var gl;

var infinity = "1000.0";
var mvMatrix = mat4.create();
var mvMatrixStack = [];
var pMatrix = mat4.create();

var lastTime = 0;

var planet1 = 0;

function initGL(canvas) {
    try {
        gl = canvas.getContext("experimental-webgl");
        gl.viewportWidth = canvas.width;
        gl.viewportHeight = canvas.height;
    } catch (e) {
    }
    if (!gl) {
        alert("Could not initialise WebGL, sorry :-(");
    }
}


function mvPushMatrix() {
    var copy = mat4.clone(mvMatrix);
    mvMatrixStack.push(copy);
}

function mvPopMatrix() {
    if (mvMatrixStack.length == 0) {
        throw "Invalid popMatrix!";
    }
    mvMatrix = mvMatrixStack.pop();
}


function degToRad(degrees) {
    return degrees * Math.PI / 180;
}

function drawScene() 
{
    gl.viewport(0, 0, gl.viewportWidth, gl.viewportHeight);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    mat4.perspective(45, gl.viewportWidth / gl.viewportHeight, 0.1, 100.0, pMatrix);

    mat4.identity(mvMatrix);
    mvPushMatrix();

    var lastUsedShader = null;

    mat4.translate(mvMatrix, mvMatrix, [0, 0, 3.5]);

    gl.useProgram(tracer.shaderProgram)
    for (var object of tracer.objects)
    {
        object.setUniforms(tracer.shaderProgram);
    }

    for (var light of tracer.lights)
    {
        //light.setUniforms(tracer.shaderProgram);
    }

    tracer.setUniforms();


    gl.bindBuffer(gl.ARRAY_BUFFER, tracer.buffers.vertexPosition);
    gl.vertexAttribPointer(tracer.attributes.vertexPosition, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, tracer.buffers.indices);

    gl.drawElements(gl.TRIANGLES, tracer.mesh.indices.length, gl.UNSIGNED_SHORT, 0);

}


class RayTracer
{
    constructor(objects, lights)
    {
        this.objects = objects;
        this.lights = lights;

        this.resolutionStr = "resolution";
        this.originStr = "origin";
        this.sceneAmbientColorStr = "sceneAmbientColor";

        this.resolution = [500, 500];
        this.origin = [0.0,1.0,-8.0];
        this.sceneAmbientColor = [0.8, 0.8, 0.8, 1];

        this.shaderProgram = null;

        this.mesh = {
            vertices: [1.0,  1.0,  0.0, -1.0,  1.0,  0.0, 1.0, -1.0,  0.0, -1.0, -1.0,  0.0],
            indices: [0, 1, 2, 3, 2, 1],
        }

        this.attributes = {
            vertexPosition: null,
        }

        this.uniforms = {
            resolution: null,
            origin: null,
            ambientColor: null,
            lightPositions: null,
        }

        this.buffers = {
            vertexPosition: null,
            indices: null,
        }
    }

    buildVertexShaderSrc()
    {
        return '' +
        'attribute vec3 vertexPosition;\n' + 
        '\n' +
        'void main(void)\n' +
        '{\n' +
        '   gl_Position = vec4(vertexPosition, 1.0);\n' +
        '}\n';
    }

    buildFragmentShaderSrc()
    {
        var shaderSource =
            '// getHeaderSource\n' +
            this.getHeaderSource() +

            '\n// objects.getDeclarationSrc\n' +
            concat(this.objects, o => o.getDeclarationSrc(), 0) + 

            //'\n// lights.getDeclarationSrc\n' +
            //concat(this.lights, o => o.getDeclarationSrc(), 0) + 

            '\n// Sphere.getIntersectFuncSrc\n' +
            Sphere.getIntersectFuncSrc() +

            '\n// Plane.getIntersectFuncSrc\n' +
            Plane.getIntersectFuncSrc() +

            '\n// Disk.getIntersectFuncSrc\n' +
            Disk.getIntersectFuncSrc() +

            '\n// Sphere.getNormalFuncSrc\n' +
            Sphere.getNormalFuncSrc() +

            '\n// this.getIntersectSceneSrc\n' +
            this.getIntersectSceneSrc() +

            '\n// this.getCalculateColorSrc\n' +
            this.getCalculateColorSrc() +

            '\n// this.getMainSrc\n' +
            this.getMainSrc();

        return shaderSource;
    }

