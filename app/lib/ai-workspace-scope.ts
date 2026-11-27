import type {StoredWorkspace} from './workspace-storage';

type Member={accountUserId:string;role:string};
/** The assistant reads the same named assignment the workspace uses for agent queues. */
export function aiVisibleLeads(workspace:StoredWorkspace|null,member:Member){
  if(!workspace)return [] as Array<Record<string,unknown>>;
  const leads=workspace.leads as Array<Record<string,unknown>>;
  if(member.role!=='agent')return leads.filter(lead=>!lead.deletedAt);
  const roster=workspace.profile.teamRoster.find(person=>person.userId===member.accountUserId&&person.active);
  if(!roster)return [];
  return leads.filter(lead=>!lead.deletedAt&&lead.assignedTo===roster.name);
}
