// Node 22 cannot see the named exports of @clerk/nextjs/server's CommonJS build
// when it is imported from TypeScript under tsx (only `default` is exposed), so
// server modules such as clerk-access.ts fail to link in unit tests. Re-export the
// real module's members by name. Production bundles are unaffected.
import {createRequire,registerHooks} from 'node:module';

const shimmed=new Set(['@clerk/nextjs/server']);
registerHooks({resolve(specifier,context,next){
 // Only shim ESM imports; the shim's own require() must reach the real CommonJS build.
 if(!shimmed.has(specifier)||!context.conditions?.includes('import'))return next(specifier,context);
 const names=Object.keys(createRequire(context.parentURL||import.meta.url)(specifier)).filter(name=>/^[A-Za-z_$][\w$]*$/.test(name)&&name!=='default');
 const source=`import {createRequire} from 'node:module';const m=createRequire(${JSON.stringify(context.parentURL||import.meta.url)})(${JSON.stringify(specifier)});export default m;export const {${names.join(',')}}=m;`;
 return {url:'data:text/javascript,'+encodeURIComponent(source),shortCircuit:true};
}});
