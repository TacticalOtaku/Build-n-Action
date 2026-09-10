const TAU=Math.PI*2;
const fract=n=>n-Math.floor(n);
const wave=(i,t)=>Math.sin(i*7.17+t)*.62+Math.sin(i*2.31-t*1.73)*.38;

/** Material-specific motion. Coordinates are local to the node; the caller protects its text. */
export function drawAmbientVFX(ctx,{width:w,height:h,element,time:t,health=50},glow,stroke,crystal) {
  if(element==='lightning') {
    // Discharges jump between independent anchors; they never orbit the card.
    const epoch=Math.floor(t*2.2),phase=fract(t*2.2);
    const envelope=.22+.78*Math.exp(-phase*7);
    for(let k=0;k<4;k++) {
      const side=k%2 ? w : 0,sign=k%2 ? 1 : -1,y=18+fract(k*.618+epoch*.173)*(h-28);
      const points=[[side,y]];
      for(let j=1;j<9;j++)points.push([side+sign*(j*4+wave(j+k*8,epoch)*7),y-j*5+wave(j*3+k,epoch)*12]);
      stroke(ctx,points,'126,162,255',envelope*.9,1.1);
      stroke(ctx,points,'231,244,255',envelope*.85,.45);
      const fork=points[4];stroke(ctx,[fork,[fork[0]+sign*12,fork[1]+8],[fork[0]+sign*18,fork[1]-3]],'156,184,255',envelope*.55,.6);
      glow(ctx,side,y,18,'103,145,255',envelope*.2);
    }
  } else if(element==='cold') {
    for(let i=0;i<30;i++) {
      const side=i%3,x=side===0 ? 0 : side===1 ? w : fract(i*.618)*w;
      const y=side===2 ? 1 : fract(i*.754)*h;
      const angle=side===0 ? -.6 : side===1 ? .6 : wave(i,0)*.4;
      crystal(ctx,x,y,8+fract(i*.47)*22,angle,.42+.18*Math.sin(t*.7+i));
      if(i%4===0)glow(ctx,x,y,21,'126,215,250',.12);
    }
    for(let i=0;i<20;i++) {
      const life=fract(t*.065+i*.618),x=fract(i*.754)*(w+70)-35+Math.sin(t*.4+i)*6,y=-40+life*(h+75);
      crystal(ctx,x,y,2+i%3,t*.1+i,Math.sin(life*Math.PI)*.4);
    }
  } else if(element==='acid') {
    for(let i=0;i<20;i++) {
      const life=fract(t*.24+i*.618),x=(i%2 ? w+3 : -3)+wave(i,life*3)*9,y=h-life*(h+20),r=1+life*4;
      glow(ctx,x,y,12,'180,230,62',Math.sin(life*Math.PI)*.16);
      ctx.strokeStyle=`rgba(183,228,76,${Math.sin(life*Math.PI)*.7})`;ctx.lineWidth=.8;ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.stroke();
      ctx.fillStyle=`rgba(240,255,188,${Math.sin(life*Math.PI)*.7})`;ctx.beginPath();ctx.arc(x-r*.3,y-r*.4,.7,0,TAU);ctx.fill();
      if(life>.8)stroke(ctx,[[x-r*2,y],[x-r*3,y-3]],'210,244,136',(1-life)*2,.7);
    }
  } else if(element==='poison'||element==='necrotic') {
    const rgb=element==='poison' ? '120,185,103' : '135,105,186';
    for(let i=0;i<28;i++) {
      const life=fract(t*.09+i*.618),sign=i%2 ? 1 : -1,x=(i%2 ? w : 0)+sign*(5+life*16)+wave(i,t*.6)*7,y=h+7-life*(h+53);
      const alpha=Math.sin(life*Math.PI)**2;
      glow(ctx,x,y,10+life*15,rgb,alpha*.11);
      const points=Array.from({length:12},(_,j)=>[x+Math.sin(j*.35+t*.6+i)*(3+j*.4),y-j*2]);
      stroke(ctx,points,rgb,alpha*.12,.7);
      if(element==='necrotic')glow(ctx,x+3,y,4,'208,181,239',alpha*.3);
    }
  } else if(element==='radiant') {
    for(let i=0;i<18;i++) {
      const x=fract(i*.618)*(w+32)-16,y=fract(i*.754)*(h+44)-22,a=.25+.6*Math.sin(t*.65+i)**6;
      glow(ctx,x,y,19,'255,210,122',a*.15);
      const length=3+a*6;
      stroke(ctx,[[x-length,y],[x+length,y]],'255,230,174',a*.7,.6);
      stroke(ctx,[[x,y-length*1.6],[x,y+length*1.6]],'255,248,217',a,.7);
    }
  } else if(element.startsWith('health-')) {
    // A threshold cue, not a claim about the actor's current health.
    const low=element==='health-low',rgb=low ? '239,101,115' : '106,220,164';
    const rate=low ? 1.05+(1-health/100)*.45 : .7,phase=fract(t*rate);
    const beat=Math.exp(-(((phase-.12)/.055)**2))+.55*Math.exp(-(((phase-.3)/.075)**2));
    for(const x of [0,w])glow(ctx,x,h*.46,30,rgb,.08+beat*.2);
    const y=-9,points=[];
    for(let i=0;i<=90;i++) {
      const x=i/90*w,q=fract(x/w-t*.23),pulse=Math.exp(-(((q-.48)/.017)**2))*-14+Math.exp(-(((q-.51)/.018)**2))*7;
      points.push([x,y+pulse]);
    }
    stroke(ctx,points,rgb,.45+beat*.22,.85);
    const x=w*.5,yHeart=-25;
    ctx.save();ctx.translate(x,yHeart);ctx.scale(1+beat*.12,1+beat*.12);ctx.fillStyle=`rgba(${rgb},${.5+beat*.35})`;
    ctx.beginPath();ctx.moveTo(0,5);ctx.bezierCurveTo(-12,-2,-6,-10,0,-4);ctx.bezierCurveTo(6,-10,12,-2,0,5);ctx.fill();ctx.restore();
  } else if(element==='force'||element==='thunder') {
    const rgb=element==='force' ? '184,151,255' : '151,191,223';
    for(let i=0;i<3;i++) {
      const life=fract(t*.45+i/3),a=Math.sin(life*Math.PI)*.35;
      ctx.strokeStyle=`rgba(${rgb},${a})`;ctx.lineWidth=1.3-life;
      for(const side of [-1,1]) {
        ctx.beginPath();ctx.ellipse(side<0 ? 0 : w,h*.5,9+life*30,18+life*40,0,side<0 ? Math.PI*.6 : -Math.PI*.4,side<0 ? Math.PI*1.4 : Math.PI*.4);ctx.stroke();
      }
    }
  }
}
