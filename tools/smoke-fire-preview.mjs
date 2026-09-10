import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(process.env.BNA_PLAYWRIGHT ? pathToFileURL(path.join(process.env.BNA_PLAYWRIGHT,'index.mjs')).href : 'playwright');
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
  const page=await browser.newPage({viewport:{width:1280,height:720},reducedMotion:'no-preference'});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(pathToFileURL(path.resolve('artifacts/fire-vfx-preview.html')).href);
  await page.waitForFunction(()=>window.firePreview);
  await page.getByRole('button',{name:'Пауза',exact:true}).click();
  const result=await page.evaluate(()=>{
    const {fx}=window.firePreview,gl=fx.gl;
    fx.draw(3);const first=fx.canvas.toDataURL();
    const pixel=new Uint8Array(4);gl.readPixels(Math.floor(fx.canvas.width/2),Math.floor(fx.canvas.height/2),1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);
    fx.draw(3.5);const second=fx.canvas.toDataURL();
    fx.draw(3.5,0);const pixels=new Uint8Array(fx.canvas.width*fx.canvas.height*4);gl.readPixels(0,0,fx.canvas.width,fx.canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
    fx.draw(3.5);return {animated:first!==second,centerAlpha:pixel[3],offClear:pixels.every(x=>x===0),glError:gl.getError()};
  });
  assert.deepEqual(result,{animated:true,centerAlpha:0,offClear:true,glError:0});
  const still=await page.locator('#effect-1').evaluate(c=>c.toDataURL());
  await page.waitForTimeout(150);
  assert.equal(await page.locator('#effect-1').evaluate(c=>c.toDataURL()),still,'Paused fire must remain still');
  for(const time of [0,2,5,9]) {
    const borderAlpha=await page.evaluate(time=>{
      const {fx}=window.firePreview;fx.draw(time);
      const gl=fx.gl,w=fx.canvas.width,h=fx.canvas.height,p=new Uint8Array(w*h*4);
      gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,p);
      let max=0;
      for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(x===0||y===0||x===w-1||y===h-1)max=Math.max(max,p[(y*w+x)*4+3]);
      return max;
    },time);
    assert.ok(borderAlpha<=1,`Fire must dissipate before canvas boundary at t=${time}`);
    await page.screenshot({path:`artifacts/fire-preview-frame-${time}.png`});
  }
  await page.screenshot({path:'artifacts/fire-preview-dark.png'});
  for(let i=2;i<12;i++)await page.locator('.panel').nth(i).screenshot({path:`artifacts/material-${i}.png`});
  await page.getByRole('checkbox').check();
  await page.screenshot({path:'artifacts/fire-preview-light.png'});
  await page.emulateMedia({reducedMotion:'reduce'});await page.reload();
  await page.getByRole('button',{name:'Воспроизвести',exact:true}).waitFor();
  assert.deepEqual(errors,[]);
  console.log('PASS: shader compiles, frames change, text stays clear, intensity zero clears, pause and reduced motion work; dark/light screenshots saved.');
} finally {await browser.close();}
