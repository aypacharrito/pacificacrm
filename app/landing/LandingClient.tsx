"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import PlanComparison from "../components/PlanComparison";
import ClerkNavAuth from "../components/ClerkNavAuth";
import Starfield from "../components/Starfield";
import { pacificaPlans } from "../lib/plans";
import styles from "./landing.module.css";

const plans = Object.entries(pacificaPlans).map(([id, plan]) => ({
  id: id as keyof typeof pacificaPlans, ...plan,
  features: [plan.seats, "Contacts, calendar & reports", "Power dialer, SMS & email", "AI drafts & document intake", "Industry workspace settings"],
}));
const industries = ["Insurance", "Home services", "Law firms", "Real estate", "Automotive", "Financial services"];
const previews = ["Today", "Dialer", "Doxa"] as const;
type Preview = typeof previews[number];

function WorkspacePreview({ preview, onChange }: { preview: Preview; onChange: (value: Preview) => void }) {
  return <div className={styles.productFrame}>
    <header><span className={styles.previewBrand}><Image src="/pacifica-mark.png" width={23} height={23} alt="" /> PACIFICA</span><span>YOUR WORKSPACE, IN FOCUS</span><small>Interactive tour · sample data</small></header>
    <div className={styles.productBody}>
      <aside><span className={styles.workspaceLabel}>WORKSPACE</span>{previews.map((item, index) => <button type="button" key={item} aria-pressed={preview === item} onClick={() => onChange(item)}><span aria-hidden="true">{["◷", "↗", "✧"][index]}</span>{item}</button>)}<div className={styles.previewAsideLinks}><span>Contacts</span><span>Messages</span><span>Calendar</span><span>Reports</span></div><div className={styles.previewUser}><i>AC</i><span>Alex Carranza<small>My workspace</small></span></div></aside>
      <section aria-label={`${preview} product preview`} aria-live="polite" className={styles.previewContent}>
        {preview === "Today" ? <>
          <div className={styles.frameTop}><div><span>YOUR DAY, AT A GLANCE</span><h2>A little clarity.<br />A lot of possibility.</h2></div><span className={styles.status}><i />Ready for your next move</span></div>
          <div className={styles.frameStats}>{[["42", "Calls today"], ["18", "Conversations"], ["7", "Appointments"]].map(([value, label]) => <div key={label}><b>{value}</b><span>{label}</span></div>)}</div>
          <div className={styles.queueHeading}><h3>Your next best steps</h3><span>FROM YOUR NOTES</span></div>
          <div className={styles.queue}>{[["MT", "Maria Torres", "Request the declaration page", "Follow-up"], ["DO", "Daniel Ortiz", "Review renewal documents", "Review"], ["SC", "Sophia Cruz", "Confirm appointment details", "Appointment"]].map(([initials, name, task, type]) => <article key={name}><i>{initials}</i><div><b>{name}</b><span>{task}</span></div><small>{type}</small><span aria-hidden="true">↗</span></article>)}</div>
        </> : preview === "Dialer" ? <div className={styles.dialerPreview}><p className={styles.kicker}>A MORE FOCUSED CONVERSATION</p><div className={styles.contactOrb}>MT</div><h2>Maria Torres</h2><p>Home & Auto · New lead</p><span className={styles.sampleNumber}>Contact details, notes and next steps. Together.</span><div className={styles.callDemo}><span aria-hidden="true">↗</span>Ready to connect</div><p className={styles.demoNote}>Preview only. No call will be placed.</p><Link href="/login">Explore your dialer →</Link></div> : <div className={styles.aiPreview}><span className={styles.aiSpark}>✧</span><h2>Room to think.<br />Help to move forward.</h2><p>Work through your notes, prepare a follow-up, or bring a document into the conversation.</p><div className={styles.sampleComposer}><span>What should I focus on today?</span><div><span>+</span><span>↑</span></div></div><Link href="/login">Meet Doxa →</Link></div>}
      </section>
    </div>
    <footer><span><i />One connected workspace</span><span>Calls. Conversations. What comes next.</span></footer>
  </div>;
}

