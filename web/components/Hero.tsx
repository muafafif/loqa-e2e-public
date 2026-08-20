"use client";

import { useEffect, useRef, useState } from "react";
import { useLang } from "@/lib/i18n";

type ModuleId = "chat" | "workspace" | "finance" | "inventory" | "order" | "project" | "analytics";

export function Hero() {
  const beamRef = useRef<HTMLDivElement>(null);
  const [activeModule, setActiveModule] = useState<ModuleId>("chat");
  const { t, lang } = useLang();

  const MODULES: { id: ModuleId; label: string; icon: React.ReactNode }[] = [
    { id: "chat",      label: "Chat",                                                    icon: <IconChat /> },
    { id: "workspace", label: "Workspace",                                               icon: <IconWorkspace /> },
    { id: "finance",   label: lang === "id" ? "Keuangan"  : "Finance",                  icon: <IconFinance /> },
    { id: "inventory", label: lang === "id" ? "Inventori" : "Inventory",                icon: <IconInventory /> },
    { id: "order",     label: lang === "id" ? "Pesanan"   : "Orders",                   icon: <IconOrder /> },
    { id: "project",   label: lang === "id" ? "Proyek"    : "Projects",                 icon: <IconProject /> },
    { id: "analytics", label: lang === "id" ? "Analitik"  : "Analytics",                icon: <IconAnalytics /> },
  ];

  useEffect(() => {
    const el = beamRef.current;
    if (!el) return;
    let frame: number;
    let t = 0;
    const animate = () => {
      t += 0.003;
      const x = 50 + Math.sin(t) * 8;
      el.style.background = `radial-gradient(ellipse 70% 40% at ${x}% 100%, rgba(99,102,241,0.18) 0%, transparent 70%)`;
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center px-6 pt-24 pb-16 hero-gradient dot-pattern overflow-hidden">
      <div ref={beamRef} className="absolute bottom-0 left-0 right-0 h-96 pointer-events-none" />

      {/* Badge */}
      <div className="mb-8 flex items-center gap-2 px-4 py-1.5 rounded-full border border-violet-500/20 bg-violet-500/5 backdrop-blur-sm">
        <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
        <span className="shimmer-text text-xs font-medium tracking-wide">
          {t.hero.badge}
        </span>
      </div>

      {/* Headline */}
      <h1 className="text-center text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight max-w-3xl leading-[1.1]">
        <span className="text-white">{t.hero.headline1}</span>
        <br />
        <span className="bg-gradient-to-br from-violet-300 via-violet-400 to-violet-600 bg-clip-text text-transparent">
          {t.hero.headline2}
        </span>
      </h1>

      <p className="mt-6 text-center text-zinc-400 text-lg max-w-2xl leading-relaxed">
        {t.hero.tagline}
      </p>

      {/* CTA */}
      <div className="mt-10 flex flex-col sm:flex-row items-center gap-3">
        <a
          href="#download"
          className="group relative flex items-center gap-2.5 px-6 py-3 rounded-xl bg-violet-500 text-white font-semibold text-sm hover:bg-violet-400 transition-all glow-accent-sm"
        >
          <AppleIcon />
          {t.hero.ctaMac}
          <svg className="w-3.5 h-3.5 group-hover:translate-y-0.5 transition-transform" viewBox="0 0 14 14" fill="none">
            <path d="M7 1v9M3 7l4 3 4-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M1 11h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </a>
        <a
          href="#download"
          className="flex items-center gap-2.5 px-6 py-3 rounded-xl bg-white/5 border border-white/10 text-white font-semibold text-sm hover:bg-white/10 hover:border-white/20 transition-all"
        >
          <WindowsIcon />
          {t.hero.ctaWindows}
        </a>
        <a
          href="#pricing"
          className="flex items-center gap-2 px-6 py-3 rounded-xl text-zinc-400 text-sm font-medium hover:text-white transition-colors"
        >
          {t.hero.ctaPricing}
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2 6h8M6 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </a>
      </div>

      {/* App Preview */}
      <div className="relative mt-16 w-full max-w-5xl">
        <div className="absolute -inset-4 bg-violet-500/10 rounded-2xl blur-2xl" />
        <div className="card-border relative rounded-xl overflow-hidden glow-accent">

          {/* OS window chrome */}
          <div className="flex items-center gap-1.5 px-4 py-2.5 bg-[#0c0c10] border-b border-white/[0.06]">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
            <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/70" />
            <div className="w-2.5 h-2.5 rounded-full bg-green-500/70" />
            <span className="ml-auto text-[9px] text-zinc-700 font-mono">localhost:3002</span>
          </div>

          {/* In-app top nav — mirrors actual app header (h-12) */}
          <div className="flex items-center gap-3 px-4 py-0 bg-[#0e0e14] border-b border-white/[0.06]" style={{ height: "44px" }}>
            {/* Logo — identical gradient layers to actual app */}
            <div className="flex items-center gap-2 shrink-0">
              <LoqaMark size={22} id="nav" />
              <div className="flex flex-col leading-none">
                <span className="font-bold text-[11px] text-white tracking-tight">LOQA</span>
                <span className="text-[7px] font-bold text-violet-400 uppercase tracking-[0.2em]">Work</span>
              </div>
            </div>

            {/* Divider */}
            <div className="w-px h-4 bg-white/10 shrink-0" />

            {/* Module nav items */}
            <nav className="flex items-center gap-0.5 flex-1">
              {MODULES.map(({ id, label, icon }) => {
                const isActive = activeModule === id;
                return (
                  <button
                    key={id}
                    onClick={() => setActiveModule(id)}
                    className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-[9.5px] font-semibold transition-all ${
                      isActive
                        ? "bg-violet-600 text-white shadow-[0_0_8px_rgba(139,92,246,0.4)]"
                        : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.05]"
                    }`}
                  >
                    <span className={isActive ? "text-white/80" : "text-zinc-600"}>{icon}</span>
                    {label}
                  </button>
                );
              })}
            </nav>

            {/* Settings button */}
            <button className="flex items-center gap-1 px-2 py-1 rounded-lg text-zinc-500 hover:text-zinc-300 text-[10px] shrink-0">
              <SettingsIcon />
              {lang === "id" ? "Setelan" : "Settings"}
            </button>
          </div>

          {/* Module content */}
          <div className="bg-[#0b0b0f]" style={{ height: "440px" }}>
            {activeModule === "chat"      && <ChatModule      lang={lang} />}
            {activeModule === "workspace" && <WorkspaceModule lang={lang} />}
            {activeModule === "finance"   && <FinanceModule   lang={lang} />}
            {activeModule === "inventory" && <InventoryModule lang={lang} />}
            {activeModule === "order"     && <OrderModule     lang={lang} />}
            {activeModule === "project"   && <ProjectModule   lang={lang} />}
            {activeModule === "analytics" && <AnalyticsModule lang={lang} />}
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-[#0a0a0a] to-transparent pointer-events-none rounded-b-xl" />
      </div>
    </section>
  );
}

/* ─── Chat Module ─── */
function ChatModule({ lang }: { lang: string }) {
  const id = lang === "id";
  return (
    <div className="flex h-full">
      <div className="w-[180px] shrink-0 border-r border-white/[0.05] bg-[#0d0d11] flex flex-col">
        <div className="px-3 pt-3 pb-2 border-b border-white/[0.05]">
          <button className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-violet-600/20 border border-violet-500/30 text-violet-300 text-[10px] font-semibold">
            + {id ? "Percakapan Baru" : "New Chat"}
          </button>
        </div>
        <div className="flex-1 px-2 py-2 overflow-hidden">
          <div className="text-[8px] font-semibold uppercase tracking-widest text-zinc-600 px-1 mb-1.5">{id ? "Hari ini" : "Today"}</div>
          {(id
            ? ["Strategi pemasaran Q4", "Analisis kompetitor utama", "Ide konten media sosial"]
            : ["Q4 marketing strategy", "Competitor analysis", "Social media content ideas"]
          ).map((title, i) => (
            <div key={i} className={`px-2 py-1.5 rounded-lg mb-0.5 cursor-pointer ${i === 0 ? "bg-violet-500/10 border border-violet-500/20" : "hover:bg-white/[0.03]"}`}>
              <span className={`text-[10px] truncate block ${i === 0 ? "text-zinc-200" : "text-zinc-500"}`}>{title}</span>
            </div>
          ))}
          <div className="text-[8px] font-semibold uppercase tracking-widest text-zinc-600 px-1 mb-1.5 mt-3">{id ? "Kemarin" : "Yesterday"}</div>
          {(id
            ? ["Draft proposal klien Acme", "Ringkasan meeting kemarin"]
            : ["Draft proposal for Acme", "Meeting summary"]
          ).map((title, i) => (
            <div key={i} className="px-2 py-1.5 rounded-lg mb-0.5 hover:bg-white/[0.03] cursor-pointer">
              <span className="text-[10px] text-zinc-600 truncate block">{title}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-hidden px-6 py-5 flex flex-col gap-5">
          <div className="flex gap-3 justify-end">
            <div className="max-w-[60%] rounded-2xl rounded-tr-sm px-4 py-2.5" style={{ background: "rgba(109,40,217,0.18)", border: "1px solid rgba(139,92,246,0.25)" }}>
              <p className="text-[11px] text-zinc-200 leading-relaxed">
                {id ? "Buatkan 5 ide kampanye digital untuk produk SaaS B2B di Q4 ini." : "Give me 5 digital campaign ideas for a B2B SaaS product this Q4."}
              </p>
            </div>
            <div className="w-6 h-6 rounded-full shrink-0 mt-0.5 flex items-center justify-center" style={{ background: "rgba(109,40,217,0.25)", border: "1px solid rgba(139,92,246,0.3)" }}>
              <span className="text-[8px] font-bold text-violet-300">H</span>
            </div>
          </div>

          <div className="flex gap-3">
            <LoqaMark size={22} id="chat-ai" />
            <div className="flex-1 max-w-[82%]">
              <div className="rounded-2xl rounded-tl-sm px-4 py-3" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                <p className="text-[11px] text-zinc-200 leading-relaxed mb-2.5">
                  {id ? "Berikut 5 ide kampanye untuk Q4:" : "Here are 5 campaign ideas for Q4:"}
                </p>
                <div className="space-y-2">
                  {(id ? [
                    { n: "1", title: "End-of-Year ROI Report", desc: "Konten berbasis data → tunjukkan penghematan nyata kepada calon klien" },
                    { n: "2", title: "Free Audit Campaign", desc: "Tawarkan audit proses gratis → leads berkualitas tinggi" },
                    { n: "3", title: "Partner Co-Marketing", desc: "Kolaborasi dengan tools komplementer → jangkauan audience baru" },
                  ] : [
                    { n: "1", title: "End-of-Year ROI Report", desc: "Data-driven content → show real savings to prospects" },
                    { n: "2", title: "Free Audit Campaign", desc: "Offer a free process audit → high-intent quality leads" },
                    { n: "3", title: "Partner Co-Marketing", desc: "Collaborate with complementary tools → new audience reach" },
                  ]).map(({ n, title, desc }) => (
                    <div key={n} className="flex gap-2 items-start">
                      <span className="w-4 h-4 rounded-full text-[8px] font-bold flex items-center justify-center shrink-0 mt-0.5" style={{ background: "rgba(139,92,246,0.2)", color: "#a78bfa" }}>{n}</span>
                      <p className="text-[10px] leading-relaxed"><span className="text-zinc-200 font-medium">{title}</span><span className="text-zinc-500"> — {desc}</span></p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <LoqaMark size={22} id="chat-ai2" />
            <TypingBubble />
          </div>
        </div>

        <div className="px-5 pb-4 pt-1">
          <div className="relative rounded-2xl" style={{ background: "rgb(22,22,30)", border: "1px solid rgb(40,40,55)" }}>
            <div className="px-4 pt-3 pb-10 text-[11px] text-zinc-600">{id ? "Tanya apa saja…" : "Ask anything…"}</div>
            <div className="absolute bottom-0 left-0 right-0 px-3 pb-2.5 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] px-1.5 py-0.5 rounded-md text-zinc-600" style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.06)" }}>↵ {id ? "kirim" : "send"}</span>
                <span className="text-[9px] text-zinc-700">⇧↵ {id ? "baris baru" : "new line"}</span>
              </div>
              <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "rgb(30,30,40)", border: "1px solid rgb(40,40,55)" }}>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path d="M8 12V4M4 8l4-4 4 4" stroke="#52525b" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Workspace Module ─── */
function WorkspaceModule({ lang }: { lang: string }) {
  const id = lang === "id";
  return (
    <div className="flex h-full">
      <div className="w-[220px] shrink-0 border-r border-white/[0.05] bg-[#0d0d11] flex flex-col">
        <div className="px-3 pt-3 pb-2 border-b border-white/[0.05]">
          <div className="text-[9px] font-semibold uppercase tracking-widest text-zinc-600 mb-2">Knowledge Base</div>
          {(id
            ? [{ name: "Laporan Q3 2024", docs: 3 }, { name: "Kontrak Vendor", docs: 12 }, { name: "SOP Internal", docs: 7 }]
            : [{ name: "Q3 2024 Report", docs: 3 }, { name: "Vendor Contracts", docs: 12 }, { name: "Internal SOP", docs: 7 }]
          ).map(({ name, docs }, i) => (
            <div key={i} className={`flex items-center gap-2 px-2 py-1.5 rounded-lg mb-0.5 cursor-pointer ${i === 0 ? "bg-violet-500/10 border border-violet-500/20" : "hover:bg-white/[0.03]"}`}>
              <FolderIcon active={i === 0} />
              <div className="flex-1 min-w-0">
                <div className={`text-[10px] truncate ${i === 0 ? "text-zinc-200" : "text-zinc-500"}`}>{name}</div>
                <div className="text-[8px] text-zinc-700">{docs} {id ? "dokumen" : "docs"}</div>
              </div>
            </div>
          ))}
          <button className="w-full mt-2 flex items-center justify-center gap-1 py-1 rounded-lg text-[9px] text-zinc-600 hover:text-zinc-400 border border-dashed border-white/10">
            + {id ? "KB Baru" : "New KB"}
          </button>
        </div>
        <div className="px-3 pt-3">
          <div className="text-[9px] font-semibold uppercase tracking-widest text-zinc-600 mb-2">{id ? "Catatan" : "Notes"}</div>
          {(id
            ? ["Meeting notes Q4", "Rencana roadmap 2025", "Brainstorm fitur baru"]
            : ["Meeting notes Q4", "2025 roadmap plan", "Feature brainstorm"]
          ).map((note, i) => (
            <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded-lg mb-0.5 hover:bg-white/[0.03] cursor-pointer">
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2 1h8a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1Z" stroke="#52525b" strokeWidth="1.2"/><path d="M3 4h6M3 6.5h4" stroke="#52525b" strokeWidth="1.2" strokeLinecap="round"/></svg>
              <span className="text-[10px] text-zinc-500 truncate">{note}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 px-5 py-4 flex flex-col gap-4 overflow-hidden">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[12px] font-semibold text-white mb-0.5">{id ? "Laporan Q3 2024" : "Q3 2024 Report"}</div>
            <div className="text-[9px] text-zinc-500">3 {id ? "dokumen · 47 chunks · siap digunakan di Chat" : "docs · 47 chunks · ready to use in Chat"}</div>
          </div>
          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-semibold text-violet-300 border border-violet-500/30" style={{ background: "rgba(139,92,246,0.1)" }}>
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M6 1v7M3 5l3-3 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M1 10h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
            {id ? "Upload Dokumen" : "Upload Document"}
          </button>
        </div>

        <div className="space-y-2">
          {(id
            ? [{ name: "Laporan Keuangan Q3 2024.pdf", size: "1,2 MB", chunks: 18 }, { name: "Presentasi Investor Q3.pdf", size: "0,8 MB", chunks: 12 }, { name: "Analisis Pasar Q3 2024.docx", size: "0,4 MB", chunks: 17 }]
            : [{ name: "Q3 2024 Financial Report.pdf", size: "1.2 MB", chunks: 18 }, { name: "Investor Presentation Q3.pdf", size: "0.8 MB", chunks: 12 }, { name: "Q3 Market Analysis.docx", size: "0.4 MB", chunks: 17 }]
          ).map((doc) => (
            <div key={doc.name} className="flex items-center gap-3 px-3 py-2.5 rounded-xl" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 1h6l4 4v9H4V1Z" stroke="#6d28d9" strokeWidth="1.3" strokeLinejoin="round"/><path d="M9 1v4h4" stroke="#6d28d9" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/><path d="M6 8h4M6 11h3" stroke="#a78bfa" strokeWidth="1.2" strokeLinecap="round"/></svg>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] font-medium text-zinc-300 truncate">{doc.name}</div>
                <div className="text-[8px] text-zinc-600">{doc.size} · {doc.chunks} chunks</div>
              </div>
              <span className="text-[8px] px-1.5 py-0.5 rounded-full font-medium" style={{ background: "rgba(16,185,129,0.1)", color: "#34d399", border: "1px solid rgba(16,185,129,0.2)" }}>{id ? "Siap" : "Ready"}</span>
            </div>
          ))}
        </div>

        <div className="mt-auto p-4 rounded-xl border border-dashed border-white/10 flex flex-col items-center gap-2">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M12 3v12M8 9l4-6 4 6" stroke="#52525b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M3 17v2a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2" stroke="#52525b" strokeWidth="1.5" strokeLinecap="round"/></svg>
          <span className="text-[9px] text-zinc-600">{id ? "Drag & drop PDF, DOCX, atau TXT" : "Drag & drop PDF, DOCX, or TXT"}</span>
        </div>
      </div>
    </div>
  );
}

/* ─── Finance Module ─── */
function FinanceModule({ lang }: { lang: string }) {
  const id = lang === "id";
  const tabs    = id ? ["Overview", "Laporan", "Laba Rugi", "Transaksi", "Akun", "Kategori"]
                     : ["Overview", "Reports",  "P&L",       "Transactions", "Accounts", "Categories"];
  const pockets = id ? ["Semua", "Operasional", "Proyek Khusus", "Cadangan"]
                     : ["All",   "Operations",  "Special Project", "Reserve"];
  const kpis = id
    ? [{ label: "Pendapatan", value: "Rp 142,8 jt", delta: "+18,4%", up: true }, { label: "Pengeluaran", value: "Rp 98,2 jt", delta: "+5,1%", up: false }, { label: "Laba Bersih", value: "Rp 44,6 jt", delta: "+32,1%", up: true }, { label: "Saldo Total", value: "Rp 287,4 jt", delta: "+8,9%", up: true }]
    : [{ label: "Revenue", value: "Rp 142.8M", delta: "+18.4%", up: true }, { label: "Expenses", value: "Rp 98.2M", delta: "+5.1%", up: false }, { label: "Net Profit", value: "Rp 44.6M", delta: "+32.1%", up: true }, { label: "Total Balance", value: "Rp 287.4M", delta: "+8.9%", up: true }];
  const txs = id
    ? [{ name: "Invoice Klien A", type: "income", amount: "+Rp 45,0 jt", date: "20 Des" }, { name: "Gaji Tim Dev", type: "expense", amount: "-Rp 28,5 jt", date: "20 Des" }, { name: "Sewa Kantor", type: "expense", amount: "-Rp 12,0 jt", date: "18 Des" }]
    : [{ name: "Invoice Client A", type: "income", amount: "+Rp 45.0M", date: "20 Dec" }, { name: "Dev Team Salary", type: "expense", amount: "-Rp 28.5M", date: "20 Dec" }, { name: "Office Rent", type: "expense", amount: "-Rp 12.0M", date: "18 Dec" }];
  const months = id ? ["Jul","Agu","Sep","Okt","Nov","Des"] : ["Jul","Aug","Sep","Oct","Nov","Dec"];

  return (
    <div className="flex h-full">
      <div className="w-[150px] shrink-0 border-r border-white/[0.05] bg-[#0d0d11] px-2 py-3 flex flex-col gap-0.5">
        <div className="text-[8px] font-semibold uppercase tracking-widest text-zinc-600 px-2 mb-2">{id ? "Kantong" : "Pockets"}</div>
        {pockets.map((name, i) => (
          <div key={name} className={`px-2 py-1.5 rounded-lg text-[10px] font-medium cursor-pointer ${i === 0 ? "bg-violet-500/15 text-violet-300 border border-violet-500/20" : "text-zinc-500"}`}>{name}</div>
        ))}
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center gap-1 px-3 py-2 border-b border-white/[0.05] bg-[#0d0d11]/40">
          {tabs.map((tab, i) => (
            <div key={tab} className={`px-2.5 py-1 rounded-md text-[10px] font-medium cursor-pointer ${i === 0 ? "bg-violet-500/15 text-violet-300 border border-violet-500/20" : "text-zinc-500"}`}>{tab}</div>
          ))}
        </div>

        <div className="flex-1 px-5 py-4 overflow-hidden">
          <div className="grid grid-cols-4 gap-2.5 mb-4">
            {kpis.map((k) => (
              <div key={k.label} className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <div className="text-[8px] text-zinc-600 mb-1">{k.label}</div>
                <div className="text-[11px] font-semibold text-white">{k.value}</div>
                <div className={`text-[9px] font-medium ${k.up ? "text-emerald-400" : "text-red-400"}`}>{k.delta}</div>
              </div>
            ))}
          </div>

          <div className="rounded-xl p-4 mb-3" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-medium text-zinc-300">{id ? "Cashflow 6 Bulan" : "6-Month Cashflow"}</span>
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1 text-[8px] text-zinc-500"><span className="w-2 h-2 rounded-sm bg-violet-500/70 inline-block" />{id ? "Masuk" : "In"}</span>
                <span className="flex items-center gap-1 text-[8px] text-zinc-500"><span className="w-2 h-2 rounded-sm bg-zinc-700 inline-block" />{id ? "Keluar" : "Out"}</span>
              </div>
            </div>
            <div className="flex items-end gap-2" style={{ height: "72px" }}>
              {[[60,40],[75,55],[55,42],[90,60],[80,70],[100,68]].map(([inc,exp], i) => (
                <div key={i} className="flex-1 flex items-end gap-0.5">
                  <div className="flex-1 rounded-t" style={{ height: `${inc * 0.64}%`, background: "rgba(139,92,246,0.7)" }} />
                  <div className="flex-1 rounded-t" style={{ height: `${exp * 0.64}%`, background: "rgba(63,63,70,0.8)" }} />
                </div>
              ))}
            </div>
            <div className="flex justify-between mt-1">
              {months.map((m) => <span key={m} className="text-[8px] text-zinc-600 flex-1 text-center">{m}</span>)}
            </div>
          </div>

          <div className="space-y-1">
            {txs.map((tx) => (
              <div key={tx.name} className="flex items-center justify-between px-3 py-1.5 rounded-lg" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)" }}>
                <div>
                  <div className="text-[10px] font-medium text-zinc-300">{tx.name}</div>
                  <div className="text-[8px] text-zinc-600">{tx.date}</div>
                </div>
                <span className={`text-[10px] font-semibold ${tx.type === "income" ? "text-emerald-400" : "text-red-400"}`}>{tx.amount}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Inventory Module ─── */
function InventoryModule({ lang }: { lang: string }) {
  const id = lang === "id";
  const tabs = id ? ["Dashboard", "Produk", "Master Data", "Pergerakan", "Opname"]
                  : ["Dashboard", "Products", "Master Data", "Movements",  "Stocktake"];
  const kpis = id
    ? [{ label: "Total Produk", value: "248", sub: "12 kategori" }, { label: "Stok Menipis", value: "7", sub: "perlu restock" }, { label: "Nilai Stok", value: "Rp 84,2 jt", sub: "3 gudang" }, { label: "HPP Bln Ini", value: "Rp 31,4 jt", sub: "metode FIFO" }]
    : [{ label: "Total Products", value: "248", sub: "12 categories" }, { label: "Low Stock", value: "7", sub: "need restock" }, { label: "Stock Value", value: "Rp 84.2M", sub: "3 warehouses" }, { label: "COGS This Mo.", value: "Rp 31.4M", sub: "FIFO method" }];

  return (
    <div className="flex h-full">
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center gap-1 px-3 py-2 border-b border-white/[0.05] bg-[#0d0d11]/40">
          {tabs.map((tab, i) => (
            <div key={tab} className={`px-2.5 py-1 rounded-md text-[10px] font-medium cursor-pointer ${i === 0 ? "bg-violet-500/15 text-violet-300 border border-violet-500/20" : "text-zinc-500"}`}>{tab}</div>
          ))}
        </div>

        <div className="flex-1 px-5 py-4 overflow-hidden">
          <div className="grid grid-cols-4 gap-2.5 mb-4">
            {kpis.map((k) => (
              <div key={k.label} className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <div className="text-[8px] text-zinc-600 mb-1">{k.label}</div>
                <div className="text-[12px] font-semibold text-white">{k.value}</div>
                <div className="text-[8px] text-zinc-500">{k.sub}</div>
              </div>
            ))}
          </div>

          <div className="text-[9px] font-semibold uppercase tracking-widest text-zinc-600 mb-2">{id ? "Stok Menipis — Perlu Restock" : "Low Stock — Need Reorder"}</div>
          <div className="space-y-1.5">
            {[
              { name: "Laptop Stand Aluminium", sku: "LS-ALU-01", stock: 3,  min: 10 },
              { name: "Mouse Wireless Pro",     sku: "MW-PRO-02", stock: 5,  min: 15 },
              { name: "Keyboard Mechanical",    sku: "KB-MEC-03", stock: 2,  min: 8  },
            ].map((p) => (
              <div key={p.sku} className="flex items-center gap-3 px-3 py-2 rounded-lg" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)" }}>
                <div className="flex-1">
                  <div className="text-[10px] font-medium text-zinc-300">{p.name}</div>
                  <div className="text-[8px] text-zinc-600">{p.sku}</div>
                </div>
                <div className="text-right mr-2">
                  <div className="text-[10px] font-semibold text-red-400">{p.stock} pcs</div>
                  <div className="text-[8px] text-zinc-600">min {p.min}</div>
                </div>
                <div className="w-14 h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                  <div className="h-full rounded-full bg-red-500/70" style={{ width: `${(p.stock/p.min)*100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Order Module (Kasir / POS) ─── */
function OrderModule({ lang }: { lang: string }) {
  const id = lang === "id";
  const tabs = id ? ["Kasir", "Riwayat", "Insight", "Pengiriman", "Setelan"]
                  : ["Cashier", "History", "Insight", "Shipping",  "Settings"];

  return (
    <div className="flex h-full">
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center gap-1 px-3 py-2 border-b border-white/[0.05] bg-[#0d0d11]/40">
          {tabs.map((tab, i) => (
            <div key={tab} className={`px-2.5 py-1 rounded-md text-[10px] font-medium cursor-pointer ${i === 0 ? "bg-violet-500/15 text-violet-300 border border-violet-500/20" : "text-zinc-500"}`}>{tab}</div>
          ))}
        </div>

        <div className="flex flex-1 overflow-hidden">
          <div className="flex-1 px-4 py-3 border-r border-white/[0.05] flex flex-col gap-3">
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><circle cx="5" cy="5" r="3.5" stroke="#52525b" strokeWidth="1.3"/><path d="M8 8l2 2" stroke="#52525b" strokeWidth="1.3" strokeLinecap="round"/></svg>
              <span className="text-[10px] text-zinc-600">{id ? "Scan barcode atau ketik SKU…" : "Scan barcode or type SKU…"}</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { name: "Laptop Stand",    price: "Rp 185.000", stock: 15 },
                { name: "Mouse Wireless",  price: "Rp 320.000", stock: 8  },
                { name: "Keyboard Mech",   price: "Rp 750.000", stock: 5  },
                { name: "Monitor Stand",   price: "Rp 245.000", stock: 12 },
                { name: "USB Hub 7-port",  price: "Rp 195.000", stock: 20 },
                { name: "Webcam HD 1080p", price: "Rp 580.000", stock: 6  },
              ].map((p) => (
                <div key={p.name} className="p-2.5 rounded-xl cursor-pointer hover:border-violet-500/30 transition-colors" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                  <div className="text-[10px] font-medium text-zinc-300 mb-1">{p.name}</div>
                  <div className="text-[10px] text-violet-400 font-semibold">{p.price}</div>
                  <div className="text-[8px] text-zinc-600">{id ? "Stok" : "Stock"}: {p.stock}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="w-[180px] shrink-0 flex flex-col bg-[#0d0d11]">
            <div className="px-3 py-2 border-b border-white/[0.05]">
              <div className="text-[9px] font-semibold uppercase tracking-widest text-zinc-600">{id ? "Keranjang" : "Cart"}</div>
            </div>
            <div className="flex-1 px-2 py-2 overflow-hidden">
              {[
                { name: "Laptop Stand",   qty: 2, subtotal: "Rp 370.000" },
                { name: "Mouse Wireless", qty: 1, subtotal: "Rp 320.000" },
              ].map((item) => (
                <div key={item.name} className="px-2 py-1.5 rounded-lg mb-1" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}>
                  <div className="text-[9px] font-medium text-zinc-300 mb-0.5">{item.name}</div>
                  <div className="flex items-center justify-between">
                    <span className="text-[8px] text-zinc-600">x{item.qty}</span>
                    <span className="text-[9px] text-zinc-400">{item.subtotal}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="px-3 py-3 border-t border-white/[0.05]">
              <div className="flex justify-between mb-2">
                <span className="text-[10px] font-semibold text-zinc-400">Total</span>
                <span className="text-[10px] font-bold text-white">Rp 690.000</span>
              </div>
              <button className="w-full py-2 rounded-xl text-[10px] font-bold text-white" style={{ background: "rgb(109,40,217)" }}>
                {id ? "Bayar" : "Pay"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Project Module ─── */
function ProjectModule({ lang }: { lang: string }) {
  const id = lang === "id";
  const tabs = id ? ["Dashboard", "Daftar Proyek"] : ["Dashboard", "Project List"];
  const kpis = id
    ? [{ label: "Total Proyek", value: "12", sub: "5 aktif" }, { label: "Nilai Kontrak", value: "Rp 1,84 M", sub: "total semua proyek" }, { label: "Invoice Pending", value: "Rp 420 jt", sub: "3 invoice" }, { label: "Bayar Pekerja", value: "Rp 287 jt", sub: "total terbayar" }]
    : [{ label: "Total Projects", value: "12", sub: "5 active" }, { label: "Contract Value", value: "Rp 1.84B", sub: "all projects" }, { label: "Pending Invoice", value: "Rp 420M", sub: "3 invoices" }, { label: "Worker Payments", value: "Rp 287M", sub: "total paid" }];
  const projects = id
    ? [{ name: "Renovasi Kantor Jakarta", client: "PT Maju Bersama", value: "Rp 480 jt", status: "active", progress: 72 }, { name: "Website E-Commerce Klien", client: "CV Digital Raya", value: "Rp 120 jt", status: "active", progress: 45 }, { name: "Sistem ERP Internal", client: "Internal", value: "Rp 380 jt", status: "on_hold", progress: 30 }]
    : [{ name: "Jakarta Office Renovation", client: "PT Maju Bersama", value: "Rp 480M", status: "active", progress: 72 }, { name: "Client E-Commerce Website", client: "CV Digital Raya", value: "Rp 120M", status: "active", progress: 45 }, { name: "Internal ERP System", client: "Internal", value: "Rp 380M", status: "on_hold", progress: 30 }];

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center gap-1 px-3 py-2 border-b border-white/[0.05] bg-[#0d0d11]/40">
        {tabs.map((tab, i) => (
          <div key={tab} className={`px-2.5 py-1 rounded-md text-[10px] font-semibold cursor-pointer ${i === 0 ? "bg-violet-500/15 text-violet-300 border border-violet-500/20" : "text-zinc-500"}`}>{tab}</div>
        ))}
      </div>

      <div className="flex-1 px-5 py-4 overflow-hidden">
        <div className="grid grid-cols-4 gap-2.5 mb-4">
          {kpis.map((k) => (
            <div key={k.label} className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <div className="text-[8px] text-zinc-600 mb-1">{k.label}</div>
              <div className="text-[11px] font-semibold text-white">{k.value}</div>
              <div className="text-[8px] text-zinc-500">{k.sub}</div>
            </div>
          ))}
        </div>

        <div className="text-[9px] font-semibold uppercase tracking-widest text-zinc-600 mb-2">{id ? "Proyek Aktif" : "Active Projects"}</div>
        <div className="space-y-1.5">
          {projects.map((p) => (
            <div key={p.name} className="flex items-center gap-3 px-3 py-2.5 rounded-xl" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)" }}>
              <div className="w-2 h-2 rounded-full shrink-0" style={{ background: p.status === "active" ? "#34d399" : "#f59e0b" }} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[10px] font-medium text-zinc-200 truncate">{p.name}</span>
                  <span className="text-[8px] text-zinc-600 shrink-0">{p.client}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1 rounded-full" style={{ background: "rgba(255,255,255,0.06)" }}>
                    <div className="h-full rounded-full" style={{ width: `${p.progress}%`, background: "rgba(139,92,246,0.7)" }} />
                  </div>
                  <span className="text-[8px] text-zinc-500 shrink-0">{p.progress}%</span>
                </div>
              </div>
              <span className="text-[10px] font-semibold text-violet-300 shrink-0">{p.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Analytics Module ─── */
function AnalyticsModule({ lang }: { lang: string }) {
  const id = lang === "id";
  const kpis = id
    ? [{ label: "Total Token Hari Ini", value: "142.847", sub: "+12% dari kemarin" }, { label: "Latency Rata-rata", value: "1,24 dtk", sub: "P95: 2,8 dtk" }, { label: "Sesi Aktif", value: "3", sub: "7 sesi hari ini" }]
    : [{ label: "Tokens Today", value: "142,847", sub: "+12% from yesterday" }, { label: "Avg Latency", value: "1.24s", sub: "P95: 2.8s" }, { label: "Active Sessions", value: "3", sub: "7 sessions today" }];
  const days  = id ? ["Sen","Sel","Rab","Kam","Jum","Sab","Min"] : ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
  const week  = id
    ? [{ label: "Total percakapan", value: "47" }, { label: "Rata-rata pesan", value: "8,3" }, { label: "Total token", value: "892K" }, { label: "Latency terbaik", value: "0,8s" }]
    : [{ label: "Total conversations", value: "47" }, { label: "Avg messages", value: "8.3" }, { label: "Total tokens", value: "892K" }, { label: "Best latency", value: "0.8s" }];

  return (
    <div className="flex h-full">
      <div className="flex-1 px-5 py-4 overflow-hidden">
        <div className="grid grid-cols-3 gap-3 mb-4">
          {kpis.map((k) => (
            <div key={k.label} className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <div className="text-[8px] text-zinc-600 mb-1">{k.label}</div>
              <div className="text-[14px] font-semibold text-white">{k.value}</div>
              <div className="text-[8px] text-zinc-500">{k.sub}</div>
            </div>
          ))}
        </div>

        <div className="rounded-xl p-4 mb-3" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
          <div className="text-[10px] font-medium text-zinc-300 mb-3">Token Usage — {id ? "7 Hari Terakhir" : "Last 7 Days"}</div>
          <svg viewBox="0 0 400 72" className="w-full" style={{ height: "72px" }}>
            <defs>
              <linearGradient id="area-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#8B5CF6" stopOpacity="0.3"/>
                <stop offset="100%" stopColor="#8B5CF6" stopOpacity="0"/>
              </linearGradient>
            </defs>
            <path d="M0,55 L57,42 L114,50 L171,28 L228,18 L285,32 L342,12 L400,8" fill="none" stroke="#8B5CF6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M0,55 L57,42 L114,50 L171,28 L228,18 L285,32 L342,12 L400,8 L400,72 L0,72Z" fill="url(#area-grad)"/>
          </svg>
          <div className="flex justify-between mt-1">
            {days.map((d) => <span key={d} className="text-[8px] text-zinc-600">{d}</span>)}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
            <div className="text-[9px] text-zinc-500 mb-2">{id ? "Model Digunakan" : "Models Used"}</div>
            {[{ name: "Qwen2.5 7B", pct: 68 }, { name: "Mistral 7B", pct: 22 }, { name: "Phi-3 Mini", pct: 10 }].map((m) => (
              <div key={m.name} className="mb-1.5">
                <div className="flex justify-between mb-0.5">
                  <span className="text-[9px] text-zinc-400">{m.name}</span>
                  <span className="text-[9px] text-zinc-500">{m.pct}%</span>
                </div>
                <div className="w-full h-1 rounded-full" style={{ background: "rgba(255,255,255,0.06)" }}>
                  <div className="h-full rounded-full" style={{ width: `${m.pct}%`, background: "rgba(139,92,246,0.7)" }} />
                </div>
              </div>
            ))}
          </div>
          <div className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
            <div className="text-[9px] text-zinc-500 mb-2">{id ? "Ringkasan Minggu Ini" : "This Week's Summary"}</div>
            {week.map(({ label, value }) => (
              <div key={label} className="flex justify-between py-0.5">
                <span className="text-[9px] text-zinc-600">{label}</span>
                <span className="text-[9px] text-zinc-400 font-medium">{value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Shared ─── */
function TypingBubble() {
  return (
    <div className="rounded-2xl rounded-tl-sm px-4 py-3" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
      <div className="flex items-center gap-1.5">
        {[0, 150, 300].map((delay) => (
          <span key={delay} className="w-1.5 h-1.5 rounded-full bg-violet-400" style={{ animation: `typing-dot 1.2s ${delay}ms ease-in-out infinite` }} />
        ))}
      </div>
    </div>
  );
}

/* Full-fidelity LOQA mark — mirrors actual app SVG with all gradient layers */
function LoqaMark({ size, id }: { size: number; id: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 160 160" fill="none" style={{ flexShrink: 0 }}>
      <defs>
        <radialGradient id={`${id}-bg`} cx="42" cy="36" r="110" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#130828"/>
          <stop offset="100%" stopColor="#050110"/>
        </radialGradient>
        <linearGradient id={`${id}-lh`} x1="19" y1="13" x2="70" y2="141" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#8b5cf6"/>
          <stop offset="40%" stopColor="#6d28d9"/>
          <stop offset="100%" stopColor="#2e1065"/>
        </linearGradient>
        <linearGradient id={`${id}-rh`} x1="45" y1="13" x2="131" y2="141" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#f5f3ff"/>
          <stop offset="20%" stopColor="#c4b5fd"/>
          <stop offset="55%" stopColor="#8b5cf6"/>
          <stop offset="100%" stopColor="#4c1d95"/>
        </linearGradient>
        <linearGradient id={`${id}-sh`} x1="45" y1="13" x2="95" y2="70" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="white" stopOpacity=".62"/>
          <stop offset="100%" stopColor="white" stopOpacity="0"/>
        </linearGradient>
        <linearGradient id={`${id}-cv`} x1="45" y1="13" x2="102" y2="141" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="white" stopOpacity=".95"/>
          <stop offset="35%" stopColor="white" stopOpacity=".65"/>
          <stop offset="100%" stopColor="white" stopOpacity=".08"/>
        </linearGradient>
        <linearGradient id={`${id}-sp`} x1="45" y1="13" x2="115" y2="29" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#f0abfc" stopOpacity=".9"/>
          <stop offset="100%" stopColor="#6366f1" stopOpacity=".3"/>
        </linearGradient>
      </defs>
      <rect width="160" height="160" rx="36" fill={`url(#${id}-bg)`}/>
      <polygon points="45,13 19,67 35,128 102,141" fill={`url(#${id}-lh)`}/>
      <polygon points="45,13 115,29 131,83 102,141" fill={`url(#${id}-rh)`}/>
      <polygon points="45,13 115,29 131,83 102,141" fill={`url(#${id}-sh)`}/>
      <line x1="19" y1="67" x2="45" y2="13" stroke="rgba(255,255,255,.28)" strokeWidth="1.2"/>
      <line x1="45" y1="13" x2="115" y2="29" stroke={`url(#${id}-sp)`} strokeWidth="1.8"/>
      <line x1="45" y1="13" x2="102" y2="141" stroke={`url(#${id}-cv)`} strokeWidth="1.8" strokeLinecap="round"/>
      <circle cx="45" cy="13" r="2.8" fill="white" fillOpacity=".96"/>
    </svg>
  );
}

function FolderIcon({ active }: { active?: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M1 3a1 1 0 0 1 1-1h2.5l1.5 2H10a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V3Z" stroke={active ? "#a78bfa" : "#52525b"} strokeWidth="1.2"/>
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="2.5" stroke="#52525b" strokeWidth="1.4"/>
      <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.42 1.42M11.53 11.53l1.42 1.42M3.05 12.95l1.42-1.42M11.53 4.47l1.42-1.42" stroke="#52525b" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  );
}

function IconChat() {
  return <svg width="10" height="10" viewBox="0 0 16 16" fill="none"><path d="M14 2H2a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h3l3 3 3-3h3a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></svg>;
}
function IconWorkspace() {
  return <svg width="10" height="10" viewBox="0 0 16 16" fill="none"><path d="M2 2h5v5H2zM9 2h5v5H9zM2 9h5v5H2zM9 9h5v5H9z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></svg>;
}
function IconFinance() {
  return <svg width="10" height="10" viewBox="0 0 16 16" fill="none"><path d="M2 10h12M8 6V2m0 0L5.5 4.5M8 2l2.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><rect x="2" y="10" width="12" height="4" rx="1" stroke="currentColor" strokeWidth="1.5"/></svg>;
}
function IconInventory() {
  return <svg width="10" height="10" viewBox="0 0 16 16" fill="none"><path d="M2 5h12v9H2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/><path d="M5 5V3a3 3 0 0 1 6 0v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>;
}
function IconOrder() {
  return <svg width="10" height="10" viewBox="0 0 16 16" fill="none"><circle cx="6" cy="13" r="1.2" fill="currentColor"/><circle cx="11" cy="13" r="1.2" fill="currentColor"/><path d="M1 2h2l2 7h6l2-5H5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}
function IconProject() {
  return <svg width="10" height="10" viewBox="0 0 16 16" fill="none"><path d="M2 4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4Z" stroke="currentColor" strokeWidth="1.5"/><path d="M5 8h6M5 11h4M5 5h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>;
}
function IconAnalytics() {
  return <svg width="10" height="10" viewBox="0 0 16 16" fill="none"><path d="M2 12l3.5-4 3 3 2.5-5L14 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}

function AppleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
      <path d="M10.5 7.4c0-1.7 1.4-2.5 1.4-2.5s-.7-1.1-2-1.4c-.9-.2-1.7.5-2.1.5-.5 0-1.2-.5-2-.4-1 .1-2 .6-2.5 1.6C2.2 7 3 9.7 4.1 11.2c.5.8 1.1 1.6 1.9 1.6.8 0 1-.5 2-.5 1 0 1.2.5 2 .5s1.4-.8 1.9-1.6c.4-.6.6-1.2.6-1.2s-1.4-.6-1.4-2.2zm-1.3-4c.5-.6.8-1.4.7-2.2-.7.1-1.5.5-2 1.1-.4.5-.8 1.3-.7 2.1.8.1 1.5-.4 2-1z"/>
    </svg>
  );
}

function WindowsIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="currentColor">
      <path d="M0 1.8L5.3 1l.001 5.1-5.3.03L0 1.8zm5.3 5.7L5.3 12.4 0 11.6V7.5l5.3-.03zM5.9 1l6.8-.9v6H5.9V1zm6.8 6.1v5.9l-6.8-.9V7.1l6.8.03z"/>
    </svg>
  );
}
