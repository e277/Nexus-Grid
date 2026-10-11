import {
  ArrowRight,
  ClipboardCheck,
  Fingerprint,
  KeyRound,
  Lock,
  Scale,
  ScrollText,
  ShieldCheck,
  Users,
} from "lucide-react";
import Link from "next/link";

import { auth, authConfigured } from "@/auth";

import { Brand } from "../components/landing/Brand";
import { ThemeToggle } from "../components/ThemeToggle";

export const dynamic = "force-dynamic";

/**
 * The public front door.
 *
 * It says what the system does and how it can be trusted, then hands off to
 * sign-in. It quotes no live figure: those come from the console, which reads
 * them from the publishers on every load, and a number frozen into a landing
 * page would be the one figure on the site nobody could reproduce.
 */

const LOOP = [
  { step: "Perceive", detail: "Read trade, soil, climate, planting and freight data.", tone: "perceive" },
  { step: "Assess", detail: "Find imports a CARICOM member already supplies.", tone: "reason" },
  { step: "Recommend", detail: "Rank regional suppliers for the gap.", tone: "reason" },
  { step: "Plan", detail: "Draft the coordination plan and its risks.", tone: "plan" },
  { step: "Hold", detail: "Urgent plans wait for a person to decide.", tone: "plan" },
  { step: "Execute", detail: "Post the approved plan to the operator dashboard.", tone: "execute" },
  { step: "Monitor and recover", detail: "Watch the lane and replan on disruption.", tone: "recover" },
] as const;

const TONE: Record<(typeof LOOP)[number]["tone"], string> = {
  perceive: "border-phase-perceive bg-phase-perceive-bg text-phase-perceive-tx",
  reason: "border-phase-reason bg-phase-reason-bg text-phase-reason-tx",
  plan: "border-phase-plan bg-phase-plan-bg text-phase-plan-tx",
  execute: "border-phase-execute bg-phase-execute-bg text-phase-execute-tx",
  recover: "border-phase-recover bg-phase-recover-bg text-phase-recover-tx",
};

const SOURCES = [
  { name: "UN Comtrade", gives: "Trade flows. Every sourcing gap starts here." },
  { name: "World Bank Open Data", gives: "Arable land, cereal yield, agriculture's share of GDP." },
  { name: "ISRIC SoilGrids", gives: "pH, organic carbon and clay under each growing point." },
  { name: "NASA POWER", gives: "Rain-fed planting windows per member state." },
  { name: "Open-Meteo", gives: "Live climate risk at both ends of every lane." },
  { name: "NOAA NHC", gives: "Named storms active in the basin." },
];

const PILLARS = [
  {
    icon: Scale,
    title: "Find the addressable gap",
    body: "Where one member state buys a commodity from outside the region while another already exports it, the gap is computed from the trade flows themselves, not estimated.",
  },
  {
    icon: Users,
    title: "Coordinate, don't trade",
    body: "Nexus-Grid buys, sells and holds nothing. It tells ministries, cooperatives and shippers what to coordinate, and carries the plan to them.",
  },
  {
    icon: ClipboardCheck,
    title: "A person at the gate",
    body: "The loop runs on its own at every step but one. Urgent plans stop for a human to approve, amend, reject or escalate, and nothing moves until they do.",
  },
];

const SECURITY = [
  {
    icon: Fingerprint,
    title: "Single sign-on",
    body: "People sign in with your own identity provider: Microsoft Entra ID, Okta or any OIDC issuer, Google Workspace or GitHub. No passwords are stored here.",
  },
  {
    icon: Users,
    title: "Role-based access",
    body: "Viewers read, operators run sweeps and decide gates, admins see process metrics. Every route checks the role on the server.",
  },
  {
    icon: ScrollText,
    title: "A verified audit trail",
    body: "Each run started and each gate decided is recorded under the signed-in person's identity, which a caller cannot supply for themselves.",
  },
  {
    icon: Lock,
    title: "Closed by default",
    body: "Access is an allow-list of people and domains. A deployment without an identity provider stays shut rather than falling open.",
  },
  {
    icon: KeyRound,
    title: "Service accounts",
    body: "Integrations call the API with their own tokens, held only as hashes and checked in constant time.",
  },
  {
    icon: ShieldCheck,
    title: "Hardened delivery",
    body: "Strict transport security, a content security policy and clickjacking protection on every response; sessions end after a working shift.",
  },
];

