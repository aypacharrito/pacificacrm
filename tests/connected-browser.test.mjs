import test from 'node:test';import assert from 'node:assert/strict';import {EventEmitter} from 'node:events';
import {createHash} from 'node:crypto';
import {JSDOM} from 'jsdom';
import {pageUrl,pageCitation,pageBounds,pagePartition,createConnectedBrowser,visiblePageText} from '../desktop/connected-browser.mjs';
const identity=(workspaceId,memberId=workspaceId)=>({workspaceId,memberId});
test('connected pages reject privileged URLs and redact query credentials from AI citations',()=>{
 for(const url of ['file:///etc/passwd','http://example.com','javascript:alert(1)','https://localhost/a','https://127.0.0.1','https://[::1]','https://name:password@example.com','https://pacificacrm.com/dashboard'])assert.equal(pageUrl(url,'https://pacificacrm.com'),null,url);
 assert.equal(pageUrl('https://example.com/policy'),'https://example.com/policy');assert.equal(pageCitation('https://example.com/policy?token=secret#private'),'https://example.com/policy');
});
test('member partitions are stable, distinct, and do not reuse legacy workspace-only cookies',()=>{
 const a=pagePartition(identity('workspace','member-a')),b=pagePartition(identity('workspace','member-b'));
 assert.equal(a,pagePartition(identity('workspace','member-a')));assert.notEqual(a,b);assert.notEqual(a,'persist:pacifica-pages-'+createHash('sha256').update('workspace').digest('hex').slice(0,24));
 assert.throws(()=>pagePartition({workspaceId:'workspace'}),/Verified member/);
});
test('visible page capture excludes synthetic private notes in form controls and keeps a redacted citation',()=>{
 const dom=new JSDOM('<main><h1>Coverage terms</h1><textarea>Synthetic private note for member A</textarea><input value="Private key"><div contenteditable="true">Synthetic private note for member B</div><p aria-hidden="true">Hidden private text</p></main>',{url:'https://example.com/policy?token=private#member',runScripts:'outside-only'});
 dom.window.Element.prototype.getClientRects=function(){return [{width:100,height:20}]};
 const result=dom.window.eval(visiblePageText);
 assert.match(result.text,/Coverage terms/);assert.doesNotMatch(result.text,/private note|Private key|Hidden private text/i);
 assert.equal(pageCitation(result.url),'https://example.com/policy');dom.window.close();
});
test('native bounds stay inside the content area and outside the window title bar',()=>{
 assert.deepEqual(pageBounds({x:-50,y:0,width:5000,height:5000},[1200,900]),{x:0,y:68,width:1200,height:832});assert.equal(pageBounds({x:NaN,y:10,width:300,height:400},[1200,900]),null);
});
function harness(){
 const views=[],partitions=[],sent=[],opened=[];const sessions=new Map();
 class Contents extends EventEmitter{url='';navigationHistory={canGoBack:()=>false,canGoForward:()=>false};getURL(){return this.url}getTitle(){return 'Policy page'}isLoading(){return false}isDestroyed(){return !!this.destroyed}close(){this.destroyed=true}setWindowOpenHandler(fn){this.popup=fn}loadURL(url){this.url=url;return Promise.resolve()}reload(){}async executeJavaScript(script){assert.equal(script,visiblePageText);return {title:'Policy page',text:'Coverage details',url:this.url}}}
 class View{constructor(options){this.options=options;this.webContents=new Contents();views.push(this)}setBounds(value){this.bounds=value}setVisible(value){this.visible=value}setBackgroundColor(){}}
 const window={isDestroyed:()=>false,getContentSize:()=>[1200,900],contentView:{addChildView(){},removeChildView(){}}};
 const controller=createConnectedBrowser({getWindow:()=>window,WebContentsView:View,appOrigin:'https://pacificacrm.com',session:{fromPartition(key){partitions.push(key);if(sessions.has(key))return sessions.get(key);const value={setPermissionRequestHandler(fn){this.permission=fn},setPermissionCheckHandler(fn){this.check=fn},async clearStorageData(){this.cleared=true}};sessions.set(key,value);return value}},shell:{openExternal:async url=>opened.push(url)},onState:state=>sent.push(state)});
 return {controller,views,partitions,sessions,sent,opened};
}
test('remote pages are sandboxed without Node or preload, with separate workspace sessions',async()=>{
 const h=harness();await h.controller.open('https://example.com/policy',identity('workspace-a'));const options=h.views[0].options.webPreferences;assert.equal(options.nodeIntegration,false);assert.equal(options.contextIsolation,true);assert.equal(options.sandbox,true);assert.equal(options.preload,undefined);assert.equal(options.webSecurity,true);
 let allowed=true;options.session.permission(null,'media',answer=>allowed=answer);assert.equal(allowed,false);assert.equal(options.session.check(),false);
 assert.equal(h.views[0].webContents.popup({url:'https://accounts.example.com'}).action,'deny');
 h.controller.bound({visible:true,bounds:{x:600,y:180,width:580,height:680}});assert.equal(h.views[0].visible,true);
 await h.controller.open('https://example.com/other',identity('workspace-b'));assert.equal(h.views[0].webContents.isDestroyed(),true);assert.notEqual(h.partitions[0],h.partitions[1]);h.controller.close();assert.equal(h.views[1].webContents.isDestroyed(),true);
 assert.ok(h.partitions.every(key=>key.startsWith('persist:pacifica-pages-member-')));
});
test('explicit sign-out revokes only the active page session and preserves unrelated workspace partitions',async()=>{
 const h=harness();await h.controller.open('https://example.com/a',identity('workspace-a','member-a'));const first=h.partitions[0];h.controller.close();await h.controller.open('https://example.com/a-again',identity('workspace-a','member-a'));assert.equal(h.partitions[1],first,'the same member reuses their persisted login partition');
 await h.controller.open('https://example.com/b',identity('workspace-a','member-b'));const second=h.partitions[2];assert.notEqual(first,second);await h.controller.action('disconnect');assert.equal(h.sessions.get(second).cleared,true);assert.equal(h.sessions.get(first).cleared,undefined);assert.equal(h.controller.state().url,'');
});
test('capture is explicit, blocks sign-in pages, redacts tokens and survives external-browser fallback',async()=>{
 const h=harness();await h.controller.open('https://example.com/policy?token=secret#private',identity('workspace'));assert.equal((await h.controller.capture()).url,'https://example.com/policy');
 await h.controller.action('external');assert.equal(h.opened.length,1);
 await h.controller.open('https://accounts.google.com/signin',identity('workspace'));await assert.rejects(h.controller.capture(),/Finish signing in/);
 await h.controller.action('disconnect');assert.equal([...h.sessions.values()][0].cleared,true);assert.equal(h.controller.state().url,'');
});
test('navigation to local files is blocked even after an initially safe page',async()=>{
 const h=harness();await h.controller.open('https://example.com',identity('workspace'));let blocked=false;h.views[0].webContents.emit('will-navigate',{preventDefault(){blocked=true}},'file:///etc/passwd');assert.equal(blocked,true);assert.match(h.sent.at(-1).error,/cannot open/);h.controller.close();
});
