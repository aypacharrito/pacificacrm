import { isHostedRuntime } from "./hosted-runtime";
import {getPacificaAccess} from './clerk-access';
import {isClerkConfigured} from './clerk-config';
import {phoneAssignmentForWorkspace} from './phone-assignments';
import {twilioAccountConfig,twilioApiRequest} from './twilio-rest';
export async function authorizedMessage(sid:string){
 if(!/^SM[a-f0-9]{32}$/i.test(sid)&&!/^MM[a-f0-9]{32}$/i.test(sid))return null;
 const access=isClerkConfigured()?await getPacificaAccess():{allowed:!isHostedRuntime(),userId:'local',email:'local'};
 if(!access.allowed)return null;
 const assignment=await phoneAssignmentForWorkspace(access.userId,access.email);
 if(!assignment?.phoneNumber||assignment.provider!=='twilio')return null;
 const config=twilioAccountConfig();
 const base=`https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages/${sid}`;
 const result=await twilioApiRequest<{from?:string;to?:string}>(`${base}.json`,{},config.credentials);
 if(!result.response.ok||![result.data.from,result.data.to].includes(assignment.phoneNumber))return null;
 return {...config,base};
}
