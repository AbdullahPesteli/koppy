// Adapted from R-K25 rig.cjs: local Playwright, real pixels, persisted GM_config prefs.
const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const variant = process.env.LEGACY_VARIANT || 'fixed';
const revisions = { base: '7c0ea2dedae82ae56cac13f8aa829bef42bd8e07', broken: 'b1f024a8d9914ceecce26fe65cddcc4bad38fb0e' };
let code = revisions[variant] ? execFileSync('git', ['show', `${revisions[variant]}:dist/Koppy.user.js`], {maxBuffer: 8e6}).toString() : fs.readFileSync(path.resolve(__dirname, '../../dist/Koppy.user.js'), 'utf8');
// In-memory negative control: prove the preview assertion rejects a dead open path.
if (variant === 'mutant') {
 const marker='open:async function(e,buttonType){';
 if (!code.includes(marker)) throw new Error('Preview mutation marker missing');
 code=code.replace(marker,marker+' return; // test-only preview mutant\n');
}
const artifacts = path.join(__dirname, 'legacy-toolbar-artifacts');
fs.mkdirSync(artifacts, {recursive:true});
async function setup(page) {
  const errors = [], logs = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => logs.push(`${m.type()}: ${m.text()}`));
  await page.route('https://koppy.test/**', r => r.fulfill({contentType:'text/html', body:`<meta charset="utf-8"><body style="margin:0"><b>LAB — isolated fixture, not installed Zen</b><button id="menu" style="position:absolute;left:80px;top:100px;padding:0;border:0"><img id="icon" width="160" height="120"></button><img id="big" style="position:absolute;left:300px;top:100px;width:400px;height:300px"><img id="small" width="20" height="20" style="position:absolute;left:750px;top:100px"><div id="bg" style="position:absolute;left:300px;top:450px;width:300px;height:150px"></div><p id="txt" style="position:absolute;left:650px;top:500px">hello selectable text</p></body>`}));
  await page.goto('https://koppy.test/');
  await page.evaluate(() => {
    const c=document.createElement('canvas'); c.width=640;c.height=480;
    const x=c.getContext('2d');x.fillStyle='#168ac7';x.fillRect(0,0,640,480);x.fillStyle='#fa9';x.fillRect(40,40,200,160);x.fillStyle='black';x.font='40px sans-serif';x.fillText('LAB 640×480',40,300);
    const png=c.toDataURL();window.__png=png; document.querySelectorAll('img').forEach(i=>i.src=png);document.querySelector('#big').srcset=png+' 1x';document.querySelector('#bg').style.backgroundImage=`url(${png})`;
    window.__clicks=0;document.querySelector('#menu').onclick=()=>window.__clicks++;
    window.__writes=[];window.__copies=[];
    Object.defineProperty(navigator,'clipboard',{configurable:true,value:{write:async items=>{for(const item of items)for(const type of item.types){const b=await item.getType(type);window.__writes.push({type,size:b.size});}},writeText:async text=>window.__writes.push({type:'text/plain',text})}});
    window.addEventListener('copy',e=>{window.__copies.push({text:getSelection().toString(), prevented:e.defaultPrevented});e.preventDefault();}); // Test-only sink: never write host clipboard.
    const store={'pv-prefs':JSON.stringify({'floatBar.keys.enable':true,'floatBar.butonOrder':'actual,current,gallery,magnifier,download,stitch'})};
    const g={GM_getValue:(k,d)=>k in store?store[k]:d, GM_setValue:(k,v)=>store[k]=v,GM_deleteValue:k=>delete store[k],GM_addStyle:css=>{const s=document.createElement('style');s.textContent=css;document.head.append(s);return s;},GM_registerMenuCommand:()=>{},GM_unregisterMenuCommand:()=>{},GM_openInTab:()=>({close(){}}),GM_xmlhttpRequest:opts=>{fetch(opts.url).then(async r=>opts.onload?.({status:r.status,response:opts.responseType==='blob'?await r.blob():await r.arrayBuffer(),responseHeaders:'content-type: image/png'})).catch(e=>opts.onerror?.(e));return {abort(){}};},GM_getResourceText:()=>'',GM_getResourceURL:()=>'',GM_info:{script:{name:'Koppy',version:'LAB'},scriptHandler:'Tampermonkey'}};
    Object.assign(window,g);window.GM={getValue:g.GM_getValue,setValue:g.GM_setValue,addStyle:g.GM_addStyle,registerMenuCommand:g.GM_registerMenuCommand,xmlHttpRequest:g.GM_xmlhttpRequest,info:g.GM_info};
  });
  const pngBytes=Buffer.from((await page.evaluate(()=>__png)).split(',')[1],'base64');
  await page.route('https://koppy.test/image.png',r=>r.fulfill({contentType:'image/png',body:pngBytes}));
  await page.evaluate(()=>{document.querySelectorAll('img').forEach(i=>i.src='/image.png');document.querySelector('#big').srcset='/image.png 1x';document.querySelector('#bg').style.backgroundImage='url(/image.png)';});
  await page.addScriptTag({content:'(function(){'+code+'\n})();'});await page.waitForTimeout(500);
  return {errors,logs};
}
async function hover(page,id){await page.mouse.move(950,650);await page.locator('#'+id).hover();await page.waitForTimeout(400);}
async function receipt(page,name,state,extra={}){await page.screenshot({path:path.join(artifacts,`${variant}-${name}.png`)});fs.writeFileSync(path.join(artifacts,`${variant}-${name}.json`),JSON.stringify({...state,...extra},null,2));}
test('controller acquisition has zero unhandled errors',async({page})=>{
 const state=await setup(page);for(const id of ['big','small','bg','icon'])await hover(page,id);
 await receipt(page,'errors',state);expect(state.errors).toEqual([]);
});
test('explicit saved-key preview creates a real image window',async({page})=>{
 const state=await setup(page);await hover(page,'big');await page.keyboard.press('a');await page.waitForTimeout(800);
 const windows=await page.locator('.pv-pic-window-container').count();await receipt(page,'preview',state,{windows});expect(windows).toBeGreaterThan(0);expect(state.errors).toEqual([]);
});
test('legacy hitboxes absent; underlying menu receives exactly one click',async({page})=>{
 const state=await setup(page);const counts={};for(const id of ['big','small','bg','icon']){await hover(page,id);counts[id]=await page.locator('#pv-float-bar-container').count();}
 await page.screenshot({path:path.join(artifacts,`${variant}-hover.png`)});
 // First legacy toolbar button overlaps the upper-left area of the menu image.
 await page.mouse.click(88,108);const clicks=await page.evaluate(()=>window.__clicks);
 await receipt(page,'hitboxes',state,{counts,clicks});expect(counts).toEqual({big:0,small:0,bg:0,icon:0});expect(clicks).toBe(1);expect(state.errors).toEqual([]);
});
test('Cmd+C produces PNG bytes and selected text copy is not intercepted',async({page})=>{
 const state=await setup(page);await hover(page,'big');await page.keyboard.press('Meta+c');await page.waitForTimeout(1000);await receipt(page,'copy-debug',state,await page.evaluate(()=>({writes:__writes,text:document.body.innerText,diagnostics:window.KoppyDiagnostics?.summaryText?.()})));await expect.poll(()=>page.evaluate(()=>window.__writes.filter(x=>x.type==='image/png'&&x.size>0).length)).toBeGreaterThan(0);
 await page.evaluate(()=>{const r=document.createRange();r.selectNodeContents(document.querySelector('#txt'));getSelection().removeAllRanges();getSelection().addRange(r);});
 await page.keyboard.press('Meta+c');await page.waitForTimeout(200);
 const data=await page.evaluate(()=>({writes:__writes,copies:__copies,selection:getSelection().toString()}));await receipt(page,'copy',state,data);
 expect(data.copies.some(x=>x.text==='hello selectable text'&&!x.prevented)).toBe(true);expect(data.writes.filter(x=>x.type==='image/png')).toHaveLength(1);expect(state.errors).toEqual([]);
});