    getMainSrc()
    {
        return '' +
        'void main()\n' +
        '{' + 
        '   vec3 direction = normalize(vec3((gl_FragCoord.xy/resolution-0.5)*2.0,1.0));\n' +
        '   gl_FragColor = calculateColor(origin, direction);\n' +
        '}';
    }

    getHeaderSource()
    {
        return '' +
        'precision highp float;\n' +
        '\n' +
        'uniform vec2 ' + this.resolutionStr + ';\n' +
        'uniform vec3 ' + this.originStr + ';\n' +
        'uniform vec4 ' + this.sceneAmbientColorStr + ';\n' +
        '\n' +
        'uniform vec3 lightPositions[' + this.lights.length + '];\n';
        //'uniform vec4 lightColors[' + this.lights.length + '];\n'; 
    }

    setUniforms()
    {
        gl.uniform2fv(this.uniforms.resolution, this.resolution);
        gl.uniform3fv(this.uniforms.origin, this.origin);
        gl.uniform4fv(this.uniforms.ambientColor, this.sceneAmbientColor);

        var lightPositions = [];
        //var lightColors = []; 
        for (var light of this.lights) 
        {
            lightPositions.push.apply(lightPositions, light.position);
        }
        //console.log(lightPositions);

        gl.uniform3fv(this.uniforms.lightPositions, lightPositions);
    }

