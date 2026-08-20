"use client";

import { createContext, useContext, useState, ReactNode } from "react";

export type Lang = "en" | "id";

// ── English strings (source of truth) ────────────────────────────────────────

const en = {
  nav: {
    features:  "Features",
    whyLocal:  "Why Local?",
    pricing:   "Pricing",
    download:  "Download",
  },

  hero: {
    badge:       "Now available for macOS & Windows",
    headline1:   "Your AI assistant,",
    headline2:   "entirely offline.",
    tagline:
      "Chat with documents, manage finances, track inventory, process orders, manage projects, and analyze your business — all running locally on your device, no cloud subscription needed. Your data, your control.",
    ctaMac:      "Download for Mac",
    ctaWindows:  "Download for Windows",
    ctaPricing:  "View pricing",
  },

  features: {
    sectionLabel: "Full Features",
    headline1:    "Everything you need,",
    headline2:    "without depending on the cloud.",
    items: [
      {
        title: "AI Chat with RAG",
        description:
          "Upload PDF, DOCX, or TXT documents then ask anything. The AI model reads your documents and answers accurately — all locally.",
        tags: ["RAG", "Local LLM", "Multi-format"],
      },
      {
        title: "Finance & P&L",
        description:
          "Record transactions, manage accounts, view profit & loss reports, and analyze cash flow — complete with PDF export and period filters.",
        tags: ["P&L Report", "Multi-account", "Export PDF"],
      },
      {
        title: "Inventory & Stock",
        description:
          "Track product stock, manage warehouses, record stock movements with FIFO, Average, or Fixed cost methods.",
        tags: ["FIFO / Average", "Multi-warehouse", "Stocktake"],
      },
      {
        title: "Orders & POS",
        description:
          "Barcode / SKU scanning at the cashier, cart management, checkout with automatic stock deduction and finance transaction recording.",
        tags: ["Barcode scan", "POS Cashier", "Auto stock-out"],
      },
      {
        title: "Project Management",
        description:
          "Track projects with budget (RAB), workers and payments, invoicing, and integration with finance — all in one place.",
        tags: ["RAB / Budget", "Worker payments", "Invoicing"],
      },
      {
        title: "Analytics",
        description:
          "Visual dashboard with token usage, latency, active sessions, and model performance charts — all monitored in one screen.",
        tags: ["Token tracking", "Latency", "Per-session"],
      },
      {
        title: "Model Manager",
        description:
          "Download AI models directly from Hugging Face, switch chat and embedding models anytime, without restarting the app.",
        tags: ["GGUF", "HuggingFace", "Hot-swap"],
      },
      {
        title: "Dual App",
        description:
          "Two app versions: LOQA Home for personal use, LOQA Work for business — with features tailored to each.",
        tags: ["LOQA Home", "LOQA Work", "Separate"],
      },
    ],
  },

  whyLocal: {
    sectionLabel: "Why Local?",
    headline1:    "Privacy isn't an add-on.",
    headline2:    "It's the default.",
    body:
      "In an era where every AI app sends your data to their servers, LOQA takes a different path — everything runs on your own device.",
    points: [
      {
        icon: "🔒",
        title: "Data never leaves your device",
        description:
          "All conversations, documents, and financial data exist only on your computer.",
      },
      {
        icon: "✈️",
        title: "Works without internet",
        description:
          "No connection? No problem. The app runs fully offline.",
      },
      {
        icon: "⚡",
        title: "AI model runs on your hardware",
        description:
          "Inference runs directly on your local CPU/GPU — no external API latency.",
      },
      {
        icon: "∞",
        title: "Transparent pricing, pay what you need",
        description:
          "Choose a subscription or buy Lifetime once. No hidden fees — the price you see is what you pay.",
      },
    ],
  },

  pricing: {
    sectionLabel: "License & Pricing",
    headline:     "Choose what",
    headlineAccent: "fits your needs.",
    body:
      "Per-device license, activated with a license key. Start with a subscription, or pay once with Lifetime and never pay again.",
    cycleLabels: { monthly: "Monthly", yearly: "Yearly", lifetime: "Lifetime" },
    yearlyBadge:   "Save 20%",
    lifetimeBadge: "One-time",
    perMonth:      "/ mo",
    perDevice:     "per device",
    billedYearly:  "Billed yearly",
    oneTimePay:    "One-time payment",
    getStarted:    "Get Started",
    deviceNote:    "* 1 license = 1 device. Business plan: 5 devices. Deactivate to move to another device.",
    plans: [
      {
        name: "Starter",
        tagline: "For personal users",
        app: "LOQA Home",
        includes: [
          "All LOQA Home features",
          "AI Chat · Knowledge Base & RAG",
          "Finance & Analytics",
        ],
      },
      {
        name: "Pro",
        tagline: "For professionals & SMEs",
        app: "LOQA Home + Work",
        includes: [
          "All LOQA Home & Work features",
          "Full Finance · P&L Report",
          "Inventory & Order / POS cashier",
        ],
      },
      {
        name: "Business",
        tagline: "For growing teams & businesses",
        app: "LOQA Home + Work",
        includes: [
          "All LOQA Home & Work features",
          "Full Finance · P&L Report",
          "Inventory & Order / POS cashier",
        ],
      },
    ],
    faq: {
      title: "Frequently Asked Questions",
      items: [
        {
          q: "How does the license key work?",
          a: "After purchase, you receive a license key via email. Enter it on first launch — the app validates it once online, then runs fully offline forever.",
        },
        {
          q: "Can I switch devices?",
          a: "Yes. Deactivate from the old device via the license management panel, then activate on the new device.",
        },
        {
          q: "What happens when a subscription expires?",
          a: "Your data remains intact. AI features enter limited mode. Reactivate anytime to restore full access.",
        },
        {
          q: "Is Lifetime truly one-time?",
          a: "Yes. Pay once, use forever. No recurring fees, no hidden charges. Future updates included.",
        },
      ],
    },
  },

  footer: {
    copyright: "© 2025 Muhammad Hasbi Ashshiddieqy · Proprietary License",
    contact:   "Contact",
  },
} as const;

