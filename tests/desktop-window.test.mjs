import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {createConnectedBrowser} from '../desktop/connected-browser.mjs';

function desktop(settings={}){
 const windows=[],handlers=new Map(),external=[],timers=new Map();let timerId=0;
 const flushLayout=()=>{for(const [id,timer] of timers)if(timer.delay===250){timers.delete(id);timer.fn()}};
 class Window {
  constructor(options){this.options=options;this.visible=false;this.minimized=false;this.positions=0;this.bounds={x:100,y:100,width:options.width,height:options.height};this.events=new Map();this.sent=[];this.webContents={send:(...args)=>this.sent.push(args),once(){},on(){},setWindowOpenHandler(){}};if(options.webPreferences?.preload)windows.push(this)}
  once(name,fn){this.events.set(name,fn)} on(name,fn){this.events.set(name,fn)} loadURL(){} loadFile(file){this.file=file;return Promise.resolve()} close(){this.visible=false} show(){this.visible=true} showInactive(){this.visible=true} hide(){this.visible=false} isVisible(){return this.visible} isDestroyed(){return false}
  isMinimized(){return this.minimized} minimize(){this.minimized=true;this.visible=false} restore(){this.minimized=false;this.visible=true;this.events.get('restore')?.()} setSkipTaskbar(value){this.skipTaskbar=value}
  setBackgroundColor(value){this.background=value} setMinimumSize(width,height){this.minimum=[width,height]} setAlwaysOnTop(){} setVisibleOnAllWorkspaces(){} setTitleBarOverlay(value){this.theme=value} getBounds(){return this.bounds} getPosition(){return [this.bounds.x,this.bounds.y]} getSize(){return [this.bounds.width,this.bounds.height]} setSize(width,height){this.bounds={...this.bounds,width,height}} setPosition(x,y){this.positions++;this.bounds={...this.bounds,x,y}} focus(){} flashFrame(value){this.flashing=value}
 }
 const source=fs.readFileSync(new URL('../desktop/chrome.mjs',import.meta.url),'utf8').replace('export ','')+'\n'+fs.readFileSync(new URL('../desktop/main.mjs',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replace('const __dirname=path.dirname(fileURLToPath(import.meta.url));','const __dirname="/desktop";');
 vm.runInNewContext(source,{createConnectedBrowser,WebContentsView:class {},app:{whenReady:()=>({then:callback=>callback()}),on(){},setAppUserModelId(){},getPath:()=>'/user-data',getVersion:()=> '0.2.11',isPackaged:false},BrowserWindow:Window,ipcMain:{on:(name,fn)=>handlers.set(name,name==='pacifica:call-state'?(...args)=>{fn(...args);const overlay=windows[1];if(overlay&&!overlay.rendered){overlay.rendered=true;overlay.events.get('ready-to-show')?.();handlers.get('pacifica:overlay-rendered')?.({sender:overlay.webContents})}}:fn),handle:(name,fn)=>handlers.set(name,fn)},session:{defaultSession:{setPermissionRequestHandler(){},on(){}}},shell:{openExternal(url){external.push(url)}},screen:{getDisplayMatching:()=>({workArea:{x:0,y:0,width:1400,height:1000}})},nativeTheme:{shouldUseDarkColors:false,on(){}},systemPreferences:{getAccentColor:()=>'',on(){}},fs:{readFileSync:()=>settings.value||'{}',mkdirSync(){},writeFileSync:(_path,value)=>settings.value=value,renameSync(){}},electronUpdater:{autoUpdater:{}},path:{join:(...parts)=>parts.join('/')},process:{env:{},platform:'win32'},URL,setTimeout(fn,delay){timers.set(++timerId,{fn,delay});return timerId},clearTimeout(id){timers.delete(id)},setInterval(){},clearInterval(){},console});
 windows[0].webContents.mainFrame={url:'https://pacificacrm.com/dashboard'};
 return {windows,handlers,external,flushLayout,event:{sender:windows[0].webContents,senderFrame:windows[0].webContents.mainFrame}};
}
test('Ava gets room for queue controls and routes actions only from the native overlay',()=>{
 const {windows,handlers,event}=desktop(),update=handlers.get('pacifica:call-state');
 update(event,{active:true,mode:'ava',name:'Test contact',paused:false});const overlay=windows[1];assert.deepEqual(overlay.getSize(),[660,112]);
 for(const action of ['takeover','skip','pause'])handlers.get('pacifica:call-action')({sender:overlay.webContents},action);
 assert.deepEqual(windows[0].sent.filter(([name])=>name==='pacifica:call-action').map(([,action])=>action),['takeover','skip','pause']);
 handlers.get('pacifica:call-action')({sender:windows[0].webContents},'takeover');assert.equal(windows[0].sent.filter(([name])=>name==='pacifica:call-action').length,3);
 update(event,{active:true});assert.deepEqual(overlay.getSize(),[480,88]);
});
test('floating call window keeps a dragged position across timer updates and calls',()=>{
 const {windows,handlers,event}=desktop();const update=handlers.get('pacifica:call-state');
 update(event,{active:true,elapsed:'00:01'});assert.equal(windows.length,2);assert.equal(windows[1].bounds.x,460);assert.equal(windows[1].bounds.height,88);
 windows[1].setPosition(160,200);const positions=windows[1].positions;
 update(event,{active:true,elapsed:'00:02'});assert.equal(windows[1].positions,positions);
 update(event,{active:false});assert.equal(windows[1].visible,false);
 update(event,{active:true});assert.equal(windows[1].bounds.x,160);
});
test('minimize survives call timer updates; call results appear outside the CRM',()=>{
 const {windows,handlers,event}=desktop(),update=handlers.get('pacifica:call-state');
 update(event,{active:true});const overlay=windows[1];handlers.get('pacifica:call-action')({sender:overlay.webContents},'minimize');
 update(event,{active:true,elapsed:'00:02'});assert.equal(overlay.minimized,true);assert.equal(overlay.visible,false);assert.equal(overlay.skipTaskbar,false);
 update(event,{active:false,wrapUp:{id:'1:10'}});assert.equal(overlay.minimized,false);assert.equal(overlay.visible,true);assert.equal(overlay.bounds.height,560);
 handlers.get('pacifica:exit-call-overlay')(event);assert.equal(overlay.visible,true);
 update(event,{active:false,wrapUp:null});assert.equal(overlay.visible,false);
});
test('desktop result actions require the current result and the native sender',()=>{
 const {windows,handlers,event}=desktop(),update=handlers.get('pacifica:call-state');
 update(event,{active:false,wrapUp:{id:'1:10'}});const action=handlers.get('pacifica:wrap-action');const decisions=()=>windows[0].sent.filter(([name])=>name==='pacifica:wrap-action');
 action({sender:windows[0].webContents},{id:'1:10',kind:'save'});action({sender:windows[1].webContents},{id:'old',kind:'save'});assert.equal(decisions().length,0);
 action({sender:windows[1].webContents},{id:'1:10',kind:'save'});assert.equal(decisions()[0][0],'pacifica:wrap-action');
 update(event,{active:true});action({sender:windows[1].webContents},{id:'1:10',kind:'save'});assert.equal(decisions().length,1);
});
test('untrusted frames cannot create native call windows',()=>{
 const {windows,handlers,event}=desktop();handlers.get('pacifica:call-state')({...event,senderFrame:{url:'https://example.com'}},{active:true});assert.equal(windows.length,1);
});
test('theme changes update native chrome outside a call',()=>{
 const {windows,handlers,event}=desktop();handlers.get('pacifica:theme')(event,'dark');assert.equal(windows[0].theme.color,'#101216');assert.equal(windows[0].theme.height,60);
});

test('layout changes preserve position, clamp to screen and persist across launches',()=>{
 const settings={},first=desktop(settings),update=first.handlers.get('pacifica:call-state');
 update(first.event,{active:true});const overlay=first.windows[1];overlay.setPosition(100,150);
 const toggle=()=>first.handlers.get('pacifica:call-action')({sender:overlay.webContents},'toggle-layout');
 toggle();assert.deepEqual(overlay.getSize(),[280,180]);assert.equal(overlay.bounds.x,100);assert.equal(overlay.bounds.y,150);
 first.flushLayout();assert.equal(JSON.parse(settings.value).layout,'vertical');assert.equal(overlay.sent.at(-1)[1].layout,'vertical');
 update(first.event,{active:false,wrapUp:{id:'1:10'}});assert.deepEqual(overlay.getSize(),[480,560]);
 toggle();assert.deepEqual(overlay.getSize(),[480,560]);
 update(first.event,{active:true});overlay.setPosition(1100,800);toggle();assert.deepEqual(overlay.getSize(),[480,88]);assert.equal(overlay.bounds.x,920);assert.equal(overlay.bounds.y,800);
 toggle();const second=desktop(settings);second.handlers.get('pacifica:call-state')(second.event,{active:true});assert.deepEqual(second.windows[1].getSize(),[280,180]);
});
test('only the overlay can change layout and invalid saved preferences use horizontal',()=>{
 const {windows,handlers,event}=desktop({value:'not-json'});handlers.get('pacifica:call-state')(event,{active:true});
 handlers.get('pacifica:call-action')(event,'toggle-layout');assert.deepEqual(windows[1].getSize(),[480,88]);
});

test('native overlay resizes and remembers separate sizes and screen position',()=>{
 const settings={},first=desktop(settings),update=first.handlers.get('pacifica:call-state');update(first.event,{active:true});const overlay=first.windows[1];assert.equal(overlay.options.resizable,true);
 overlay.setSize(720,140);overlay.events.get('resized')();overlay.setPosition(200,250);overlay.events.get('moved')();update(first.event,{active:true,elapsed:'00:03'});assert.deepEqual(overlay.getSize(),[720,140]);
 first.handlers.get('pacifica:call-action')({sender:overlay.webContents},'toggle-layout');assert.deepEqual(overlay.getSize(),[280,180]);
 first.handlers.get('pacifica:call-action')({sender:overlay.webContents},'toggle-layout');assert.deepEqual(overlay.getSize(),[720,140]);
 const second=desktop(settings);second.handlers.get('pacifica:call-state')(second.event,{active:true});assert.deepEqual(second.windows[1].getSize(),[720,140]);assert.equal(second.windows[1].bounds.x,200);assert.equal(second.windows[1].bounds.y,250);
});

test('installed desktop version is available only to trusted app frames',()=>{
 const {handlers,event}=desktop();const version=handlers.get('pacifica:desktop-version');assert.equal(version(event),'0.2.11');assert.equal(version({...event,senderFrame:{url:'https://example.com'}}),null);
});

function downloadRoute({configured='',allowed=true,releases=[],ok=true}={}){
 const source=fs.readFileSync(new URL('../app/api/desktop/download/route.ts',import.meta.url),'utf8');
 const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText.replace(/^import .*;$/gm,'').replace(/^export /gm,'');
 const context=vm.createContext({Response,URL,console,getPacificaAccess:async()=>({allowed}),process:{env:{PACIFICA_DESKTOP_WINDOWS_URL:configured}},fetch:async()=>({ok,json:async()=>releases})});vm.runInContext(compiled,context);return ()=>context.GET(new Request('https://pacificacrm.com/api/desktop/download'));
}
test('an older pinned GitHub installer redirects to the latest release without caching',async()=>{
 const url='https://github.com/aypacharrito/Dialer/releases/download/pacifica-desktop-11/Pacifica-Setup-0.2.11.exe';
 const response=await downloadRoute({configured:'https://github.com/aypacharrito/Dialer/releases/download/pacifica-desktop-2/old.exe',releases:[{tag_name:'pacifica-desktop-11',assets:[{name:'Pacifica-Setup-0.2.11.exe',browser_download_url:url}]}]})();assert.equal(response.status,302);assert.equal(response.headers.get('location'),url);assert.equal(response.headers.get('cache-control'),'no-store');
});
test('failed latest release lookup does not silently hand out an obsolete installer',async()=>{
 const response=await downloadRoute({configured:'https://github.com/aypacharrito/Dialer/releases/download/pacifica-desktop-2/old.exe',ok:false})();assert.equal(response.status,503);
});
test('custom external installers and subscription checks remain supported',async()=>{
 assert.equal((await downloadRoute({configured:'https://downloads.example.com/Pacifica.exe'})()).headers.get('location'),'https://downloads.example.com/Pacifica.exe');assert.equal((await downloadRoute({allowed:false})()).status,403);
});

test('ending a call replaces the rectangle with a separate result view and restores call size on retry',()=>{
 const {windows,handlers,event}=desktop(),update=handlers.get('pacifica:call-state');update(event,{active:true});const overlay=windows[1];overlay.setSize(700,110);overlay.events.get('resized')();
 update(event,{active:false,wrapUp:{id:'manual:1'}});assert.deepEqual(overlay.getSize(),[480,560]);assert.equal(overlay.sent.at(-1)[1].active,false);assert.equal(overlay.sent.at(-1)[1].wrapUp.id,'manual:1');
 update(event,{active:true,wrapUp:null});assert.deepEqual(overlay.getSize(),[700,110]);assert.equal(overlay.sent.at(-1)[1].wrapUp,null);
});

test('Google calendar authorization opens only the fixed CRM URL in the system browser for trusted frames',async()=>{
 const {handlers,external,event}=desktop();const open=handlers.get('pacifica:open-calendar-browser');
 assert.equal(await open({...event,senderFrame:{url:'https://attacker.test'}}),false);assert.equal(external.length,0);
 assert.equal(await open(event),true);assert.equal(external[0],'https://pacificacrm.com/dashboard?calendar=open');
});


test('connected page controls require the CRM main frame, including same-origin iframe rejection',async()=>{
 const {handlers,event}=desktop();
 for(const channel of ['page-open','page-bounds','page-action','page-capture','page-close']){
  const handler=handlers.get(`pacifica:${channel}`);
  for(const senderFrame of [{url:'https://attacker.test/dashboard'},{url:event.senderFrame.url}])assert.throws(()=>handler({...event,senderFrame}),/signed-in workspace/);
  for(const url of ['https://pacificacrm.com/login','https://pacificacrm.com/dashboard-other']){event.senderFrame.url=url;assert.throws(()=>handler(event),/signed-in workspace/)}
  event.senderFrame.url='https://pacificacrm.com/dashboard';
 }
 assert.equal(handlers.get('pacifica:page-bounds')(event,{}),false);
 await assert.rejects(handlers.get('pacifica:page-capture')(event),/Wait for the page/);
 assert.doesNotThrow(()=>handlers.get('pacifica:page-close')(event));
});

test('native startup defaults to dark and restores the selected appearance on relaunch',()=>{
 const settings={},first=desktop(settings);
 assert.equal(first.windows[0].options.backgroundColor,'#101216');
 first.handlers.get('pacifica:theme')(first.event,'light');
 assert.equal(first.windows[0].background,'#f2f3f5');assert.equal(JSON.parse(settings.value).appearance,'light');
 const second=desktop(settings);assert.equal(second.windows[0].options.backgroundColor,'#f2f3f5');assert.equal(second.windows[0].options.titleBarOverlay.color,'#f2f3f5');assert.equal(second.windows[0].options.titleBarOverlay.height,60);
 second.handlers.get('pacifica:theme')(second.event,'dark');
 assert.equal(desktop(settings).windows[0].options.backgroundColor,'#101216');
});
test('untrusted or invalid themes cannot replace the saved native appearance',()=>{
 const settings={},h=desktop(settings);
 h.handlers.get('pacifica:theme')({...h.event,senderFrame:{url:'https://example.com'}},'light');
 h.handlers.get('pacifica:theme')(h.event,'unknown');
 assert.equal(settings.value,undefined);assert.equal(h.windows[0].options.backgroundColor,'#101216');
});
