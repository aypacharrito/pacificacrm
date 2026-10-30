import { app, BrowserWindow, WebContentsView, ipcMain, session, shell, screen, nativeTheme, systemPreferences, dialog } from "electron";
import electronUpdater from "electron-updater";
import {createConnectedBrowser} from "./connected-browser.mjs";
import {createDesktopUpdater} from "./updater.mjs";
import {desktopChrome} from "./chrome.mjs";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname=path.dirname(fileURLToPath(import.meta.url));
function systemAppearance(){let accent;try{const value=systemPreferences.getAccentColor();if(typeof value==='string'&&/^[a-f0-9]{8}$/i.test(value))accent='#'+value.slice(0,6)}catch{}return {theme:nativeTheme.shouldUseDarkColors?'dark':'light',accent}}
const publishSystemAppearance=()=>{if(mainWindow&&!mainWindow.isDestroyed())mainWindow.webContents.send('pacifica:system-appearance',systemAppearance())};
nativeTheme.on('updated',publishSystemAppearance);
if(process.platform==='win32'||process.platform==='linux')systemPreferences.on('accent-color-changed',publishSystemAppearance);
ipcMain.handle('pacifica:system-appearance',event=>trustedMain(event)?systemAppearance():null);
const appUrl=(process.env.PACIFICA_APP_URL||"https://pacificacrm.com/dashboard?desktop=1").trim();
const appOrigin=new URL(appUrl).origin;
let mainWindow=null;
let splashWindow=null;
let overlayWindow=null;
let messageWindow=null;
let messageQueue=[];
const seenMessages=new Set();
let overlayPhase="";
let overlayReady=false;
let reloadOverlay=null;
let overlayLoadTimer=null;
let overlayRecoveryAttempts=0;
let overlayLayout="horizontal";
let overlayGeometry="";
let overlaySizes={};
let overlayPosition=null;
let desktopAppearance="dark";
let lastCallState={active:false};
const {autoUpdater}=electronUpdater; // PACIFICA_DESKTOP_AUTO_UPDATE_V1
let updateTimer=null;
let desktopUpdater=null;
let rendererRecoveryTimer=null;
let lastRendererRecovery=0;
let unresponsiveTimer=null;
const connectedPages=createConnectedBrowser({getWindow:()=>mainWindow,WebContentsView,session,shell,appOrigin,onState:state=>{if(mainWindow&&!mainWindow.isDestroyed())mainWindow.webContents.send('pacifica:page-state',state)}});
function trustedPageControl(event){return trustedMain(event)&&event.senderFrame===mainWindow.webContents.mainFrame&&/^\/dashboard(?:\/|$)/.test(new URL(event.senderFrame.url).pathname)}
for(const [channel,handler] of Object.entries({
 'pacifica:page-open':(_event,url,workspaceId)=>connectedPages.open(url,workspaceId),
 'pacifica:page-bounds':(_event,value)=>connectedPages.bound(value),
 'pacifica:page-action':(_event,name)=>connectedPages.action(name),
 'pacifica:page-capture':()=>connectedPages.capture(),
 'pacifica:page-close':()=>connectedPages.close(),
}))ipcMain.handle(channel,(event,...args)=>{if(!trustedPageControl(event))throw Error('Open your signed-in workspace first.');return handler(event,...args)});

function host(url){
  try{return new URL(url).hostname.toLowerCase()}catch{return ""}
}
function isAppUrl(url){
  try{return new URL(url).origin===appOrigin}catch{return false}
}
function isAuthUrl(url){
  const value=host(url);
  return value==="accounts.google.com"||
    value==="accounts.googleusercontent.com"||
    value.endsWith(".googleusercontent.com")||
    value==="clerk.com"||
    value.endsWith(".clerk.com")||
    value==="accounts.dev"||
    value.endsWith(".accounts.dev")||
    value.endsWith(".clerk.accounts.dev");
}
function isTrustedNavigation(url){return isAppUrl(url)||isAuthUrl(url)}