// ── Indonesian strings ────────────────────────────────────────────────────────

const id: typeof en = {
  nav: {
    features:  "Fitur",
    whyLocal:  "Kenapa Lokal?",
    pricing:   "Harga",
    download:  "Download",
  },

  hero: {
    badge:       "Tersedia untuk macOS & Windows",
    headline1:   "Asisten AI Anda,",
    headline2:   "sepenuhnya offline.",
    tagline:
      "Chat dengan dokumen, kelola keuangan, pantau inventori, proses pesanan, lacak proyek, dan analisis bisnis Anda — semua berjalan lokal di perangkat Anda, tanpa langganan cloud. Data Anda, kendali Anda.",
    ctaMac:      "Download untuk Mac",
    ctaWindows:  "Download untuk Windows",
    ctaPricing:  "Lihat paket harga",
  },

  features: {
    sectionLabel: "Fitur Lengkap",
    headline1:    "Semua yang Anda butuhkan,",
    headline2:    "tanpa bergantung cloud.",
    items: [
      {
        title: "AI Chat dengan RAG",
        description:
          "Upload dokumen PDF, DOCX, atau TXT lalu tanya apa saja. Model AI membaca isi dokumen Anda dan menjawab dengan akurat — semua di lokal.",
        tags: ["RAG", "Local LLM", "Multi-format"],
      },
      {
        title: "Finance & P&L",
        description:
          "Catat transaksi, kelola akun, lihat laporan laba rugi, dan analisis cashflow — lengkap dengan ekspor PDF dan filter per periode.",
        tags: ["Laporan P&L", "Multi-akun", "Export PDF"],
      },
      {
        title: "Inventory & Stok",
        description:
          "Pantau stok produk, kelola gudang, catat pergerakan barang masuk/keluar dengan metode FIFO, Average, atau Fixed cost.",
        tags: ["FIFO / Average", "Multi-gudang", "Opname"],
      },
      {
        title: "Pesanan & POS",
        description:
          "Scan barcode / SKU di kasir, kelola keranjang, checkout dengan pemotongan stok otomatis dan pencatatan transaksi keuangan.",
        tags: ["Scan barcode", "Kasir POS", "Auto stock-out"],
      },
      {
        title: "Manajemen Proyek",
        description:
          "Lacak proyek dengan anggaran (RAB), pekerja dan pembayaran, penagihan invoice, dan integrasi dengan keuangan — semua dalam satu tempat.",
        tags: ["RAB / Anggaran", "Bayar pekerja", "Invoice"],
      },
      {
        title: "Analytics",
        description:
          "Dashboard visual dengan chart token usage, latency, sesi aktif, dan performa model — semua terpantau dalam satu layar.",
        tags: ["Token tracking", "Latency", "Per-session"],
      },
      {
        title: "Model Manager",
        description:
          "Download model AI langsung dari Hugging Face, ganti model chat dan embedding kapan saja, tanpa restart aplikasi.",
        tags: ["GGUF", "HuggingFace", "Hot-swap"],
      },
      {
        title: "Dual App",
        description:
          "Dua versi aplikasi: LOQA Home untuk personal, LOQA Work untuk bisnis — dengan fitur yang disesuaikan masing-masing.",
        tags: ["LOQA Home", "LOQA Work", "Terpisah"],
      },
    ],
  },

  whyLocal: {
    sectionLabel: "Kenapa Lokal?",
    headline1:    "Privasi bukan fitur tambahan.",
    headline2:    "Ini adalah defaultnya.",
    body:
      "Di era di mana semua aplikasi AI mengirim data Anda ke server mereka, LOQA memilih jalan berbeda — semua berjalan di perangkat Anda sendiri.",
    points: [
      {
        icon: "🔒",
        title: "Data tidak keluar dari device",
        description:
          "Semua percakapan, dokumen, dan data finansial Anda hanya ada di komputer Anda.",
      },
      {
        icon: "✈️",
        title: "Bekerja tanpa internet",
        description:
          "Tidak ada koneksi? Tidak masalah. Aplikasi berjalan penuh secara offline.",
      },
      {
        icon: "⚡",
        title: "Model AI di hardware Anda",
        description:
          "Inferensi langsung di CPU/GPU lokal — tidak ada latensi API eksternal.",
      },
      {
        icon: "∞",
        title: "Harga transparan, beli sesuai kebutuhan",
        description:
          "Pilih berlangganan atau beli Lifetime sekali bayar. Tidak ada biaya tersembunyi — harga yang Anda lihat adalah yang Anda bayar.",
      },
    ],
  },

  pricing: {
    sectionLabel: "Lisensi & Harga",
    headline:     "Pilih cara yang",
    headlineAccent: "sesuai kebutuhan.",
    body:
      "Lisensi per perangkat, aktif dengan license key. Mulai dengan berlangganan, atau bayar sekali dengan Lifetime dan tidak pernah bayar lagi.",
    cycleLabels: { monthly: "Bulanan", yearly: "Tahunan", lifetime: "Lifetime" },
    yearlyBadge:   "Hemat 20%",
    lifetimeBadge: "Sekali bayar",
    perMonth:      "/ bln",
    perDevice:     "per perangkat",
    billedYearly:  "Ditagih tahunan",
    oneTimePay:    "Pembayaran sekali",
    getStarted:    "Mulai Sekarang",
    deviceNote:    "* 1 lisensi = 1 perangkat. Paket Business: 5 perangkat. Nonaktifkan untuk pindah ke perangkat lain.",
    plans: [
      {
        name: "Starter",
        tagline: "Untuk pengguna personal",
        app: "LOQA Home",
        includes: [
          "Semua fitur LOQA Home",
          "AI Chat · Knowledge Base & RAG",
          "Finance & Analytics",
        ],
      },
      {
        name: "Pro",
        tagline: "Untuk profesional & UMKM",
        app: "LOQA Home + Work",
        includes: [
          "Semua fitur LOQA Home & Work",
          "Finance lengkap · Laporan P&L",
          "Inventory & Order / kasir (POS)",
        ],
      },
      {
        name: "Business",
        tagline: "Untuk tim & bisnis yang berkembang",
        app: "LOQA Home + Work",
        includes: [
          "Semua fitur LOQA Home & Work",
          "Finance lengkap · Laporan P&L",
          "Inventory & Order / kasir (POS)",
        ],
      },
    ],
    faq: {
      title: "Pertanyaan yang Sering Diajukan",
      items: [
        {
          q: "Bagaimana cara kerja license key?",
          a: "Setelah pembelian, Anda menerima license key via email. Masukkan saat pertama kali membuka aplikasi — divalidasi sekali secara online, lalu berjalan penuh offline selamanya.",
        },
        {
          q: "Apakah bisa pindah perangkat?",
          a: "Ya. Nonaktifkan dari perangkat lama lewat panel manajemen lisensi, lalu aktifkan di perangkat baru.",
        },
        {
          q: "Apa yang terjadi saat langganan habis?",
          a: "Data Anda tetap utuh. Fitur AI masuk mode terbatas. Aktifkan kembali kapan saja untuk akses penuh.",
        },
        {
          q: "Apakah Lifetime benar-benar sekali bayar?",
          a: "Ya. Bayar sekali, gunakan selamanya. Tidak ada biaya berulang, tidak ada biaya tersembunyi. Update mendatang sudah termasuk.",
        },
      ],
    },
  },

  footer: {
    copyright: "© 2025 Muhammad Hasbi Ashshiddieqy · Lisensi Proprietary",
    contact:   "Kontak",
  },
};

// ── Context ───────────────────────────────────────────────────────────────────

const STRINGS = { en, id } as const;

type Strings = typeof en;

const LangContext = createContext<{
  lang: Lang;
  setLang: (l: Lang) => void;
  t: Strings;
}>({ lang: "en", setLang: () => {}, t: en });

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>("en");
  return (
    <LangContext.Provider value={{ lang, setLang, t: STRINGS[lang] }}>
      {children}
    </LangContext.Provider>
  );
}

export function useLang() {
  return useContext(LangContext);
}
