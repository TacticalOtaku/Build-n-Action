/** Browser smoke test of the real editor against a small, explicit Foundry API harness.
 * Set BNA_PLAYWRIGHT to a playwright package directory when it is not installed locally.
 * This does not replace testing inside a live Foundry world.
 */
import fs from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import {pathToFileURL} from "node:url";
import assert from "node:assert/strict";

const root = process.cwd();
const {chromium} = await import(process.env.BNA_PLAYWRIGHT ? pathToFileURL(path.join(process.env.BNA_PLAYWRIGHT, "index.mjs")).href : "playwright");
const template = await fs.readFile("templates/condition-blueprint.hbs", "utf8");
const locales = JSON.parse(await fs.readFile("lang/ru.json", "utf8"));
const bootstrap = `
const locales = ${JSON.stringify(locales)};
const tr = key => key.split('.').reduce((v,k)=>v?.[k],locales) ?? key;
const clone = value => structuredClone(value);
const get = (obj,p) => p.split('.').reduce((v,k)=>v?.[k],obj);
const expand = obj => {const result={}; for (const [key,value] of Object.entries(obj)) {let at=result;const keys=key.split('.');keys.forEach((k,i)=>{if(i===keys.length-1)at[k]=value;else at=at[k]??={};});}return result;};
const merge = (target, data) => {for(const [key,value] of Object.entries(data)){if(value && typeof value==='object' && !Array.isArray(value) && !(value instanceof Set)){target[key]??={};merge(target[key],value);}else target[key]=clone(value);}return target;};
const fields = {};
for (const id of ['healthPercentages','itemTypes','statusEffects','customScripts']) fields[id] = {
 storage(bonus) {const value=bonus.filters[id];return id==='healthPercentages'?value?.type!==null:id==='customScripts'?!!value:value.size>0;},
 render(bonus) {
  if(id==='healthPercentages')return '<fieldset><legend>HP</legend><div class="form-group"><label>Процент HP</label><input name="filters.healthPercentages.value" type="number" min="0" max="100" value="'+bonus.filters[id].value+'"></div><div class="form-group"><label>Сравнение</label><select name="filters.healthPercentages.type"><option value="">Не выбрано</option><option value="0" '+(bonus.filters[id].type===0?'selected':'')+'>или ниже</option><option value="1" '+(bonus.filters[id].type===1?'selected':'')+'>или выше</option></select></div></fieldset>';
  return '<fieldset><input name="filters.'+id+'" value="'+(id==='customScripts'?bonus.filters[id]:[...bonus.filters[id]].join(';'))+'"></fieldset>';
 }
};
class Bonus {
 constructor(source,{parent}) {this.parent=parent;this.source=clone(source);this.source.filters={healthPercentages:{value:50,type:null},itemTypes:[],statusEffects:[],customScripts:'',...this.source.filters};this.refresh();}
 refresh(){Object.assign(this,clone(this.source));for(const id of ['itemTypes','statusEffects'])this.filters[id]=new Set(this.filters[id]);this.actor=actor;this.item=null;this.uuid='Actor.demo.Bonus.demo';this.schema={getField:path=>({label:tr('BUILD_N_ACTION.FIELDS.'+path+'.label'),constructor:fields[path.split('.')[1]]})};}
 toObject(){return clone(this.source);}
 updateSource(data){if(data.filters?.healthPercentages){const value=data.filters.healthPercentages; if(value.value!==undefined)value.value=Number(value.value);if(value.type!==undefined)value.type=value.type===''?null:Number(value.type);if(value.value<0||value.value>100)throw Error('HP must be 0–100');} for(const id of ['itemTypes','statusEffects'])if(typeof data.filters?.[id]==='string')data.filters[id]=data.filters[id].split(';').filter(Boolean);merge(this.source,data);this.refresh();}
}
const actor={id:'actor',name:'Арден · воин',isOwner:true,system:{attributes:{hp:{pct:40}}},items:new Map()};
const item={id:'sword',name:'Пылающий меч',system:{activities:new Map()}};actor.items.set(item.id,item);
const owner={isOwner:true,flags:{'build-n-action':{bonuses:[]}},async setFlag(scope,key,data){this.flags[scope][key]=clone(data);window.writes++;}};
owner.flags['build-n-action'].bonuses=[{id:'demo',name:'Пламя последнего рубежа',type:'damage',filters:{healthPercentages:{value:50,type:0},itemTypes:['weapon']},bonuses:{bonus:'1d6',damageType:['fire']},conditionGraph:null}];
window.writes=0;window.errors=[];window.mock={fields,owner,Bonus,getCollection:()=>new Map(owner.flags['build-n-action'].bonuses.map(data=>[data.id,new Bonus(data,{parent:owner})]))};
class Application {
 static DEFAULT_OPTIONS={};
 constructor(options){this.options=options;this.id=options.id;}
 async render(){const context=await this._prepareContext();let html=${JSON.stringify(template)};html=html.replace(/{{#each gates}}([\\s\\S]*?){{\\/each}}/g,(_,part)=>context.gates.map(g=>part.replace(/{{(type|label|hint)}}/g,(_,key)=>g[key])).join(''));html=html.replace(/{{localize ["']([^"']+)["']}}/g,(_,key)=>tr(key)).replace(/{{name}}/g,context.name);this.element?.remove();this.element=document.createElement('form');this.element.className='application build-n-action blueprint';this.element.innerHTML='<div class="window-content">'+html+'</div>';document.body.append(this.element);this.element.addEventListener('click',e=>{const target=e.target.closest('[data-action]');if(target)this.constructor.DEFAULT_OPTIONS.actions[target.dataset.action]?.call(this,e,target);});this._onRender();return this;}
 _onRender(){}
 async close(){this.element.remove();return this;}
}
window.foundry={applications:{api:{ApplicationV2:Application,HandlebarsApplicationMixin:Base=>Base,DialogV2:class {static async confirm(){return true;}}},instances:new Map(),ux:{FormDataExtended:class{constructor(form){this.object=Object.fromEntries(new FormData(form));}}}},utils:{randomID:()=>crypto.randomUUID(),expandObject:expand,getProperty:get,getType:v=>Array.isArray(v)?"Array":"Object"}};
window.game={i18n:{localize:tr,has:key=>tr(key)!==key},actors:new Map([['actor',actor]]),user:{isGM:true,targets:new Set()},modules:new Map([['build-n-action',{api:{filters:{healthPercentages(s,v){return s.actor.system.attributes.hp.pct<=v.value;},itemTypes(){return true;}}}}]])};
window.ui={notifications:{error:message=>{window.errors.push(message);}}};window.canvas={tokens:{placeables:[],get:()=>null}};
const {default:Editor}=await import('/scripts/applications/condition-blueprint.mjs');window.editor=new Editor({bonus:new Bonus(owner.flags['build-n-action'].bonuses[0],{parent:owner})});await editor.render();
`;

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, "http://localhost");
  if (url.pathname === "/") {response.setHeader("Content-Type", "text/html; charset=utf-8");response.end(`<html lang="ru"><head><meta charset="utf-8"><link rel="stylesheet" href="/module.css"><style>*{box-sizing:border-box}body{margin:0;padding:18px;background:#11181b;font-family:'Segoe UI',sans-serif}form.application{height:calc(100vh - 36px);width:100%;max-width:1400px;margin:auto;border:1px solid #3c4446;border-radius:9px;overflow:hidden}.window-content{height:100%}button{cursor:pointer}input,select,button{font-family:inherit}button{line-height:1.4}select,input{padding:5px}.fa-solid{font-style:normal}.fa-solid::before{content:'◇'}p{margin:10px 0}</style></head><body class="theme-dark" data-bna-effects="on" data-bna-motion="on"><script type="module" src="/bootstrap.mjs"></script></body></html>`);return;}
  if (url.pathname === "/bootstrap.mjs") {response.setHeader("Content-Type", "text/javascript; charset=utf-8");response.end(bootstrap);return;}
  if (url.pathname === "/scripts/fields/_module.mjs") {response.setHeader("Content-Type", "text/javascript");response.end("export default window.mock.fields;");return;}
  if (url.pathname === "/scripts/services/bonus-repository.mjs") {response.setHeader("Content-Type", "text/javascript");response.end("export const getCollection=window.mock.getCollection;");return;}
  const resolved = path.resolve(root, "." + decodeURIComponent(url.pathname).replace('/modules/build-n-action/','/'));
  if (!resolved.startsWith(root + path.sep)) {response.writeHead(403).end();return;}
  try {response.setHeader("Content-Type", resolved.endsWith(".css") ? "text/css" : "text/javascript");response.end(await fs.readFile(resolved));} catch {response.writeHead(404).end();}
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
let browser;
try {
  browser = await chromium.launch({channel: "chrome", headless: true});
  const page = await browser.newPage({viewport: {width: 1366, height: 900}, reducedMotion: "reduce"});
  const failures = [];
  page.on("pageerror", error => failures.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.waitForSelector(".bna-node", {timeout: 10000});
  assert.equal(await page.locator(".bna-node").count(), 4);
  assert.equal(await page.locator('.window-content > *').count(), 1, 'Foundry template parts require exactly one root element');
  // Match the core constraints omitted by the original harness.
  await page.addStyleTag({content: '.application button { height: 24px; } .application button.icon { font-family: "Font Awesome 6 Pro"; }'});
  await page.evaluate(() => {
    const header=document.createElement('header'); header.className='window-header';
    header.innerHTML='<button type="button" class="icon fa-solid fa-xmark" aria-label="Close Window"></button>';
    editor.element.prepend(header);
  });
  assert.match(await page.locator('.window-header button').evaluate(e=>getComputedStyle(e).fontFamily), /Font Awesome/);
  const libraryEntries = await page.locator('.bna-catalog-entry').evaluateAll(entries => entries.map(e=>({height:e.getBoundingClientRect().height, textHeight:e.querySelector('span').getBoundingClientRect().height})));
  assert.ok(libraryEntries.every(e => e.height >= e.textHeight + 12), 'Wrapped labels must fit inside their own rows');
  assert.equal(await page.locator('[data-bp-action="save"]').evaluate(e=>e.scrollHeight <= e.clientHeight),true,'Save button must not clip its label under core button height rules');
  assert.equal(await page.locator('[data-bp-action="save"]').isEnabled(), true);
  const condition = page.locator('[data-node-id="condition-1"]');
  await condition.click();
  await page.locator('[name="filters.healthPercentages.value"]').fill("25");
  await page.locator('[name="filters.healthPercentages.value"]').press("Tab");
  assert.equal(await page.evaluate(() => editor.draft.filters.healthPercentages.value), 25);
  assert.equal(await page.locator('.bna-node[data-element=health-low]').getAttribute('data-health'),'25');
  assert.equal(await page.evaluate(() => writes), 0);
  await page.locator('[data-bp-action="undo"]').click();
  assert.equal(await page.evaluate(() => editor.draft.filters.healthPercentages.value), 50);
  await page.locator('[data-bp-action="redo"]').click();
  assert.equal(await page.evaluate(() => editor.draft.filters.healthPercentages.value), 25);
  await page.locator('[data-bp-action="undo"]').click();
  const box = await condition.boundingBox();
  const before = await page.evaluate(() => editor.graph.nodes[0].x);
  await page.mouse.move(box.x + 90, box.y + 45);await page.mouse.down();await page.mouse.move(box.x + 125, box.y + 70, {steps: 5});await page.mouse.up();
  assert.ok(await page.evaluate(() => editor.graph.nodes[0].x) > before);
  await page.locator('[data-bp-action="add"][data-type="or"]').click();
  assert.equal(await page.locator('[data-bp-action="save"]').isEnabled(), false);
  await page.locator('[data-bp-action="undo"]').click();
  await page.locator('[data-bp-action="save"]').click();
  assert.equal(await page.evaluate(() => writes), 1);
  assert.equal(await page.evaluate(() => mock.owner.flags['build-n-action'].bonuses[0].conditionGraph.enabled), true);
  await page.locator('.bna-blueprint-trial summary').click();
  await page.locator('[data-bp-context="actor"]').selectOption("actor");
  await page.locator('[data-bp-context="item"]').selectOption("sword");
  await page.locator('[data-bp-action="trial"]').click();
  assert.equal(await page.evaluate(() => editor.trial.result), true);
  await page.locator('.bna-blueprint-trial summary').click();
  await page.locator('[data-bp-action="fit"]').click();
  const oldScale = await page.evaluate(() => editor.view.scale);
  await page.locator('[data-bp-action="zoomIn"]').click();
  assert.ok(await page.evaluate(() => editor.view.scale) > oldScale);
  await page.locator('[data-bp-action="zoomOut"]').click();
  await page.locator('[data-bp-action="validate"]').click();
  assert.equal(await page.locator('.bna-blueprint-diagnostics').evaluate(e=>e.open),true);
  await page.locator('[data-bp-action="add"][data-type="branch"]').click();
  const branchId=await page.evaluate(()=>editor.selected);
  assert.equal(await page.locator(`[data-node-id="${branchId}"] .bna-port-out`).count(),2);
  await page.locator('[data-node-id="all"] .bna-port-out').click();
  await page.locator(`[data-node-id="${branchId}"] .bna-port-in`).click();
  await page.locator(`[data-node-id="${branchId}"] [data-port="false"]`).click();
  await page.locator('[data-node-id="result"] .bna-port-in').click();
  assert.equal(await page.locator('[data-bp-action="save"]').isEnabled(),true);
  await page.locator('[data-bp-action="save"]').click();
  assert.equal(await page.evaluate(()=>mock.owner.flags['build-n-action'].bonuses[0].conditionGraph.edges.some(e=>e.fromPort==='false')),true);
  await page.locator('[data-bp-action="fit"]').click();
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.locator('[data-node-id="result"]').hover();
  await page.locator('[data-node-id="result"]').focus();
  await page.waitForFunction(()=>editor.effects.surfaces.some(s=>s.intensity>.8),null,{timeout:3000});
  await page.waitForFunction(()=>editor.effects.fireReady===true);
  assert.equal(await page.locator('.bna-node[data-element=health-low]').count(),1,'Configured HP conditions get their own effect');
  const flameFrame = await page.locator('.bna-node[data-type=result] .bna-elemental-canvas').evaluate(e=>e.toDataURL());
  await page.waitForTimeout(150);
  assert.notEqual(await page.locator('.bna-node[data-type=result] .bna-elemental-canvas').evaluate(e=>e.toDataURL()),flameFrame,'Fire must evolve between frames');
  assert.equal(await page.locator('.bna-node[data-type=result] .bna-elemental-canvas').evaluate(e=>e.getContext('2d').getImageData(e.width/2,e.height/2,1,1).data[3]),0,'Effects must never cover node content');
  await fs.mkdir("artifacts", {recursive: true});
  await page.screenshot({path: "artifacts/blueprint-dark.png"});
  await page.evaluate(() => {document.body.dataset.bnaEffects='off';});
  await page.waitForFunction(()=>editor.effects.frame===0);
  assert.equal(await page.locator('.bna-node[data-type=result] .bna-elemental-canvas').evaluate(el=>getComputedStyle(el).display), "none");
  await page.evaluate(() => {document.body.dataset.bnaEffects='on';document.body.dataset.bnaMotion='off';});
  await page.waitForFunction(()=>editor.effects.frame===0);
  const stillFrame=await page.locator('.bna-node[data-type=result] .bna-elemental-canvas').evaluate(e=>e.toDataURL());
  await page.waitForTimeout(100);
  assert.equal(await page.locator('.bna-node[data-type=result] .bna-elemental-canvas').evaluate(e=>e.toDataURL()),stillFrame,'Motion off must freeze decorative drawing');
  await page.evaluate(() => {document.body.dataset.bnaMotion='on';});
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.waitForFunction(()=>editor.effects.frame===0);
  await page.evaluate(() => document.body.classList.remove('theme-dark'));
  await page.screenshot({path: "artifacts/blueprint-light.png"});
  await page.setViewportSize({width: 1024, height: 768});
  await page.screenshot({path: "artifacts/blueprint-compact.png"});
  assert.deepEqual(failures, []);
  assert.deepEqual(await page.evaluate(() => errors), []);
  const elements=await page.evaluate(async()=>{
    const {drawElementalEffect,EFFECT_ELEMENTS}=await import('/scripts/services/elemental-effects.mjs');
    const s=editor.effects.surfaces[0];
    return [...EFFECT_ELEMENTS].map(element=>{
      drawElementalEffect(s.ctx,{...s,element,time:0,intensity:1}); const before=s.canvas.toDataURL();
      drawElementalEffect(s.ctx,{...s,element,time:1,intensity:1});
      return {element,changes:before!==s.canvas.toDataURL(),center:s.ctx.getImageData(s.canvas.width/2,s.canvas.height/2,1,1).data[3]};
    });
  });
  assert.ok(elements.every(e=>e.changes && e.center===0),'All elemental effects animate without obscuring text');
  await page.evaluate(()=>editor.render());
  assert.equal(await page.locator('.bna-node[data-type=result] .bna-elemental-canvas').count(),1,'Rerender must not create duplicate canvases or schedulers');
  assert.equal(await page.locator('.bna-elemental-canvas').count(),2,'One surface per fire and HP node');
  await page.evaluate(()=>editor.close({force:true}));
  assert.equal(await page.locator('.bna-node[data-type=result] .bna-elemental-canvas').count(),0);
  assert.equal(await page.evaluate(()=>editor.effects.frame),0);
  console.log("Blueprint browser smoke passed: draft parameters, history, dragging, validation, save, trial, effects, dark/light/compact screenshots.");
} finally {await browser?.close();server.close();}