function loadOverlayLayout(){
  try{const value=JSON.parse(fs.readFileSync(path.join(app.getPath("userData"),"overlay-settings.json"),"utf8"));if(value.appearance==="light")desktopAppearance="light";if(value.layout==="vertical")overlayLayout="vertical";if(value.sizes&&typeof value.sizes==="object")overlaySizes=value.sizes;if(Number.isFinite(value.position?.x)&&Number.isFinite(value.position?.y))overlayPosition=value.position}catch{/* First launch or invalid preferences: use the compact horizontal bar. */}
  nativeTheme.themeSource="system";
}
let saveLayoutTimer;
function scheduleOverlayLayoutSave(){clearTimeout(saveLayoutTimer);saveLayoutTimer=setTimeout(saveOverlayLayout,250)}
function saveOverlayLayout(){
  try{const directory=app.getPath("userData"),file=path.join(directory,"overlay-settings.json");fs.mkdirSync(directory,{recursive:true});fs.writeFileSync(`${file}.tmp`,JSON.stringify({appearance:desktopAppearance,layout:overlayLayout,sizes:overlaySizes,position:overlayPosition}));fs.renameSync(`${file}.tmp`,file)}catch(error){console.warn("[Pacifica overlay layout]",error?.message||error)}
}
function overlayState(){return {...lastCallState,theme:desktopAppearance,layout:lastCallState.active?overlayLayout:"vertical"}}
function overlayMinimum(phase){
  if(phase==="call"&&lastCallState.mode==="ava")return overlayLayout==="vertical"?[300,230]:[660,112];
  return phase==="incoming"?[420,138]:phase==="wrap"?[480,560]:(overlayLayout==="vertical"?[280,180]:[480,88]);
}
function overlayDimensions(phase){
  const minimum=overlayMinimum(phase);
  const saved=overlaySizes[phase==="incoming"?"incoming":phase==="wrap"?"wrap:result":`${phase}:${overlayLayout}${lastCallState.mode==="ava"?":ava":""}`];
  return minimum.map((size,index)=>Math.max(size,Math.min(index?900:1200,Number(saved?.[index])||size)));
}

function positionOverlay(){
  if(!overlayWindow)return;
  const display=overlayPosition?screen.getDisplayMatching({...overlayPosition,width:480,height:88}):mainWindow?screen.getDisplayMatching(mainWindow.getBounds()):screen.getPrimaryDisplay();
  const area=display.workArea;
  const [width,height]=overlayWindow.getSize();
  const x=overlayPosition?Math.max(area.x,Math.min(overlayPosition.x,area.x+area.width-width)):area.x+Math.max(0,Math.round((area.width-width)/2));
  const y=overlayPosition?Math.max(area.y,Math.min(overlayPosition.y,area.y+area.height-height)):area.y+16;
  overlayWindow.setPosition(x,y,false);
}

