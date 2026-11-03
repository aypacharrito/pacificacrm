import {workspaceRedis,workspaceRedisConfig} from './workspace-storage';
import {cleanPlatformFeatures,type PlatformFeatures} from './platform-features';
const key='pacifica:v2:platform:optional-tools';
export async function getPlatformFeatures():Promise<PlatformFeatures>{
 if(!workspaceRedisConfig().url)return cleanPlatformFeatures(null);
 try{const stored=await workspaceRedis(['GET',key]);return cleanPlatformFeatures(typeof stored==='string'?JSON.parse(stored):stored)}catch{return cleanPlatformFeatures(null)}
}
export async function savePlatformFeatures(value:PlatformFeatures){
 if(!workspaceRedisConfig().url)throw Error('Cloud settings storage is unavailable.');
 const result=await workspaceRedis(['SET',key,JSON.stringify({...cleanPlatformFeatures(value),updatedAt:new Date().toISOString()})]);
 if(result!=='OK')throw Error('Cloud settings could not be saved.');return cleanPlatformFeatures(value);
}
