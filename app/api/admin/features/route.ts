import {isPacificaPlatformOwnerApi} from '../../../lib/clerk-access';
import {getPlatformFeatures,savePlatformFeatures} from '../../../lib/platform-feature-store';
export const runtime='nodejs';
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
export async function GET(){if(!await isPacificaPlatformOwnerApi())return json({error:'Platform-owner access required.'},403);return json({features:await getPlatformFeatures()})}
export async function POST(request:Request){
 if(!await isPacificaPlatformOwnerApi())return json({error:'Platform-owner access required.'},403);
 if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return json({error:'Invalid origin.'},403);
 try{const body=await request.json(),features=body?.features;
  if(!features||typeof features!=='object'||typeof features.miner!=='boolean'||typeof features.industryTools!=='boolean'||Object.keys(features).some(key=>!['miner','industryTools'].includes(key)))return json({error:'Choose both optional-tool settings.'},400);
  return json({features:await savePlatformFeatures(features)});
 }catch{return json({error:'Optional tools could not be saved. Try again.'},503)}
}
