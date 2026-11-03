export function appendMobileCallNote(leads:unknown[],input:{leadId:number;key:string;notes:string;outcome:string},now=new Date().toISOString()){
 let found=false;
 const next=leads.map(raw=>{const lead=raw as Record<string,unknown>;if(lead.id!==input.leadId||lead.deletedAt)return raw;found=true;
 const keys=Array.isArray(lead.mobileCallNoteKeys)?lead.mobileCallNoteKeys.map(String):[];if(keys.includes(input.key))return raw;
 return {...lead,notes:[String(lead.notes||'').trim(),`[Mobile call · ${now}] ${input.outcome}\n${input.notes}`].filter(Boolean).join('\n'),notesUpdatedAt:now,mobileCallNoteKeys:[...keys,input.key].slice(-200)};
 });if(!found)throw Error('Choose an existing contact for these notes.');return next;
}
