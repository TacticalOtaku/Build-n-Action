/** Texture-driven fire, shared by the editor's active node surfaces. */
export class FireVFX {
  constructor(canvas, textureUrl, {width=218,height=148,padding=80}={}) {
    this.canvas=canvas;this.width=width;this.height=height;this.padding=padding;
    const gl=this.gl=canvas.getContext('webgl',{alpha:true,premultipliedAlpha:true,antialias:false,preserveDrawingBuffer:true});
    if(!gl)throw Error('WebGL unavailable');
    const vertex=`attribute vec2 aPosition;void main(){gl_Position=vec4(aPosition,0.,1.);}`;
    const fragment=`precision highp float;
      uniform vec2 uResolution;uniform vec2 uSize;uniform float uPadding;uniform float uTime;uniform float uIntensity;uniform sampler2D uFire;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
      float fbm(vec2 p){float n=0.,a=.5;for(int i=0;i<4;i++){n+=a*noise(p);p=mat2(.8,-.6,.6,.8)*p*2.03+13.7;a*=.5;}return n;}
      vec3 sampleFire(vec2 q,float seed){
        vec2 flow=vec2(q.x*3.5+seed,q.y*2.5-uTime*.48);
        vec2 curl=vec2(fbm(flow+vec2(0,fbm(flow+6.))),fbm(flow+vec2(8.,2.)))-.5;
        vec2 uv=q+curl*vec2(.13,.17)*(.3+q.y);
        uv.x+=sin(uTime*.23+seed)*.018;
        uv.y*=.89+.16*fbm(vec2(q.x*5.+seed,uTime*.34));
        vec3 c=texture2D(uFire,clamp(uv,vec2(.001),vec2(.999))).rgb;
        float edge=smoothstep(0.,.05,q.x)*(1.-smoothstep(.95,1.,q.x));
        return c*edge*(.78+.3*fbm(flow*2.5+4.));
      }
      void main(){
        vec2 extent=uSize+2.*uPadding;
        vec2 p=vec2(gl_FragCoord.x/uResolution.x,1.-gl_FragCoord.y/uResolution.y)*extent-uPadding;
        // Signed distance masks the inside of the rounded node, leaving its content untouched.
        vec2 box=abs(p-uSize*.5)-(uSize*.5-vec2(6.));
        float sd=length(max(box,0.))+min(max(box.x,box.y),0.)-6.;
        float outside=smoothstep(-1.,1.,sd);
        vec3 color=vec3(0.);
        // Overlapping fields blend continuously around the shoulders; no horizontal cut plane.
        vec3 crown=vec3(0.);
        {
          float rise=max(-p.y,0.);
          float plume=.5+.5*sin(p.x*.071+sin(p.x*.033)+uTime*.32);
          float wind=sin(rise*.043-uTime*.9)*9.+(fbm(vec2(rise*.035,uTime*.4))-.5)*22.;
          float spread=28.+rise*.22;
          vec2 uv=vec2((p.x+spread-wind)/(uSize.x+spread*2.),rise/142.+.38+(1.-plume)*.12);
          float perimeter=smoothstep(-spread,-spread+22.,p.x-wind)*(1.-smoothstep(uSize.x+spread-22.,uSize.x+spread,p.x-wind));
          crown=sampleFire(uv,0.)*perimeter*(1.-smoothstep(58.,78.,rise))*.9;
        }
        // Vertical edge sheets keep their upward flow instead of rotating flames sideways.
        float side=min(abs(p.x),abs(p.x-uSize.x));
        float seed=p.x<uSize.x*.5 ? 2. : 17.;
        float eddy=fbm(vec2(p.y*.046-uTime*.85,seed+uTime*.18));
        float reach=10.+eddy*35.+7.*sin(p.y*.072+seed-uTime*1.6);
        // Rounded emission ends dissipate through the texture instead of fading into flat feet.
        float tip=max(p.y-uSize.y+14.,0.);
        float distanceToSheet=length(vec2(side,tip*1.5));
        vec2 sideUV=vec2(.2+eddy*.48, .35+distanceToSheet/(reach*2.)+.1*sin(p.y*.04-uTime));
        float ragged=1.-smoothstep(reach*.38,reach,distanceToSheet+(noise(p*.13+vec2(0.,uTime*2.))-.5)*9.);
        vec3 sheet=sampleFire(sideUV,seed)*ragged*.68;
        float shoulder=smoothstep(-22.,30.+eddy*12.,p.y);
        color=mix(crown,sheet,shoulder);
        float glow=exp(-max(sd,0.)*.17)*(.06+.035*noise(p*.045+vec2(0.,-uTime)));
        color+=vec3(1.,.26,.035)*glow;
        // Sparse embers drift upward along independent trajectories.
        for(int i=0;i<20;i++){
          float id=float(i),life=fract(uTime*(.13+hash(vec2(id,3.))*.1)+hash(vec2(id,9.)));
          float x=hash(vec2(id,4.))*(uSize.x+40.)-20.;
          vec2 spark=vec2(x+sin(life*4.+id)*16.,-life*74.);
          float d=length((p-spark)*vec2(1.,.6));
          color+=vec3(1.,.53,.17)*exp(-d*d*1.2)*sin(life*3.14159)*.68;
        }
        color*=outside*uIntensity;
        float alpha=clamp(max(color.r,max(color.g,color.b)),0.,.96);
        gl_FragColor=vec4(min(color,vec3(alpha)),alpha);
      }`;
    const compile=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;};
    this.vertex=compile(gl.VERTEX_SHADER,vertex);this.fragment=compile(gl.FRAGMENT_SHADER,fragment);
    this.program=gl.createProgram();gl.attachShader(this.program,this.vertex);gl.attachShader(this.program,this.fragment);gl.linkProgram(this.program);
    if(!gl.getProgramParameter(this.program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(this.program));
    gl.useProgram(this.program);this.buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
    const position=gl.getAttribLocation(this.program,'aPosition');gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
    this.uniforms=Object.fromEntries(['uResolution','uSize','uPadding','uTime','uIntensity','uFire'].map(k=>[k,gl.getUniformLocation(this.program,k)]));
    this.texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,this.texture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([0,0,0,0]));
    for(const name of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,name,gl.CLAMP_TO_EDGE);
    for(const name of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,name,gl.LINEAR);
    this.ready=new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>{if(this.destroyed){resolve();return;}gl.bindTexture(gl.TEXTURE_2D,this.texture);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);resolve();};image.onerror=()=>reject(Error('Fire texture could not be loaded'));image.src=textureUrl;});
    const ratio=Math.min(devicePixelRatio||1,2);canvas.width=Math.round((width+padding*2)*ratio);canvas.height=Math.round((height+padding*2)*ratio);
    canvas.style.width=`${width+padding*2}px`;canvas.style.height=`${height+padding*2}px`;
  }
  draw(time,intensity=1){
    if(this.destroyed)return;
    const gl=this.gl,u=this.uniforms;gl.viewport(0,0,this.canvas.width,this.canvas.height);gl.useProgram(this.program);
    gl.uniform2f(u.uResolution,this.canvas.width,this.canvas.height);gl.uniform2f(u.uSize,this.width,this.height);gl.uniform1f(u.uPadding,this.padding);gl.uniform1f(u.uTime,time);gl.uniform1f(u.uIntensity,intensity);gl.uniform1i(u.uFire,0);gl.drawArrays(gl.TRIANGLES,0,6);
  }
  destroy(){if(this.destroyed)return;this.destroyed=true;const gl=this.gl;gl.deleteTexture(this.texture);gl.deleteBuffer(this.buffer);gl.deleteProgram(this.program);gl.deleteShader(this.vertex);gl.deleteShader(this.fragment);gl.getExtension('WEBGL_lose_context')?.loseContext();}
}
