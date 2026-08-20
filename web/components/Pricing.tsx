"use client";

import { useState } from "react";
import Link from "next/link";
import { useLang } from "@/lib/i18n";

type BillingCycle = "monthly" | "yearly" | "lifetime";

const PRICES = [
  { monthly: 49000,  yearly: 39000,  lifetime: 1590000 },
  { monthly: 99000,  yearly: 79000,  lifetime: 3290000 },
  { monthly: 299000, yearly: 239000, lifetime: 9870000 },
];
const DEVICES   = [1, 1, 5];
const HIGHLIGHT = [false, true, false];

function formatPrice(n: number) {
  return "Rp " + n.toLocaleString("id-ID");
}

export function Pricing({ compact = false }: { compact?: boolean }) {
  const [cycle, setCycle] = useState<BillingCycle>("yearly");
  const { t } = useLang();
  const p = t.pricing;

  const trustItems = [
    { icon: <KeyIcon />,      text: compact ? p.cycleLabels.lifetime : (t.pricing.cycleLabels.lifetime + " = " + (t.pricing.lifetimeBadge)) },
    { icon: <DeviceIcon />,   text: p.perDevice },
    { icon: <ShieldIcon />,   text: "100% offline" },
    { icon: <InfinityIcon />, text: p.lifetimeBadge },
  ];

  return (
    <section id="pricing" className={`relative ${compact ? "py-20" : "py-28"} px-6`}>
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-px h-24 bg-gradient-to-b from-transparent via-violet-500/30 to-transparent" />

      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <span className="inline-block text-xs font-semibold uppercase tracking-[0.15em] text-violet-400 mb-4">
            {p.sectionLabel}
          </span>
          <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">
            {p.headline}{" "}
            <span className="text-zinc-400">{p.headlineAccent}</span>
          </h2>
          <p className="mt-4 text-zinc-500 text-sm max-w-lg mx-auto leading-relaxed">
            {p.body}
          </p>

          {/* Billing cycle toggle */}
          <div className="mt-7 inline-flex items-center gap-1 bg-white/[0.04] border border-white/[0.08] rounded-xl p-1">
            {(["monthly", "yearly", "lifetime"] as BillingCycle[]).map((c) => (
              <button
                key={c}
                onClick={() => setCycle(c)}
                className={`relative px-4 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 ${
                  cycle === c ? "bg-white/10 text-white" : "text-zinc-500 hover:text-zinc-400"
                }`}
              >
                {p.cycleLabels[c]}
                {c === "yearly" && (
                  <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                    {p.yearlyBadge}
                  </span>
                )}
                {c === "lifetime" && (
                  <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-violet-500/15 text-violet-400 border border-violet-500/20">
                    {p.lifetimeBadge}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {p.plans.map((plan, i) => (
            <PlanCard
              key={plan.name}
              name={plan.name}
              tagline={plan.tagline}
              app={plan.app}
              includes={plan.includes}
              devices={DEVICES[i]}
              highlight={HIGHLIGHT[i]}
              price={PRICES[i][cycle]}
              cycle={cycle}
              compact={compact}
              perMonth={p.perMonth}
              billedYearly={p.billedYearly}
              oneTimePay={p.oneTimePay}
              getStarted={p.getStarted}
              perDevice={p.perDevice}
            />
          ))}
        </div>

        {/* Extra device note */}
        <p className="mt-6 text-center text-xs text-zinc-600">{p.deviceNote}</p>

        {/* Trust strip */}
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-6">
          {[
            { icon: <KeyIcon />,      text: "License key activation" },
            { icon: <DeviceIcon />,   text: p.perDevice              },
            { icon: <ShieldIcon />,   text: "100% offline"           },
            { icon: <InfinityIcon />, text: p.lifetimeBadge          },
          ].map(({ icon, text }) => (
            <div key={text} className="flex items-center gap-2 text-zinc-500 text-xs">
              <span className="text-violet-500/70">{icon}</span>
              {text}
            </div>
          ))}
        </div>

        {compact && (
          <div className="mt-8 text-center">
            <Link
              href="/pricing"
              className="inline-flex items-center gap-2 text-sm text-violet-400 hover:text-violet-300 transition-colors font-medium"
            >
              {t.pricing.cycleLabels.monthly === "Monthly" ? "See full comparison" : "Lihat perbandingan lengkap"}
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M2 6h8M6 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}

function PlanCard({
  name, tagline, app, includes, devices, highlight,
  price, cycle, compact, perMonth, billedYearly, oneTimePay, getStarted, perDevice,
}: {
  name: string; tagline: string; app: string; includes: readonly string[];
  devices: number; highlight: boolean; price: number; cycle: BillingCycle;
  compact: boolean; perMonth: string; billedYearly: string; oneTimePay: string;
  getStarted: string; perDevice: string;
}) {
  const isLifetime = cycle === "lifetime";
  const isYearly   = cycle === "yearly";

  return (
    <div
      className={`relative rounded-2xl p-6 flex flex-col transition-all ${
        highlight
          ? "bg-violet-500/[0.07] border border-violet-500/40 shadow-[0_0_60px_-15px_rgba(139,92,246,0.3)]"
          : "bg-white/[0.03] border border-white/[0.07] hover:border-white/[0.12]"
      }`}
    >
      {highlight && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="px-3 py-1 rounded-full text-[10px] font-semibold bg-violet-500 text-white tracking-wide shadow-lg">
            MOST POPULAR
          </span>
        </div>
      )}

      <div className="mb-5">
        <span className={`text-base font-bold ${highlight ? "text-white" : "text-zinc-200"}`}>{name}</span>
        <p className="text-xs text-zinc-500 mt-0.5">{tagline}</p>
      </div>

      <div className="mb-5 pb-5 border-b border-white/[0.06]">
        <div className="flex items-baseline gap-1.5">
          <span className={`text-3xl font-bold tracking-tight ${highlight ? "text-white" : "text-zinc-100"}`}>
            {formatPrice(price)}
          </span>
          {!isLifetime && <span className="text-xs text-zinc-500">{perMonth}</span>}
        </div>
        <div className="mt-1 text-[11px] text-zinc-500">
          {isLifetime
            ? oneTimePay
            : isYearly
            ? `${billedYearly} — ${formatPrice(price * 12)} / yr`
            : perMonth}
        </div>
      </div>

      <div className="mb-5 flex flex-col gap-2.5">
        <CheckItem text={app} />
        <CheckItem text={`${devices === 1 ? "1" : devices} ${perDevice}`} />
        {!compact && includes.map((line) => <CheckItem key={line} text={line} />)}
      </div>

      <a
        href="#download"
        className={`w-full text-center py-2.5 rounded-xl text-sm font-semibold mt-auto transition-all ${
          highlight
            ? "bg-violet-500 text-white hover:bg-violet-400"
            : "bg-white/[0.07] text-zinc-300 border border-white/[0.1] hover:bg-white/[0.12] hover:text-white"
        }`}
      >
        {getStarted}
      </a>
    </div>
  );
}

function CheckItem({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2">
      <svg width="13" height="13" viewBox="0 0 14 14" fill="none" className="shrink-0 mt-0.5">
        <circle cx="7" cy="7" r="6" fill="#8B5CF6" fillOpacity="0.2"/>
        <path d="M4.5 7l2 2 3-3" stroke="#a78bfa" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      <span className="text-xs text-zinc-400 leading-relaxed">{text}</span>
    </div>
  );
}

function KeyIcon() {
  return <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="6" cy="8" r="4" stroke="currentColor" strokeWidth="1.5"/><path d="M10 8h5M13 6v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>;
}
function DeviceIcon() {
  return <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="1" y="2" width="10" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.5"/><path d="M6 10v3M4 13h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><rect x="11" y="6" width="4" height="7" rx="1" stroke="currentColor" strokeWidth="1.3"/></svg>;
}
function ShieldIcon() {
  return <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 1l6 2.5v4C14 11 11.5 14 8 15 4.5 14 2 11 2 7.5v-4L8 1Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/><path d="M5.5 8l2 2 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}
function InfinityIcon() {
  return <svg width="16" height="14" viewBox="0 0 20 14" fill="none"><path d="M10 7c0-2.21 1.79-4 4-4s4 1.79 4 4-1.79 4-4 4c-1.5 0-2.81-.82-3.5-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><path d="M10 7c0-2.21-1.79-4-4-4S2 4.79 2 7s1.79 4 4 4c1.5 0 2.81-.82 3.5-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>;
}
