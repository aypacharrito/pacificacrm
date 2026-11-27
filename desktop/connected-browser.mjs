import {createHash} from 'node:crypto';
export function pageUrl(value,appOrigin=''){
 try{const url=new URL(String(value));const host=url.hostname.toLowerCase();
  if(url.protocol!=='https:'||url.username||url.password||url.origin===appOrigin||!host.includes('.')||host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||/^[\d.:\[\]]+$/.test(host))return null;
  return url.href;
 }catch{return null}
}
export function pageCitation(value){const url=new URL(value);url.search='';url.hash='';return url.href}
export function pagePartition(identity){
 const {workspaceId,memberId}=identity||{};
 if(typeof workspaceId!=='string'||!workspaceId.trim()||workspaceId.length>200||typeof memberId!=='string'||!memberId.trim()||memberId.length>200)throw Error('Verified member required.');
 return 'persist:pacifica-pages-member-'+createHash('sha256').update(JSON.stringify([workspaceId,memberId])).digest('hex').slice(0,32);
}
export function pageBounds(value,size){
 const {x,y,width,height}=value||{};if(![x,y,width,height].every(Number.isFinite))return null;
 const left=Math.max(0,Math.min(size[0],Math.round(x))),top=Math.max(68,Math.min(size[1],Math.round(y)));
 return {x:left,y:top,width:Math.max(0,Math.min(Math.round(width),size[0]-left)),height:Math.max(0,Math.min(Math.round(height),size[1]-top))};
}
// Only visible page text is shared. Credentials, inputs, scripts, cookies and
// storage are never read. This script is fixed; the renderer cannot supply code.
export const visiblePageText=`(()=>{const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);const parts=[];let total=0,node;while((node=walker.nextNode())&&total<24000){const el=node.parentElement;if(!el||el.closest('script,style,noscript,input,textarea,select,[contenteditable], [aria-hidden="true"]'))continue;const style=getComputedStyle(el);if(style.visibility==='hidden'||style.display==='none'||!el.getClientRects().length)continue;const text=node.textContent.trim();if(text){parts.push(text);total+=text.length}}return {title:document.title.slice(0,180),text:parts.join('\\n').slice(0,24000),url:location.href}})()`;
export function createConnectedBrowser({getWindow,WebContentsView,session,shell,appOrigin,onState}){
 let view=null,workspace='',error='',requestedUrl='',activeSession=null;
 const state=()=>({url:view?.webContents.getURL()||requestedUrl,title:view?.webContents.getTitle()||'',loading:view?.webContents.isLoading()||false,error,canGoBack:view?.webContents.navigationHistory.canGoBack()||false,canGoForward:view?.webContents.navigationHistory.canGoForward()||false});
 const publish=()=>onState(state());
 function close(){if(view){const window=getWindow();if(window&&!window.isDestroyed())window.contentView.removeChildView(view);if(!view.webContents.isDestroyed())view.webContents.close();view=null}workspace='';error='';requestedUrl='';publish()}
 function bound(value){if(!view)return false;const box=pageBounds(value?.bounds,getWindow()?.getContentSize()||[0,0]);view.setVisible(Boolean(value?.visible&&box&&box.width>20&&box.height>20));if(box)view.setBounds(box);return true}
 async function open(value,identity){
  const url=pageUrl(value,appOrigin);if(!url)throw Error('Use a public HTTPS website address.');
  const id=pagePartition(identity);
  const window=getWindow();if(!window||window.isDestroyed())throw Error('Open Pacifica first.');
  if(!view||workspace!==id){close();workspace=id;activeSession=session.fromPartition(id);
   activeSession.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
   activeSession.setPermissionCheckHandler(()=>false);
   view=new WebContentsView({webPreferences:{session:activeSession,contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true,allowRunningInsecureContent:false,webviewTag:false,spellcheck:true}});
   window.contentView.addChildView(view);view.setVisible(false);view.setBackgroundColor('#ffffff');
   const contents=view.webContents;
   contents.setWindowOpenHandler(()=>{error='This site opened another window. Use Open in browser to continue there.';publish();return {action:'deny'}});
   const guard=(event,target)=>{if(!pageUrl(target,appOrigin)){event.preventDefault();error='This destination cannot open in the page panel.';publish()}};
   contents.on('will-navigate',guard);contents.on('will-redirect',guard);
   for(const event of ['did-start-loading','did-stop-loading','did-navigate','did-navigate-in-page','page-title-updated'])contents.on(event,()=>{if(view?.webContents===contents)publish()});
   contents.on('did-fail-load',(_event,code,_description,_url,isMainFrame)=>{if(isMainFrame&&code!==-3){error='The page could not load. Retry or open it in your browser.';publish()}});
   contents.on('render-process-gone',()=>{error='The page stopped responding. Reload to continue.';publish()});
   contents.on('will-attach-webview',event=>event.preventDefault());
  }
  error='';requestedUrl=url;const opened=view;void opened.webContents.loadURL(url).catch(()=>{if(view===opened){error='The page could not load. Retry or open it in your browser.';publish()}});publish();return state();
 }
 async function action(name){
  if(name==='disconnect'){const saved=activeSession;close();await saved?.clearStorageData();activeSession=null;return state()}
  if(!view)return state();const contents=view.webContents;error='';
  if(name==='back'&&contents.navigationHistory.canGoBack())contents.navigationHistory.goBack();
  else if(name==='forward'&&contents.navigationHistory.canGoForward())contents.navigationHistory.goForward();
  else if(name==='reload')contents.reload();
  else if(name==='external'){const url=pageUrl(contents.getURL()||requestedUrl,appOrigin);if(url)await shell.openExternal(url)}
  publish();return state();
 }
 async function capture(){
  if(!view||view.webContents.isLoading())throw Error('Wait for the page to finish loading.');
  const before=pageUrl(view.webContents.getURL(),appOrigin);if(!before)throw Error('Open a website first.');
  if(/(?:\/|\.)(?:login|signin|sign-in|oauth|authorize|accounts)(?:[./?]|$)/i.test(before))throw Error('Finish signing in before adding this page.');
  const contents=view.webContents;const result=await contents.executeJavaScript(visiblePageText);
  if(view?.webContents!==contents||contents.getURL()!==before||result.url!==before)throw Error('The page changed. Try adding it again.');
  if(typeof result.text!=='string'||!result.text.trim())throw Error('No readable page text. You can paste details into the panel instead.');
  return {title:String(result.title||new URL(before).hostname).slice(0,180),url:pageCitation(before),text:result.text.slice(0,24000)};
 }
 return {open,bound,action,capture,close,state};
}
