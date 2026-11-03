import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {JSDOM} from 'jsdom';
import {overlayTop} from '../../app/lib/workspace-chrome.ts';
import WorkspaceChromeMetrics from '../../app/components/WorkspaceChromeMetrics.tsx';
import {desktopChrome} from '../../desktop/chrome.mjs';
const read=name=>fs.readFileSync(new URL('../../'+name,import.meta.url),'utf8');
const css=read('app/polished-workspace.css')+'\n'+read('app/floating-workspace.css');
function lastToken(theme,name){const blocks=[...css.matchAll(new RegExp(`html\\[data-theme="${theme}"\\]\\s*\\{([^}]+)\\}`,'g'))];const values=blocks.flatMap(b=>[...b[1].matchAll(new RegExp(`--${name}:([^;}]*)`,'g'))].map(m=>m[1].trim()));return values.at(-1)}
function luminance(hex){if(hex.length===4)hex='#'+hex.slice(1).split('').map(x=>x+x).join('');const rgb=hex.slice(1).match(/../g).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722}
function contrast(a,b){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)}
test('native caption backgrounds exactly match the final light and dark web-shell colors',()=>{
 for(const theme of ['dark','light'])assert.equal(desktopChrome(theme).background,lastToken(theme,'ps-bg'));
 assert.ok(contrast(desktopChrome('light').symbols,desktopChrome('light').background)>7);
 assert.ok(contrast(desktopChrome('dark').symbols,desktopChrome('dark').background)>7);
 const pkg=JSON.parse(read('desktop/package.json'));assert.ok(pkg.build.files.includes('chrome.mjs'));assert.equal(pkg.build.publish[0].repo,'pacificacrm');
});
test('theme IPC updates native controls only for the trusted CRM and a valid theme',()=>{
 const source=read('desktop/main.mjs');const handler=source.match(/ipcMain.on\("pacifica:theme",([\s\S]*?)\n\}\);/)[1];
 const colors=[],overlays=[];const contents={};const window={webContents:contents,setBackgroundColor:c=>colors.push(c),setTitleBarOverlay:c=>overlays.push(c)};
 const context={mainWindow:window,desktopAppearance:'dark',saveOverlayLayout(){},nativeTheme:{},desktopChrome,lastCallState:{},overlayWindow:null,messageWindow:null,isAppUrl:url=>url==='https://pacificacrm.com/dashboard',overlayState:()=>({}),showMessagePopup(){}};
 const apply=vm.runInNewContext('('+handler+'\n})',context),event={sender:contents,senderFrame:{url:'https://pacificacrm.com/dashboard'}};
 apply(event,'light');assert.equal(colors.at(-1),lastToken('light','ps-bg'));assert.equal(overlays.at(-1).symbolColor,desktopChrome('light').symbols);assert.equal(overlays.at(-1).height,60);
 apply(event,'dark');assert.equal(colors.at(-1),lastToken('dark','ps-bg'));
 apply({...event,sender:{}},'light');apply({...event,senderFrame:{url:'https://evil.test'}},'light');apply(event,'invalid');assert.equal(colors.length,2);
});
test('drawer offset handles wrapped headers, fractional pixels and short windows',()=>{
 assert.equal(overlayTop(60,900),60);assert.equal(overlayTop(142.2,700),143);assert.equal(overlayTop(999,200),199);assert.equal(overlayTop(-1,800),0);assert.equal(overlayTop(NaN,800),60);
 assert.match(css,/\.workspace>\.topbar\{border:0!important/);
 assert.match(css,/\.drawer-backdrop\{top:var\(--crm-overlay-top/);
 assert.match(css,/\.contact-drawer\{top:0!important;bottom:auto!important;height:100%!important;max-height:100%!important/);
});
test('the single header observer updates the real sheet inset and cleans up on unmount',async()=>{
 const dom=new JSDOM('<div class="app-shell"><section class="workspace"><header class="topbar"></header></section></div><div id="root"></div>',{pretendToBeVisual:true});
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,IS_REACT_ACT_ENVIRONMENT:true});let bottom=60,callback,disconnected=0;
 document.querySelector('.topbar').getBoundingClientRect=()=>({bottom});
 globalThis.ResizeObserver=class{constructor(fn){callback=fn}observe(){}disconnect(){disconnected++}};
 const root=createRoot(document.getElementById('root'));
 try{await act(async()=>root.render(React.createElement(WorkspaceChromeMetrics)));assert.equal(document.documentElement.style.getPropertyValue('--crm-overlay-top'),'60px');bottom=112;await act(async()=>{callback();callback();await new Promise(r=>setTimeout(r,30))});assert.equal(document.documentElement.style.getPropertyValue('--crm-overlay-top'),'112px');}
 finally{await act(async()=>root.unmount());assert.equal(disconnected,1);assert.equal(document.documentElement.style.getPropertyValue('--crm-overlay-top'),'');delete globalThis.ResizeObserver;dom.window.close()}
});
test('all normal light-mode text tokens exceed 4.5:1 on every neutral work surface',()=>{
 for(const role of ['ps-text','ps-text-strong','ps-muted','ps-subtle'])for(const surface of ['ps-bg','ps-surface','ps-surface-2','ps-surface-3'])assert.ok(contrast(lastToken('light',role),lastToken('light',surface))>=4.5,`${role} on ${surface}`);
 assert.ok(contrast('#ffffff','#365d49')>=4.5);
});
test('the actual font changes to native Segoe; unused bundled fonts are not eagerly downloaded',()=>{
 assert.match(read('app/typography.css'),/--font-pacifica: "Segoe UI Variable Text", "Segoe UI Variable", "Segoe UI"/);
 assert.doesNotMatch(read('app/layout.tsx'),/rel="preload".*as="font"/);
 assert.match(css,/label>small\{[^}]*opacity:1!important/);
});
