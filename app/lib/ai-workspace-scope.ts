import type {StoredWorkspace} from './workspace-storage';

type Member={accountUserId:string;role:string};
export function agentAssignedLead(workspace:StoredWorkspace,memberId:string,lead:Record<string,unknown>){
  const assignee=String(lead.assignedTo||'');
  const matching=workspace.profile.teamRoster.filter(person=>person.active&&person.name===assignee);
  return matching.length===1&&matching[0].userId===memberId;
}
/** The assistant reads the same named assignment the workspace uses for agent queues. */
export function aiVisibleLeads(workspace:StoredWorkspace|null,member:Member){
  if(!workspace)return [] as Array<Record<string,unknown>>;
  const leads=workspace.leads as Array<Record<string,unknown>>;
  if(member.role!=='agent')return leads.filter(lead=>!lead.deletedAt);
  return leads.filter(lead=>!lead.deletedAt&&agentAssignedLead(workspace,member.accountUserId,lead));
}
