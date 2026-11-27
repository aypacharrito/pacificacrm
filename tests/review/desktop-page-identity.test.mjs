import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';

test('desktop verifies the signed-in member before opening or capturing a page',async()=>{
 const handlers=new Map(),partitions=new Map(),windows=[];
 const ipcMain=new EventEmitter();ipcMain.handle=(name,fn)=>handlers.set(name,fn);
 const app=new EventEmitter();app.whenReady=()=>Promise.resolve();app.getPath=()=>'.';app.setAppUserModelId=()=>{};
 class Contents extends EventEmitter{url='https://pacificacrm.com/dashboard';mainFrame={url:this.url};navigationHistory={canGoBack:()=>false,canGoForward:()=>false};getURL(){return this.url}getTitle(){return 'Synthetic citation'}isLoading(){return false}isDestroyed(){return false}close(){}setWindowOpenHandler(){}loadURL(url){this.url=url;return Promise.resolve()}send(){}async executeJavaScript(){return {title:'Synthetic citation',url:this.url,text:'Coverage details'}}}
 class Window extends EventEmitter{constructor(){super();this.webContents=new Contents();this.contentView={addChildView(){},removeChildView(){}};windows.push(this)}loadURL(url){this.webContents.url=url;this.webContents.mainFrame.url=url;return Promise.resolve()}loadFile(){return Promise.resolve()}isDestroyed(){return false}getContentSize(){return [1200,900]}setTitleBarOverlay(){}setBackgroundColor(){}show(){}close(){this.emit('closed')}}
 class View{constructor(options){this.webContents=new Contents();this.options=options}setVisible(){}setBackgroundColor(){}setBounds(){}}
 let member='member-a',allowed=true;
 const session={defaultSession:{setPermissionRequestHandler(){},on(){},async fetch(url,options){assert.match(url,/\/api\/desktop\/page-identity$/);assert.equal(options.credentials,'include');return allowed?Response.json({workspaceId:'workspace',memberId:member}):Response.json({error:'No session'},{status:403})}},fromPartition(key){if(!partitions.has(key))partitions.set(key,{setPermissionRequestHandler(){},setPermissionCheckHandler(){},async clearStorageData(){this.cleared=true}});return partitions.get(key)}};
 globalThis.desktopHarness={app,ipcMain,BrowserWindow:Window,WebContentsView:View,session};
 const timeout=globalThis.setTimeout;globalThis.setTimeout=(fn,ms)=>[6000,12000].includes(ms)?0:timeout(fn,ms);
 try{
  await import('../../desktop/main.mjs');await Promise.resolve();await Promise.resolve();
  const main=windows[1],event={sender:main.webContents,senderFrame:main.webContents.mainFrame},open=handlers.get('pacifica:page-open');
  await assert.rejects(open(event,'https://example.com/policy','workspace','member-b'),/does not match/);assert.equal(partitions.size,0);
  await open(event,'https://example.com/policy','workspace','member-a');const first=[...partitions.keys()][0];assert.equal(partitions.size,1);
  await handlers.get('pacifica:page-capture')(event);member='member-b';
  await assert.rejects(handlers.get('pacifica:page-bounds')(event,{visible:true,bounds:{x:10,y:80,width:400,height:300}}),/another member/);assert.equal(partitions.get(first).cleared,true);
  await assert.rejects(handlers.get('pacifica:page-capture')(event),/another member/);
  await open(event,'https://example.com/other','workspace','member-b');assert.equal(partitions.size,2);
  allowed=false;await assert.rejects(handlers.get('pacifica:page-capture')(event),/another member/);assert.equal([...partitions.values()][1].cleared,true);
 }finally{globalThis.setTimeout=timeout;delete globalThis.desktopHarness}
});
