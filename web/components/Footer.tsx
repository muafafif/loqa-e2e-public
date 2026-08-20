"use client";

import { useLang } from "@/lib/i18n";

export function Footer() {
  const { t } = useLang();

  return (
    <footer className="relative py-12 px-6 border-t border-white/[0.06]">
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        {/* Logo + tagline */}
        <div className="flex items-center gap-2.5">
          <svg width="22" height="22" viewBox="0 0 160 160" fill="none">
            <rect width="160" height="160" rx="36" fill="#0f0f13"/>
            <defs>
              <linearGradient id="ft-left" x1="19" y1="67" x2="102" y2="141" gradientUnits="userSpaceOnUse">
                <stop stopColor="#7c3aed"/>
                <stop offset="1" stopColor="#4f1fa0"/>
              </linearGradient>
              <linearGradient id="ft-right" x1="45" y1="13" x2="131" y2="83" gradientUnits="userSpaceOnUse">
                <stop stopColor="#a78bfa"/>
                <stop offset="1" stopColor="#7c3aed"/>
              </linearGradient>
              <linearGradient id="ft-ridge" x1="45" y1="13" x2="102" y2="141" gradientUnits="userSpaceOnUse">
                <stop stopColor="#ede9fe" stopOpacity="0.9"/>
                <stop offset="1" stopColor="#c4b5fd" stopOpacity="0.4"/>
              </linearGradient>
            </defs>
            <polygon points="45,13 102,141 35,128 19,67" fill="url(#ft-left)"/>
            <polygon points="45,13 115,29 131,83 102,141" fill="url(#ft-right)"/>
            <line x1="45" y1="13" x2="102" y2="141" stroke="url(#ft-ridge)" strokeWidth="2.5" strokeLinecap="round"/>
            <polygon points="45,13 115,29 131,83 102,141" fill="white" fillOpacity="0.06"/>
          </svg>
          <span className="text-sm text-zinc-500">{t.footer.copyright}</span>
        </div>

        {/* Links */}
        <div className="flex items-center gap-5">
          <a
            href="https://github.com/MuhammadHasbiAshshiddieqy/knowledge-ai"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <GitHubIcon />
            GitHub
          </a>
          <a
            href="mailto:hsbdeveloper97@gmail.com"
            className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            {t.footer.contact}
          </a>
        </div>
      </div>
    </footer>
  );
}

function GitHubIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z"/>
    </svg>
  );
}
