import {bounded, connectedOwner, fail} from '../../../lib/connected/http';
import {readAttachment} from '../../../lib/connected/service';
import {quota} from '../../../lib/connected/store';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(request: Request) {
  try {
    const owner = await connectedOwner(request);
    await quota(owner, 'attachment', 24);
    const source = bounded(new URL(request.url).searchParams.get('source'), 11_000);
    const file = await readAttachment(owner, source);
    const name = file.name.replace(/[\x00-\x1f\x7f/\\]/g, '_').toWellFormed();
    return new Response(Buffer.from(file.content), {headers: {
      'Cache-Control': 'private, no-store', 'Content-Type': 'application/octet-stream',
      'Content-Disposition': "attachment; filename*=UTF-8''" + encodeURIComponent(name).replace(/['()*]/g, c => '%' + c.charCodeAt(0).toString(16)),
      'Content-Security-Policy': 'sandbox', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
    }});
  } catch (error) { return fail(error); }
}
