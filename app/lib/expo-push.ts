export async function sendExpoPush(token:unknown,title:string,body:string,data:Record<string,unknown>={}){
  const to=String(token||"");
  if(!/^(?:Expo|Exponent)PushToken\[[^\]]+\]$/.test(to))return;
  try{
    await fetch("https://exp.host/--/api/v2/push/send",{method:"POST",signal:AbortSignal.timeout(2000),headers:{"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify({to,title,body:body.slice(0,240),data,sound:"default",channelId:"pacifica"})});
  }catch{/* A notification failure must never reject an inbound customer message. */}
}