function createOverlay(){
  if(overlayWindow&&!overlayWindow.isDestroyed())return overlayWindow;
  overlayReady=false;
  overlayWindow=new BrowserWindow({
    width:480,height:88,minWidth:280,minHeight:88,maxWidth:1200,maxHeight:900,
    frame:false,resizable:true,minimizable:true,show:false,alwaysOnTop:true,skipTaskbar:true,
    backgroundColor:desktopChrome(desktopAppearance).background,title:"Pacifica Call",icon:path.join(__dirname,"assets/pacifica.ico"),
    webPreferences:{preload:path.join(__dirname,"overlay-preload.cjs"),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}
  });
  overlayWindow.setAlwaysOnTop(true,"floating");
  overlayWindow.setVisibleOnAllWorkspaces(true,{visibleOnFullScreen:true});
  const overlay=overlayWindow;
  const load=()=>{
    overlayReady=false;overlay.hide();
    if(overlayLoadTimer)clearTimeout(overlayLoadTimer);
    overlayLoadTimer=setTimeout(()=>recoverOverlay("Call controls did not finish loading"),12000);
    void overlay.loadFile(path.join(__dirname,"overlay.html")).catch(()=>recoverOverlay("Call controls could not load"));
  };
  const recoverOverlay=reason=>{
    if(overlay!==overlayWindow||overlay.isDestroyed())return;
    overlayReady=false;overlay.hide();
    if(overlayLoadTimer){clearTimeout(overlayLoadTimer);overlayLoadTimer=null}
    if(!lastCallState.active&&!lastCallState.incoming&&!lastCallState.wrapUp)return;
    if(overlayRecoveryAttempts++<1){load();return}
    publishOverlayStatus(false,reason);
    mainWindow?.webContents.send("pacifica:overlay-error",reason+". Keep using the call controls in Pacifica.");
    // Restore only the main window; reloading it would disconnect a live call.
    if(mainWindow?.isMinimized())mainWindow.restore();mainWindow?.show();
  };
  reloadOverlay=load;
  overlay.once("ready-to-show",()=>{revealRenderedOverlay()});
  overlay.webContents.on("render-process-gone",()=>recoverOverlay("The floating window stopped responding"));
  overlay.webContents.on("unresponsive",()=>recoverOverlay("The floating window stopped responding"));
  overlay.webContents.on("did-finish-load",()=>overlay.webContents.send("pacifica:call-state",overlayState()));
  load();
  positionOverlay();
  overlayWindow.on("resized",()=>{if(!overlayGeometry)return;overlaySizes[overlayGeometry]=overlayWindow.getSize();scheduleOverlayLayoutSave()});
  overlayWindow.on("moved",()=>{const {x,y}=overlayWindow.getBounds();overlayPosition={x,y};scheduleOverlayLayoutSave()});
  overlayWindow.on("restore",()=>overlayWindow?.setSkipTaskbar(true));
  overlayWindow.on("closed",()=>{if(overlayLoadTimer)clearTimeout(overlayLoadTimer);overlayWindow=null;overlayReady=false;reloadOverlay=null;overlayPhase="";overlayGeometry="";overlayRecoveryAttempts=0});
  return overlayWindow;
}

function recoverMainRenderer(reason="renderer unavailable"){
  if(!mainWindow||mainWindow.isDestroyed())return;
  const now=Date.now();if(now-lastRendererRecovery<8000)return;lastRendererRecovery=now;
  console.warn("[Pacifica desktop recovery]",reason);
  if(rendererRecoveryTimer)clearTimeout(rendererRecoveryTimer);
  rendererRecoveryTimer=setTimeout(()=>{
    rendererRecoveryTimer=null;
    if(!mainWindow||mainWindow.isDestroyed())return;
    const current=mainWindow.webContents.getURL();
    if(isAppUrl(current))mainWindow.webContents.reloadIgnoringCache();
    else void mainWindow.loadURL(appUrl);
  },650);
}

