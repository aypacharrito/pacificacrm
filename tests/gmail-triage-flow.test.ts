import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { registerHooks } from "node:module";
import { test } from "node:test";

test("owner connection, signed Gmail delivery, replay, and scheduled retention use the CRM entry points", async (t) => {
  const host = "https://crm.example.test", callback = `${host}/api/integrations/gmail/callback`;
  const addresses = ["pacificafixtureexample@gmail.com", "davidfixtureexample@gmail.com"];
  const subscription = "projects/fixtures/subscriptions/gmail", pushAddress = "push@fixtures.iam.gserviceaccount.com";
  const env = {
    GMAIL_TRIAGE_CLIENT_ID: "fixture", GMAIL_TRIAGE_CLIENT_SECRET: "fixture", GMAIL_TRIAGE_REDIRECT_URI: callback, GMAIL_TRIAGE_MAILBOXES: addresses.join(","),
    GMAIL_TRIAGE_ENCRYPTION_KEY: "a1".repeat(32), GMAIL_TRIAGE_TOPIC: "projects/fixtures/topics/gmail",
    GMAIL_TRIAGE_SUBSCRIPTION: subscription, GMAIL_TRIAGE_PUSH_AUDIENCE: "fixture-push", GMAIL_TRIAGE_PUSH_SERVICE_ACCOUNT: pushAddress,
    GMAIL_TRIAGE_ENABLE_SMS: "false", NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test", CLERK_SECRET_KEY: "sk_test",
    KV_REST_API_URL: "https://redis.example.test", KV_REST_API_TOKEN: "fixture", CRON_SECRET: "fixture-cron",
  };
  const prior = new Map(Object.keys(env).map(key => [key, process.env[key]]));
  Object.assign(process.env, env);
  t.after(() => { for (const [name, value] of prior) { if (value === undefined) delete process.env[name]; else process.env[name] = value; } });

  const cookie = new Map<string, string>(), redis = new Map<string, string>(), leases = new Set<string>();
  const fixture = {
    ownerId: "owner_1", role: "owner", leases,
    cookies: { get: (key: string) => ({ value: cookie.get(key) }), set: (key: string, value: string) => cookie.set(key, value) },
  };
  const global = globalThis as typeof globalThis & { gmailFixture?: typeof fixture };
  global.gmailFixture = fixture;
  const replacements: Record<string, string> = {
    "next/headers": "export async function cookies(){return globalThis.gmailFixture.cookies}",
    "clerk-access": "export async function getPacificaAccess(){const f=globalThis.gmailFixture;return {allowed:true,role:f.role,userId:f.ownerId,accountUserId:f.ownerId,email:'pacificafixtureexample@gmail.com'}} export async function workspaceAutomationAccess(id){return id==='owner_1'}",
    "workspace-storage": "export async function readStoredWorkspace(){return null} export async function acquireAutomationLease(key){const s=globalThis.gmailFixture.leases;if(s.has(key))return false;s.add(key);return true} export async function releaseAutomationLease(key){globalThis.gmailFixture.leases.delete(key)}",
    "outbound-sms": "export async function outboundSmsStatus(){throw Error('Unexpected text check')} export async function sendOutboundSms(){throw Error('Unexpected text')}",
  };
  const hooks = registerHooks({ resolve(specifier, context, next) {
    const name = specifier === "next/headers" ? specifier : specifier.split("/").at(-1)?.replace(/\.ts$/, "") || "";
    const code = replacements[name];
    return code ? { url: `data:text/javascript,${encodeURIComponent(code)}`, shortCircuit: true } : next(specifier, context);
  } });
  t.after(() => { hooks.deregister(); delete global.gmailFixture; });

  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: "jwk" }), kid: "fixture-key" };
  const pushToken = () => {
    const as64 = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
    const now = Math.floor(Date.now() / 1000);
    const parts = `${as64({ alg: "RS256", kid: jwk.kid })}.${as64({ aud: "fixture-push", email: pushAddress, email_verified: true, iss: "https://accounts.google.com", iat: now, exp: now + 300 })}`;
    return `${parts}.${sign("RSA-SHA256", Buffer.from(parts), privateKey).toString("base64url")}`;
  };
  const now = Date.now(), day = 86_400_000;
  let time = now;
  t.mock.method(Date, "now", () => time);
  const mutations: string[] = [];
  const profiles: string[] = [];
  const messages = new Map<string, { threadId: string; id: string; internalDate: string; labelIds: string[]; payload: object }>();
  const storeMessage = (id: string, sender: string, subject: string, body: string, time: number) => {
    messages.set(id, { id, threadId: `thread-${id}`, internalDate: String(time), labelIds: ["UNREAD"], payload: {
      mimeType: "text/plain", body: { data: Buffer.from(body).toString("base64url") }, headers: [
        { name: "From", value: sender }, { name: "Subject", value: subject },
        { name: "Authentication-Results", value: `mx.google.com; dmarc=pass header.from=${sender.split("@")[1]}` },
      ],
    } });
  };
  const fake = t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input)), auth = new Headers(init?.headers).get("authorization");
    if (url.hostname === "redis.example.test") {
      const [cmd, key, value, ...rest] = JSON.parse(String(init?.body)) as string[];
      if (cmd === "GET") return Response.json({ result: redis.get(key) ?? null });
      if (cmd === "SET") {
        if (rest.includes("NX") && redis.has(key)) return Response.json({ result: null });
        redis.set(key, value);
        return Response.json({ result: "OK" });
      }
      throw new Error(`Unexpected Redis command ${cmd}`);
    }
    if (url.hostname === "oauth2.googleapis.com") {
      const form = new URLSearchParams(String(init?.body));
      const index = (form.get("code") || form.get("refresh_token") || "").endsWith("1") ? 1 : 0;
      if (form.get("grant_type") === "authorization_code") assert.ok(form.get("code_verifier"));
      return Response.json({ access_token: `access-${index}`, refresh_token: `refresh-${index}`, scope: "https://www.googleapis.com/auth/gmail.modify" });
    }
    if (url.hostname === "www.googleapis.com") return Response.json({ keys: [jwk] });
    assert.equal(url.hostname, "gmail.googleapis.com");
    const index = auth === "Bearer access-1" ? 1 : 0;
    assert.equal(auth, `Bearer access-${index}`);
    const path = url.pathname.replace("/gmail/v1/users/me/", "");
    if (path === "profile") {
      profiles.push(addresses[index]);
      return Response.json({ emailAddress: addresses[index], historyId: index === 0 && messages.size ? "101" : "100" });
    }
    if (path === "watch") return Response.json({ historyId: "101", expiration: String(Date.now() + 5 * day) });
    if (path === "messages") return Response.json({ messages: index === 0 ? [...messages.values()].filter(message => message.labelIds.includes("STARRED")) : [] });
    if (path === "history") {
      const current = index === 0 && messages.size ? "101" : "100";
      const added = index === 0 && current !== url.searchParams.get("startHistoryId") ? [...messages.keys()].map(id => ({ message: { id } })) : [];
      return Response.json({ historyId: current, history: added.length ? [{ messagesAdded: added }] : [] });
    }
    const [namespace, id, action] = path.split("/");
    if (namespace === "threads") return Response.json({ id, messages: [...messages.values()].filter(message => message.threadId === id) });
    if (namespace === "messages" && index === 0) {
      const message = messages.get(id);
      if (!message) return new Response(null, { status: 404 });
      if (action) {
        mutations.push(`${id}:${action}`);
        assert.ok(["modify", "trash"].includes(action));
        if (action === "modify") {
          assert.deepEqual(JSON.parse(String(init?.body)), { addLabelIds: ["STARRED"] });
          message.labelIds.push("STARRED");
        } else message.labelIds.push("TRASH");
      }
      return Response.json(message);
    }
    throw new Error(`Unexpected provider path ${path}`);
  });
  const { GET, POST } = await import("../app/api/integrations/gmail/route");
  const oauth = await import("../app/api/integrations/gmail/callback/route");
  const push = await import("../app/api/integrations/gmail/push/route");
  const cron = await import("../app/api/cron/gmail-triage/route");
  const post = (body: object, origin = host) => POST(new Request(`${host}/api/integrations/gmail`, { method: "POST", body: JSON.stringify(body), headers: { Origin: origin } }));
  const connect = async (address: string, code: string) => {
    const response = await post({ action: "connect", address });
    assert.equal(response.status, 200);
    const auth = new URL((await response.json()).url);
    assert.equal(auth.searchParams.get("login_hint"), address);
    return oauth.GET(new Request(`${callback}?${new URLSearchParams({ code, state: auth.searchParams.get("state")! })}`));
  };

  assert.match((await connect(addresses[0], "code-1")).headers.get("location") || "", /gmail=failed/);
  assert.match((await connect(addresses[0], "code-0")).headers.get("location") || "", /gmail=connected/);
  assert.match((await connect(addresses[1], "code-1")).headers.get("location") || "", /gmail=connected/);
  assert.equal([...redis.values()].some(value => value.includes("refresh-")), false);
  const preferences = { tasks: true, star: true, trash: true };
  assert.equal((await post({ action: "preferences", preferences, address: addresses[0] }, "https://untrusted.test")).status, 403);
  const initial = await (await GET()).json();
  assert.ok(initial.accounts.every((account: { preferences: object }) => Object.values(account.preferences).every(value => value === false)));
  fixture.role = "agent";
  assert.equal((await GET()).status, 403);
  fixture.role = "owner";

  // Establish the cursor while action switches are disabled. Older retained mail is triaged once new history arrives.
  const scheduled = () => cron.GET(new Request(`${host}/api/cron/gmail-triage`, { headers: { Authorization: "Bearer fixture-cron" } }));
  assert.equal((await scheduled()).status, 200);
  assert.deepEqual(mutations, []);
  assert.equal((await post({ action: "preferences", preferences, address: addresses[0] })).status, 200);
  storeMessage("carrier", "agent@joinroot.com", "Agency appointment", "Please complete the agency application.", now);
  storeMessage("passkey", "support@stripe.com", "New passkey added", "Your new passkey was added to your Stripe account.", now - 6 * day);

  const deliver = (token: string) => push.POST(new Request(`${host}/api/integrations/gmail/push`, {
    method: "POST", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ subscription,
      message: { data: Buffer.from(JSON.stringify({ emailAddress: addresses[0], historyId: "101" })).toString("base64") },
    }),
  }));
  const before = fake.mock.callCount();
  assert.equal((await deliver("bad-token")).status, 401);
  assert.equal(fake.mock.callCount(), before);
  assert.equal((await deliver(pushToken())).status, 204);
  assert.equal((await deliver(pushToken())).status, 204);
  assert.deepEqual(mutations, ["carrier:modify"]);
  const snapshot = await (await GET()).json();
  const [account] = snapshot.accounts;
  assert.equal(account.tasks.length, 1);
  assert.match(account.tasks[0].url, /thread-carrier$/);
  assert.equal((await post({ action: "complete", address: addresses[0], taskId: account.tasks[0].id })).status, 200);
  assert.ok(profiles.includes(addresses[1]));

  time += day;
  assert.equal((await scheduled()).status, 200);
  assert.deepEqual(mutations, ["carrier:modify", "passkey:trash"]);
  assert.ok(messages.get("carrier")?.labelIds.includes("UNREAD"));
  assert.ok(messages.get("passkey")?.labelIds.includes("UNREAD"));
  assert.equal((await (await GET()).json()).accounts[0].tasks.length, 0);
});
