import {getPacificaAccess} from '../../../lib/clerk-access';
export const runtime='nodejs';
export async function GET(){
 const access=await getPacificaAccess();
 if(!access.allowed||!access.userId||!access.accountUserId)return Response.json({error:'Sign in to the workspace.'},{status:403,headers:{'Cache-Control':'no-store'}});
 return Response.json({workspaceId:access.userId,memberId:access.accountUserId},{headers:{'Cache-Control':'no-store'}});
}
