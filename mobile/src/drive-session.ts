export type DriveLead={id:number;name:string;phone:string;product:string;source:string;priorityReason:string};
export type DrivePhase="idle"|"briefing"|"calling"|"wrap-up"|"paused"|"finished";
export type DriveSession={queue:DriveLead[];index:number;phase:DrivePhase;completed:number;lastDisposition:string;resumePhase?:DrivePhase};

export function createDriveSession(queue:DriveLead[]):DriveSession{return {queue:[...queue],index:0,phase:"idle",completed:0,lastDisposition:""}}
export function currentDriveLead(session:DriveSession){return session.index<session.queue.length?session.queue[session.index]:null}
export function startDriveSession(session:DriveSession):DriveSession{return {...session,phase:currentDriveLead(session)?"briefing":"finished"}}
export function beginDriveCall(session:DriveSession):DriveSession{return session.phase==="briefing"&&currentDriveLead(session)?{...session,phase:"calling"}:session}
export async function openDriveCall(session:DriveSession,openPhone:()=>Promise<unknown>):Promise<DriveSession>{
  if(session.phase!=="briefing"||!currentDriveLead(session))return session;
  await openPhone();
  return beginDriveCall(session);
}
export function finishDriveCall(session:DriveSession,connected:boolean):DriveSession{
  if(session.phase!=="calling")return session;
  if(connected)return {...session,phase:"wrap-up"};
  const index=session.index+1;return {...session,index,completed:session.completed+1,lastDisposition:"No answer",phase:index<session.queue.length?"briefing":"finished"};
}
export function saveDriveDisposition(session:DriveSession,disposition:string):DriveSession{
  if(session.phase!=="wrap-up"||!disposition.trim())return session;
  const index=session.index+1;return {...session,index,completed:session.completed+1,lastDisposition:disposition.trim(),phase:index<session.queue.length?"briefing":"finished"};
}
export function pauseDriveSession(session:DriveSession):DriveSession{return session.phase==="finished"?session:{...session,resumePhase:session.phase,phase:"paused"}}
export function resumeDriveSession(session:DriveSession):DriveSession{return session.phase==="paused"?{...session,phase:session.resumePhase&&session.resumePhase!=="paused"?session.resumePhase:currentDriveLead(session)?"briefing":"finished",resumePhase:undefined}:session}
