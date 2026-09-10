import {FireVFX} from './fire-vfx.mjs';
import {drawAmbientVFX} from './ambient-vfx.mjs';
const TAU = Math.PI * 2;
export const EFFECT_PADDING = 80;
export const EFFECT_ELEMENTS = new Set(['fire', 'cold', 'lightning', 'acid', 'poison', 'radiant', 'necrotic', 'health-low', 'health-high', 'force', 'thunder']);
const noise = (i, t) => Math.sin(i * 7.17 + t) * .62 + Math.sin(i * 2.31 - t * 1.73) * .38;
const fraction = value => value - Math.floor(value);

function glow(ctx, x, y, radius, color, alpha) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
  g.addColorStop(0, `rgba(${color},${alpha})`); g.addColorStop(1, `rgba(${color},0)`);
  ctx.fillStyle = g; ctx.fillRect(x-radius, y-radius, radius*2, radius*2);
}

function strokeGlow(ctx, points, rgb, alpha, width=1) {
  for (const [line, opacity] of [[width*7,alpha*.06],[width*3,alpha*.17],[width,alpha]]) {
    ctx.beginPath();points.forEach(([x,y],i)=>i ? ctx.lineTo(x,y) : ctx.moveTo(x,y));
    ctx.strokeStyle=`rgba(${rgb},${opacity})`;ctx.lineWidth=line;ctx.lineJoin='round';ctx.lineCap='round';ctx.stroke();
  }
}

function crystal(ctx,x,y,length,angle,alpha) {
  ctx.save();ctx.translate(x,y);ctx.rotate(angle);
  const g=ctx.createLinearGradient(-3,0,4,-length);g.addColorStop(0,`rgba(86,163,202,${alpha*.15})`);g.addColorStop(.5,`rgba(178,230,250,${alpha*.55})`);g.addColorStop(1,`rgba(239,253,255,${alpha})`);
  ctx.fillStyle=g;ctx.beginPath();ctx.moveTo(-3,0);ctx.lineTo(-4,-length*.55);ctx.lineTo(0,-length);ctx.lineTo(4,-length*.4);ctx.lineTo(3,0);ctx.closePath();ctx.fill();
  strokeGlow(ctx,[[0,0],[0,-length]],'215,246,255',alpha*.6,.5);ctx.restore();
}

