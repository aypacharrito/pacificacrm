import {registerHooks} from 'node:module';
const source=`const entries=new Map();
export async function workspaceRedis(command){
  const [verb,key,value,condition]=command;
  if(verb==='GET')return entries.get(key)??null;
  if(verb==='DEL')return entries.delete(key)?1:0;
  if(verb==='SET'&&condition==='NX'&&entries.has(key))return null;
  if(verb==='SET'){entries.set(key,value);return 'OK'}
  throw Error('Unexpected command');
}`;
registerHooks({resolve(specifier,context,next){if(specifier.endsWith('/workspace-redis'))return {url:'data:text/javascript,'+encodeURIComponent(source),shortCircuit:true};return next(specifier,context)}});
