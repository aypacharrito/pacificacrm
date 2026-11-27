import { notFound } from "next/navigation";
import { archonWorkspaceUrl, canOpenArchon } from "../../lib/archon-owner";
import { requirePacificaWorkspacePage } from "../../lib/clerk-access";
import { isClerkConfigured } from "../../lib/clerk-config";
import styles from "./archon.module.css";

export const dynamic = "force-dynamic";

const modules = [
  ["Money", [["trading", "Trading"], ["stores", "Stores"], ["arbitrage", "Arbitrage"], ["marketing", "Marketing Studio"]]],
  ["Clients", [["stenos", "Stenos"]]],
  ["Build", [["code", "Code Forge"], ["lab", "Research Lab"], ["reverse", "Reverse Engineering"]]],
  ["Mind", [["prime", "Command"]]],
] as const;

export default async function ArchonPage() {
  if (!isClerkConfigured()) notFound();
  const access = await requirePacificaWorkspacePage();
  if (!canOpenArchon(access)) notFound();

  const workspace = archonWorkspaceUrl();
  return <main className={styles.workspace}>
    <a className={styles.back} href="/dashboard">Back to Pacifica</a>
    <header className={styles.header}>
      <div><h1>Archon</h1><p>{access.displayName}</p></div>
      {workspace && <a className={styles.launch} href={workspace.href} referrerPolicy="no-referrer">Open Archon</a>}
    </header>
    {workspace ?
      <div className={styles.groups}>
        {modules.map(([group, entries]) => <section key={group} aria-label={group}>
          <h2>{group}</h2>
          <ul>{entries.map(([key, label]) =>
            <li key={key}><a href={`${workspace.href}#${key}`} referrerPolicy="no-referrer">{label}</a></li>
          )}</ul>
        </section>)}
      </div> :
      <section className={styles.setup} aria-labelledby="archon-setup">
        <h2 id="archon-setup">Connection setup required</h2>
        <p>Set the protected Archon workspace URL for this Pacifica environment, then reopen this page.</p>
      </section>}
  </main>;
}