function createWindow(){
  splashWindow=new BrowserWindow({width:220,height:180,frame:false,transparent:true,resizable:false,show:false,skipTaskbar:true,alwaysOnTop:true,webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true}});
  const splash=splashWindow;
  splash.once("ready-to-show",()=>{if(!splash.isDestroyed())splash.showInactive()});
  void splash.loadFile(path.join(__dirname,"splash.html"));
  const finishSplash=()=>{if(splashWindow&&!splashWindow.isDestroyed())splashWindow.close();splashWindow=null;mainWindow?.show()};
  const splashTimeout=setTimeout(finishSplash,12000);
  mainWindow=new BrowserWindow({
    width:1420,height:920,minWidth:940,minHeight:650,show:false,
    backgroundColor:desktopChrome(desktopAppearance).background,title:"Pacifica",icon:path.join(__dirname,"assets/pacifica.ico"),
    autoHideMenuBar:true,
    titleBarStyle:"hidden",
    titleBarOverlay:{color:desktopChrome(desktopAppearance).background,symbolColor:desktopChrome(desktopAppearance).symbols,height:60},
    webPreferences:{preload:path.join(__dirname,"preload.cjs"),contextIsolation:true,nodeIntegration:false,sandbox:true,spellcheck:true,backgroundThrottling:false}
  });
  mainWindow.once("ready-to-show",()=>{clearTimeout(splashTimeout);finishSplash()});
  mainWindow.webContents.setWindowOpenHandler(({url})=>{
    if(isTrustedNavigation(url))return {action:"allow"};
    if(/^https?:\/\//i.test(url))void shell.openExternal(url);return {action:"deny"};
  });
  mainWindow.webContents.on("did-navigate",(_event,url)=>{if(!isAppUrl(url)||!new URL(url).pathname.startsWith("/dashboard")){messageQueue=[];seenMessages.clear();messageWindow?.hide();connectedPages.close()}});
  mainWindow.webContents.on("will-navigate",(event,url)=>{if(!isTrustedNavigation(url)){event.preventDefault();if(/^https?:\/\//i.test(url))void shell.openExternal(url)}});
  mainWindow.webContents.on("render-process-gone",(_event,details)=>{if(details.reason!=="clean-exit")recoverMainRenderer(`renderer process gone: ${details.reason}`)});
  mainWindow.webContents.on("unresponsive",()=>{
    clearTimeout(unresponsiveTimer);
    unresponsiveTimer=setTimeout(async()=>{
      const window=mainWindow;
      if(!window||window.isDestroyed()||lastCallState.active||lastCallState.incoming||lastCallState.wrapUp)return;
      const choice=await dialog.showMessageBox(window,{type:"question",title:"Pacifica is taking a moment",message:"Keep waiting or reload Pacifica?",buttons:["Keep waiting","Reload"],defaultId:0,cancelId:0});
      if(choice.response===1&&window===mainWindow&&!window.isDestroyed()&&!lastCallState.active&&!lastCallState.incoming&&!lastCallState.wrapUp)recoverMainRenderer("owner requested reload");
    },15000);
  });
  mainWindow.webContents.on("responsive",()=>{clearTimeout(unresponsiveTimer);unresponsiveTimer=null});
  mainWindow.webContents.on("did-fail-load",(_event,code,description,_url,isMainFrame)=>{if(isMainFrame&&code!==-3)recoverMainRenderer(`load failed ${code}: ${description}`)});
  void mainWindow.loadURL(appUrl);
  mainWindow.on("closed",()=>{connectedPages.close();clearTimeout(unresponsiveTimer);clearTimeout(rendererRecoveryTimer);clearTimeout(splashTimeout);if(splashWindow&&!splashWindow.isDestroyed())splashWindow.close();splashWindow=null;messageWindow?.close();messageWindow=null;overlayWindow?.close();overlayWindow=null;mainWindow=null});
}

// Navigation is restricted to the main window and the existing trusted auth origins.
ipcMain.handle("pacifica:navigate",(event,action)=>{
  if(event.sender!==mainWindow?.webContents||!isTrustedNavigation(event.senderFrame?.url||event.sender.getURL()))return false;
  if(lastCallState.active||lastCallState.incoming||lastCallState.wrapUp)return false;
  if(action==="back"&&mainWindow.webContents.navigationHistory.canGoBack())mainWindow.webContents.navigationHistory.goBack();
  else if(action==="home"||action==="back")void mainWindow.loadURL(appUrl);
  return true;
});

function startDesktopUpdater(){
 desktopUpdater=createDesktopUpdater({updater:autoUpdater,supported:app.isPackaged&&process.platform==='win32',onState:state=>mainWindow?.webContents.send('pacifica:update-state',state),isBusy:()=>Boolean(lastCallState.active||lastCallState.incoming||lastCallState.wrapUp)});
 void desktopUpdater.check();updateTimer=setInterval(()=>void desktopUpdater.check(),4*60*60*1000);
}
ipcMain.handle('pacifica:update-status',event=>trustedMain(event)?desktopUpdater?.status():null);
ipcMain.handle('pacifica:update-check',event=>trustedMain(event)?desktopUpdater?.check():null);
ipcMain.handle('pacifica:update-install',event=>trustedMain(event)?desktopUpdater?.install():false);

app.whenReady().then(()=>{
  if(process.platform==="win32")app.setAppUserModelId("com.pacificacrm.desktop");
  session.defaultSession.setPermissionRequestHandler((webContents,permission,callback,details)=>{
    const trusted=isAppUrl(details.requestingUrl||webContents.getURL());
    callback(Boolean(trusted&&["media","notifications","clipboard-sanitized-write"].includes(permission)));
  });
  session.defaultSession.on("will-download",(_event,item,contents)=>{
    if(contents!==mainWindow?.webContents)return;
    item.setSaveDialogOptions({title:"Save attachment",defaultPath:path.join(app.getPath("downloads"),path.basename(item.getFilename()))});
  });
  loadOverlayLayout();
  createWindow();
  setTimeout(startDesktopUpdater,6000);
  app.on("activate",()=>{if(BrowserWindow.getAllWindows().length===0)createWindow()});
});
app.on("window-all-closed",()=>{if(updateTimer){clearInterval(updateTimer);updateTimer=null}if(process.platform!=="darwin")app.quit()});

function showCallOverlay(){
  const nextPhase=lastCallState.incoming?"incoming":lastCallState.active?"call":lastCallState.wrapUp?"wrap":"";
  if(!nextPhase){overlayWindow?.hide();overlayPhase="";publishOverlayStatus(false);return}
  const overlay=createOverlay();
  const phaseChanged=overlayPhase!==nextPhase;
  const geometry=nextPhase==="incoming"?"incoming":nextPhase==="wrap"?"wrap:result":`call:${overlayLayout}${lastCallState.mode==="ava"?":ava":""}`;
  if(overlayGeometry!==geometry){
    // Keep the exact top-left location when switching Call -> Call result.
    // Size changes must not make the overlay "jump" to a new position.
    const [oldX,oldY]=overlay.getPosition();
    const [width,height]=overlayDimensions(nextPhase);
    overlay.setMinimumSize(...overlayMinimum(nextPhase));
    overlay.setSize(width,height,false);
    const area=screen.getDisplayMatching({x:oldX,y:oldY,width:1,height:1}).workArea;
    const x=Math.max(area.x,Math.min(oldX,area.x+area.width-width));
    const y=Math.max(area.y,Math.min(oldY,area.y+area.height-height));
    overlay.setPosition(x,y,false);
    overlayPosition={x,y};scheduleOverlayLayoutSave();
    overlayGeometry=geometry;
  }
  overlay.webContents.send("pacifica:call-state",overlayState());
  if(!overlayReady)return;
  overlayPhase=nextPhase;
  // Timer updates must not restore a minimized window or move a dragged window.
  // A new result is shown so wrap-up is available outside the CRM as requested.
  if(overlay.isMinimized()){
    if(nextPhase!=="wrap"&&nextPhase!=="incoming")return;
    if(!phaseChanged)return;
    overlay.restore();
  }
  if(nextPhase==="incoming"&&phaseChanged){overlay.show();overlay.focus();overlay.flashFrame(true)}
  else if(!overlay.isVisible())overlay.showInactive();
  publishOverlayStatus(overlay.isVisible());
}

function publishOverlayStatus(open,error=''){
 mainWindow?.webContents.send('pacifica:overlay-status',{open,error});
}
function applyCallState(event,state){
 if(!trustedMain(event)||!state||typeof state!=='object')return false;
 lastCallState={...state,active:Boolean(state.active)};
 try{showCallOverlay();return true}catch(error){
  const reason=`Floating call could not open: ${error?.message||'native window error'}`;
  console.warn('[Pacifica overlay]',reason);publishOverlayStatus(false,reason);return false;
 }
}
ipcMain.on('pacifica:call-state',applyCallState);
// One ordered request supplies the call state and creates its window.
ipcMain.handle('pacifica:sync-call-state',applyCallState);

ipcMain.on("pacifica:call-action",(event,action)=>{
  if(!overlayWindow||event.sender!==overlayWindow.webContents||typeof action!=="string")return;
  if(action==="toggle-layout"&&lastCallState.active){overlayLayout=overlayLayout==="horizontal"?"vertical":"horizontal";saveOverlayLayout();showCallOverlay();return}
  if(action==="minimize"){overlayWindow.setSkipTaskbar(false);overlayWindow.minimize();return}
  if(!["open","mute","end","pause","takeover","skip","answer-incoming","decline-incoming"].includes(action)&&!/^digit:[0-9*#]$/.test(action))return;
  if(action==="open"){mainWindow?.show();mainWindow?.focus()}
  mainWindow?.webContents.send("pacifica:call-action",action);
});

ipcMain.on("pacifica:wrap-action",(event,action)=>{
  if(!overlayWindow||event.sender!==overlayWindow.webContents||lastCallState.active||!lastCallState.wrapUp||!action||typeof action!=="object")return;
  if(action.id!==lastCallState.wrapUp.id||!["save","again","pause"].includes(action.kind))return;
  mainWindow?.webContents.send("pacifica:wrap-action",action);
});

function trustedMain(event){return mainWindow&&event.sender===mainWindow.webContents&&isAppUrl(event.senderFrame?.url||"")}

ipcMain.handle("pacifica:enter-call-overlay",(event)=>{
  if(!trustedMain(event)||(!lastCallState.active&&!lastCallState.wrapUp&&!lastCallState.incoming))return false;
  const overlay=createOverlay();
  if(overlay.isMinimized())overlay.restore();
  showCallOverlay();
  if(!overlayReady){if(!overlayLoadTimer&&reloadOverlay){overlayRecoveryAttempts=0;reloadOverlay()}return true;}
  if(!overlay.isVisible())overlay.show();
  overlay.setAlwaysOnTop(true,"floating");
  try{overlay.moveTop()}catch{}
  overlay.focus();
  return overlay.isVisible();
});
ipcMain.handle("pacifica:exit-call-overlay",(event)=>{if(!trustedMain(event))return false;if(!lastCallState.active&&!lastCallState.incoming&&!lastCallState.wrapUp)overlayWindow?.hide();return true});
ipcMain.handle("pacifica:show-main-window",(event)=>{if(!trustedMain(event))return false;mainWindow?.show();mainWindow?.focus();return true});

ipcMain.on("pacifica:theme",(event,theme)=>{
  if(!mainWindow||event.sender!==mainWindow.webContents||!isAppUrl(event.senderFrame?.url||"")||(theme!=="dark"&&theme!=="light"))return;
  if(desktopAppearance!==theme){desktopAppearance=theme;saveOverlayLayout()}
  nativeTheme.themeSource="system";
  const chrome=desktopChrome(theme);
  mainWindow.setBackgroundColor(chrome.background);
  mainWindow.setTitleBarOverlay({color:chrome.background,symbolColor:chrome.symbols,height:60});
  lastCallState={...lastCallState,theme:theme==="dark"?"dark":"light"};
  overlayWindow?.setBackgroundColor(chrome.background);
  overlayWindow?.webContents.send("pacifica:call-state",overlayState());
  if(messageWindow?.isVisible())showMessagePopup();
});

ipcMain.handle("pacifica:desktop-version",event=>trustedMain(event)?app.getVersion():null);

// A dedicated always-on-top window keeps messages outside the Windows notification center.
function showMessagePopup(){
 if(!mainWindow||mainWindow.isDestroyed())return;
 if(!messageQueue.length){messageWindow?.hide();return}
 if(!messageWindow||messageWindow.isDestroyed()){
  messageWindow=new BrowserWindow({width:360,height:220,frame:false,resizable:false,show:false,alwaysOnTop:true,skipTaskbar:true,backgroundColor:desktopChrome(desktopAppearance).background,title:"Pacifica message",webPreferences:{preload:path.join(__dirname,"message-preload.cjs"),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  messageWindow.setAlwaysOnTop(true,"floating");messageWindow.setVisibleOnAllWorkspaces(true,{visibleOnFullScreen:true});
  messageWindow.webContents.setWindowOpenHandler(()=>({action:"deny"}));
  messageWindow.webContents.on("will-navigate",event=>event.preventDefault());
  messageWindow.on("closed",()=>{messageWindow=null});
  messageWindow.webContents.once("did-finish-load",()=>showMessagePopup());
  void messageWindow.loadFile(path.join(__dirname,"message.html"));return;
 }
 const area=screen.getDisplayMatching(mainWindow.getBounds()).workArea;
 messageWindow.setPosition(area.x+Math.max(0,area.width-376),area.y+Math.max(0,area.height-236));
 messageWindow.setBackgroundColor(desktopChrome(desktopAppearance).background);messageWindow.webContents.send("pacifica:message-state",{...messageQueue[0],theme:desktopAppearance});messageWindow.showInactive();
}
ipcMain.on("pacifica:message-state",(event,input)=>{
 if(!trustedMain(event)||!input||typeof input!=="object"||!Number.isSafeInteger(input.leadId))return;
 const id=String(input.id||"").slice(0,180);if(!id||seenMessages.has(id))return;
 seenMessages.add(id);if(seenMessages.size>500)seenMessages.delete(seenMessages.values().next().value);
 messageQueue.push({id,leadId:input.leadId,name:String(input.name||"New message").slice(0,100),body:String(input.body||"").slice(0,240),channel:input.channel==="email"?"email":"sms",theme:input.theme==="dark"?"dark":"light"});
 if(messageQueue.length>10)messageQueue.splice(1,1);showMessagePopup();
});
ipcMain.on("pacifica:message-action",(event,action)=>{
 if(!messageWindow||event.sender!==messageWindow.webContents||!messageQueue.length||!["open","dismiss"].includes(action))return;
 const message=messageQueue.shift();
 if(action==="open"&&mainWindow&&!mainWindow.isDestroyed()){if(mainWindow.isMinimized())mainWindow.restore();mainWindow.show();mainWindow.focus();mainWindow.webContents.send("pacifica:message-open",message)}
 showMessagePopup();
});

ipcMain.handle("pacifica:overlay-state",event=>{
 if(!overlayWindow||event.sender!==overlayWindow.webContents)return {active:false};
 return overlayState();
});
ipcMain.on("pacifica:overlay-rendered",event=>{
 if(!overlayWindow||event.sender!==overlayWindow.webContents||overlayReady)return;
 if(overlayLoadTimer){clearTimeout(overlayLoadTimer);overlayLoadTimer=null}
 overlayReady=true;revealRenderedOverlay();
});

function revealRenderedOverlay(){
 if(!overlayReady)return;
 if(overlayLoadTimer){clearTimeout(overlayLoadTimer);overlayLoadTimer=null}
 showCallOverlay();
}

// Google OAuth must run in the system browser, with the CRM session in that browser.
ipcMain.handle("pacifica:open-calendar-browser",async event=>{
 if(!trustedMain(event))return false;
 await shell.openExternal(new URL("/dashboard?calendar=open",appUrl).toString());
 return true;
});