export default function LandingClient({ clerkEnabled = false }: { clerkEnabled?: boolean }) {
  const [checkout, setCheckout] = useState("");
  const [error, setError] = useState("");
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [preview, setPreview] = useState<Preview>("Today");
  useEffect(() => {
    let frame = 0;
    try {
      const saved = window.localStorage.getItem("pacifica-public-theme");
      if (saved === "light") frame = window.requestAnimationFrame(() => setTheme("light"));
    } catch { /* Keep the default when browser storage is unavailable. */ }
    return () => window.cancelAnimationFrame(frame);
  }, []);
  function toggleTheme() {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    try { window.localStorage.setItem("pacifica-public-theme", next); } catch { /* Theme still works in memory. */ }
  }
  async function subscribe(plan: "solo" | "team" | "agency") {
    setCheckout(plan); setError("");
    try {
      const response = await fetch("/api/stripe/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.url) throw new Error(data.error || "Checkout is not active yet");
      window.location.assign(String(data.url));
    } catch (err) { setError(err instanceof Error ? err.message : "Checkout is not active yet"); setCheckout(""); }
  }

  return <main className={styles.site} data-landing-theme={theme}>
    <a href="#product" className={styles.skipLink}>Skip to product</a>
    <nav className={styles.nav} aria-label="Main navigation">
      <Link href="/" className={styles.brand}><Image src="/pacifica-mark.png" width={32} height={32} alt="" /><span>PACIFICA</span></Link>
      <div className={styles.navLinks}><a href="#product">Workspace</a><Link href="/compare">Compare</Link><a href="#pricing">Pricing</a></div>
      <div className={styles.navActions}><button type="button" className={styles.themeToggle} onClick={toggleTheme} aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}><span aria-hidden="true">{theme === "light" ? "☾" : "☼"}</span></button>{clerkEnabled ? <ClerkNavAuth /> : <Link href="/login">Log in</Link>}<a className={styles.navCta} href="#pricing">Get started <span aria-hidden="true">↗</span></a></div>
    </nav>

    <section className={styles.hero} aria-labelledby="hero-heading">
      {theme === "dark" && <div className={styles.sky}><Starfield className={styles.stars} /><div className={styles.horizon} /></div>}
      <div className={styles.heroCopy}><p className={styles.kicker}><i /> YOUR NEXT CHAPTER STARTS HERE</p><h1 id="hero-heading">Less noise.<br /><span>More possibility.</span></h1><p className={styles.sub}>Every lead. Every conversation. A clear next step.<br className={styles.desktopBreak} /> Your calls, messages, and AI—beautifully in sync.</p><div className={styles.heroActions}><a href="#pricing">Find your workspace <span aria-hidden="true">↗</span></a><a href="#product">Explore Pacifica <span aria-hidden="true">↓</span></a></div><p className={styles.heroNote}>From ${pacificaPlans.solo.monthlyPrice}/month <span>·</span> Cancel anytime <span>·</span> Usage billed separately</p></div>
      <div id="product" className={styles.productStage}><WorkspacePreview preview={preview} onChange={setPreview} /></div>
    </section>

    <section className={styles.industries} aria-label="Industries"><p>BUILT FOR PEOPLE WHO BUILD RELATIONSHIPS</p><div>{industries.map(item => <span key={item}>{item}</span>)}</div></section>

    <section className={styles.product} id="workflow"><div className={styles.sectionIntro}><p className={styles.kicker}>EVERYTHING, IN ORBIT</p><h2>A clearer way<br />to move your day forward.</h2><p>The context you need and the tools you use.<br />Finally, in the same place.</p></div><div className={styles.featureGrid}>
      <article className={styles.featureWide}><div><span className={styles.featureNumber}>01 / CLARITY</span><h3>Good notes.<br />Real next steps.</h3><p>Doxa turns your call notes into reminders on Today. Complete, snooze, or reopen them—without filling your calendar with cold follow-ups.</p><a href="#product" onClick={() => setPreview("Today")}>Bring your day into focus <span>↗</span></a></div><div className={styles.reminderDemo}><span>FROM A CONVERSATION TO A NEXT STEP</span><blockquote>“Send Maria the quote after reviewing her declaration page.”</blockquote><div className={styles.connectLine} aria-hidden="true">↓</div><div><i>○</i><span><b>Review Maria’s declaration page</b><small>Visible on Today. Ready when you are.</small></span><span aria-hidden="true">↗</span></div></div></article>
      <article><span className={styles.featureNumber}>02 / CONNECTION</span><h3>Find your rhythm.</h3><p>A focused power dialer, ClearVoice noise suppression, and your contact’s context. Stay present for the conversation.</p><div className={styles.wave} aria-hidden="true">{Array.from({ length: 44 }, (_, i) => <i key={i} style={{ height: `${8 + Math.sin(i * .7) ** 2 * Math.sin(i / 44 * Math.PI) * 68}px` }} />)}</div><a href="#product" onClick={() => setPreview("Dialer")}>Explore the dialer <span>↗</span></a></article>
      <article><span className={styles.featureNumber}>03 / CONTEXT</span><h3>Pick up where you left off.</h3><p>Calls, texts, photos, and PDFs belong with the relationship. Keep the whole story close, and the next conversation effortless.</p><div className={styles.messageDemo}><span>Maria Torres <small>Contact history</small></span><p>Here’s the declaration page we discussed.</p><div><span aria-hidden="true">↳</span> Declaration page.pdf <small>Attached to conversation</small></div></div><Link href="/login">Open your workspace <span>↗</span></Link></article>
    </div></section>

    <section className={styles.aiSection}><div className={styles.aiSectionCopy}><p className={styles.kicker}>MEET DOXA</p><h2>A little more<br /><span>headspace.</span></h2><p>Prepare for the next call. Draft a thoughtful follow-up. Read a document. Turn what you know into what happens next.</p><a href="#product" onClick={() => setPreview("Doxa")}>Take a closer look <span>↗</span></a></div><div className={styles.aiExample}><span className={styles.aiSpark}>✧</span><p>What should I work on next?</p><div className={styles.aiAnswer}><span>DOXA <small>Illustrative response</small></span><h3>Start with the promises you made.</h3><p>Review Maria’s declaration page, prepare Daniel’s renewal, and confirm Sophia’s appointment.</p><div><span>3 next steps</span><span>One clear direction ↗</span></div></div></div></section>

    <section className={styles.pricing} id="pricing"><div className={styles.sectionIntro}><p className={styles.kicker}>SPACE TO GROW</p><h2>Your ambition.<br />Your workspace.</h2><p>Start solo, grow to a five-person team, or bring up to ten users together.</p></div><div className={styles.planGrid}>{plans.map(plan => <article className={plan.id === "team" ? styles.popular : ""} key={plan.id}><div className={styles.planName}><h3>{plan.name}</h3>{plan.id === "team" && <span>Room for your team</span>}</div><p className={styles.planPrice}><sup>$</sup>{plan.monthlyPrice}<span>/ month</span></p><p>{plan.description}</p><button type="button" disabled={Boolean(checkout)} onClick={() => void subscribe(plan.id)}>{checkout === plan.id ? "Opening checkout…" : `Choose ${plan.name}`}<span aria-hidden="true">↗</span></button><ul>{plan.features.map(feature => <li key={feature}><span aria-hidden="true">✓</span>{feature}</li>)}</ul></article>)}</div><div className={styles.enterpriseContact}><div><span>FOR GROWING AGENCIES</span><h3>Need more than 10 users?</h3><p>Tell us how many agents you need. We can discuss additional seats, multiple locations, and a custom agency setup.</p></div><a href="mailto:pacificalegalinsurance@gmail.com?subject=Pacifica%20CRM%20-%20Custom%20Agency%20Pricing">Contact us for more <span aria-hidden="true">↗</span></a></div>{error && <p role="alert" className={styles.checkoutError}>{error}</p>}<p className={styles.priceNote}>Month-to-month. Calling, messaging, phone numbers, AI-provider usage, external data, and taxes are separate where applicable.</p><details className={styles.planDetails}><summary>Compare everything included <span aria-hidden="true">+</span></summary><PlanComparison /></details></section>

    <section className={styles.faq}><div><p className={styles.kicker}>A FEW GOOD QUESTIONS</p><h2>Before you<br />make your move.</h2><Link href="/compare">Compare Pacifica with other CRMs ↗</Link></div><div>{[["What’s included in the monthly plan?", "Your workspace includes contacts, calendar, reports, the power dialer, messaging, and AI tools. Calling, messaging, phone numbers, AI-provider usage, external data, and taxes are separate where applicable. Integrations require setup."], ["How many users are included?", "Solo includes 1 user, Team includes up to 5, and Agency includes up to 10. Need more seats? Use the Contact us for more link above to request custom pricing."], ["Can I bring my existing leads?", "Yes. Import contacts from a CSV and organize your work in Pacifica. You can also configure supported lead-source integrations in your workspace."], ["Can I use Pacifica on my phone?", "Yes. Pacifica works in your browser, with a mobile app for business texting and supported mobile workflows."], ["Am I locked into a contract?", "Plans are month-to-month. You can cancel your subscription without committing to an annual plan."]].map(([question, answer]) => <details key={question}><summary>{question}<span aria-hidden="true">+</span></summary><p>{answer}</p></details>)}</div></section>

    <section className={styles.finalCta}><p className={styles.kicker}>MAKE ROOM FOR WHAT’S NEXT</p><h2>Your next chapter.<br /><span>All in one place.</span></h2><a href="#pricing">Get started with Pacifica <span aria-hidden="true">↗</span></a></section>
    <footer className={styles.footer}><div><Link href="/" className={styles.brand}><Image src="/pacifica-mark.png" width={28} height={28} alt="" /><span>PACIFICA</span></Link><p>A clearer space for your business.</p></div><div><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><Link href="/sms">SMS Messaging</Link><Link href="/login">CRM login</Link></div><small>Pacifica CRM</small></footer>
  </main>;
}
