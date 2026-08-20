import type { MonthlyPoint, TimelinePoint, AccountSummary } from "@/lib/financeApi";
import type { Transaction, PLMonthRow } from "@/types";

interface ExportPdfOptions {
  appName: string;
  rangeLabel: string;
  from: string;
  to: string;
  totalIncome: number;
  totalExpense: number;
  net: number;
  monthly: MonthlyPoint[];
  accounts: AccountSummary[];
  transactions: Transaction[];
}

function fmt(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "decimal", maximumFractionDigits: 0 }).format(n);
}

function fmtMonth(m: string) {
  const [y, mo] = m.split("-");
  const names = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agt","Sep","Okt","Nov","Des"];
  return `${names[parseInt(mo) - 1]} '${y.slice(2)}`;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map(c => c + c).join("") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const PALETTE = ["#3b82f6","#10b981","#f59e0b","#8b5cf6","#ef4444","#06b6d4","#f97316","#84cc16","#ec4899","#6366f1"];
const DEFAULT_COLOR = "#0284c7";

export async function exportFinancePdf(opts: ExportPdfOptions): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const MARGIN = 14;
  const COL = W - MARGIN * 2;
  let y = 0;

  // ── Header ──────────────────────────────────────────────────────────────────
  doc.setFillColor(2, 132, 199);
  doc.rect(0, 0, W, 22, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text(opts.appName, MARGIN, 10);
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.text(`Laporan Keuangan · ${opts.rangeLabel} · ${opts.from} s/d ${opts.to}`, MARGIN, 17);
  doc.text(`Dicetak: ${new Date().toLocaleDateString("id-ID", { dateStyle: "long" })}`, W - MARGIN, 17, { align: "right" });
  doc.setTextColor(30, 30, 30);
  y = 30;

  // ── KPI Cards ───────────────────────────────────────────────────────────────
  const cardW = (COL - 6) / 3;
  const cards = [
    { label: "Total Pendapatan", value: fmt(opts.totalIncome), color: "#10b981" as string },
    { label: "Total Beban",      value: fmt(opts.totalExpense), color: "#ef4444" as string },
    { label: "Net Cashflow",     value: (opts.net >= 0 ? "+" : "") + fmt(opts.net), color: opts.net >= 0 ? "#0284c7" : "#f97316" },
  ];
  cards.forEach((card, i) => {
    const x = MARGIN + i * (cardW + 3);
    doc.setDrawColor(220, 220, 220);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(x, y, cardW, 18, 2, 2, "FD");
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 100, 100);
    doc.text(card.label, x + cardW / 2, y + 6, { align: "center" });
    const [r, g, b] = hexToRgb(card.color);
    doc.setTextColor(r, g, b);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text(card.value, x + cardW / 2, y + 13, { align: "center" });
  });
  doc.setTextColor(30, 30, 30);
  y += 24;

  // ── Monthly bar chart (drawn as grouped bars) ─────────────────────────────
  if (opts.monthly.length > 0) {
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text("Pendapatan vs Beban per Bulan", MARGIN, y);
    y += 4;

    const chartH = 38;
    const chartW = COL;
    const maxVal = Math.max(...opts.monthly.flatMap(m => [m.income, m.expense]), 1);
    const barGroupW = chartW / opts.monthly.length;
    const barW = Math.min(barGroupW * 0.35, 6);

    // Axes
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.2);
    doc.line(MARGIN, y, MARGIN, y + chartH);
    doc.line(MARGIN, y + chartH, MARGIN + chartW, y + chartH);

    opts.monthly.forEach((m, i) => {
      const gx = MARGIN + i * barGroupW + barGroupW / 2;
      const incH = (m.income / maxVal) * chartH;
      const expH = (m.expense / maxVal) * chartH;

      // income bar
      doc.setFillColor(16, 185, 129);
      doc.rect(gx - barW - 0.5, y + chartH - incH, barW, incH, "F");
      // expense bar
      doc.setFillColor(239, 68, 68);
      doc.rect(gx + 0.5, y + chartH - expH, barW, expH, "F");

      // x label
      doc.setFontSize(5.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100, 100, 100);
      doc.text(fmtMonth(m.month), gx, y + chartH + 3.5, { align: "center" });
    });

    // Legend
    doc.setFillColor(16, 185, 129);
    doc.rect(MARGIN + COL - 28, y - 1, 3, 3, "F");
    doc.setFontSize(6);
    doc.setTextColor(60, 60, 60);
    doc.text("Pendapatan", MARGIN + COL - 24, y + 1.5);
    doc.setFillColor(239, 68, 68);
    doc.rect(MARGIN + COL - 28, y + 4, 3, 3, "F");
    doc.text("Beban", MARGIN + COL - 24, y + 6.5);

    doc.setTextColor(30, 30, 30);
    y += chartH + 10;
  }

  // ── Account balance table ─────────────────────────────────────────────────
  if (opts.accounts.length > 0) {
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text("Saldo per Akun", MARGIN, y);
    y += 2;

    const positiveAccounts = opts.accounts.filter(a => a.balance > 0);
    const totalBal = positiveAccounts.reduce((s, a) => s + a.balance, 0);

    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      head: [["Akun", "Jenis", "Mata Uang", "Saldo", "%"]],
      body: positiveAccounts.map((a, i) => {
        const pct = totalBal > 0 ? ((a.balance / totalBal) * 100).toFixed(1) + "%" : "—";
        return [a.name, a.type, a.currency, fmt(a.balance), pct];
      }),
      foot: [["Total", "", "", fmt(totalBal), "100%"]],
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: [2, 132, 199], textColor: 255, fontStyle: "bold", fontSize: 7 },
      footStyles: { fillColor: [241, 245, 249], fontStyle: "bold", fontSize: 7 },
      columnStyles: { 3: { halign: "right" }, 4: { halign: "right" } },
      didParseCell: (data) => {
        if (data.section === "body" && data.column.index === 0) {
          const i = data.row.index;
          const a = positiveAccounts[i];
          const color = (a?.color && a.color !== DEFAULT_COLOR) ? a.color : PALETTE[i % PALETTE.length];
          const [r, g, b] = hexToRgb(color);
          data.cell.styles.textColor = [r, g, b];
          data.cell.styles.fontStyle = "bold";
        }
      },
    });

    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  }

  // ── Transactions table ────────────────────────────────────────────────────
  if (opts.transactions.length > 0) {
    if (y > 220) { doc.addPage(); y = 20; }

    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 30, 30);
    doc.text(`Daftar Transaksi (${opts.transactions.length})`, MARGIN, y);
    y += 2;

    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      head: [["Tanggal", "Keterangan", "Akun", "Kategori", "Pocket", "Jenis", "Jumlah"]],
      body: opts.transactions.map(tx => [
        tx.date,
        tx.description || tx.category_name || tx.type,
        tx.account_name,
        tx.category_name || "—",
        tx.pocket_name || "—",
        tx.type === "income" ? "Masuk" : tx.type === "expense" ? "Keluar" : "Transfer",
        (tx.type === "income" ? "+" : tx.type === "expense" ? "-" : "↔") + fmt(tx.amount),
      ]),
      styles: { fontSize: 6.5, cellPadding: 1.5 },
      headStyles: { fillColor: [2, 132, 199], textColor: 255, fontStyle: "bold", fontSize: 7 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        6: { halign: "right" },
      },
      didParseCell: (data) => {
        if (data.section === "body" && data.column.index === 6) {
          const tx = opts.transactions[data.row.index];
          if (tx?.type === "income")    data.cell.styles.textColor = [16, 185, 129];
          if (tx?.type === "expense")   data.cell.styles.textColor = [239, 68, 68];
        }
      },
    });
  }

  // ── Footer on each page ──────────────────────────────────────────────────
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setFontSize(6);
    doc.setTextColor(160, 160, 160);
    doc.text(`${opts.appName} · Laporan Keuangan`, MARGIN, 293);
    doc.text(`Hal ${p} / ${pageCount}`, W - MARGIN, 293, { align: "right" });
  }

  const filename = `laporan_keuangan_${opts.from}_${opts.to}.pdf`;
  doc.save(filename);
}


