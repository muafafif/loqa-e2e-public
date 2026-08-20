import { Suspense } from "react";

const GITHUB_REPO = "MuhammadHasbiAshshiddieqy/knowledge-ai";

interface ReleaseAsset {
  name: string;
  browser_download_url: string;
  size: number;
}

interface Release {
  tag_name: string;
  published_at: string;
  assets: ReleaseAsset[];
}

async function getLatestRelease(): Promise<Release | null> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
      { next: { revalidate: 3600 } }
    );
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

function fmtSize(bytes: number) {
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(0)} MB`;
}

function findAsset(assets: ReleaseAsset[], pattern: RegExp) {
  return assets.find((a) => pattern.test(a.name));
}

async function DownloadCards() {
  const release = await getLatestRelease();
  const version = release?.tag_name ?? "—";
  const assets = release?.assets ?? [];

  const macAsset = findAsset(assets, /aarch64\.dmg$/i) ?? findAsset(assets, /\.dmg$/i);
  const winAsset = findAsset(assets, /x64-setup\.exe$/i) ?? findAsset(assets, /setup\.exe$/i);

  const platforms = [
    {
      name: "macOS",
      subtitle: "Apple Silicon (M1/M2/M3+)",
      icon: <AppleIcon />,
      asset: macAsset,
      note: "Klik kanan → Open saat pertama kali membuka",
      ext: ".dmg",
    },
    {
      name: "Windows",
      subtitle: "x64 — semua PC",
      icon: <WindowsIcon />,
      asset: winAsset,
      note: "Klik \"More info\" → \"Run anyway\" jika muncul SmartScreen",
      ext: ".exe",
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl mx-auto">
      {platforms.map((p) => (
        <div key={p.name} className="card-border p-6 flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-white">
              {p.icon}
            </div>
            <div>
              <p className="font-semibold text-white text-sm">{p.name}</p>
              <p className="text-xs text-zinc-500">{p.subtitle}</p>
            </div>
          </div>

          {p.asset ? (
            <a
              href={p.asset.browser_download_url}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-violet-500 hover:bg-violet-400 text-white text-sm font-semibold transition-all glow-accent-sm"
            >
              <DownloadIcon />
              Download {p.ext}
              <span className="text-violet-200/70 font-normal text-xs">
                {fmtSize(p.asset.size)}
              </span>
            </a>
          ) : (
            <div className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.06] text-zinc-500 text-sm">
              Belum tersedia
            </div>
          )}

          <p className="text-[11px] text-zinc-600 leading-relaxed">⚠️ {p.note}</p>
        </div>
      ))}

      <div className="sm:col-span-2 text-center">
        <p className="text-xs text-zinc-600">
          Versi{" "}
          <a
            href={`https://github.com/${GITHUB_REPO}/releases`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-violet-400 hover:text-violet-300 transition-colors"
          >
            {version}
          </a>
          {" · "}
          <a
            href={`https://github.com/${GITHUB_REPO}/releases`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-zinc-500 hover:text-zinc-400 transition-colors"
          >
            Lihat semua release →
          </a>
        </p>
      </div>
    </div>
  );
}

export function Download() {
  return (
    <section id="download" className="relative py-24 px-6">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-px h-16 bg-gradient-to-b from-transparent via-violet-500/30 to-transparent" />

      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <span className="inline-block text-xs font-semibold uppercase tracking-[0.15em] text-violet-400 mb-4">
            Download
          </span>
          <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">
            Mulai dalam hitungan menit.
          </h2>
          <p className="mt-3 text-zinc-400 text-base max-w-md mx-auto">
            Install, pilih model AI, dan mulai ngobrol dengan dokumen Anda.
          </p>
        </div>

        <Suspense fallback={<DownloadSkeleton />}>
          <DownloadCards />
        </Suspense>
      </div>
    </section>
  );
}

function DownloadSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl mx-auto">
      {[0, 1].map((i) => (
        <div key={i} className="card-border p-6 flex flex-col gap-4 animate-pulse">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/[0.04]" />
            <div className="flex flex-col gap-1.5">
              <div className="h-3 w-16 bg-white/[0.06] rounded" />
              <div className="h-2.5 w-24 bg-white/[0.04] rounded" />
            </div>
          </div>
          <div className="h-10 rounded-xl bg-violet-500/10" />
          <div className="h-2.5 w-4/5 bg-white/[0.03] rounded" />
        </div>
      ))}
    </div>
  );
}

function AppleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor">
      <path d="M13.5 9.5c0-2.2 1.8-3.2 1.8-3.2s-.9-1.4-2.6-1.8c-1.1-.2-2.2.6-2.7.6-.6 0-1.5-.6-2.6-.5-1.3.1-2.5.8-3.2 2.1C3 9 4 12.4 5.3 14.3c.7 1 1.4 2.1 2.4 2 1 0 1.3-.6 2.5-.6 1.3 0 1.6.6 2.6.6 1 0 1.8-1 2.5-2.1.5-.8.7-1.6.7-1.6s-1.8-.8-1.8-2.8zm-1.7-5.2c.6-.8 1-1.8.9-2.8-.9.1-2 .7-2.6 1.5-.5.6-1 1.6-.9 2.6 1 0 1.9-.5 2.6-1.3z"/>
    </svg>
  );
}

function WindowsIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 17 17" fill="currentColor">
      <path d="M0 2.3L6.8 1.3v6.5H0V2.3zm6.8 7.3v6.1L0 14.7V9.6h6.8zm.9-8.4l8.7-1.2v7.7H7.7V1.2zm8.7 8.4v7.2l-8.7-1.1V9.6h8.7z"/>
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <path d="M6.5 1v8M3.5 6l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M1 10h11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}