    programInit()
    {
        this.uniforms.resolution = gl.getUniformLocation(this.shaderProgram, this.resolutionStr);
        this.uniforms.origin = gl.getUniformLocation(this.shaderProgram, this.originStr);
        this.uniforms.ambientColor = gl.getUniformLocation(this.shaderProgram, this.sceneAmbientColorStr);
        this.uniforms.lightPositions = gl.getUniformLocation(this.shaderProgram, "lightPositions");
        //this.uniforms.lightColors = gl.getUniformLocation(this.shaderProgram, "lightColors");

        this.attributes.vertexPosition = gl.getAttribLocation(this.shaderProgram, "vertexPosition")
        gl.enableVertexAttribArray(this.attributes.vertexPosition)

        this.buffers.vertexPosition = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.vertexPosition);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.mesh.vertices), gl.STATIC_DRAW)

        this.buffers.indices = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.buffers.indices)
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(this.mesh.indices), gl.STATIC_DRAW);
    }

    //setAttributes()
    //{

    //}

    compileShader()
    {
        var vertexShaderSrc = this.buildVertexShaderSrc();
        var fragmentShaderSrc = this.buildFragmentShaderSrc();

        var vertexShader = gl.createShader(gl.VERTEX_SHADER);
        var fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);

        this.shaderProgram = gl.createProgram();

        gl.shaderSource(vertexShader, vertexShaderSrc);
        gl.shaderSource(fragmentShader, fragmentShaderSrc);

        gl.compileShader(vertexShader);
        gl.compileShader(fragmentShader);

        if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS))
        {
            console.log(gl.getShaderInfoLog(vertexShader));
        }

        if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS))
        {
            console.log(gl.getShaderInfoLog(fragmentShader));
        }

        gl.attachShader(this.shaderProgram, vertexShader);
        gl.attachShader(this.shaderProgram, fragmentShader);

        gl.linkProgram(this.shaderProgram);

        if (!gl.getProgramParameter(this.shaderProgram, gl.LINK_STATUS))
        {
            console.log("ERROR: Could not link shader");
        }
    }

    getCalculateColorSrc()
    {
        return '' +
        'vec4 calculateColor(vec3 origin, vec3 ray)\n' +
        '{\n' +
        '   int intersectID = 0;\n'+
        '   vec4 objColor = vec4(0.0);\n' +
        '   vec3 normal = vec3(0.0);\n' +
        '   float intersectDistance = intersectScene(origin, ray, intersectID);\n'+
        '   //if (intersectID == 3) { return vec4(1.0, 0.0, 0.0, 0.0); }\n' +
        '\n' +
    
        '   if(intersectDistance != ' + infinity + ')\n' +
        '   {\n' +
        '       vec3 intersectPoint = origin + ray * intersectDistance;\n' +
        '       float contribution = 0.0;\n' +
        '       float lambertAmount = 0.0;\n' +
        '\n' +
        concat(this.objects, o => o.getHitSrc(), 2) + '\n' + 
        '       for(int i = 0; i < ' + this.lights.length + '; i++)\n' +
        '       {\n' +
        '           vec3 lightDir = normalize(lightPositions[i] - intersectPoint);\n' +
        '           int blankID = -2;\n' +
        '           float lightIntersect = intersectScene(intersectPoint + lightDir * 0.001, lightDir, blankID);\n' +
        '           //if (blankID == 3) { objColor = vec4(1.0, 0.1, 0.1, 0.0); }\n' +
        '           //if (blankID == 2) { lightIntersect = 0.0; }\n' +
        '           if(lightIntersect == 1000.0)\n' +
        '           {\n' +
        '               contribution = dot(normalize(lightPositions[i] - intersectPoint), normal);\n' +
        '               if (contribution > 0.0)\n' +
        '               {\n' +
        '                  lambertAmount += contribution;\n' +
        '               }\n' +
        '           }\n' + 
        '       }\n' + 
        '\n' +
        '       lambertAmount = min(1.0, lambertAmount);\n' +
        '\n' +
        '       return vec4(objColor.xyz * lambertAmount + objColor.xyz * 0.1, 1);\n' +
        '   } else {\n' +
        '       return sceneAmbientColor;\n' +
        '   }\n' +
        '}\n';
    }

    getIntersectSceneSrc()
    {
        return '' +
        'float intersectScene(in vec3 origin, in vec3 direction, inout int closestID)\n' +
        '{\n' +
        '   float intersectDistance = ' + infinity + ';\n' +        
        '   int intersectID = -1;\n' +
        concat(this.objects, o => o.getIntersectSrc(), 1) + '\n' + 
        concat(this.objects, o => o.getClosestIntersectSrc(), 1) + '\n' + 
        '   closestID = intersectID;\n'+
        '   return intersectDistance;\n'+
        '}\n';
    }
}

function concat(objects, arrow, indentLevel)
{
    var numSpaces = 0;

    if(indentLevel != null && indentLevel != 0)
    {
        numSpaces = 4 * indentLevel - 1;
    }

    var text = '';

    for(var o of objects)
    {
        text += arrow(o);
    }

    text = normalizeLeadingSpace(text);

    //console.log(text.split('\n').map(s => '\t' + s).join());
    //var numSpaces = 4 * indentLevel;

    return text.split('\n').map(s => ' '.repeat(numSpaces) + s).join('\n');
}

class Light
{
    constructor(position)
    {
        this.id = makeObjUID();
        this.position = position;
        //this.color = color;

        this.positionStr = 'lightPosition_' + this.id;
        //this.colorStr = 'lightColor_' + this.id;
    }

    getDeclarationSrc()
    {
        //return '' +
        //'uniform vec3 ' + this.positionStr + ';\n';
        //'uniform vec4 ' + this.colorStr + ';';
    }

    setUniforms(program)
    {
        //var uniformLocation = gl.getUniformLocation(program, this.positionStr);
        //gl.uniform3fv(uniformLocation, this.position);
    }

    getIntersectSrc()
    {
        //return '' +
        //'contribution = dot(normalize(' + this.positionStr + '- intersectPoint), normal);\n' +
        //'if (contribution > 0.0)\n' +
        //'{\n' +
        //'   lambertAmount += contribution;\n' +
        //'}\n';
    }
}

