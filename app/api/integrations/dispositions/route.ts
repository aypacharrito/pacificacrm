import { isHostedRuntime } from "../../../lib/hosted-runtime";
import {getPacificaAccess} from "../../../lib/clerk-access";
import { isClerkConfigured } from "../../../lib/clerk-config";

export const runtime="nodejs";

type Connector={
  endpoint:string;
  token?:string;
  method?:"POST"|"PUT"|"PATCH";
  tokenHeader?:string;
  tokenPrefix?:string;
  leadIdField?:string;
  dispositionField?:string;
};

type DispositionRequest={
  event?:string;
  source?:string;
  vendorId?:string;
  leadName?:string;
  phone?:string;
  disposition?:string;
  crmStage?:string;
  crmOutcome?:string;
  appointmentAt?:string;
  notes?:string;
};

async function identity(){
  if(!isClerkConfigured())return isHostedRuntime()?null:"local";
  const access=await getPacificaAccess();return access.allowed?access.userId:null;
}

function sourceKey(value:string){
  return value.toLowerCase().replace(/[^a-z0-9]/g,"");
}

function configuredConnectors(){
  const connectors:Record<string,Connector>={};
  const raw=process.env.LEAD_SOURCE_CONNECTORS_JSON;
  if(raw){
    try{
      const parsed=JSON.parse(raw) as Record<string,Connector>;
      for(const [key,connector] of Object.entries(parsed))connectors[sourceKey(key)]=connector;
    }catch{throw new Error("LEAD_SOURCE_CONNECTORS_JSON is not valid JSON")}
  }
  if(process.env.SMARTFINANCIAL_STATUS_URL){
    connectors.smartfinancial={
      endpoint:process.env.SMARTFINANCIAL_STATUS_URL,
      token:process.env.SMARTFINANCIAL_API_KEY,
      method:"POST",
      tokenHeader:"Authorization",
      tokenPrefix:"Bearer ",
      leadIdField:"lead_id",
      dispositionField:"disposition",
    };
  }
  return connectors;
}

function connectorFor(source:string){
  const wanted=sourceKey(source);
  const connectors=configuredConnectors();
  return connectors[wanted]||Object.entries(connectors).find(([key])=>wanted.includes(key)||key.includes(wanted))?.[1];
}

function clean(value:unknown,max=2000){
  return typeof value==="string"?value.trim().slice(0,max):"";
}

export async function POST(request:Request){
  const userId=await identity();
  if(!userId)return Response.json({error:"Sign in required"},{status:401});
  try{
    const raw=await request.json() as DispositionRequest;
    const body={
      source:clean(raw.source,120)||"Lead provider",
      vendorId:clean(raw.vendorId,200),
      leadName:clean(raw.leadName,200),
      phone:clean(raw.phone,40),
      disposition:clean(raw.disposition,160),
      crmStage:clean(raw.crmStage,100),
      crmOutcome:clean(raw.crmOutcome,120),
      appointmentAt:clean(raw.appointmentAt,80),
      notes:clean(raw.notes,4000),
    };
    if(!body.disposition)return Response.json({error:"Choose a lead-source disposition"},{status:400});

    const smartFinancial=sourceKey(body.source).includes("smartfinancial");
    if(smartFinancial&&raw.event!=="call-ended")return Response.json({ok:true,synced:false,message:"Saved in Pacifica · SmartFinancial updates after an outbound call"});
    const connector=connectorFor(body.source);
    if(!connector)return Response.json({ok:true,synced:false,message:`Saved in Pacifica · ${body.source} status sync not connected`});
    if(!body.vendorId)return Response.json({ok:true,synced:false,message:"Saved in Pacifica · source lead ID unavailable"});

    const endpoint=new URL(connector.endpoint);
    if(endpoint.protocol!=="https:")throw new Error("Lead-source status endpoint must use HTTPS");
    const method=connector.method||"POST";
    if(!["POST","PUT","PATCH"].includes(method))throw new Error("Lead-source connector method is invalid");
    const leadIdField=connector.leadIdField||"lead_id";
    const dispositionField=connector.dispositionField||"disposition";
    const outbound:Record<string,string>=smartFinancial?{[leadIdField]:body.vendorId,[dispositionField]:"Attempted Contact"}:{
      [leadIdField]:body.vendorId,
      [dispositionField]:body.disposition,
      lead_name:body.leadName,
      phone:body.phone,
      pacifica_crm_stage:body.crmStage,
      pacifica_crm_outcome:body.crmOutcome,
      appointment_at:body.appointmentAt,
      notes:body.notes,
    };
    const headers:Record<string,string>={"Content-Type":"application/json","User-Agent":"Pacifica-CRM/1.0"};
    if(connector.token)headers[connector.tokenHeader||"Authorization"]=`${connector.tokenPrefix??"Bearer "}${connector.token}`;
    const response=await fetch(endpoint,{method,headers,body:JSON.stringify(outbound),signal:AbortSignal.timeout(10000),cache:"no-store"});
    if(!response.ok){
      console.error("Lead-source disposition sync failed",{source:body.source,status:response.status});
      return Response.json({error:`${body.source} rejected the status update (${response.status})`},{status:502});
    }
    return Response.json({ok:true,synced:true,message:`${body.source} disposition updated`});
  }catch(error){
    console.error("Lead-source disposition error",error instanceof Error?error.message:"Unknown error");
    return Response.json({error:error instanceof Error?error.message:"Unable to update lead source"},{status:500});
  }
}
