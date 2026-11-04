import {registerHooks} from 'node:module';
registerHooks({resolve(specifier,context,next){
 if(specifier==='electron')return {url:'data:text/javascript,'+encodeURIComponent(`export const app=globalThis.desktopHarness.app, BrowserWindow=globalThis.desktopHarness.BrowserWindow,WebContentsView=globalThis.desktopHarness.WebContentsView,ipcMain=globalThis.desktopHarness.ipcMain,session={defaultSession:{setPermissionRequestHandler(){},on(){}}},shell={openExternal(){}},screen={getDisplayMatching(){return {workArea:{x:0,y:0,width:1440,height:900}}},getPrimaryDisplay(){return this.getDisplayMatching()}},nativeTheme={shouldUseDarkColors:false,on(){}},systemPreferences={getAccentColor(){return ''},on(){}},dialog={showMessageBox:async()=>({response:0})};`),shortCircuit:true};
 if(specifier==='electron-updater')return {url:'data:text/javascript,export default {autoUpdater:{}}',shortCircuit:true};return next(specifier,context);
}});