var makeObjUID = (function() 
{
    var i = 1;

    return function ()
    {
        return i++;
    }
})();


class Sphere
{
    constructor(center, radius, color)
    {
        this.id = makeObjUID();
        this.center = center;
        this.radius = radius;
        this.color = color;

        this.rotation = 0;
        this.orbitCenter = [0, 0, 0];

        this.centerStr = 'sphereCenter_' + this.id;
        this.colorStr = 'sphereColor_' + this.id;
        this.radiusStr = 'sphereRadius_' + this.id;
        this.intersectStr = 'tSphere_' + this.id;
    }

    getDeclarationSrc()
    {
        return '' +
        'uniform vec3 ' + this.centerStr + ';\n' +
        'uniform vec4 ' + this.colorStr + ';\n' +
        'uniform float ' + this.radiusStr  + ';\n';
    }

    getIntersectSrc()
    {
        return '' +
        'float ' + this.intersectStr + ' = intersectSphere(origin, direction, ' + this.centerStr + ', ' + this.radiusStr + ');\n';
    }

    getClosestIntersectSrc()
    {
        return '' +
        'if(' + this.intersectStr + ' < intersectDistance)\n'+
        '{\n' +
        '   intersectDistance = ' + this.intersectStr + ';\n' + 
        '   intersectID = ' + this.id + ';\n' + 
        '}\n';
    }

    getHitSrc()
    {
        // TODO: Should be else if
        return '' +
        'if (intersectID == ' + this.id + ')\n' +
        '{\n' +
        '   objColor = ' + this.colorStr + ';\n' +
        '   normal = sphereNormal(intersectPoint, ' + this.centerStr + ', ' + this.radiusStr + ');\n' +
        '}\n';
    }

    setUniforms(program)
    {
        
        var mcenter = vec3.fromValues(this.center[0], this.center[1], this.center[2]);
        

        mvPushMatrix();
        mat4.identity(mvMatrix);
        mat4.translate(mvMatrix, mvMatrix, this.orbitCenter);
        vec3.transformMat4(mcenter, mcenter, mvMatrix)
        var ce = vec3.fromValues(0, 0, 4);
        vec3.rotateY(mcenter, mcenter, ce, this.rotation);
        //mat4.rotate(mvMatrix, mvMatrix, this.rotation * 10, [1, 1, 1]);
        //console.log(mcenter);
        mvPopMatrix();
        

        var uniformLocation = gl.getUniformLocation(program, this.centerStr);
        gl.uniform3fv(uniformLocation, mcenter);

        uniformLocation = gl.getUniformLocation(program, this.radiusStr);
        gl.uniform1f(uniformLocation, this.radius);

        uniformLocation = gl.getUniformLocation(program, this.colorStr);
        gl.uniform4fv(uniformLocation, this.color);
    }

    static getNormalFuncSrc()
    {
        return '' +
        'vec3 sphereNormal(vec3 surfacePosition, vec3 sphereCenter, float sphereRadius)\n' +
        '{\n' +
        '   return (surfacePosition - sphereCenter) / sphereRadius;\n' +
        '}\n';
    }

    static getIntersectFuncSrc()
    {
        return '' +
        'float intersectSphere(in vec3 origin, in vec3 direction, in vec3 spherePosition, in float sphereRadius)\n' +
        '{\n' +
            // Geometric ray-sphere intersection
            // vector from eye to sphere center
        '   vec3 eyeToCenter = spherePosition - origin;\n' +

            // length of the projection of eyeToCenter onto the ray
        '   float projectionLength = dot(eyeToCenter, direction);\n' +

            // distance from eye to center of sphere
        '   float sphereDistance = dot(eyeToCenter, eyeToCenter);\n' +

            // distance squared from eye to sphere intersection using pythagorean
            // theorem
        '   float discriminant = (sphereRadius * sphereRadius) - sphereDistance + (projectionLength * projectionLength);\n' +
        '\n' +

        '   if (discriminant < 0.0)\n' +
        '   {\n' +
        '       return ' + infinity + ';\n' +
        '   } else {\n' +
        '       if (projectionLength - sqrt(discriminant) < 0.0)\n' +
        '       {\n' +
        '           return ' + infinity + ';\n' +
        '       } else {\n' +
        '           return projectionLength - sqrt(discriminant);\n' +
        '       }\n' +
        '   }\n' +
        '}\n';
    }
}