function flame(ctx, x, y, height, width, sway, opacity) {
  const g = ctx.createLinearGradient(x, y, x+sway, y-height);
  g.addColorStop(0, `rgba(255,232,157,${opacity})`);
  g.addColorStop(.22, `rgba(255,167,47,${opacity*.95})`);
  g.addColorStop(.65, `rgba(243,79,17,${opacity*.7})`);
  g.addColorStop(1, 'rgba(164,35,8,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.moveTo(x-width, y);
  ctx.bezierCurveTo(x-width*1.3, y-height*.36, x+sway-width*.35, y-height*.64, x+sway, y-height);
  ctx.bezierCurveTo(x+sway+width*.8, y-height*.52, x+width, y-height*.28, x+width, y);
  ctx.closePath(); ctx.fill();
}

/** All motion is continuous in time, so frame rate changes never speed up the effect. */
export function drawElementalEffect(ctx, {width, height, element, time = 0, intensity = 1, health = 50}) {
  const p = EFFECT_PADDING, w = width, h = height;
  ctx.clearRect(0, 0, w+p*2, h+p*2);
  if (!EFFECT_ELEMENTS.has(element) || intensity <= 0) return;
  ctx.save(); ctx.translate(p, p); ctx.globalAlpha = intensity;
  // Never paint over names, values, or inspector content, even with an opaque flame.
  ctx.beginPath(); ctx.rect(-p, -p, w+p*2, h+p*2); ctx.roundRect(3, 3, w-6, h-6, 5); ctx.clip('evenodd');
  if(element!=='fire') {
    drawAmbientVFX(ctx,{width,height,element,time,health},glow,strokeGlow,crystal);
    ctx.restore();return;
  }
  if (element === 'fire') {
    ctx.filter='blur(0.55px)';
    for (let i=0; i<18; i++) {
      const x=5+fraction(i*.618034)*(w-10)+noise(i+3,time*.7)*2, n=noise(i, time*2.4);
      const tall = 12 + 18*(.5+.5*n) + 10*(.5+.5*Math.sin(i*4.8));
      const sway=noise(i+8,time*1.9)*11;
      glow(ctx,x,2,18,'246,104,23',.08);
      flame(ctx,x,4,tall,4.5+3*Math.sin(i*2.4)**2,sway,.4);
      flame(ctx,x,3,tall*.49,2.5,sway*.4,.48);
    }
    for (const side of [0,w]) for (let i=0; i<7; i++) {
      const y=24+i*(h-28)/7, n=noise(i+side,time*3);
      glow(ctx,side,y,15,'255,105,20',.13);
      flame(ctx,side,y,15+n*7,4, (side ? 1 : -1)*(3+n*2),.4);
    }
    ctx.filter='none';
    for (let i=0; i<32; i++) {
      const life=fraction(time*(.19+(i%4)*.035)+i*.618);
      const side=i%3, x0=side===0 ? -3 : side===1 ? w+3 : fraction(i*.754)*w;
      const y0=side===2 ? 0 : fraction(i*.421)*h;
      const x=x0+noise(i,time*.9+life*2)*9, y=y0-life*52;
      const a=Math.sin(life*Math.PI)**2*.65;
      glow(ctx,x,y,3,'255,162,53',a*.25);
      ctx.fillStyle=`rgba(255,208,121,${a})`; ctx.beginPath(); ctx.ellipse(x,y,.6+(i%3)*.18,1.1,noise(i,time)*.3,0,TAU); ctx.fill();
    }
    glow(ctx,4,h-4,20,'255,127,28',.16); glow(ctx,w-4,h-4,20,'255,127,28',.16);
  }
  ctx.restore();
}

/** A single scheduler per editor, running only while a visible node is active or fading. */
export class ElementalEffects {
  constructor(root) {
    this.root=root; this.abort=new AbortController(); this.surfaces=[];
    this.motion=matchMedia('(prefers-reduced-motion: reduce)');
    const options={signal:this.abort.signal};
    for(const event of ['pointerover','pointerout','focusin','focusout']) root.addEventListener(event,()=>this.wake(),options);
    this.motion.addEventListener('change',()=>this.wake(),options);
    document.addEventListener('visibilitychange',()=>this.wake(),options);
    this.preferences=new MutationObserver(()=>this.wake());
    this.preferences.observe(document.body,{attributes:true,attributeFilter:['data-bna-effects','data-bna-motion']});
    this.refresh();
  }
  refresh() {
    this.surfaces=this.surfaces.filter(s=>{if(s.node.isConnected)return true;s.canvas.remove();return false;});
    for(const node of this.root.querySelectorAll('.bna-node[data-element]')) {
      if(!EFFECT_ELEMENTS.has(node.dataset.element) || this.surfaces.some(s=>s.node===node))continue;
      const canvas=document.createElement('canvas'); canvas.className='bna-elemental-canvas';canvas.setAttribute('aria-hidden','true');
      const width=node.offsetWidth, height=node.offsetHeight, ratio=Math.min(devicePixelRatio || 1,2);
      canvas.width=Math.ceil((width+EFFECT_PADDING*2)*ratio);canvas.height=Math.ceil((height+EFFECT_PADDING*2)*ratio);
      canvas.style.width=`${width+EFFECT_PADDING*2}px`;canvas.style.height=`${height+EFFECT_PADDING*2}px`;
      node.append(canvas);const ctx=canvas.getContext('2d');if(!ctx){canvas.remove();continue;}ctx.scale(ratio,ratio);
      this.surfaces.push({node,canvas,ctx,width,height,intensity:0,health:Number(node.dataset.health ?? 50)});
    }
    this.wake();
  }
  prepareFire(width,height) {
    if(this.fireFailed||this.fire)return;
    try {
      const url=globalThis.foundry?.utils?.getRoute?.('modules/build-n-action/assets/vfx/fire-bed-v1.png') ?? 'modules/build-n-action/assets/vfx/fire-bed-v1.png';
      this.fire=new FireVFX(document.createElement('canvas'),url,{width,height,padding:EFFECT_PADDING});
      this.fire.ready.then(()=>{if(!this.destroyed){this.fireReady=true;this.wake();}}).catch(()=>{this.fireFailed=true;this.fire?.destroy();this.fire=null;});
    } catch {this.fireFailed=true;this.fire?.destroy();this.fire=null;}
  }
  wake() { if(!this.destroyed&&!this.frame)this.frame=requestAnimationFrame(t=>this.tick(t)); }
  tick(now) {
    this.frame=0;
    const enabled=document.body.dataset.bnaEffects!=='off' && !document.hidden;
    const animated=document.body.dataset.bnaMotion!=='off' && !this.motion.matches;
    const dt=Math.min((now-(this.last ?? now-16))/1000,.05);this.last=now;
    let running=false;
    for(const s of this.surfaces) {
      const editingHealth=s.node.dataset.element.startsWith('health-') && this.root.querySelector('[name^="filters.healthPercentages."]:focus-within');
      const active=enabled && s.node.isConnected && s.node.getClientRects().length>0 && (s.node.matches(':hover,:focus-within')||!!editingHealth);
      const target=active ? 1 : 0;
      s.intensity=animated && enabled ? s.intensity+(target-s.intensity)*(1-Math.exp(-dt*(active ? 9 : 5))) : target;
      if(Math.abs(s.intensity-target)<.005)s.intensity=target;
      const element=s.node.dataset.element,time=animated ? now/1000 : 0,intensity=s.intensity*(animated ? 1 : .35);
      if(element==='fire'&&intensity>0)this.prepareFire(s.width,s.height);
      if(element==='fire'&&this.fireReady&&this.fire) {
        this.fire.draw(time,intensity);
        s.ctx.clearRect(0,0,s.width+EFFECT_PADDING*2,s.height+EFFECT_PADDING*2);
        s.ctx.drawImage(this.fire.canvas,0,0,s.width+EFFECT_PADDING*2,s.height+EFFECT_PADDING*2);
      } else drawElementalEffect(s.ctx,{...s,element,time,intensity});
      running ||= enabled && animated && (active || s.intensity>0);
    }
    if(running)this.wake();else this.last=null;
  }
  destroy() { this.destroyed=true;cancelAnimationFrame(this.frame);this.frame=0;this.abort.abort();this.preferences.disconnect();this.fire?.destroy();this.fire=null;for(const s of this.surfaces)s.canvas.remove();this.surfaces=[]; }
}
