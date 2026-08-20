"use client";

import { useEffect, useRef, useState } from "react";
import { useLang } from "@/lib/i18n";

const ICONS = [
  // AI Chat
  <svg key="chat" width="22" height="22" viewBox="0 0 22 22" fill="none">
    <path d="M11 2a9 9 0 1 0 0 18A9 9 0 0 0 11 2Z" stroke="#8B5CF6" strokeWidth="1.5"/>
    <path d="M8 11h6M11 8v6" stroke="#8B5CF6" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>,
  // Finance
  <svg key="finance" width="22" height="22" viewBox="0 0 22 22" fill="none">
    <rect x="2" y="5" width="18" height="14" rx="2" stroke="#8B5CF6" strokeWidth="1.5"/>
    <path d="M2 9h18" stroke="#8B5CF6" strokeWidth="1.5"/>
    <path d="M7 14h2M12 14h3" stroke="#8B5CF6" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>,
  // Inventory
  <svg key="inventory" width="22" height="22" viewBox="0 0 22 22" fill="none">
    <path d="M11 2L20 7v8l-9 5-9-5V7l9-5Z" stroke="#8B5CF6" strokeWidth="1.5" strokeLinejoin="round"/>
    <path d="M11 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" stroke="#8B5CF6" strokeWidth="1.5"/>
    <path d="M11 12v4" stroke="#8B5CF6" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>,
  // Order / POS
  <svg key="order" width="22" height="22" viewBox="0 0 22 22" fill="none">
    <circle cx="8" cy="19" r="1.5" fill="#8B5CF6"/>
    <circle cx="15" cy="19" r="1.5" fill="#8B5CF6"/>
    <path d="M2 3h2.5l2.5 9h8l2.5-6H7" stroke="#8B5CF6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>,
  // Project
  <svg key="project" width="22" height="22" viewBox="0 0 22 22" fill="none">
    <rect x="2" y="3" width="18" height="16" rx="2" stroke="#8B5CF6" strokeWidth="1.5"/>
    <path d="M7 8h8M7 12h5M7 16h3" stroke="#8B5CF6" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>,
  // Analytics
  <svg key="analytics" width="22" height="22" viewBox="0 0 22 22" fill="none">
    <path d="M4 14l4-4 3 3 4-5 3 3" stroke="#8B5CF6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    <rect x="2" y="2" width="18" height="18" rx="3" stroke="#8B5CF6" strokeWidth="1.5"/>
  </svg>,
  // Model Manager
  <svg key="model" width="22" height="22" viewBox="0 0 22 22" fill="none">
    <path d="M11 3v4M5.6 5.6l2.8 2.8M3 11h4M5.6 16.4l2.8-2.8M11 19v-4M16.4 16.4l-2.8-2.8M19 11h-4M16.4 5.6l-2.8 2.8" stroke="#8B5CF6" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>,
  // Dual App
  <svg key="dual" width="22" height="22" viewBox="0 0 22 22" fill="none">
    <rect x="3" y="11" width="7" height="8" rx="1.5" stroke="#8B5CF6" strokeWidth="1.5"/>
    <rect x="12" y="3" width="7" height="16" rx="1.5" stroke="#8B5CF6" strokeWidth="1.5"/>
    <path d="M3 7h7" stroke="#8B5CF6" strokeWidth="1.5" strokeLinecap="round"/>
    <path d="M5 7V4" stroke="#8B5CF6" strokeWidth="1.5" strokeLinecap="round"/>
    <path d="M8 7V5" stroke="#8B5CF6" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>,
];

export function Features() {
  const { t } = useLang();

  return (
    <section id="features" className="relative py-24 px-6">
      <div className="max-w-6xl mx-auto">
        {/* Section header */}
        <div className="text-center mb-16">
          <span className="inline-block text-xs font-semibold uppercase tracking-[0.15em] text-violet-400 mb-4">
            {t.features.sectionLabel}
          </span>
          <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">
            {t.features.headline1}
            <br />
            <span className="text-zinc-400">{t.features.headline2}</span>
          </h2>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {t.features.items.map((f, i) => (
            <FeatureCard key={i} icon={ICONS[i]} title={f.title} description={f.description} tags={f.tags} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}

function FeatureCard({
  icon, title, description, tags, index,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  tags: readonly string[];
  index: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [hovered, setHovered] = useState(false);

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
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="card-border p-6 flex flex-col gap-4 cursor-default transition-all duration-500"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(20px)",
        transitionDelay: `${index * 60}ms`,
        boxShadow: hovered ? "0 0 40px -10px rgba(99,102,241,0.2)" : "none",
      }}
    >
      <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
        {icon}
      </div>
      <div>
        <h3 className="font-semibold text-white text-[15px] mb-2">{title}</h3>
        <p className="text-sm text-zinc-400 leading-relaxed">{description}</p>
      </div>
      <div className="flex flex-wrap gap-1.5 mt-auto">
        {tags.map((tag) => (
          <span
            key={tag}
            className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-white/[0.05] text-zinc-500 border border-white/[0.06]"
          >
            {tag}
          </span>
        ))}
      </div>
    </div>
  );
}
