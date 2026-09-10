/** Responsive layout regression with real module CSS/templates and explicit Foundry layout defaults. */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(process.env.BNA_PLAYWRIGHT ? pathToFileURL(path.join(process.env.BNA_PLAYWRIGHT,'index.mjs')).href : 'playwright');
const css='@layer foundry { .scrollable { margin-right: -12px; } }\n'+await fs.readFile('module.css','utf8');
let workshop=await fs.readFile('templates/bonus-workshop.hbs','utf8');
workshop=workshop.replace(/{{#each createButtons}}([\s\S]*?){{\/each}}/,(_,row)=>['Броски атаки','Броски урона','Кости здоровья','Сложность спасброска','Проверки характеристик','Спасброски'].map((name,i)=>row.replace(/{{type}}/g,String(i)).replace(/{{icon}}/g,'fa-solid').replace(/{{localize label}}/g,name)).join(''));
workshop=workshop.replace(/{{#each currentBonuses}}([\s\S]*?){{\/each}}/,(_,row)=>[1,2].map(i=>row.replace(/{{bonus.name}}/g,'Greataxe — длинное название бонуса '+i).replace(/{{{context.description}}}/g,'Описание бонуса с несколькими строками текста.').replace(/{{#unless bonus.enabled}}disabled{{\/unless}}/g,'').replace(/{{#if context.collapsed}}collapsed{{\/if}}/g,'')).join(''));
workshop=workshop.replace(/{{{?[^{}]+}?}}/g,'');
let nav=await fs.readFile('templates/sheet-navigation.hbs','utf8');
nav=nav.replace(/{{#each tabs}}([\s\S]*?){{\/each}}/,(_,row)=>['Описание','Бонусы','Настройки','Фильтры','Дополнительно'].map((name,i)=>row.replace(/{{id}}/g,String(i)).replace(/{{localize label}}/g,name).replace(/{{icon}}/g,'fa-solid').replace(/{{cssClass}}/g,i?'':'active')).join(''));
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
 const page=await browser.newPage({viewport:{width:1200,height:900}});
 for(const width of [280,320,440,620,820]) {
  await page.setContent(`<style>${css}\n*{box-sizing:border-box}body{background:#161a1d;margin:20px;font-family:'Segoe UI'} .application{height:700px;width:${width}px;display:flex;flex-direction:column;float:left;margin-right:16px}.window-content{flex:1;min-height:0;padding:0}.window-header{flex:none}.hidden{display:none!important}.form-fields{display:flex;gap:8px}.form-group{display:flex;flex-wrap:wrap;gap:8px}.form-group>label{flex:1}.form-group>.hint{flex:0 0 100%}input{width:100%}.tab.active{display:flex;flex-direction:column}.sheet fieldset{width:100%}.sheet-tabs a{color:inherit}.fa-solid:before{content:'◆'}</style><body class="theme-dark"><section class="application build-n-action builder"><header class="window-header">Бонусы предмета</header><div class="window-content">${workshop}</div></section><section class="application build-n-action sheet"><header class="window-header">Настройки бонуса</header><div class="window-content"><header class="header name-stacked"><input value="Greataxe"><ul class="properties"><li class="property">Броски урона</li></ul><button>Конструктор условий</button><p class="bna-blueprint-banner">Бонус управляется графом. После изменения условий откройте конструктор для проверки связей.</p></header>${nav}<div class="tab active scrollable"><fieldset><legend>Описание</legend><div class="form-group"><label>Изображение</label><div class="form-fields"><input value="systems/dnd5e/icons/weapons/greataxe.webp"><button>📁</button></div><p class="hint">Изображение бонуса, показываемое в интерфейсе.</p></div><textarea rows="12"></textarea></fieldset></div></div></section></body>`);
  const metrics=await page.evaluate(()=>{
   const box=e=>e.getBoundingClientRect();
   const select=document.querySelector('.select-type'),current=document.querySelector('.current-bonuses'),pages=document.querySelector('.pages');
   const tabs=[...document.querySelectorAll('.sheet-tabs .item')];
   return {selectorVisible:box(select).height>0,currentWidth:box(current).width,pagesWidth:box(pages).width,
    overflow:[...document.querySelectorAll('.window-content,.bonus,.sheet-tabs,.form-fields')].some(e=>e.scrollWidth>e.clientWidth+2),
    tabsOverlap:tabs.some((a,i)=>tabs.slice(i+1).some(b=>{const x=box(a),y=box(b);return Math.min(x.right,y.right)>Math.max(x.left,y.left)+1 && Math.min(x.bottom,y.bottom)>Math.max(x.top,y.top)+1;}))};
  });
  assert.ok(metrics.selectorVisible,`Type selector visible at ${width}`);
  assert.ok(!metrics.overflow,`No horizontal overflow at ${width}: ${JSON.stringify(metrics)}`);
  assert.ok(!metrics.tabsOverlap,`Tabs do not overlap at ${width}`);
  if(width<=680)assert.ok(metrics.currentWidth>=metrics.pagesWidth-2,`Bonuses use full row at ${width}`);
  await page.locator('.builder').screenshot({path:`artifacts/workshop-${width}.png`});
  await page.locator('.sheet').screenshot({path:`artifacts/bonus-sheet-${width}.png`});
 }
 console.log('PASS: workshop and bonus sheet at 280, 320, 440, 620, 820px; no hidden selector, collapsed list, overlapping tabs or horizontal overflow.');
} finally {await browser.close();}