// ── P&L PDF export ────────────────────────────────────────────────────────────

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
}

export async function exportPLPdf(opts: ExportPLPdfOptions): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const MARGIN = 14;
  let y = 0;

  // ── Header ──────────────────────────────────────────────────────────────────
  doc.setFillColor(2, 132, 199);
  doc.rect(0, 0, W, 22, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text(opts.appName, MARGIN, 10);
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.text(`Laporan Laba Rugi · ${opts.rangeLabel}`, MARGIN, 17);
  doc.text(`Dicetak: ${new Date().toLocaleDateString("id-ID", { dateStyle: "long" })}`, W - MARGIN, 17, { align: "right" });
  doc.setTextColor(30, 30, 30);
  y = 30;

  // ── KPI Cards ───────────────────────────────────────────────────────────────
  const COL = W - MARGIN * 2;
  const cardW = (COL - 9) / 4;
  const kpiCards = [
    { label: "Pendapatan Kotor", value: fmt(opts.totals.gross_income), color: "#10b981" },
    { label: "Laba Kotor",       value: `${fmt(opts.totals.gross_profit)} (${opts.totals.gross_margin.toFixed(1)}%)`, color: "#0284c7" },
    { label: "Laba Bersih",      value: `${fmt(opts.totals.net_profit)}`, color: opts.totals.net_profit >= 0 ? "#10b981" : "#ef4444" },
    { label: "Margin Bersih",    value: `${opts.totals.net_margin.toFixed(1)}%`, color: opts.totals.net_profit >= 0 ? "#0284c7" : "#f97316" },
  ];
  kpiCards.forEach((card, i) => {
    const x = MARGIN + i * (cardW + 3);
    doc.setDrawColor(220, 220, 220);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(x, y, cardW, 18, 2, 2, "FD");
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 100, 100);
    doc.text(card.label, x + cardW / 2, y + 6, { align: "center" });
    const [r, g, b] = hexToRgb(card.color);
    doc.setTextColor(r, g, b);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text(card.value, x + cardW / 2, y + 13, { align: "center" });
  });
  doc.setTextColor(30, 30, 30);
  y += 24;

  // ── Net Margin bar chart (one bar per month) ─────────────────────────────
  if (opts.rows.length > 0) {
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text("Margin Bersih (%) per Bulan", MARGIN, y);
    y += 4;

    const chartH = 32;
    const chartW = COL;
    const margins = opts.rows.map(r => r.net_margin);
    const maxAbs  = Math.max(...margins.map(Math.abs), 1);
    const zero    = y + chartH / 2;
    const barW    = Math.min(chartW / opts.rows.length * 0.6, 10);

    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.2);
    doc.line(MARGIN, zero, MARGIN + chartW, zero);

    opts.rows.forEach((r, i) => {
      const bx = MARGIN + i * (chartW / opts.rows.length) + (chartW / opts.rows.length) / 2 - barW / 2;
      const bh = Math.abs(r.net_margin) / maxAbs * (chartH / 2 - 2);
      if (r.net_margin >= 0) {
        doc.setFillColor(16, 185, 129);
        doc.rect(bx, zero - bh, barW, bh, "F");
      } else {
        doc.setFillColor(239, 68, 68);
        doc.rect(bx, zero, barW, bh, "F");
      }
      doc.setFontSize(5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100, 100, 100);
      doc.text(fmtMonth(r.month), bx + barW / 2, y + chartH + 3.5, { align: "center" });
      doc.setFontSize(5);
      const label = `${r.net_margin.toFixed(1)}%`;
      const ly = r.net_margin >= 0 ? zero - bh - 1.5 : zero + bh + 4;
      doc.setTextColor(r.net_margin >= 0 ? 16 : 239, r.net_margin >= 0 ? 185 : 68, r.net_margin >= 0 ? 129 : 68);
      doc.text(label, bx + barW / 2, ly, { align: "center" });
    });
    doc.setTextColor(30, 30, 30);
    y += chartH + 10;
  }

  // ── P&L Statement table ──────────────────────────────────────────────────
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text("Laporan Laba Rugi", MARGIN, y);
  y += 2;

  const colHeaders = ["Keterangan", ...opts.rows.map(r => fmtMonth(r.month)), "Total"];
  const plRows: (string | number)[][] = [
    ["Pendapatan Kotor",        ...opts.rows.map(r => fmt(r.gross_income)),   fmt(opts.totals.gross_income)],
    ["  − HPP / COGS",          ...opts.rows.map(r => fmt(-r.cogs)),          fmt(-opts.totals.cogs)],
    ["Laba Kotor",              ...opts.rows.map(r => `${fmt(r.gross_profit)} (${r.gross_margin.toFixed(1)}%)`), `${fmt(opts.totals.gross_profit)} (${opts.totals.gross_margin.toFixed(1)}%)`],
    ["  − Beban Operasional",   ...opts.rows.map(r => fmt(-r.opex)),          fmt(-opts.totals.opex)],
    ...(opts.rows.some(r => r.other_income > 0)
      ? [["  + Pendapatan Lain", ...opts.rows.map(r => fmt(r.other_income)),  fmt(opts.totals.other_income)]]
      : []),
    ["Laba Bersih",             ...opts.rows.map(r => `${fmt(r.net_profit)} (${r.net_margin.toFixed(1)}%)`), `${fmt(opts.totals.net_profit)} (${opts.totals.net_margin.toFixed(1)}%)`],
  ];

  const highlightRows = [2, plRows.length - 1];

  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    head: [colHeaders],
    body: plRows,
    styles: { fontSize: 6.5, cellPadding: 1.5 },
    headStyles: { fillColor: [2, 132, 199], textColor: 255, fontStyle: "bold", fontSize: 7 },
    columnStyles: Object.fromEntries(
      Array.from({ length: colHeaders.length - 1 }, (_, i) => [i + 1, { halign: "right" as const }])
    ),
    didParseCell: (data) => {
      if (data.section === "body" && highlightRows.includes(data.row.index)) {
        data.cell.styles.fillColor = [241, 245, 249];
        data.cell.styles.fontStyle = "bold";
        const isNetProfit = data.row.index === plRows.length - 1;
        if (isNetProfit && data.column.index > 0) {
          const val = opts.rows[data.column.index - 1]?.net_profit ?? opts.totals.net_profit;
          if (val >= 0) data.cell.styles.textColor = [16, 185, 129];
          else data.cell.styles.textColor = [239, 68, 68];
        }
      }
    },
  });

  // ── Footer ──────────────────────────────────────────────────────────────────
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setFontSize(6);
    doc.setTextColor(160, 160, 160);
    doc.text(`${opts.appName} · Laporan Laba Rugi`, MARGIN, H - 7);
    doc.text(`Hal ${p} / ${pageCount}`, W - MARGIN, H - 7, { align: "right" });
  }

  const now = new Date();
  const ds = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,"0")}`;
  doc.save(`laporan_laba_rugi_${ds}.pdf`);
}
