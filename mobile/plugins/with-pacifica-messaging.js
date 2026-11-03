// One FCM service handles native Twilio calls and normal Expo notifications.
// Keeping two services with MESSAGING_EVENT can silently drop one type of push.
const fs=require('node:fs/promises'),path=require('node:path');
const {withAndroidManifest,withDangerousMod,withAppBuildGradle}=require('expo/config-plugins');
module.exports=config=>{
 const packageName=config.android?.package;
 if(!/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/i.test(packageName||''))throw Error('Set a valid Pacifica Android package first.');
 config=withAppBuildGradle(config,cfg=>{
  // The SDKs declare these as implementation dependencies, which hides them
  // from the application's Kotlin compile classpath. Our receiver uses both.
  const begin='// @generated Pacifica messaging dependencies',end='// @end Pacifica messaging dependencies';
  cfg.modResults.contents=cfg.modResults.contents.replace(/\n?\/\/ @generated Pacifica messaging dependencies[\s\S]*?\/\/ @end Pacifica messaging dependencies\n?/g,'\n').trimEnd()+`\n\n${begin}\ndependencies {\n    implementation("com.twilio:voice-android:6.10.3")\n    implementation("com.google.firebase:firebase-messaging:25.0.1")\n}\n${end}\n`;
  return cfg;
 });
 config=withAndroidManifest(config,cfg=>{
  const manifest=cfg.modResults.manifest;manifest.$['xmlns:tools']='http://schemas.android.com/tools';
  manifest['uses-permission']=(manifest['uses-permission']||[]).filter(p=>p.$['android:name']!=='android.permission.RECORD_AUDIO');
  manifest['uses-permission'].push({$:{'android:name':'android.permission.RECORD_AUDIO'}});
  const app=manifest.application[0],name=`${packageName}.PacificaMessagingService`;
  const replaced=['com.twiliovoicereactnative.VoiceFirebaseMessagingService','expo.modules.notifications.service.ExpoFirebaseMessagingService'];
  app.service=(app.service||[]).filter(s=>!replaced.includes(s.$['android:name'])&&s.$['android:name']!==name);
  for(const item of replaced)app.service.push({$:{'android:name':item,'tools:node':'remove'}});
  app.service.push({$:{'android:name':name,'android:exported':'false','android:stopWithTask':'false'},'intent-filter':[{$:{},action:[{$:{'android:name':'com.google.firebase.MESSAGING_EVENT'}}]}]});
  return cfg;
 });
 return withDangerousMod(config,['android',async cfg=>{
  const dir=path.join(cfg.modRequest.platformProjectRoot,'app/src/main/java',...packageName.split('.'));await fs.mkdir(dir,{recursive:true});
  await fs.writeFile(path.join(dir,'PacificaMessagingService.kt'),`package ${packageName}
import com.google.firebase.messaging.RemoteMessage
import com.twilio.voice.Voice
import com.twiliovoicereactnative.VoiceFirebaseMessagingService
import com.twiliovoicereactnative.CallMessageListenerProxy
import expo.modules.notifications.service.ExpoFirebaseMessagingService
class PacificaMessagingService : ExpoFirebaseMessagingService() {
  override fun onMessageReceived(message: RemoteMessage) {
    val handled = Voice.handleMessage(this, message.data, VoiceFirebaseMessagingService.MessageHandler(), CallMessageListenerProxy())
    if (!handled) super.onMessageReceived(message)
  }
}
`);return cfg;
 }]);
};
