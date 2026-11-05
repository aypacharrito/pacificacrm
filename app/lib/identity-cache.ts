/**
 * Short-lived, per-instance caches for the access checks that run on every API request.
 *
 * Without them each request made one or two Clerk Backend API calls (middleware + route) and, for
 * subscription accounts, several Stripe list calls. The dashboard polls every few seconds, so that
 * was most of each request's latency. Entries live for PACIFICA_IDENTITY_CACHE_MS (default 30 s), so
 * an access change made elsewhere (Clerk dashboard, Stripe cancellation) applies within that window;
 * changes made through Pacifica's own admin/team routes clear the entry immediately on that instance.
 * Failures are never cached. Concurrent lookups for the same key share one request.
 */
const MAX_ENTRIES=500;

function ttl(fallback:number){
  const raw=process.env.PACIFICA_IDENTITY_CACHE_MS;
  const value=raw===undefined||raw===""?fallback:Number(raw);
  return Number.isFinite(value)&&value>=0?value:fallback;
}

class TtlCache<T>{
  private entries=new Map<string,{expires:number;value:Promise<T>}>();
  constructor(private readonly defaultMs:number){}

  get(key:string,load:()=>Promise<T>,ms=ttl(this.defaultMs)):Promise<T>{
    if(ms<=0)return load();
    const now=Date.now(),hit=this.entries.get(key);
    if(hit&&hit.expires>now)return hit.value;
    const value=load();
    this.entries.set(key,{expires:now+ms,value});
    value.catch(()=>{if(this.entries.get(key)?.value===value)this.entries.delete(key)});
    while(this.entries.size>MAX_ENTRIES)this.entries.delete(this.entries.keys().next().value!);
    return value;
  }

  set(key:string,value:T,ms:number){if(ms>0)this.entries.set(key,{expires:Date.now()+ms,value:Promise.resolve(value)})}
  forget(key:string){this.entries.delete(key)}
  clear(){this.entries.clear()}
}

// Clerk user records (email + privateMetadata drive access, role and workspace).
const users=new TtlCache<unknown>(30_000);
export function cachedClerkUser<T>(userId:string,load:()=>Promise<T>):Promise<T>{
  return users.get(userId,load) as Promise<T>;
}
export function forgetClerkUser(userId:string){users.forget(userId)}

// Paid-subscription checks: a positive answer is kept for 5 minutes, a negative one for the user TTL.
const paid=new TtlCache<boolean>(30_000);
export async function cachedPaidSubscription(email:string,check:()=>Promise<boolean>):Promise<boolean>{
  const key=email.trim().toLowerCase();
  const result=await paid.get(key,check);
  if(result&&ttl(30_000)>0)paid.set(key,true,Math.max(ttl(30_000),300_000));
  return result;
}

export function clearIdentityCaches(){users.clear();paid.clear()}
