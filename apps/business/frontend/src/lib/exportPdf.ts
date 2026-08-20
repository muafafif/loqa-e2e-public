import type { MonthlyPoint, AccountSummary, TimelinePoint } from "@/lib/financeApi";
import type { Transaction, PLMonthRow, InventoryDashboard, BrandReportRow, CategoryReportRow } from "@/types";
import type { TranslationKey } from "@/lib/i18n/en";

const BASE_URL = "http://localhost:8001/api";

// Strip leading prose lines that aren't part of the numbered/bulleted content.
function cleanInsight(raw: string): string {
  const lines = raw.trim().split("\n");
  const firstContent = lines.findIndex(l => /^\s*(\d+[.)]\s|[-*]\s|#)/.test(l));
  return (firstContent > 0 ? lines.slice(firstContent) : lines).join("\n").trim();
}

// ── Prompt builders with adaptive compression ─────────────────────────────────
//
// Threshold: if the verbose time-series string exceeds SERIES_THRESHOLD chars,
// replace it with programmatic statistics (min/max/avg/trend) instead of
// listing every data point. This keeps the prompt short for long date ranges
// without losing analytical value — and without a second AI round-trip.

const SERIES_THRESHOLD = 600; // ~150 tokens, covers ~8 months verbose

function fmtRp(n: number) {
  if (Math.abs(n) >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000_000)     return `${(n / 1_000_000).toFixed(1)}jt`;
  if (Math.abs(n) >= 1_000)         return `${(n / 1_000).toFixed(0)}rb`;
  return `${n}`;
}

function trendLabel(first: number, last: number): string {
  if (first === 0) return "—";
  const pct = ((last - first) / Math.abs(first)) * 100;
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(0)}%`;
}

function compressMonthly(monthly: { month: string; income: number; expense: number }[]): string {
  if (monthly.length === 0) return "tidak ada data";
  const verbose = monthly.map(m =>
    `${m.month} — Pendapatan ${fmtRp(m.income)}, Beban ${fmtRp(m.expense)}`
  ).join("; ");
  if (verbose.length <= SERIES_THRESHOLD) return verbose;

  const incomes  = monthly.map(m => m.income);
  const expenses = monthly.map(m => m.expense);
  const avg = (arr: number[]) => arr.reduce((s, v) => s + v, 0) / arr.length;
  const minIdx = (arr: number[]) => arr.indexOf(Math.min(...arr));
  const maxIdx = (arr: number[]) => arr.indexOf(Math.max(...arr));

  return (
    `${monthly.length} bulan (${monthly[0].month} s/d ${monthly[monthly.length - 1].month})\n` +
    `Pendapatan: rata-rata ${fmtRp(avg(incomes))}, ` +
    `min ${fmtRp(Math.min(...incomes))} (${monthly[minIdx(incomes)].month}), ` +
    `max ${fmtRp(Math.max(...incomes))} (${monthly[maxIdx(incomes)].month}), ` +
    `tren ${trendLabel(incomes[0], incomes[incomes.length - 1])}\n` +
    `Beban: rata-rata ${fmtRp(avg(expenses))}, ` +
    `min ${fmtRp(Math.min(...expenses))} (${monthly[minIdx(expenses)].month}), ` +
    `max ${fmtRp(Math.max(...expenses))} (${monthly[maxIdx(expenses)].month}), ` +
    `tren ${trendLabel(expenses[0], expenses[expenses.length - 1])}`
  );
}

function compressPLRows(rows: { month: string; net_profit: number; net_margin: number; gross_profit: number; opex: number }[]): string {
  if (rows.length === 0) return "tidak ada data";
  const verbose = rows.map(r =>
    `${r.month} — Laba Bersih ${fmtRp(r.net_profit)} (${r.net_margin.toFixed(1)}%)`
  ).join("; ");
  if (verbose.length <= SERIES_THRESHOLD) return verbose;

  const nets    = rows.map(r => r.net_profit);
  const margins = rows.map(r => r.net_margin);
  const minIdx  = (arr: number[]) => arr.indexOf(Math.min(...arr));
  const maxIdx  = (arr: number[]) => arr.indexOf(Math.max(...arr));
  const avg     = (arr: number[]) => arr.reduce((s, v) => s + v, 0) / arr.length;

  return (
    `${rows.length} bulan (${rows[0].month} s/d ${rows[rows.length - 1].month})\n` +
    `Laba Bersih: rata-rata ${fmtRp(avg(nets))}, ` +
    `min ${fmtRp(Math.min(...nets))} (${rows[minIdx(nets)].month}), ` +
    `max ${fmtRp(Math.max(...nets))} (${rows[maxIdx(nets)].month}), ` +
    `tren ${trendLabel(nets[0], nets[nets.length - 1])}\n` +
    `Margin Bersih: rata-rata ${avg(margins).toFixed(1)}%, ` +
    `min ${Math.min(...margins).toFixed(1)}% (${rows[minIdx(margins)].month}), ` +
    `max ${Math.max(...margins).toFixed(1)}% (${rows[maxIdx(margins)].month})`
  );
}

const PROMPT_PREFIX = "Berikan 3-5 insight singkat dalam Bahasa Indonesia. Langsung tulis poin pertama tanpa kalimat pembuka, intro, atau kesimpulan penutup. Format: nomor dan teks poin saja.\n";

export function buildFinancePrompt(opts: {
  from: string; to: string;
  totalIncome: number; totalExpense: number; net: number;
  monthly: { month: string; income: number; expense: number }[];
}): string {
  return (
    PROMPT_PREFIX +
    `Laporan keuangan periode ${opts.from} hingga ${opts.to}:\n` +
    `Total Pendapatan: Rp ${opts.totalIncome.toLocaleString("id-ID")}\n` +
    `Total Beban: Rp ${opts.totalExpense.toLocaleString("id-ID")}\n` +
    `Net Cashflow: Rp ${opts.net.toLocaleString("id-ID")} (${opts.net >= 0 ? "surplus" : "defisit"})\n` +
    `Data bulanan: ${compressMonthly(opts.monthly)}`
  );
}

export function buildPLPrompt(opts: {
  rangeLabel: string;
  totals: { gross_income: number; cogs: number; gross_profit: number; opex: number; net_profit: number };
  grossMargin: number; netMargin: number;
  rows: { month: string; net_profit: number; net_margin: number; gross_profit: number; opex: number }[];
}): string {
  return (
    PROMPT_PREFIX +
    `Laporan laba rugi periode ${opts.rangeLabel}:\n` +
    `Pendapatan Kotor: Rp ${opts.totals.gross_income.toLocaleString("id-ID")}\n` +
    `HPP: Rp ${opts.totals.cogs.toLocaleString("id-ID")}\n` +
    `Laba Kotor: Rp ${opts.totals.gross_profit.toLocaleString("id-ID")} (margin ${opts.grossMargin.toFixed(1)}%)\n` +
    `Beban Operasional: Rp ${opts.totals.opex.toLocaleString("id-ID")}\n` +
    `Laba Bersih: Rp ${opts.totals.net_profit.toLocaleString("id-ID")} (margin ${opts.netMargin.toFixed(1)}%)\n` +
    `Data bulanan: ${compressPLRows(opts.rows)}`
  );
}

export function buildOrderPrompt(opts: {
  months: number;
  kpi: { total_orders: number; total_revenue: number; avg_order_value: number; cancelled_orders: number };
  monthly: { month: string; revenue: number; orders: number }[];
  topProducts: { name: string; qty: number; revenue: number }[];
}): string {
  const monthlyStr = compressMonthly(opts.monthly.map(m => ({ month: m.month, income: m.revenue, expense: 0 })))
    .replace(/, Beban .+?(?=\n|$)/gm, ""); // strip expense part (always 0)
  const tops = opts.topProducts.slice(0, 5).map(p => `${p.name}: ${fmtRp(p.revenue)}`).join("; ");
  return (
    PROMPT_PREFIX +
    `Laporan order ${opts.months} bulan terakhir:\n` +
    `Total Order: ${opts.kpi.total_orders}, Pendapatan: Rp ${opts.kpi.total_revenue.toLocaleString("id-ID")}\n` +
    `Rata-rata per order: Rp ${opts.kpi.avg_order_value.toLocaleString("id-ID")}, Dibatalkan: ${opts.kpi.cancelled_orders}\n` +
    `Tren bulanan: ${monthlyStr}\n` +
    `Produk terlaris: ${tops}`
  );
}

export function buildAnalyticsPrompt(opts: {
  period: string;
  totalTokens: number; messages: number; sessions: number; avgLatencyMs: number;
  byModel: { model_name: string; input_tokens: number; output_tokens: number }[];
}): string {
  const models = opts.byModel.slice(0, 3).map(m =>
    `${m.model_name || "unknown"}: ${fmtRp(m.input_tokens + m.output_tokens)} token`
  ).join("; ");
  return (
    PROMPT_PREFIX +
    `Laporan analytics AI periode ${opts.period}:\n` +
    `Total Token: ${fmtRp(opts.totalTokens)}, Pesan: ${opts.messages}, Sesi: ${opts.sessions}\n` +
    `Avg Latency: ${opts.avgLatencyMs}ms\n` +
    `Model digunakan: ${models || "—"}`
  );
}

export function buildInventoryPrompt(opts: {
  totalAssetValue: number; hppMonth: number;
  grossMarginMonth: number; grossMarginPct: number;
  turnover: number; lowStockCount: number;
  topBrands: { name: string; stockValue: number; marginPct: number }[];
}): string {
  const brands = opts.topBrands.slice(0, 5).map(b =>
    `${b.name}: nilai stok ${fmtRp(b.stockValue)}, margin ${b.marginPct.toFixed(1)}%`
  ).join("; ");
  return (
    PROMPT_PREFIX +
    `Laporan inventaris:\n` +
    `Nilai Aset Total: Rp ${opts.totalAssetValue.toLocaleString("id-ID")}\n` +
    `HPP Bulan Ini: Rp ${opts.hppMonth.toLocaleString("id-ID")}\n` +
    `Gross Margin: Rp ${opts.grossMarginMonth.toLocaleString("id-ID")} (${opts.grossMarginPct.toFixed(1)}%)\n` +
    `Inventory Turnover: ${opts.turnover.toFixed(1)}x/tahun\n` +
    `Stok Menipis: ${opts.lowStockCount} item\n` +
    `Top brand: ${brands}`
  );
}

/**
 * Streams a single-turn chat request and returns the full text response.
 * Resolves with null if the request times out or fails — callers export without insight.
 */
export async function generateAiInsight(prompt: string, timeoutMs = 20_000): Promise<string | null> {
  return new Promise((resolve) => {
    const controller = new AbortController();
    const timer = setTimeout(() => { controller.abort(); resolve(null); }, timeoutMs);
    let text = "";

    fetch(`${BASE_URL}/chat/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: prompt }],
        kb_id: null,
        use_rag: false,
        session_id: "export-insight",
        conv_id: null,
        chat_mode: "chat_only",
        pocket_id: null,
      }),
      signal: controller.signal,
    }).then(async (res) => {
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === "token") text += event.content;
            if (event.type === "done") { clearTimeout(timer); resolve(cleanInsight(text) || null); return; }
            if (event.type === "error") { clearTimeout(timer); resolve(null); return; }
          } catch { /* skip malformed */ }
        }
      }
      clearTimeout(timer);
      resolve(cleanInsight(text) || null);
    }).catch(() => { clearTimeout(timer); resolve(null); });
  });
}

