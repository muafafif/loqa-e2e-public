import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { LangProvider } from "@/lib/i18n";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "LOQA — Local AI Knowledge Base",
  description:
    "Your local AI knowledge base, finance & inventory management — running entirely on your device. No cloud, no data leaving your machine.",
  openGraph: {
    title: "LOQA — Local AI Knowledge Base",
    description: "AI knowledge base, finance & inventory — all offline, all yours.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="antialiased"><LangProvider>{children}</LangProvider></body>
    </html>
  );
}