class Plane 
{
    static getIntersectFuncSrc()
    {
        return '' +
        'float intersectPlane(in vec3 origin, in vec3 direction, in vec3 planePosition, in vec3 planeNormal)\n' +
        '{\n' +
        '   float denominator = dot(planeNormal, direction);\n' +
        '   if (denominator > 0.001)\n' +
        '   {\n' +
        '       vec3 directionToPlane = normalize(planePosition - origin);\n' +
        '       float intersectDistance = dot(directionToPlane, planeNormal) / denominator;\n' +
        '\n' +    
        '       if (intersectDistance >= 0.0)\n' +
        '       {\n' +
        '           return intersectDistance;\n' +
        '       } else {\n' +
        '           return ' + infinity + ';\n' +
        '       }\n' +
        '   }\n' +
        '\n' +
        '   return ' + infinity + ';\n' +
        '}\n';
    }
}

class Disk
{
    constructor(center, normal, radius, color)
    {
        this.id = makeObjUID();
        this.position = center;
        this.normal = normal
        this.radius = radius;
        this.color = color;

        this.positionStr = 'diskPosition_' + this.id;
        this.normalStr = 'diskNormal_' + this.id;
        this.colorStr = 'diskColor_' + this.id;
        this.radiusStr = 'diskRadius_' + this.id;
        this.intersectStr = 'tDisk_' + this.id;
    }

    getDeclarationSrc()
    {
        return '' +
        'uniform vec3 ' + this.positionStr + ';\n' +
        'uniform vec3 ' + this.normalStr + ';\n' +
        'uniform vec4 ' + this.colorStr + ';\n' +
        'uniform float ' + this.radiusStr  + ';\n';
    }

    getIntersectSrc()
    {
        return '' +
        'float ' + this.intersectStr + ' = intersectDisk(origin, direction, ' + this.positionStr + ', ' + this.normalStr + ', ' + this.radiusStr +  ');\n';
    }

    getClosestIntersectSrc()
    {
        return '' +
        'if(' + this.intersectStr + ' < intersectDistance)\n'+
        '{\n' +
        '   intersectDistance = ' + this.intersectStr + ';\n' + 
        '   intersectID = ' + this.id + ';\n' + 
        '}\n';
    }

    getHitSrc()
    {
        // TODO: Should be else if
        return '' +
        'if (intersectID == ' + this.id + ')\n' +
        '{\n' +
        '   objColor = ' + this.colorStr + ';\n' +
        '   normal = ' + this.normalStr + ';\n' +
        '}\n';
    }

    setUniforms(program) 
    {
        var uniformLocation = gl.getUniformLocation(program, this.positionStr);
        gl.uniform3fv(uniformLocation, this.position);

        uniformLocation = gl.getUniformLocation(program, this.radiusStr);
        gl.uniform1f(uniformLocation, this.radius);

        uniformLocation = gl.getUniformLocation(program, this.normalStr);
        gl.uniform3fv(uniformLocation, this.normal);

        uniformLocation = gl.getUniformLocation(program, this.colorStr);
        gl.uniform4fv(uniformLocation, this.color);
    }