// ── Shared utilities ──────────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "decimal", maximumFractionDigits: 0 }).format(n);
}

function fmtMonth(m: string) {
  const [y, mo] = m.split("-");
  const names = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agt","Sep","Okt","Nov","Des"];
  return `${names[parseInt(mo) - 1]} '${y.slice(2)}`;
}

function fmtK(n: number): string {
  if (Math.abs(n) >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + "M";
  if (Math.abs(n) >= 1_000_000)     return (n / 1_000_000).toFixed(1) + "Jt";
  if (Math.abs(n) >= 1_000)         return (n / 1_000).toFixed(0) + "Rb";
  return String(n);
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map(c => c + c).join("") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function savePdfBlob(doc: { output: (type: "blob") => Blob }, filename: string) {
  const blob = doc.output("blob");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// Distribute column widths proportionally so they always fill COL exactly.
// ratios: relative weight per column (need not sum to 1).
// Returns columnStyles object ready for autoTable.
function autoColWidths(
  COL: number,
  ratios: number[],
  overrides: Record<number, Partial<{ halign: "left" | "center" | "right"; fontStyle: string; overflow: string }>> = {}
): Record<number, object> {
  const total = ratios.reduce((s, r) => s + r, 0);
  return Object.fromEntries(
    ratios.map((r, i) => [
      i,
      { cellWidth: (r / total) * COL, ...overrides[i] },
    ])
  );
}

// Brand colors
const C = {
  brand:    [124, 58, 237] as [number,number,number],
  brandDark:[91,  33, 182] as [number,number,number],
  brandBg:  [245,243,255] as [number,number,number],
  green:    [16, 185, 129] as [number,number,number],
  greenBg:  [236,253,245] as [number,number,number],
  red:      [239, 68,  68] as [number,number,number],
  redBg:    [254,242,242] as [number,number,number],
  amber:    [245,158,  11] as [number,number,number],
  sky:      [14, 165, 233] as [number,number,number],
  dark:     [17,  24,  39] as [number,number,number],
  mid:      [75,  85,  99] as [number,number,number],
  muted:    [156,163,175] as [number,number,number],
  border:   [229,231,235] as [number,number,number],
  surface:  [249,250,251] as [number,number,number],
  white:    [255,255,255] as [number,number,number],
};

const PALETTE_HEX = ["#7c3aed","#3b82f6","#10b981","#f59e0b","#ef4444","#06b6d4","#f97316","#84cc16","#ec4899","#6366f1"];

// ── Logo renderer — SVG → PNG data URL via canvas ────────────────────────────

async function getLogoDataUrl(sizePx = 128): Promise<string | null> {
  try {
    const res = await fetch("/loqa-icon.svg");
    const svgText = await res.text();
    return await new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = sizePx;
        canvas.height = sizePx;
        const ctx = canvas.getContext("2d");
        if (!ctx) { resolve(null); return; }
        ctx.drawImage(img, 0, 0, sizePx, sizePx);
        resolve(canvas.toDataURL("image/png"));
      };
      img.onerror = () => resolve(null);
      const blob = new Blob([svgText], { type: "image/svg+xml" });
      img.src = URL.createObjectURL(blob);
    });
  } catch {
    return null;
  }
}

// ── Shared layout helpers ────────────────────────────────────────────────────

function drawHeader(
  doc: import("jspdf").jsPDF,
  W: number,
  appName: string,
  title: string,
  subtitle: string,
  logoDataUrl?: string | null,
) {
  doc.setFillColor(...C.brandDark);
  doc.rect(0, 0, W, 28, "F");
  doc.setFillColor(...C.brand);
  doc.rect(0, 0, W * 0.55, 28, "F");

  // Logo — 18×18mm, vertically centered in the 28mm header
  const logoSize = 18;
  const logoX = 5;
  const logoY = (28 - logoSize) / 2;
  if (logoDataUrl) {
    doc.addImage(logoDataUrl, "PNG", logoX, logoY, logoSize, logoSize);
  } else {
    // Fallback: white circle placeholder
    doc.setFillColor(255, 255, 255);
    doc.circle(logoX + logoSize / 2, logoY + logoSize / 2, logoSize / 2, "F");
  }

  const textX = logoX + logoSize + 3;
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text(appName, textX, 11);

  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(220, 210, 255);
  doc.text(title, textX, 18);

  doc.setFontSize(7);
  doc.setTextColor(200, 190, 255);
  if (subtitle) doc.text(subtitle, W - 14, 11, { align: "right" });
  doc.text(`Dicetak: ${new Date().toLocaleDateString("id-ID", { dateStyle: "long" })}`, W - 14, 18, { align: "right" });

  doc.setFillColor(...C.brand);
  doc.rect(0, 28, W, 1, "F");
}

function drawFooter(
  doc: import("jspdf").jsPDF,
  W: number,
  H: number,
  appName: string,
  label: string,
  page: number,
  total: number,
  logoDataUrl?: string | null,
) {
  doc.setFillColor(...C.surface);
  doc.rect(0, H - 10, W, 10, "F");
  doc.setFillColor(...C.border);
  doc.rect(0, H - 10, W, 0.3, "F");

  // Logo kecil di footer
  const fLogoSize = 5;
  const fLogoY = H - 10 + (10 - fLogoSize) / 2;
  if (logoDataUrl) {
    doc.addImage(logoDataUrl, "PNG", 5, fLogoY, fLogoSize, fLogoSize);
  }

  const textX = logoDataUrl ? 12 : 14;
  doc.setFontSize(6.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...C.muted);
  doc.text(`${appName} · ${label}`, textX, H - 4);
  doc.text(`Halaman ${page} / ${total}`, W - 14, H - 4, { align: "right" });
}

function sectionHeader(doc: import("jspdf").jsPDF, W: number, MARGIN: number, y: number, title: string, color = C.brand): number {
  doc.setFillColor(...C.brandBg);
  doc.rect(MARGIN, y, W - MARGIN * 2, 7.5, "F");
  doc.setFillColor(...color);
  doc.rect(MARGIN, y, 2.5, 7.5, "F");
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...color);
  doc.text(title, MARGIN + 6, y + 5.2);
  doc.setTextColor(...C.dark);
  return y + 11;
}

function kpiCards(
  doc: import("jspdf").jsPDF,
  MARGIN: number, y: number, COL: number,
  cards: { label: string; value: string; sub?: string; color: [number,number,number] }[]
): number {
  const gap = 3.5;
  const cardW = (COL - gap * (cards.length - 1)) / cards.length;
  cards.forEach((card, i) => {
    const x = MARGIN + i * (cardW + gap);
    doc.setFillColor(...C.white);
    doc.setDrawColor(...C.border);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, y, cardW, 22, 2, 2, "FD");
    doc.setFillColor(...card.color);
    doc.rect(x, y, cardW, 2, "F");
    // Truncate label if needed
    doc.setFontSize(6.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...C.mid);
    doc.text(card.label, x + cardW / 2, y + 9, { align: "center", maxWidth: cardW - 4 });
    doc.setFontSize(9.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...card.color);
    doc.text(card.value, x + cardW / 2, y + 15.5, { align: "center", maxWidth: cardW - 2 });
    if (card.sub) {
      doc.setFontSize(5.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...C.muted);
      doc.text(card.sub, x + cardW / 2, y + 19.5, { align: "center", maxWidth: cardW - 4 });
    }
  });
  doc.setTextColor(...C.dark);
  return y + 27;
}

// ── AI Insight section ────────────────────────────────────────────────────────

