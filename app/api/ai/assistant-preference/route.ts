import {readAssistantName, validAssistantName, writeAssistantName} from '../../../lib/assistant-preference';
import {connectedOwner, json, objectBody} from '../../../lib/connected/http';
import {ConnectedError} from '../../../lib/connected/types';
import {readStoredWorkspace} from '../../../lib/workspace-storage';

export const runtime = 'nodejs';

function failure(error: unknown) {
  if (error instanceof ConnectedError) return json({error: error.message}, error.status);
  return json({error: 'Your assistant name could not be saved or loaded. Try again.'}, 503);
}

export async function GET(request: Request) {
  try {
    const owner = await connectedOwner(request);
    const saved = await readAssistantName(owner);
    const legacy = saved === null && owner.workspace === owner.member
      ? (await readStoredWorkspace(owner.workspace).catch(() => null))?.profile.assistantName
      : undefined;
    return json({name: saved ?? legacy ?? ''});
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    const owner = await connectedOwner(request);
    const body = await objectBody(request);
    const name = typeof body.name === 'string' ? body.name.trim() : null;
    if (!validAssistantName(name)) return json({error: 'Enter an assistant name up to 60 characters.'}, 400);
    await writeAssistantName(owner, name);
    return json({name});
  } catch (error) {
    return failure(error);
  }
}
