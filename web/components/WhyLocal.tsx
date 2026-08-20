"use client";

import { useEffect, useRef, useState } from "react";
import { useLang } from "@/lib/i18n";

export function WhyLocal() {
  const { t } = useLang();

  return (
    <section id="why-local" className="relative py-24 px-6">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-px h-16 bg-gradient-to-b from-transparent via-violet-500/30 to-transparent" />

      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
        {/* Left: text */}
        <div>
          <span className="inline-block text-xs font-semibold uppercase tracking-[0.15em] text-violet-400 mb-4">
            {t.whyLocal.sectionLabel}
          </span>
          <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-tight mb-4">
            {t.whyLocal.headline1}
            <br />
            <span className="text-zinc-400">{t.whyLocal.headline2}</span>
          </h2>
          <p className="text-zinc-400 text-base leading-relaxed mb-10">
            {t.whyLocal.body}
          </p>
          <div className="flex flex-col gap-5">
            {t.whyLocal.points.map((p, i) => (
              <AnimatedPoint key={i} {...p} index={i} />
            ))}
          </div>
        </div>

        {/* Right: visual */}
        <div className="flex items-center justify-center">
          <LocalVisual />
        </div>
      </div>
    </section>
  );
}

function AnimatedPoint({
  icon, title, description, index,
}: { icon: string; title: string; description: string; index: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect(); } },
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className="flex items-start gap-4 transition-all duration-500"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateX(0)" : "translateX(-16px)",
        transitionDelay: `${index * 80}ms`,
      }}
    >
      <div className="w-9 h-9 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-base shrink-0">
        {icon}
      </div>
      <div>
        <p className="text-sm font-semibold text-white mb-0.5">{title}</p>
        <p className="text-sm text-zinc-500 leading-relaxed">{description}</p>
      </div>
    </div>
  );
}

function LocalVisual() {
  return (
    <div className="relative w-72 h-72 flex items-center justify-center">
      {[1, 2, 3].map((i) => (
        <div key={i} className="absolute rounded-full border border-violet-500/10" style={{ inset: `${i * 28}px` }} />
      ))}
      <div className="absolute inset-16 rounded-full border border-violet-500/20 animate-ping" style={{ animationDuration: "3s" }} />
      <div className="relative z-10 w-24 h-24 rounded-2xl bg-[#111] border border-violet-500/30 flex items-center justify-center glow-accent-sm">
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
          <rect x="6" y="4" width="28" height="24" rx="3" stroke="#8B5CF6" strokeWidth="1.5"/>
          <path d="M14 36h12M20 28v8" stroke="#8B5CF6" strokeWidth="1.5" strokeLinecap="round"/>
          <path d="M13 12h14M13 17h8" stroke="#8B5CF6" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.6"/>
        </svg>
      </div>
      <div className="absolute top-8 right-8 w-9 h-9 rounded-full bg-[#111] border border-green-500/30 flex items-center justify-center">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <rect x="2" y="6" width="10" height="7" rx="1.5" stroke="#22c55e" strokeWidth="1.3"/>
          <path d="M4.5 6V4.5a2.5 2.5 0 0 1 5 0V6" stroke="#22c55e" strokeWidth="1.3" strokeLinecap="round"/>
        </svg>
      </div>
      <div className="absolute bottom-8 left-8 w-9 h-9 rounded-full bg-[#111] border border-red-500/30 flex items-center justify-center">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M3 11a3 3 0 0 1-.5-5.9A4 4 0 0 1 10.5 7H11a2 2 0 0 1 0 4H3Z" stroke="#ef4444" strokeWidth="1.3" strokeOpacity="0.7"/>
          <path d="M2 2l10 10" stroke="#ef4444" strokeWidth="1.3" strokeLinecap="round"/>
        </svg>
      </div>
    </div>
  );
}