// ── Inline bold parser ────────────────────────────────────────────────────────
// Splits "foo **bar** baz" into [{text:"foo ", bold:false},{text:"bar", bold:true},{text:" baz", bold:false}]
type Span = { text: string; bold: boolean };
function parseInline(raw: string): Span[] {
  const spans: Span[] = [];
  // Also strip lone *italic*, backtick, [link](url) before processing bold
  const s = raw
    .replace(/`(.+?)`/g, "$1")
    .replace(/\[(.+?)\]\(.+?\)/g, "$1")
    .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, "$1"); // *italic* -> plain
  let rest = s;
  while (rest.length) {
    const idx = rest.indexOf("**");
    if (idx === -1) { spans.push({ text: rest, bold: false }); break; }
    if (idx > 0)    spans.push({ text: rest.slice(0, idx), bold: false });
    const end = rest.indexOf("**", idx + 2);
    if (end === -1) { spans.push({ text: rest.slice(idx + 2), bold: true }); break; }
    spans.push({ text: rest.slice(idx + 2, end), bold: true });
    rest = rest.slice(end + 2);
  }
  return spans.filter(s => s.text.length > 0);
}

// Measure the pixel-width of a span using current font state
function spanWidth(doc: import("jspdf").jsPDF, text: string, bold: boolean): number {
  doc.setFont("helvetica", bold ? "bold" : "normal");
  return doc.getTextWidth(text);
}

// Word-wrap a paragraph of mixed-bold spans into lines of [{spans}]
// Returns array of lines; each line is an array of Span
function wrapSpans(
  doc: import("jspdf").jsPDF,
  spans: Span[],
  maxW: number,
): Span[][] {
  const lines: Span[][] = [];
  let current: Span[] = [];
  let currentW = 0;

  // Tokenise all spans into words preserving bold
  const tokens: Span[] = [];
  for (const span of spans) {
    const words = span.text.split(/(\s+)/);
    for (const w of words) {
      if (w.length) tokens.push({ text: w, bold: span.bold });
    }
  }

  for (const token of tokens) {
    const w = spanWidth(doc, token.text, token.bold);
    if (currentW + w > maxW && current.length > 0 && token.text.trim().length > 0) {
      // Trim trailing whitespace from current line
      while (current.length && current[current.length - 1].text.trim() === "") current.pop();
      lines.push(current);
      current = [];
      currentW = 0;
      // Skip leading whitespace at start of new line
      if (!token.text.trim()) continue;
    }
    current.push(token);
    currentW += w;
  }
  if (current.length) {
    while (current.length && current[current.length - 1].text.trim() === "") current.pop();
    if (current.length) lines.push(current);
  }
  return lines;
}

function drawAiInsightSection(
  doc: import("jspdf").jsPDF,
  W: number,
  MARGIN: number,
  y: number,
  insight: string,
  CONTENT_BOTTOM: number,
): number {
  const fontSize   = 8;
  const lineHeight = 5;
  const PAD_X      = 6;
  const PAD_Y      = 6;
  const maxW       = W - MARGIN * 2 - PAD_X * 2;

  doc.setFontSize(fontSize);

  // Parse insight into paragraphs → lines of spans
  type ParagraphLines = { lines: Span[][] };
  const paras: ParagraphLines[] = [];

  const rawParas = insight.split(/\n+/).filter(l => l.trim());
  for (const raw of rawParas) {
    // Strip heading markers
    const clean = raw.replace(/^#{1,6}\s+/, "");
    const spans = parseInline(clean);
    const wrapped = wrapSpans(doc, spans, maxW);
    if (wrapped.length) paras.push({ lines: wrapped });
  }

  // Calculate total content height
  let contentH = 0;
  for (let pi = 0; pi < paras.length; pi++) {
    contentH += paras[pi].lines.length * lineHeight;
    if (pi < paras.length - 1) contentH += lineHeight * 0.5; // gap between paragraphs
  }
  const boxH = contentH + PAD_Y * 2;

  // Section header (always fits — 7.5mm)
  doc.setFillColor(245, 243, 255);
  doc.roundedRect(MARGIN, y, W - MARGIN * 2, 7.5, 2, 2, "F");
  doc.setFillColor(...C.brand);
  doc.rect(MARGIN, y, 2.5, 7.5, "F");
  doc.setFontSize(fontSize);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...C.brand);
  doc.text("AI Insight", MARGIN + PAD_X, y + 5.2);
  doc.setTextColor(...C.dark);
  y += 11;

  // Draw box — add new page if needed
  if (y + boxH > CONTENT_BOTTOM) {
    doc.addPage();
    y = 20;
  }

  doc.setFillColor(250, 249, 255);
  doc.setDrawColor(...C.brand);
  doc.setLineWidth(0.2);
  doc.roundedRect(MARGIN, y, W - MARGIN * 2, boxH, 2, 2, "FD");

  let ty = y + PAD_Y;
  for (let pi = 0; pi < paras.length; pi++) {
    for (const line of paras[pi].lines) {
      let tx = MARGIN + PAD_X;
      for (const span of line) {
        doc.setFont("helvetica", span.bold ? "bold" : "normal");
        doc.setFontSize(fontSize);
        doc.setTextColor(...C.mid);
        doc.text(span.text, tx, ty);
        tx += doc.getTextWidth(span.text);
      }
      ty += lineHeight;
    }
    if (pi < paras.length - 1) ty += lineHeight * 0.5;
  }

  doc.setTextColor(...C.dark);
  return y + boxH + 6;
}

// ── Bar chart (income vs expense grouped) ────────────────────────────────────

function drawBarChart(
  doc: import("jspdf").jsPDF,
  MARGIN: number, y: number, COL: number,
  monthly: MonthlyPoint[],
  chartH = 44
): number {
  if (monthly.length === 0) return y;

  const YAXIS_W = 10; // reserved width for y-axis labels
  const chartX = MARGIN + YAXIS_W;
  const chartW = COL - YAXIS_W;

  const maxVal = Math.max(...monthly.flatMap(m => [m.income, m.expense]), 1);
  const barGroupW = chartW / monthly.length;
  const barW = Math.min(barGroupW * 0.30, 7);

  // Y-axis grid (4 lines)
  const gridCount = 4;
  doc.setFontSize(5);
  doc.setFont("helvetica", "normal");
  for (let g = 1; g <= gridCount; g++) {
    const gy = y + chartH - (g / gridCount) * chartH;
    doc.setDrawColor(...C.border);
    doc.setLineWidth(0.15);
    doc.setLineDashPattern([1.2, 1.2], 0);
    doc.line(chartX, gy, chartX + chartW, gy);
    doc.setTextColor(...C.muted);
    doc.text(fmtK((maxVal * g) / gridCount), chartX - 1, gy + 1.5, { align: "right" });
  }
  doc.setLineDashPattern([], 0);

  // X axis baseline
  doc.setDrawColor(...C.mid);
  doc.setLineWidth(0.3);
  doc.line(chartX, y + chartH, chartX + chartW, y + chartH);

  monthly.forEach((m, i) => {
    const cx = chartX + i * barGroupW + barGroupW / 2;
    const incH = (m.income / maxVal) * chartH;
    const expH = (m.expense / maxVal) * chartH;

    doc.setFillColor(...C.green);
    if (incH > 1) doc.roundedRect(cx - barW - 0.8, y + chartH - incH, barW, incH, 0.8, 0.8, "F");

    doc.setFillColor(...C.red);
    if (expH > 1) doc.roundedRect(cx + 0.8, y + chartH - expH, barW, expH, 0.8, 0.8, "F");

    doc.setFontSize(5.5);
    doc.setTextColor(...C.mid);
    doc.text(fmtMonth(m.month), cx, y + chartH + 4, { align: "center" });
  });

  // Legend — below x-axis labels, centered
  const legendY = y + chartH + 10;
  const legendCx = chartX + chartW / 2;
  doc.setFontSize(6);
  doc.setTextColor(...C.mid);
  doc.setFillColor(...C.green);
  doc.roundedRect(legendCx - 22, legendY, 3, 3, 0.5, 0.5, "F");
  doc.text("Pendapatan", legendCx - 17, legendY + 2.5);
  doc.setFillColor(...C.red);
  doc.roundedRect(legendCx + 5, legendY, 3, 3, 0.5, 0.5, "F");
  doc.text("Beban", legendCx + 10, legendY + 2.5);

  doc.setTextColor(...C.dark);
  return legendY + 7;
}

// ── Cumulative area chart (timeline) ─────────────────────────────────────────

