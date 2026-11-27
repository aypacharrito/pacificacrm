import {createHash} from 'node:crypto';
import type {Owner} from './connected/types';
import {workspaceRedis} from './workspace-redis';

function preferenceKey(owner: Owner) {
  return 'pacifica:assistant:name:' + createHash('sha256').update(JSON.stringify([owner.workspace, owner.member])).digest('base64url');
}

export function validAssistantName(name: unknown): name is string {
  return typeof name === 'string' && name.length <= 60 && !/[\p{Cc}\p{Cf}]/u.test(name);
}

export async function readAssistantName(owner: Owner) {
  const name = await workspaceRedis(['GET', preferenceKey(owner)]);
  return validAssistantName(name) ? name : null;
}

export async function writeAssistantName(owner: Owner, name: string) {
  // An empty string records an explicit reset, even if an older workspace name exists.
  const result = await workspaceRedis(['SET', preferenceKey(owner), name]);
  if (result !== 'OK') throw Error('Name storage is unavailable.');
}
