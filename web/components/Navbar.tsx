"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useLang } from "@/lib/i18n";

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const { lang, setLang, t } = useLang();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-[#0a0a0a]/80 backdrop-blur-xl border-b border-white/[0.06]"
          : "bg-transparent"
      }`}
    >
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5">
          <svg width="28" height="28" viewBox="0 0 160 160" fill="none">
            <rect width="160" height="160" rx="36" fill="#0f0f13"/>
            <defs>
              <linearGradient id="nb-left" x1="19" y1="67" x2="102" y2="141" gradientUnits="userSpaceOnUse">
                <stop stopColor="#7c3aed"/>
                <stop offset="1" stopColor="#4f1fa0"/>
              </linearGradient>
              <linearGradient id="nb-right" x1="45" y1="13" x2="131" y2="83" gradientUnits="userSpaceOnUse">
                <stop stopColor="#a78bfa"/>
                <stop offset="1" stopColor="#7c3aed"/>
              </linearGradient>
              <linearGradient id="nb-ridge" x1="45" y1="13" x2="102" y2="141" gradientUnits="userSpaceOnUse">
                <stop stopColor="#ede9fe" stopOpacity="0.9"/>
                <stop offset="1" stopColor="#c4b5fd" stopOpacity="0.4"/>
              </linearGradient>
            </defs>
            <polygon points="45,13 102,141 35,128 19,67" fill="url(#nb-left)"/>
            <polygon points="45,13 115,29 131,83 102,141" fill="url(#nb-right)"/>
            <line x1="45" y1="13" x2="102" y2="141" stroke="url(#nb-ridge)" strokeWidth="2.5" strokeLinecap="round"/>
            <polygon points="45,13 115,29 131,83 102,141" fill="white" fillOpacity="0.06"/>
          </svg>
          <span className="font-semibold text-white text-[15px] tracking-tight">LOQA</span>
        </Link>

        {/* Links */}
        <nav className="hidden md:flex items-center gap-1">
          {[
            { label: t.nav.features,  href: "/#features"   },
            { label: t.nav.whyLocal,  href: "/#why-local"  },
            { label: t.nav.pricing,   href: "/pricing"     },
            { label: t.nav.download,  href: "/#download"   },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="px-3.5 py-1.5 text-sm text-zinc-400 hover:text-white transition-colors rounded-lg hover:bg-white/5"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Right: lang toggle + CTA */}
        <div className="flex items-center gap-2">
          {/* Language toggle */}
          <div className="flex items-center bg-white/[0.04] border border-white/[0.08] rounded-lg p-0.5">
            {(["en", "id"] as const).map((l) => (
              <button
                key={l}
                onClick={() => setLang(l)}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
                  lang === l
                    ? "bg-white/10 text-white"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>

          {/* CTA */}
          <Link
            href="/#download"
            className="hidden md:flex items-center gap-2 px-4 py-1.5 rounded-lg bg-violet-500/10 border border-violet-500/20 text-violet-300 text-sm font-medium hover:bg-violet-500/20 hover:border-violet-500/40 transition-all"
          >
            {t.nav.download}
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M6 1v7M3 5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M1 9h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </Link>
        </div>
      </div>
    </header>
  );
}