    static getIntersectFuncSrc()
    {
        return '' +
        'float intersectDisk(in vec3 origin, in vec3 direction, in vec3 diskPosition, in vec3 diskNormal, in float radius)\n' +

        '{\n' + 
        '   float denominator = dot(diskNormal, direction);\n' +
        '   if (denominator > 0.001)\n' +
        '   {\n' +
        '       vec3 directionToPlane = (diskPosition - origin);\n' +
        '       float intersectDistance = dot(directionToPlane, diskNormal) / denominator;\n' +
        '       vec3 intersectPoint = origin + direction * intersectDistance;\n' +
        '       float d = distance(intersectPoint, diskPosition);\n' +
        '\n' +    
        '       if (d < radius)\n' +
        '       {\n' +
        '           return intersectDistance;\n' +
        '       } else {\n' +
        '           return ' + infinity + ';\n' +
        '       }\n' +
        '   }\n' +
        '\n' +
        '   return ' + infinity + ';\n' +

        //'   float intersectDistance = intersectPlane(origin, direction, diskPosition, diskNormal);\n' +
        //'   if(intersectDistance != 1000.0)\n' +
        //'   {\n' +
        //'       vec3 p = origin + direction * intersectDistance;\n' +
        //'       vec3 v = p - diskPosition;\n' +
        //'       float d2 = dot(v, v);\n' +
        //'\n' +
        //'       if (sqrt(d2) <= radius)\n' +
        //'       {\n' +
        //'           return intersectDistance;\n' +
        //'       } else {\n' +
        //'           return ' + '0.0' + ';\n' +
        //'       }\n' +
        //'   }\n' +
        //'\n' +
        //'   return ' + infinity + ';\n' +



        //'   float denominator = dot(diskNormal, direction);\n' +
        //
        //'   if(denominator > 0.001)\n' +
        //'   {\n' +
        //'       vec3 directionToPlane = normalize(normalize(diskPosition) - normalize(origin));\n' +
        //'       float intersectDistance = dot(directionToPlane, diskNormal) / denominator;\n' +
        //'       vec3 intersectPoint = origin + direction * intersectDistance;\n' +
        //'       float pointDistance = distance(intersectPoint, diskPosition);\n' +
        //'\n' +
        //'       if (pointDistance > radius)\n' +
        //'       {\n' +
        //'           return intersectDistance;\n' +
        //'       } else {\n' +
        //'           return ' + infinity + ';\n' +
        //'       }\n' +
        //'   }\n' +
        //'\n' +
        //'   return ' + infinity + ';\n' +
        '}\n';
    }
}


var lastTime = 0;

var planet1 = 0;
function update() 
{
    planet1 += 0.03;

    tracer.objects[1].rotation = planet1;
    tracer.objects[1].orbitCenter = [0, 0, 4];
    //tracer.objects[1].center[0] = Math.sin(planet1) * 3.5;
    //tracer.objects[1].center[2] = -3 + (Math.cos(planet1) * 3.5);
}


function tick() {
    window.requestAnimationFrame(tick);

    update();
    drawScene();
}

function normalizeLeadingSpace(sourceCode)
{
    var test = sourceCode.split('\n').map(function(sourceLine)
    { 
        if(sourceLine && (sourceLine.charAt(0) == ' '))
        {
            return ' ' + sourceLine;
        } else {
            return sourceLine;
        }
    }).join('\n');

    return test;
}


var tracer;
function init() {
    var canvas = document.getElementById("raytracer-canvas");
    initGL(canvas);

    var objects = [];
    var lights = [];

    objects.push(new Sphere([0, -1, 4], 3, [0.6, 0.87, 0.6, 1.0]));
    objects.push(new Sphere([0, 2, 5], 1, [0.6, 0.87, 0.6, 1.0]));
//    objects.push(new Disk([0, -5, -4], [0, 1, 0], 6, [1.0, 0.27, 0.6, 1.0]));

    lights.push(new Light([2.0, 9.0, -4.0]));
    lights.push(new Light([6.0, 4.0, -4.0]));

    tracer = new RayTracer(objects, lights);

    var shaderSource = tracer.buildFragmentShaderSrc();

    console.log(normalizeLeadingSpace(shaderSource)); 

    tracer.compileShader();

    tracer.programInit();

    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.enable(gl.DEPTH_TEST);

    tick()
}