function SectionHeading({ eyebrow, title, body }: { eyebrow: string; title: string; body?: string }) {
  return (
    <div className="max-w-2xl">
      <p className="text-ng-xs font-semibold uppercase tracking-wider text-ng-accent">{eyebrow}</p>
      <h2 className="mt-2 text-ng-2xl font-bold tracking-tight text-ng-primary">{title}</h2>
      {body ? <p className="mt-3 text-ng-lg leading-relaxed text-ng-secondary">{body}</p> : null}
    </div>
  );
}

export default async function LandingPage() {
  const signedIn = authConfigured() ? Boolean(await auth()) : false;
  const cta = signedIn
    ? { href: "/console", label: "Open the console" }
    : { href: "/signin", label: "Sign in to the console" };

  return (
    <div className="min-h-screen bg-ng-bg text-ng-primary">
      <header className="sticky top-0 z-20 border-b border-ng-border/40 bg-ng-bg/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-8">
          <Brand />
          <nav aria-label="Sections" className="ml-6 hidden gap-6 text-ng-sm font-medium text-ng-secondary md:flex">
            <a href="#how" className="hover:text-ng-primary">How it works</a>
            <a href="#data" className="hover:text-ng-primary">Data</a>
            <a href="#security" className="hover:text-ng-primary">Security</a>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <Link
              href={cta.href}
              className="inline-flex h-9 items-center rounded-md bg-ng-accent px-3.5 text-ng-sm font-semibold text-ng-accent-fg transition-colors hover:bg-ng-accent-hov focus:outline-none focus-visible:ring-2 focus-visible:ring-ng-accent focus-visible:ring-offset-2"
            >
              {signedIn ? "Open console" : "Sign in"}
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* ── Hero ─────────────────────────────────────────────────────── */}
        <section className="mx-auto grid max-w-6xl gap-12 px-4 pb-20 pt-16 sm:px-8 lg:grid-cols-[1.15fr_1fr] lg:pt-24">
          <div>
            <p className="text-ng-xs font-semibold uppercase tracking-wider text-ng-accent">
              Caribbean food supply coordination
            </p>
            <h1 className="mt-4 text-ng-hero font-bold leading-[1.1] tracking-tight text-ng-primary sm:text-ng-display">
              The Caribbean imports about 80% of its food. Some of it is already grown next door.
            </h1>
            <p className="mt-6 max-w-xl text-ng-lg leading-relaxed text-ng-secondary">
              Nexus-Grid reads live trade data across the 15 CARICOM member states, finds what one
              member buys from outside the region while another already exports it, and coordinates
              the switch to a regional supplier.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href={cta.href}
                className="inline-flex h-11 items-center gap-2 rounded-md bg-ng-accent px-5 text-ng-base font-semibold text-ng-accent-fg transition-colors hover:bg-ng-accent-hov focus:outline-none focus-visible:ring-2 focus-visible:ring-ng-accent focus-visible:ring-offset-2"
              >
                {cta.label}
                <ArrowRight size={16} aria-hidden />
              </Link>
              <a
                href="#how"
                className="inline-flex h-11 items-center rounded-md border border-ng-border px-5 text-ng-base font-semibold text-ng-primary transition-colors hover:bg-ng-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-ng-accent"
              >
                How it works
              </a>
            </div>
          </div>

          {/* The loop, as the console draws it: phase colours, in order. */}
          <div
            id="how"
            className="scroll-mt-24 rounded-xl border border-ng-border bg-ng-surface p-5 shadow-ng-md sm:p-6"
          >
            <p className="text-ng-xs font-semibold uppercase tracking-wider text-ng-secondary">
              The coordination loop
            </p>
            <ol className="mt-4 space-y-2.5">
              {LOOP.map((item, index) => (
                <li key={item.step} className="flex items-start gap-3">
                  <span
                    className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-ng-xs font-bold tabular-nums ${TONE[item.tone]}`}
                  >
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-ng-base font-semibold text-ng-primary">{item.step}</p>
                    <p className="text-ng-sm leading-snug text-ng-secondary">{item.detail}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ── What it does ─────────────────────────────────────────────── */}
        <section className="border-y border-ng-border/40 bg-ng-surface">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 py-16 sm:px-8 md:grid-cols-3">
            {PILLARS.map(({ icon: Icon, title, body }) => (
              <div key={title}>
                <Icon size={22} className="text-ng-accent" aria-hidden />
                <h3 className="mt-3 text-ng-lg font-semibold text-ng-primary">{title}</h3>
                <p className="mt-2 text-ng-base leading-relaxed text-ng-secondary">{body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Data ─────────────────────────────────────────────────────── */}
        <section id="data" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-8">
          <SectionHeading
            eyebrow="Evidence"
            title="Public data anyone can check"
            body="Every source is a free, public publisher. When one is down the console says so and names what is missing; when a reading came from rules rather than a model, it is labelled."
          />
          <dl className="mt-10 grid gap-px overflow-hidden rounded-xl border border-ng-border bg-ng-border sm:grid-cols-2 lg:grid-cols-3">
            {SOURCES.map((source) => (
              <div key={source.name} className="bg-ng-surface p-5">
                <dt className="text-ng-base font-semibold text-ng-primary">{source.name}</dt>
                <dd className="mt-1 text-ng-sm leading-snug text-ng-secondary">{source.gives}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* ── Security ─────────────────────────────────────────────────── */}
        <section id="security" className="border-t border-ng-border/40 bg-ng-surface">
          <div className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-8">
            <SectionHeading
              eyebrow="Trust"
              title="Built for ministries and the people they answer to"
              body="Decisions about a region's food supply need to be attributable. Access is controlled by your organisation, and every consequential action has a name on it."
            />
            <div className="mt-10 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
              {SECURITY.map(({ icon: Icon, title, body }) => (
                <div key={title} className="flex gap-3">
                  <Icon size={20} className="mt-0.5 shrink-0 text-ng-accent" aria-hidden />
                  <div>
                    <h3 className="text-ng-base font-semibold text-ng-primary">{title}</h3>
                    <p className="mt-1 text-ng-sm leading-relaxed text-ng-secondary">{body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Closing call to action ───────────────────────────────────── */}
        <section className="mx-auto max-w-6xl px-4 py-20 sm:px-8">
          <div className="flex flex-col items-start gap-6 rounded-xl border border-ng-success-bd bg-ng-accent-lit p-8 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-ng-2xl font-bold tracking-tight text-ng-primary">
                See this week&apos;s gaps
              </h2>
              <p className="mt-1 text-ng-base text-ng-secondary">
                The console shows the addressable imports, the plans in flight and every decision taken.
              </p>
            </div>
            <Link
              href={cta.href}
              className="inline-flex h-11 shrink-0 items-center gap-2 rounded-md bg-ng-accent px-5 text-ng-base font-semibold text-ng-accent-fg transition-colors hover:bg-ng-accent-hov focus:outline-none focus-visible:ring-2 focus-visible:ring-ng-accent focus-visible:ring-offset-2"
            >
              {cta.label}
              <ArrowRight size={16} aria-hidden />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-ng-border/40">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-8 text-ng-sm text-ng-secondary sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <p>Nexus-Grid · Caribbean food supply coordination</p>
          <p>Data: UN Comtrade, World Bank, ISRIC, NASA POWER, Open-Meteo, NOAA NHC</p>
        </div>
      </footer>
    </div>
  );
}