function drawAreaChart(
  doc: import("jspdf").jsPDF,
  MARGIN: number, y: number, COL: number,
  timeline: TimelinePoint[],
  chartH = 36
): number {
  if (timeline.length < 2) return y;

  const YAXIS_W = 10;
  const chartX = MARGIN + YAXIS_W;
  const chartW = COL - YAXIS_W;

  // Build cumulative
  let cumIncome = 0, cumExpense = 0;
  const data = timeline.map(d => {
    cumIncome  += d.income;
    cumExpense += d.expense;
    return { label: d.date.slice(5), cumIncome, cumExpense };
  });

  const maxVal = Math.max(...data.flatMap(d => [d.cumIncome, d.cumExpense]), 1);
  const stepX = chartW / (data.length - 1);

  // Grid
  doc.setFontSize(5);
  for (let g = 1; g <= 3; g++) {
    const gy = y + chartH - (g / 3) * chartH;
    doc.setDrawColor(...C.border);
    doc.setLineWidth(0.15);
    doc.setLineDashPattern([1.2, 1.2], 0);
    doc.line(chartX, gy, chartX + chartW, gy);
    doc.setTextColor(...C.muted);
    doc.text(fmtK((maxVal * g) / 3), chartX - 1, gy + 1.5, { align: "right" });
  }
  doc.setLineDashPattern([], 0);
  doc.setDrawColor(...C.mid);
  doc.setLineWidth(0.3);
  doc.line(chartX, y + chartH, chartX + chartW, y + chartH);

  // Draw filled areas as series of thin vertical lines (fill simulation)
  const step = Math.max(1, Math.floor(data.length / 120));
  for (let i = 0; i < data.length - 1; i += step) {
    const d = data[i];
    const px = chartX + i * stepX;
    const incH = (d.cumIncome / maxVal) * chartH;
    const expH = (d.cumExpense / maxVal) * chartH;
    doc.setDrawColor(16, 185, 129);
    doc.setLineWidth(0.5 * step);
    doc.line(px, y + chartH, px, y + chartH - incH);
    doc.setDrawColor(239, 68, 68);
    doc.line(px, y + chartH, px, y + chartH - expH);
  }

  // Draw solid lines on top
  doc.setLineWidth(0.7);
  for (let i = 0; i < data.length - 1; i++) {
    const d0 = data[i], d1 = data[i + 1];
    const x0 = chartX + i * stepX, x1 = chartX + (i + 1) * stepX;

    doc.setDrawColor(...C.green);
    doc.line(x0, y + chartH - (d0.cumIncome / maxVal) * chartH,
             x1, y + chartH - (d1.cumIncome / maxVal) * chartH);

    doc.setDrawColor(...C.red);
    doc.line(x0, y + chartH - (d0.cumExpense / maxVal) * chartH,
             x1, y + chartH - (d1.cumExpense / maxVal) * chartH);
  }

  // X labels — show only first and last + midpoints
  const labelIdxs = [0, Math.floor(data.length / 4), Math.floor(data.length / 2), Math.floor(data.length * 3 / 4), data.length - 1];
  doc.setFontSize(5.5);
  doc.setTextColor(...C.mid);
  labelIdxs.forEach(i => {
    if (i < data.length) {
      doc.text(data[i].label, chartX + i * stepX, y + chartH + 4, { align: "center" });
    }
  });

  // Legend — below x-axis labels, centered
  const legendY = y + chartH + 10;
  const legendCx = chartX + chartW / 2;
  doc.setFontSize(6);
  doc.setTextColor(...C.mid);
  doc.setFillColor(...C.green);
  doc.roundedRect(legendCx - 36, legendY, 10, 2, 0.5, 0.5, "F");
  doc.text("Kumulatif Pendapatan", legendCx - 24, legendY + 2);
  doc.setFillColor(...C.red);
  doc.roundedRect(legendCx + 4, legendY, 10, 2, 0.5, 0.5, "F");
  doc.text("Kumulatif Beban", legendCx + 16, legendY + 2);

  doc.setTextColor(...C.dark);
  return legendY + 7;
}

// ── Pie chart (account distribution) ─────────────────────────────────────────

function drawPieChart(
  doc: import("jspdf").jsPDF,
  MARGIN: number, y: number, COL: number,
  accounts: AccountSummary[],
  chartH = 40
): number {
  const positive = accounts.filter(a => a.balance > 0);
  if (positive.length === 0) return y;

  const total = positive.reduce((s, a) => s + a.balance, 0);
  const cx = MARGIN + 24;
  const cy = y + chartH / 2;
  const R = Math.min(chartH / 2 - 2, 18);

  let startAngle = -Math.PI / 2;
  const pieces = positive.map((a, i) => {
    const ratio = a.balance / total;
    const color = (a.color && a.color !== "#0284c7") ? a.color : PALETTE_HEX[i % PALETTE_HEX.length];
    const [r, g, b] = hexToRgb(color);
    return { ratio, color: [r, g, b] as [number,number,number], name: a.name, balance: a.balance };
  });

  // Draw pie slices (approximated with filled polygons)
  pieces.forEach(p => {
    const sweep = p.ratio * 2 * Math.PI;
    const endAngle = startAngle + sweep;
    const steps = Math.max(6, Math.floor(sweep * 10));
    const pts: [number, number][] = [[cx, cy]];
    for (let s = 0; s <= steps; s++) {
      const a = startAngle + (s / steps) * sweep;
      pts.push([cx + Math.cos(a) * R, cy + Math.sin(a) * R]);
    }
    doc.setFillColor(...p.color);
    doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(0.4);
    // Draw using lines (no polygon fill in jsPDF without plugins)
    // Draw as small triangles from center
    for (let s = 0; s < steps; s++) {
      const a1 = startAngle + (s / steps) * sweep;
      const a2 = startAngle + ((s + 1) / steps) * sweep;
      const x1 = cx + Math.cos(a1) * R, y1 = cy + Math.sin(a1) * R;
      const x2 = cx + Math.cos(a2) * R, y2 = cy + Math.sin(a2) * R;
      doc.triangle(cx, cy, x1, y1, x2, y2, "F");
    }
    // White border line between slices
    const ex = cx + Math.cos(endAngle) * R;
    const ey = cy + Math.sin(endAngle) * R;
    doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(0.5);
    doc.line(cx, cy, ex, ey);
    startAngle = endAngle;
  });

  // Donut hole
  doc.setFillColor(255, 255, 255);
  doc.circle(cx, cy, R * 0.45, "F");

  // Center label
  doc.setFontSize(5.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...C.mid);
  doc.text("Total", cx, cy - 1.5, { align: "center" });
  doc.setFontSize(6);
  doc.text(fmtK(total), cx, cy + 3, { align: "center" });

  // Legend — right of pie
  const lx = MARGIN + 52;
  const maxLegendW = COL - 52;
  let ly = y + 4;
  positive.slice(0, 8).forEach((a, i) => {
    const color = (a.color && a.color !== "#0284c7") ? a.color : PALETTE_HEX[i % PALETTE_HEX.length];
    const [r, g, b] = hexToRgb(color);
    const pct = ((a.balance / total) * 100).toFixed(1);

    doc.setFillColor(r, g, b);
    doc.roundedRect(lx, ly, 3, 3, 0.5, 0.5, "F");

    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...C.dark);
    // Use splitTextToSize to prevent truncation
    const nameText = doc.splitTextToSize(a.name, maxLegendW - 30)[0] ?? a.name;
    doc.text(nameText, lx + 5, ly + 2.8);

    doc.setFont("helvetica", "bold");
    doc.setTextColor(...C.mid);
    doc.text(`${fmt(a.balance)} (${pct}%)`, lx + maxLegendW - 28, ly + 2.8, { align: "right" });

    ly += 5.5;
  });
  if (positive.length > 8) {
    doc.setFontSize(6);
    doc.setTextColor(...C.muted);
    doc.text(`+ ${positive.length - 8} akun lainnya`, lx + 5, ly + 2);
  }

  doc.setTextColor(...C.dark);
  return y + Math.max(chartH, ly - y) + 6;
}

// ── Net margin bar chart (P&L) ────────────────────────────────────────────────

function drawMarginChart(
  doc: import("jspdf").jsPDF,
  MARGIN: number, y: number, COL: number,
  rows: PLMonthRow[],
  chartH = 38
): number {
  if (rows.length === 0) return y;

  const YAXIS_W = 10;
  const chartX = MARGIN + YAXIS_W;
  const chartW = COL - YAXIS_W;

  const maxAbs = Math.max(...rows.map(r => Math.abs(r.net_margin)), 1);
  const zero = y + chartH / 2;
  const barW = Math.min(chartW / rows.length * 0.5, 14);

  // Y-axis labels (+50% / -50%)
  doc.setFontSize(5);
  doc.setTextColor(...C.muted);
  doc.text("+50%", chartX - 1, y + chartH / 4 + 1.5, { align: "right" });
  doc.text("0%",   chartX - 1, zero + 1.5,            { align: "right" });
  doc.text("-50%", chartX - 1, y + chartH * 3 / 4 + 1.5, { align: "right" });

  // Zero line
  doc.setDrawColor(...C.mid);
  doc.setLineWidth(0.4);
  doc.line(chartX, zero, chartX + chartW, zero);

  // Grid +50 / -50 dashed
  doc.setDrawColor(...C.border);
  doc.setLineWidth(0.15);
  doc.setLineDashPattern([1.2, 1.2], 0);
  doc.line(chartX, y + chartH / 4,     chartX + chartW, y + chartH / 4);
  doc.line(chartX, y + chartH * 3 / 4, chartX + chartW, y + chartH * 3 / 4);
  doc.setLineDashPattern([], 0);

  rows.forEach((r, i) => {
    const bx = chartX + i * (chartW / rows.length) + (chartW / rows.length) / 2 - barW / 2;
    const bh = (Math.abs(r.net_margin) / maxAbs) * (chartH / 2 - 3);
    const isPos = r.net_margin >= 0;
    doc.setFillColor(...(isPos ? C.green : C.red));

    if (bh > 0.5) {
      if (isPos) doc.roundedRect(bx, zero - bh, barW, bh, 1, 1, "F");
      else       doc.roundedRect(bx, zero, barW, bh, 1, 1, "F");
    }

    doc.setFontSize(5.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...(isPos ? C.green : C.red));
    const label = `${r.net_margin.toFixed(1)}%`;
    const ly = isPos ? zero - bh - 2 : zero + bh + 4.5;
    doc.text(label, bx + barW / 2, ly, { align: "center" });

    doc.setFontSize(5.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...C.mid);
    doc.text(fmtMonth(r.month), bx + barW / 2, y + chartH + 4, { align: "center" });
  });

  doc.setTextColor(...C.dark);
  return y + chartH + 10;
}

