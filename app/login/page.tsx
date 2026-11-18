import { isHostedRuntime } from "../lib/hosted-runtime";
import Link from "next/link";
import Image from "next/image";
import { chatGPTSignInPath, getChatGPTUser } from "../chatgpt-auth";
import { isClerkConfigured } from "../lib/clerk-config";
import ClerkLogin from "./ClerkLogin";
import styles from "./login.module.css";

export const dynamic = "force-dynamic";

export default async function LoginPage(){
  if(isClerkConfigured())return <ClerkLogin/>;
  if(isHostedRuntime())return <main className={styles.page}>
    <Link href="/" className={styles.brand}><span><Image src="/pacifica-mark.png" width={32} height={32} alt="" priority/></span><b>Pacifica</b></Link>
    <section className={styles.card}>
      <p className={styles.kicker}>SECURE WORKSPACE ACCESS</p>
      <h1>Secure login needs configuration.</h1>
      <p className={styles.copy}>The website is online, but Clerk is not connected to this deployment. Add the website publishable and secret keys, then redeploy.</p>
      <div className={styles.configKeys}><code>NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY</code><code>CLERK_SECRET_KEY</code></div>
      <Link className={styles.primary} href="/">Return to Pacifica</Link>
    </section>
    <footer>Protected access · Pacifica</footer>
  </main>;
  const user=await getChatGPTUser();
  return <main className={styles.page}>
    <Link href="/" className={styles.brand}><span><Image src="/pacifica-mark.png" width={32} height={32} alt="" priority/></span><b>Pacifica</b></Link>
    <section className={styles.card}>
      <p className={styles.kicker}>SECURE WORKSPACE ACCESS</p>
      <h1>{user?`Welcome back, ${user.displayName}.`:"Sign in to your Pacifica workspace."}</h1>
      <p className={styles.copy}>Your contacts, calling setup, lead sources, quotes, and AI workspace stay behind one authenticated account.</p>
      {user?<Link className={styles.primary} href="/dashboard">Open Pacifica</Link>:<a className={styles.primary} href={chatGPTSignInPath("/dashboard")}>Continue securely</a>}
      <p className={styles.note}>New agency accounts are activated after subscription and onboarding. Calling numbers are assigned after verification.</p>
      <Link className={styles.back} href="/">← Back to the Pacifica website</Link>
    </section>
    <footer>Protected access · Pacifica</footer>
  </main>;
}