// ── Category expense bar chart (horizontal) ───────────────────────────────────

function drawCategoryBar(
  doc: import("jspdf").jsPDF,
  MARGIN: number, y: number, COL: number,
  data: { name: string; value: number; color: string }[],
  chartH = 6  // height per bar row
): number {
  if (data.length === 0) return y;

  const maxVal = Math.max(...data.map(d => d.value), 1);
  const barAreaW = COL * 0.55;
  const labelW = COL * 0.32;
  const valueW = COL * 0.13;

  data.forEach((d, i) => {
    const ry = y + i * (chartH + 2.5);
    const barW = (d.value / maxVal) * barAreaW;
    const [r, g, b] = hexToRgb(d.color);

    // Bar
    doc.setFillColor(r, g, b);
    if (barW > 0.5) doc.roundedRect(MARGIN + labelW + 2, ry, barW, chartH, 0.8, 0.8, "F");

    // Label — truncated to fit
    doc.setFontSize(6.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...C.dark);
    const truncated = doc.splitTextToSize(d.name, labelW - 2)[0] ?? d.name;
    doc.text(truncated, MARGIN + labelW - 1, ry + chartH * 0.7, { align: "right" });

    // Value
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...C.mid);
    doc.text(fmtK(d.value), MARGIN + labelW + barAreaW + 3, ry + chartH * 0.7);
  });

  doc.setTextColor(...C.dark);
  return y + data.length * (chartH + 2.5) + 4;
}

// ═══════════════════════════════════════════════════════════════════════════════
// FINANCE REPORT PDF
// ═══════════════════════════════════════════════════════════════════════════════

interface ExportPdfOptions {
  appName: string;
  rangeLabel: string;
  from: string;
  to: string;
  totalIncome: number;
  totalExpense: number;
  net: number;
  monthly: MonthlyPoint[];
  timeline: TimelinePoint[];
  accounts: AccountSummary[];
  transactions: Transaction[];
  categoryExpense?: { name: string; value: number; color: string }[];
  aiInsight?: string;
}

export async function exportFinancePdf(opts: ExportPdfOptions): Promise<void> {
  const [{ jsPDF }, autoTableMod, logo] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
    getLogoDataUrl(128),
  ]);
  const autoTable = autoTableMod.default;

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const MARGIN = 14;
  const COL = W - MARGIN * 2;
  let y = 0;

  const CONTENT_BOTTOM = H - 16; // leave room for footer

  function needPage(required: number) {
    if (y + required > CONTENT_BOTTOM) { doc.addPage(); y = 20; }
  }

  drawHeader(doc, W, opts.appName, "Laporan Keuangan", `${opts.rangeLabel} · ${opts.from} s/d ${opts.to}`, logo);
  y = 36;

  // ── AI Insight (before charts) ─────────────────────────────────────────────
  if (opts.aiInsight) {
    needPage(50);
    y = drawAiInsightSection(doc, W, MARGIN, y, opts.aiInsight, CONTENT_BOTTOM);
  }

  // KPI cards
  y = kpiCards(doc, MARGIN, y, COL, [
    { label: "Total Pendapatan",  value: fmt(opts.totalIncome),  sub: "periode ini", color: C.green },
    { label: "Total Beban",       value: fmt(opts.totalExpense), sub: "periode ini", color: C.red },
    { label: "Net Cashflow",      value: (opts.net >= 0 ? "+" : "") + fmt(opts.net), sub: opts.net >= 0 ? "surplus" : "defisit", color: opts.net >= 0 ? C.sky : C.amber },
  ]);

  // ── Chart 1: Pendapatan vs Beban per Bulan ────────────────────────────────
  if (opts.monthly.length > 0) {
    needPage(60);
    y = sectionHeader(doc, W, MARGIN, y, "Pendapatan vs Beban per Bulan");
    y = drawBarChart(doc, MARGIN, y, COL, opts.monthly, 44);
  }

  // ── Chart 2: Cashflow Kumulatif ────────────────────────────────────────────
  if (opts.timeline && opts.timeline.length > 1) {
    needPage(55);
    y = sectionHeader(doc, W, MARGIN, y, "Cashflow Kumulatif");
    y = drawAreaChart(doc, MARGIN, y, COL, opts.timeline, 36);
  }

  // ── Chart 3: Distribusi Saldo Akun ────────────────────────────────────────
  if (opts.accounts.length > 0) {
    needPage(60);
    y = sectionHeader(doc, W, MARGIN, y, "Distribusi Saldo Akun");
    y = drawPieChart(doc, MARGIN, y, COL, opts.accounts, 44);
  }

  // ── Chart 4: Top Kategori Pengeluaran ─────────────────────────────────────
  if (opts.categoryExpense && opts.categoryExpense.length > 0) {
    const barCount = opts.categoryExpense.length;
    needPage(barCount * 8.5 + 18);
    y = sectionHeader(doc, W, MARGIN, y, "Top Kategori Pengeluaran");
    y = drawCategoryBar(doc, MARGIN, y, COL, opts.categoryExpense.slice(0, 10));
  }

  // ── Saldo per Akun (table) ─────────────────────────────────────────────────
  if (opts.accounts.filter(a => a.balance > 0).length > 0) {
    needPage(40);
    y = sectionHeader(doc, W, MARGIN, y, "Saldo per Akun");
    const positive = opts.accounts.filter(a => a.balance > 0);
    const totalBal = positive.reduce((s, a) => s + a.balance, 0);

    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      head: [["Akun", "Jenis", "Mata Uang", "Saldo", "Porsi"]],
      body: positive.map((a, i) => {
        const pct = totalBal > 0 ? ((a.balance / totalBal) * 100).toFixed(1) + "%" : "—";
        return [a.name, a.type, a.currency, fmt(a.balance), pct];
      }),
      foot: [["Total", "", "", fmt(totalBal), "100%"]],
      styles: { fontSize: 7.5, cellPadding: 2.5, overflow: "linebreak" },
      headStyles: { fillColor: C.brand, textColor: C.white, fontStyle: "bold", fontSize: 7.5, cellPadding: 3 },
      footStyles: { fillColor: C.brandBg, textColor: C.brand, fontStyle: "bold", fontSize: 7.5 },
      alternateRowStyles: { fillColor: C.surface },
      columnStyles: autoColWidths(COL, [3, 1.2, 1.2, 2, 1], {
        3: { halign: "right" }, 4: { halign: "right" },
      }),
      didParseCell: (data) => {
        if (data.section === "body" && data.column.index === 0) {
          const a = positive[data.row.index];
          const color = (a?.color && a.color !== "#0284c7") ? a.color : PALETTE_HEX[data.row.index % PALETTE_HEX.length];
          const [r, g, b] = hexToRgb(color);
          data.cell.styles.textColor = [r, g, b];
          data.cell.styles.fontStyle = "bold";
        }
      },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
  }

  // ── Daftar Transaksi ──────────────────────────────────────────────────────
  if (opts.transactions.length > 0) {
    needPage(30);
    y = sectionHeader(doc, W, MARGIN, y, `Daftar Transaksi (${opts.transactions.length})`);

    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      head: [["Tanggal", "Keterangan", "Akun", "Kategori", "Jenis", "Jumlah"]],
      body: opts.transactions.map(tx => [
        tx.date,
        tx.description || tx.category_name || "—",
        tx.account_name || "—",
        tx.category_name || "—",
        tx.type === "income" ? "Masuk" : tx.type === "expense" ? "Keluar" : "Transfer",
        (tx.type === "income" ? "+" : tx.type === "expense" ? "−" : "↔") + fmt(tx.amount),
      ]),
      styles: { fontSize: 7, cellPadding: 2, overflow: "linebreak" },
      headStyles: { fillColor: C.brand, textColor: C.white, fontStyle: "bold", fontSize: 7, cellPadding: 2.5 },
      alternateRowStyles: { fillColor: C.surface },
      columnStyles: autoColWidths(COL, [1.2, 3.5, 2, 2, 1, 1.8], {
        4: { halign: "center" }, 5: { halign: "right", fontStyle: "bold" },
      }),
      didParseCell: (data) => {
        if (data.section === "body") {
          const tx = opts.transactions[data.row.index];
          if (data.column.index === 4 || data.column.index === 5) {
            if (tx?.type === "income")   data.cell.styles.textColor = C.green;
            if (tx?.type === "expense")  data.cell.styles.textColor = C.red;
            if (tx?.type === "transfer") data.cell.styles.textColor = C.sky;
            data.cell.styles.fontStyle = "bold";
          }
        }
      },
    });
  }

  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    drawFooter(doc, W, H, opts.appName, "Laporan Keuangan", p, pageCount, logo);
  }

  savePdfBlob(doc, `laporan_keuangan_${opts.from}_${opts.to}.pdf`);
}


// ═══════════════════════════════════════════════════════════════════════════════
// P&L PDF
// ═══════════════════════════════════════════════════════════════════════════════

interface PLTotals {
  gross_income: number;
  cogs: number;
  gross_profit: number;
  gross_margin: number;
  opex: number;
  other_income: number;
  net_profit: number;
  net_margin: number;
}

interface ExportPLPdfOptions {
  appName: string;
  rangeLabel: string;
  rows: PLMonthRow[];
  totals: PLTotals;
  aiInsight?: string;
}

export async function exportPLPdf(opts: ExportPLPdfOptions): Promise<void> {
  const [{ jsPDF }, autoTableMod, logo] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
    getLogoDataUrl(128),
  ]);
  const autoTable = autoTableMod.default;

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const MARGIN = 14;
  const COL = W - MARGIN * 2;
  const CONTENT_BOTTOM = H - 14;
  let y = 0;

  function needPage(required: number) {
    if (y + required > CONTENT_BOTTOM) { doc.addPage(); y = 18; }
  }

  drawHeader(doc, W, opts.appName, "Laporan Laba Rugi", opts.rangeLabel, logo);
  y = 36;

  // ── AI Insight (before charts) ─────────────────────────────────────────────
  if (opts.aiInsight) {
    needPage(50);
    y = drawAiInsightSection(doc, W, MARGIN, y, opts.aiInsight, CONTENT_BOTTOM);
  }

  const profitable = opts.totals.net_profit >= 0;
  y = kpiCards(doc, MARGIN, y, COL, [
    { label: "Pendapatan Kotor", value: fmt(opts.totals.gross_income),  sub: "gross revenue", color: C.green },
    { label: "HPP / COGS",       value: fmt(opts.totals.cogs),          sub: "harga pokok", color: C.amber },
    { label: "Laba Kotor",       value: fmt(opts.totals.gross_profit),  sub: `margin ${opts.totals.gross_margin.toFixed(1)}%`, color: C.sky },
    { label: "Laba Bersih",      value: fmt(opts.totals.net_profit),    sub: `margin ${opts.totals.net_margin.toFixed(1)}%`, color: profitable ? C.green : C.red },
  ]);

  // ── Chart 1: Net Margin per Bulan ─────────────────────────────────────────
  if (opts.rows.length > 0) {
    needPage(56);
    y = sectionHeader(doc, W, MARGIN, y, "Margin Bersih (%) per Bulan");
    y = drawMarginChart(doc, MARGIN, y, COL, opts.rows, 38);
  }

  // ── Chart 2: Laba Kotor vs Laba Bersih bar ────────────────────────────────
  if (opts.rows.length > 0) {
    needPage(56);
    y = sectionHeader(doc, W, MARGIN, y, "Laba Kotor vs Laba Bersih per Bulan");

    // Build synthetic MonthlyPoint for reuse
    const synth = opts.rows.map(r => ({ month: r.month, income: r.gross_profit, expense: -r.net_profit < 0 ? 0 : r.gross_profit - r.net_profit }));
    // Actually draw profit comparison as simple bar chart
    const YAXIS_W = 10;
    const chartX2 = MARGIN + YAXIS_W;
    const chartW2 = COL - YAXIS_W;
    const maxVal = Math.max(...opts.rows.flatMap(r => [r.gross_profit, r.net_profit, 0]), 1);
    const chartH = 40;
    const barGroupW = chartW2 / opts.rows.length;
    const barW = Math.min(barGroupW * 0.28, 7);

    // Grid
    for (let g = 1; g <= 4; g++) {
      const gy = y + chartH - (g / 4) * chartH;
      doc.setDrawColor(...C.border);
      doc.setLineWidth(0.15);
      doc.setLineDashPattern([1.2, 1.2], 0);
      doc.line(chartX2, gy, chartX2 + chartW2, gy);
      doc.setFontSize(5);
      doc.setTextColor(...C.muted);
      doc.text(fmtK((maxVal * g) / 4), chartX2 - 1, gy + 1.5, { align: "right" });
    }
    doc.setLineDashPattern([], 0);
    doc.setDrawColor(...C.mid);
    doc.setLineWidth(0.3);
    doc.line(chartX2, y + chartH, chartX2 + chartW2, y + chartH);

    opts.rows.forEach((r, i) => {
      const cx = chartX2 + i * barGroupW + barGroupW / 2;
      const gpH = Math.max(0, (r.gross_profit / maxVal) * chartH);
      const npH = Math.max(0, (r.net_profit  / maxVal) * chartH);

      doc.setFillColor(...C.sky);
      if (gpH > 0.5) doc.roundedRect(cx - barW - 0.8, y + chartH - gpH, barW, gpH, 0.8, 0.8, "F");

      doc.setFillColor(...(r.net_profit >= 0 ? C.green : C.red));
      if (npH > 0.5) doc.roundedRect(cx + 0.8, y + chartH - npH, barW, npH, 0.8, 0.8, "F");

      doc.setFontSize(5.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...C.mid);
      doc.text(fmtMonth(r.month), cx, y + chartH + 4, { align: "center" });
    });

    // Legend — below x-axis labels, centered
    const plLegendY = y + chartH + 10;
    const plLegendCx = chartX2 + chartW2 / 2;
    doc.setFontSize(6);
    doc.setTextColor(...C.mid);
    doc.setFillColor(...C.sky);
    doc.roundedRect(plLegendCx - 20, plLegendY, 3, 3, 0.5, 0.5, "F");
    doc.text("Laba Kotor", plLegendCx - 15, plLegendY + 2.5);
    doc.setFillColor(...C.green);
    doc.roundedRect(plLegendCx + 8, plLegendY, 3, 3, 0.5, 0.5, "F");
    doc.text("Laba Bersih", plLegendCx + 13, plLegendY + 2.5);

    doc.setTextColor(...C.dark);
    y = plLegendY + 7;
  }

  // ── P&L Statement table ───────────────────────────────────────────────────
  needPage(40);
  y = sectionHeader(doc, W, MARGIN, y, "Rincian Laba Rugi per Bulan");

  const monthCols = opts.rows.map(r => fmtMonth(r.month));
  const colHeaders = ["Keterangan", ...monthCols, "Total"];

  const plRows: string[][] = [
    ["Pendapatan Kotor",      ...opts.rows.map(r => fmt(r.gross_income)),    fmt(opts.totals.gross_income)],
    ["− HPP / COGS",          ...opts.rows.map(r => `(${fmt(r.cogs)})`),     `(${fmt(opts.totals.cogs)})`],
    ["Laba Kotor",            ...opts.rows.map(r => `${fmt(r.gross_profit)} (${r.gross_margin.toFixed(1)}%)`), `${fmt(opts.totals.gross_profit)} (${opts.totals.gross_margin.toFixed(1)}%)`],
    ["− Beban Operasional",   ...opts.rows.map(r => `(${fmt(r.opex)})`),     `(${fmt(opts.totals.opex)})`],
    ...(opts.rows.some(r => r.other_income > 0)
      ? [["+ Pendapatan Lain", ...opts.rows.map(r => fmt(r.other_income)),   fmt(opts.totals.other_income)]]
      : []),
    ["Laba Bersih",           ...opts.rows.map(r => `${fmt(r.net_profit)} (${r.net_margin.toFixed(1)}%)`), `${fmt(opts.totals.net_profit)} (${opts.totals.net_margin.toFixed(1)}%)`],
  ];

  // Sub-item rows (indented, normal weight) vs header rows (bold)
  const subItemRows = [1, 3, ...(opts.rows.some(r => r.other_income > 0) ? [4] : [])];

  const subtotalRows = [2, plRows.length - 1];
  const netRow = plRows.length - 1;
  const numCols = colHeaders.length;

  // Data columns get equal share of space after reserving minimum for label column.
  // Label column gets whatever remains, clamped between 45–80mm.
  const dataColW = Math.min(20, (COL - 45) / (numCols - 1));
  const labelColW = Math.min(80, Math.max(45, COL - dataColW * (numCols - 1)));

  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    head: [colHeaders],
    body: plRows,
    styles: { fontSize: 7, cellPadding: 2.5, overflow: "linebreak", valign: "middle" },
    headStyles: { fillColor: C.brand, textColor: C.white, fontStyle: "bold", fontSize: 7, cellPadding: 3 },
    columnStyles: {
      0: { halign: "left", cellWidth: labelColW, overflow: "linebreak" },
      ...Object.fromEntries(
        Array.from({ length: numCols - 1 }, (_, i) => [
          i + 1,
          { halign: "right" as const, cellWidth: dataColW },
        ])
      ),
    },
    didParseCell: (data) => {
      if (data.section === "head" && data.column.index === 0) {
        data.cell.styles.halign = "left";
      }
      if (data.section === "body") {
        const isSubItem = subItemRows.includes(data.row.index);
        const isSubtotal = subtotalRows.includes(data.row.index);

        if (data.column.index === 0) {
          if (isSubItem) {
            // Indent sub-items via left padding, normal weight, muted color
            data.cell.styles.fontStyle = "normal";
            data.cell.styles.textColor = C.mid;
            data.cell.styles.cellPadding = { top: 2.5, right: 2.5, bottom: 2.5, left: 7 };
          } else {
            data.cell.styles.fontStyle = "bold";
          }
        }

        if (isSubtotal) {
          data.cell.styles.fillColor = C.brandBg;
          data.cell.styles.fontStyle = "bold";
        }

        if (data.row.index === netRow && data.column.index > 0) {
          const colIdx = data.column.index - 1;
          const val = colIdx < opts.rows.length ? opts.rows[colIdx].net_profit : opts.totals.net_profit;
          data.cell.styles.textColor = val >= 0 ? C.green : C.red;
        }
      }
    },
  });

  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    drawFooter(doc, W, H, opts.appName, "Laporan Laba Rugi", p, pageCount, logo);
  }

  const now = new Date();
  const ds = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,"0")}`;
  savePdfBlob(doc, `laporan_laba_rugi_${ds}.pdf`);
}


// ═══════════════════════════════════════════════════════════════════════════════
// INVENTORY PDF
// ═══════════════════════════════════════════════════════════════════════════════

export interface InventoryPdfOptions {
  appName: string;
  dashboard: InventoryDashboard;
  brands: BrandReportRow[];
  categories: CategoryReportRow[];
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
  aiInsight?: string;
}

export async function exportInventoryPdf(opts: InventoryPdfOptions): Promise<void> {
  const [{ jsPDF }, autoTableMod, logo] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
    getLogoDataUrl(128),
  ]);
  const autoTable = autoTableMod.default;

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const MARGIN = 14;
  const COL = W - MARGIN * 2;
  const CONTENT_BOTTOM = H - 14;
  let y = 0;
  const { t, dashboard, brands, categories } = opts;

  const fmtNum = (n: number) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(n);
  const fmtPct = (n: number) => `${n.toFixed(1)}%`;

  function needPage(required: number) {
    if (y + required > CONTENT_BOTTOM) { doc.addPage(); y = 18; }
  }

  drawHeader(doc, W, opts.appName, t("inventory.pdf.title"), "", logo);
  y = 36;

  // ── AI Insight (before charts) ─────────────────────────────────────────────
  if (opts.aiInsight) {
    needPage(50);
    y = drawAiInsightSection(doc, W, MARGIN, y, opts.aiInsight, CONTENT_BOTTOM);
  }

  y = kpiCards(doc, MARGIN, y, COL, [
    { label: t("inventory.dashboard.assetValue"),  value: fmtNum(dashboard.total_asset_value), sub: "nilai stok",   color: C.brand },
    { label: t("inventory.dashboard.hppMonth"),    value: fmtNum(dashboard.hpp_this_month),    sub: "bulan ini",   color: C.amber },
    { label: t("inventory.dashboard.grossMargin"), value: fmtNum(dashboard.gross_margin_month),sub: fmtPct(dashboard.gross_margin_pct), color: C.green },
    { label: t("inventory.dashboard.turnover"),    value: dashboard.inventory_turnover.toFixed(1), sub: "kali/tahun", color: C.sky },
    { label: t("inventory.dashboard.lowStock"),    value: String(dashboard.low_stock_count),   sub: "item menipis", color: dashboard.low_stock_count > 0 ? C.red : C.green },
  ]);

  // ── Chart: HPP Bulanan ────────────────────────────────────────────────────
  if (dashboard.monthly_hpp && dashboard.monthly_hpp.length > 0) {
    needPage(58);
    y = sectionHeader(doc, W, MARGIN, y, "HPP Bulanan");
    const synthMonthly = dashboard.monthly_hpp.map((m: { month: string; hpp: number }) => ({
      month: m.month,
      income: 0,
      expense: m.hpp,
    }));
    y = drawBarChart(doc, MARGIN, y, COL, synthMonthly, 40);
  }

  // ── Brand Report ──────────────────────────────────────────────────────────
  if (brands.length > 0) {
    needPage(50);
    y = sectionHeader(doc, W, MARGIN, y, t("inventory.pdf.brandReport"));
    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      head: [[
        t("inventory.report.brandName"),
        t("inventory.report.productCount"),
        t("inventory.report.stockValue"),
        t("inventory.report.hppMonth"),
        t("inventory.report.revenueMonth"),
        t("inventory.report.marginMonth"),
        t("inventory.report.marginPct"),
      ]],
      body: brands.map(b => [
        b.brand_name || t("inventory.report.noBrand"),
        b.product_count,
        fmtNum(b.stock_value),
        fmtNum(b.hpp_month),
        fmtNum(b.revenue_month),
        fmtNum(b.margin_month),
        fmtPct(b.margin_pct),
      ]),
      styles: { fontSize: 7.5, cellPadding: 2.5, overflow: "linebreak" },
      headStyles: { fillColor: C.brand, textColor: C.white, fontStyle: "bold", fontSize: 7.5 },
      alternateRowStyles: { fillColor: C.surface },
      columnStyles: autoColWidths(COL, [2.5, 1, 1.6, 1.6, 1.6, 1.6, 1], {
        1: { halign: "center" },
        2: { halign: "right" }, 3: { halign: "right" },
        4: { halign: "right" }, 5: { halign: "right" }, 6: { halign: "right" },
      }),
      didParseCell: (data) => {
        if (data.section === "body" && data.column.index === 6) {
          const pct = brands[data.row.index]?.margin_pct ?? 0;
          data.cell.styles.textColor = pct >= 0 ? C.green : C.red;
          data.cell.styles.fontStyle = "bold";
        }
      },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable?.finalY + 10;
  }

  // ── Category Report ───────────────────────────────────────────────────────
  if (categories.length > 0) {
    needPage(50);
    y = sectionHeader(doc, W, MARGIN, y, t("inventory.pdf.categoryReport"));
    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      head: [[
        t("inventory.report.categoryName"),
        t("inventory.report.subcategoryName"),
        t("inventory.report.productCount"),
        t("inventory.report.stockValue"),
        t("inventory.report.hppMonth"),
        t("inventory.report.revenueMonth"),
        t("inventory.report.marginMonth"),
        t("inventory.report.marginPct"),
      ]],
      body: categories.map(c => [
        c.category_name || t("inventory.report.noCategory"),
        c.subcategory_name ?? "—",
        c.product_count,
        fmtNum(c.stock_value),
        fmtNum(c.hpp_month),
        fmtNum(c.revenue_month),
        fmtNum(c.margin_month),
        fmtPct(c.margin_pct),
      ]),
      styles: { fontSize: 7.5, cellPadding: 2.5, overflow: "linebreak" },
      headStyles: { fillColor: C.brand, textColor: C.white, fontStyle: "bold", fontSize: 7.5 },
      alternateRowStyles: { fillColor: C.surface },
      columnStyles: autoColWidths(COL, [1.8, 1.6, 0.9, 1.5, 1.5, 1.5, 1.5, 1], {
        2: { halign: "center" },
        3: { halign: "right" }, 4: { halign: "right" },
        5: { halign: "right" }, 6: { halign: "right" }, 7: { halign: "right" },
      }),
      didParseCell: (data) => {
        if (data.section === "body" && data.column.index === 7) {
          const pct = categories[data.row.index]?.margin_pct ?? 0;
          data.cell.styles.textColor = pct >= 0 ? C.green : C.red;
          data.cell.styles.fontStyle = "bold";
        }
      },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable?.finalY + 10;
  }

  // ── Low Stock ─────────────────────────────────────────────────────────────
  if (dashboard.low_stock_items.length > 0) {
    needPage(50);
    y = sectionHeader(doc, W, MARGIN, y, t("inventory.pdf.lowStockReport"), C.red);

    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      head: [[
        t("inventory.pdf.product"),
        t("inventory.pdf.warehouse"),
        t("inventory.pdf.qty"),
        t("inventory.pdf.minStock"),
        t("inventory.pdf.unit"),
        t("inventory.pdf.avgCost"),
      ]],
      body: dashboard.low_stock_items.map(item => [
        item.variant_name !== item.product_name ? `${item.product_name} / ${item.variant_name}` : item.product_name,
        item.warehouse_name,
        item.qty,
        item.min_stock,
        item.unit,
        fmtNum(item.avg_cost),
      ]),
      styles: { fontSize: 7.5, cellPadding: 2.5, overflow: "linebreak" },
      headStyles: { fillColor: C.red, textColor: C.white, fontStyle: "bold", fontSize: 7.5 },
      alternateRowStyles: { fillColor: C.redBg },
      columnStyles: autoColWidths(COL, [3, 2.5, 1, 1, 0.8, 1.5], {
        2: { halign: "right" }, 3: { halign: "right" }, 5: { halign: "right" },
      }),
      didParseCell: (data) => {
        if (data.section === "body" && data.column.index === 2) {
          const item = dashboard.low_stock_items[data.row.index];
          if (item) {
            data.cell.styles.textColor = item.qty < item.min_stock * 0.5 ? C.red : C.amber;
            data.cell.styles.fontStyle = "bold";
          }
        }
      },
    });
  }

  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    drawFooter(doc, W, H, opts.appName, t("inventory.pdf.title"), p, pageCount, logo);
  }

  const now = new Date();
  const ds = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  savePdfBlob(doc, `laporan_inventaris_${ds}.pdf`);
}


// ═══════════════════════════════════════════════════════════════════════════════
// ORDER INSIGHT PDF
// ═══════════════════════════════════════════════════════════════════════════════

export interface OrderInsightPdfOptions {
  appName: string;
  months: number;
  kpi: { total_orders: number; total_revenue: number; avg_order_value: number; cancelled_orders: number };
  monthly: { month: string; label: string; revenue: number; orders: number }[];
  topProducts: { name: string; qty: number; revenue: number }[];
  statusBreakdown: Record<string, { count: number; total: number }>;
  aiInsight?: string;
}

export async function exportOrderInsightPdf(opts: OrderInsightPdfOptions): Promise<void> {
  const [{ jsPDF }, autoTableMod, logo] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
    getLogoDataUrl(128),
  ]);
  const autoTable = autoTableMod.default;

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const MARGIN = 14;
  const COL = W - MARGIN * 2;
  const CONTENT_BOTTOM = H - 16;
  let y = 0;

  function needPage(required: number) {
    if (y + required > CONTENT_BOTTOM) { doc.addPage(); y = 20; }
  }

  const rangeLabel = `${opts.months} Bulan Terakhir`;
  drawHeader(doc, W, opts.appName, "Laporan Order & Penjualan", rangeLabel, logo);
  y = 36;

  if (opts.aiInsight) {
    needPage(50);
    y = drawAiInsightSection(doc, W, MARGIN, y, opts.aiInsight, CONTENT_BOTTOM);
  }

  // KPI cards
  const fmtRpFull = (n: number) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(n);
  y = kpiCards(doc, MARGIN, y, COL, [
    { label: "Total Order",       value: String(opts.kpi.total_orders),        sub: rangeLabel,     color: C.brand },
    { label: "Total Pendapatan",  value: fmtK(opts.kpi.total_revenue),         sub: "revenue",      color: C.green },
    { label: "Rata-rata Order",   value: fmtK(opts.kpi.avg_order_value),       sub: "per order",    color: C.sky },
    { label: "Order Dibatalkan",  value: String(opts.kpi.cancelled_orders),    sub: "cancelled",    color: C.red },
  ]);

  // Revenue bar chart
  if (opts.monthly.length > 0) {
    needPage(60);
    y = sectionHeader(doc, W, MARGIN, y, "Pendapatan per Bulan");
    const synthMonthly = opts.monthly.map(m => ({ month: m.month, income: m.revenue, expense: 0 }));
    y = drawBarChart(doc, MARGIN, y, COL, synthMonthly, 40);
  }

  // Status breakdown table
  const statusEntries = Object.entries(opts.statusBreakdown).filter(([, v]) => v.count > 0);
  if (statusEntries.length > 0) {
    needPage(40);
    y = sectionHeader(doc, W, MARGIN, y, "Breakdown Status Order");
    const statusLabel: Record<string, string> = {
      draft: "Draft", waiting_for_payment: "Menunggu Pembayaran",
      on_process: "Diproses", completed: "Selesai", cancelled: "Dibatalkan",
    };
    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      head: [["Status", "Jumlah Order", "Total Nilai"]],
      body: statusEntries.map(([s, v]) => [statusLabel[s] ?? s, v.count, fmtRpFull(v.total)]),
      styles: { fontSize: 7.5, cellPadding: 2.5 },
      headStyles: { fillColor: C.brand, textColor: C.white, fontStyle: "bold" },
      alternateRowStyles: { fillColor: C.surface },
      columnStyles: autoColWidths(COL, [3, 1.5, 2], { 1: { halign: "center" }, 2: { halign: "right" } }),
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
  }

  // Top products table
  if (opts.topProducts.length > 0) {
    needPage(40);
    y = sectionHeader(doc, W, MARGIN, y, "Produk Terlaris");
    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      head: [["Produk", "Qty Terjual", "Revenue"]],
      body: opts.topProducts.map((p, i) => [`${i + 1}. ${p.name}`, p.qty, fmtRpFull(p.revenue)]),
      styles: { fontSize: 7.5, cellPadding: 2.5, overflow: "linebreak" },
      headStyles: { fillColor: C.brand, textColor: C.white, fontStyle: "bold" },
      alternateRowStyles: { fillColor: C.surface },
      columnStyles: autoColWidths(COL, [4, 1.2, 2], { 1: { halign: "center" }, 2: { halign: "right" } }),
    });
  }

  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    drawFooter(doc, W, H, opts.appName, "Laporan Order", p, pageCount, logo);
  }

  const nowD = new Date();
  const ds2 = `${nowD.getFullYear()}${String(nowD.getMonth() + 1).padStart(2, "0")}`;
  savePdfBlob(doc, `laporan_order_${ds2}.pdf`);
}


// ═══════════════════════════════════════════════════════════════════════════════
// ANALYTICS PDF
// ═══════════════════════════════════════════════════════════════════════════════

export interface AnalyticsPdfOptions {
  appName: string;
  period: string;
  periodData: {
    total_tokens: number; input_tokens: number; output_tokens: number;
    messages: number; sessions: number; avg_latency_ms: number; max_latency_ms: number;
    by_model: { model_name: string; provider: string; input_tokens: number; output_tokens: number; messages: number }[];
    timeline: { label: string; tokens: number; messages: number }[];
  } | null;
  sessionData: {
    total_tokens: number; total_input_tokens: number; total_output_tokens: number;
    message_count: number; avg_latency_ms: number; max_latency_ms: number; rag_count: number;
  } | null;
  kbData: { kb_id: string; chunks: number; docs: number }[];
}

export async function exportAnalyticsPdf(opts: AnalyticsPdfOptions): Promise<void> {
  const [{ jsPDF }, autoTableMod, logo] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
    getLogoDataUrl(128),
  ]);
  const autoTable = autoTableMod.default;

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const MARGIN = 14;
  const COL = W - MARGIN * 2;
  const CONTENT_BOTTOM = H - 16;
  let y = 0;

  function needPage(required: number) {
    if (y + required > CONTENT_BOTTOM) { doc.addPage(); y = 20; }
  }

  const fmtN = (n: number) => n >= 1_000_000 ? `${(n/1_000_000).toFixed(1)}M` : n >= 1_000 ? `${(n/1_000).toFixed(1)}k` : String(n);
  const fmtMs = (ms: number) => ms >= 1000 ? `${(ms/1000).toFixed(1)}s` : `${ms}ms`;
  const periodLabel: Record<string, string> = { day: "Hari Ini", week: "Minggu Ini", month: "Bulan Ini" };

  drawHeader(doc, W, opts.appName, "Laporan Analytics AI", periodLabel[opts.period] ?? opts.period, logo);
  y = 36;

  // KPI cards
  if (opts.periodData) {
    y = kpiCards(doc, MARGIN, y, COL, [
      { label: "Total Token",    value: fmtN(opts.periodData.total_tokens),   sub: `↑${fmtN(opts.periodData.input_tokens)} ↓${fmtN(opts.periodData.output_tokens)}`, color: C.brand },
      { label: "Pesan",          value: String(opts.periodData.messages),      sub: "messages",   color: C.sky },
      { label: "Avg Latency",    value: fmtMs(opts.periodData.avg_latency_ms), sub: `max ${fmtMs(opts.periodData.max_latency_ms)}`, color: C.amber },
      { label: "Sesi",           value: String(opts.periodData.sessions),      sub: "sessions",   color: C.green },
    ]);
  }

  // Token timeline bar chart
  if (opts.periodData && opts.periodData.timeline.length > 0) {
    needPage(60);
    y = sectionHeader(doc, W, MARGIN, y, "Token per Periode");
    const synthMonthly = opts.periodData.timeline.map(t => ({ month: t.label, income: t.tokens, expense: 0 }));
    y = drawBarChart(doc, MARGIN, y, COL, synthMonthly, 38);
  }

  // By model table
  if (opts.periodData && opts.periodData.by_model.length > 0) {
    needPage(40);
    y = sectionHeader(doc, W, MARGIN, y, "Penggunaan per Model");
    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      head: [["Model", "Provider", "Token", "Pesan"]],
      body: opts.periodData.by_model.map(m => [
        m.model_name || "—", m.provider,
        fmtN(m.input_tokens + m.output_tokens), m.messages,
      ]),
      styles: { fontSize: 7.5, cellPadding: 2.5, overflow: "linebreak" },
      headStyles: { fillColor: C.brand, textColor: C.white, fontStyle: "bold" },
      alternateRowStyles: { fillColor: C.surface },
      columnStyles: autoColWidths(COL, [3, 1.5, 1.5, 1], { 2: { halign: "right" }, 3: { halign: "center" } }),
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
  }

  // Session stats table
  if (opts.sessionData) {
    needPage(40);
    y = sectionHeader(doc, W, MARGIN, y, "Statistik Sesi Ini");
    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      head: [["Metrik", "Nilai"]],
      body: [
        ["Total Token", fmtN(opts.sessionData.total_tokens)],
        ["  Input Token", fmtN(opts.sessionData.total_input_tokens)],
        ["  Output Token", fmtN(opts.sessionData.total_output_tokens)],
        ["Jumlah Pesan", String(opts.sessionData.message_count)],
        ["Avg Latency", fmtMs(opts.sessionData.avg_latency_ms)],
        ["Max Latency", fmtMs(opts.sessionData.max_latency_ms)],
        ["RAG Queries", String(opts.sessionData.rag_count)],
      ],
      styles: { fontSize: 7.5, cellPadding: 2.5 },
      headStyles: { fillColor: C.brand, textColor: C.white, fontStyle: "bold" },
      alternateRowStyles: { fillColor: C.surface },
      columnStyles: autoColWidths(COL, [3, 2], { 1: { halign: "right", fontStyle: "bold" } }),
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
  }

  // KB table
  if (opts.kbData.length > 0) {
    needPage(40);
    y = sectionHeader(doc, W, MARGIN, y, "Knowledge Base");
    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      head: [["Knowledge Base", "Dokumen", "Chunks"]],
      body: opts.kbData.map(kb => [kb.kb_id, kb.docs, kb.chunks]),
      styles: { fontSize: 7.5, cellPadding: 2.5, overflow: "linebreak" },
      headStyles: { fillColor: C.brand, textColor: C.white, fontStyle: "bold" },
      alternateRowStyles: { fillColor: C.surface },
      columnStyles: autoColWidths(COL, [4, 1, 1.2], { 1: { halign: "center" }, 2: { halign: "right" } }),
    });
  }

  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    drawFooter(doc, W, H, opts.appName, "Analytics AI", p, pageCount, logo);
  }

  const nowD = new Date();
  const ds3 = `${nowD.getFullYear()}${String(nowD.getMonth() + 1).padStart(2, "0")}`;
  savePdfBlob(doc, `laporan_analytics_${ds3}.pdf`);
}
