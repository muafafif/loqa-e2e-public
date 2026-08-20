"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Loader2, FileText, Link2 } from "lucide-react";
import { useT } from "@/lib/i18n";
import { getNoteGraph } from "@/lib/notesApi";
import type { NoteGraphData } from "@/types";

interface Props {
  onSelectNote: (id: number) => void;
}

interface SimNode {
  id: number;
  title: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  pinned: boolean;
}

interface SimLink { source: number; target: number }

export function GraphPanel({ onSelectNote }: Props) {
  const t = useT();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [graphData, setGraphData] = useState<NoteGraphData | null>(null);
  const [loading, setLoading] = useState(true);

  // Simulation state kept in refs so RAF closure always sees latest
  const nodesRef = useRef<SimNode[]>([]);
  const linksRef = useRef<SimLink[]>([]);
  const rafRef = useRef<number>(0);
  const dprRef = useRef<number>(1);

  // Interaction state
  const hoveredIdRef = useRef<number | null>(null);
  const draggedIdRef = useRef<number | null>(null);
  const [tooltip, setTooltip] = useState<{ title: string; x: number; y: number } | null>(null);

  // Pan / zoom state
  const panRef = useRef({ x: 0, y: 0 });
  const zoomRef = useRef(1);
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0, ox: 0, oy: 0 });

  useEffect(() => {
    getNoteGraph()
      .then(d => { setGraphData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  // ── drawing ───────────────────────────────────────────────────────────────

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = dprRef.current;
    // Clear in physical pixels
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    // Scale once for DPR, then apply pan+zoom in CSS-pixel space
    ctx.scale(dpr, dpr);
    ctx.translate(panRef.current.x, panRef.current.y);
    ctx.scale(zoomRef.current, zoomRef.current);

    const nodes = nodesRef.current;
    const links = linksRef.current;
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    const hovId = hoveredIdRef.current;

    // Links
    for (const link of links) {
      const s = nodeMap.get(link.source);
      const tgt = nodeMap.get(link.target);
      if (!s || !tgt) continue;
      const isActive = hovId === link.source || hovId === link.target;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(tgt.x, tgt.y);
      ctx.strokeStyle = isActive ? "rgba(167,139,250,0.5)" : "rgba(148,163,184,0.15)";
      ctx.lineWidth = isActive ? 2 : 1;
      ctx.stroke();

      // Arrow
      if (isActive) {
        const angle = Math.atan2(tgt.y - s.y, tgt.x - s.x);
        const arrowX = tgt.x - Math.cos(angle) * 10;
        const arrowY = tgt.y - Math.sin(angle) * 10;
        ctx.beginPath();
        ctx.moveTo(arrowX, arrowY);
        ctx.lineTo(arrowX - Math.cos(angle - 0.4) * 7, arrowY - Math.sin(angle - 0.4) * 7);
        ctx.lineTo(arrowX - Math.cos(angle + 0.4) * 7, arrowY - Math.sin(angle + 0.4) * 7);
        ctx.closePath();
        ctx.fillStyle = "rgba(167,139,250,0.6)";
        ctx.fill();
      }
    }

    // Nodes
    for (const node of nodes) {
      const isHov = hovId === node.id;
      const r = isHov ? 10 : 7;

      // Outer glow for hovered
      if (isHov) {
        const grad = ctx.createRadialGradient(node.x, node.y, r, node.x, node.y, r + 14);
        grad.addColorStop(0, "rgba(124,58,237,0.35)");
        grad.addColorStop(1, "rgba(124,58,237,0)");
        ctx.beginPath();
        ctx.arc(node.x, node.y, r + 14, 0, 2 * Math.PI);
        ctx.fillStyle = grad;
        ctx.fill();
      }

      // Node circle with gradient
      const grad = ctx.createRadialGradient(node.x - r * 0.3, node.y - r * 0.3, 1, node.x, node.y, r);
      grad.addColorStop(0, isHov ? "#c4b5fd" : "#a78bfa");
      grad.addColorStop(1, isHov ? "#7c3aed" : "#4c1d95");
      ctx.beginPath();
      ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.strokeStyle = isHov ? "rgba(196,181,253,0.8)" : "rgba(167,139,250,0.3)";
      ctx.lineWidth = isHov ? 1.5 : 1;
      ctx.stroke();

      // Label
      const label = node.title.length > 20 ? node.title.slice(0, 18) + "…" : node.title;
      ctx.font = `${isHov ? 12 : 10}px Inter, system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";

      // Label background
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = "rgba(15,23,42,0.7)";
      ctx.beginPath();
      ctx.roundRect(node.x - tw / 2 - 3, node.y + r + 2, tw + 6, isHov ? 16 : 13, 3);
      ctx.fill();

      ctx.fillStyle = isHov ? "rgb(226,232,240)" : "rgb(148,163,184)";
      ctx.fillText(label, node.x, node.y + r + 4);
    }

    ctx.restore();
  }, []);

  // ── simulation ────────────────────────────────────────────────────────────

  const simTick = useCallback(() => {
    const nodes = nodesRef.current;
    const links = linksRef.current;
    const canvas = canvasRef.current;
    if (!canvas || nodes.length === 0) { rafRef.current = requestAnimationFrame(simTick); return; }

    const dpr = dprRef.current;
    const W = canvas.width / dpr;
    const H = canvas.height / dpr;
    const nodeMap = new Map(nodes.map(n => [n.id, n]));

    const REPEL = 2500;
    const REST_LEN = 120;
    const SPRING = 0.04;
    const CENTER = 0.002;
    const DAMPING = 0.82;

    for (const n of nodes) {
      if (n.pinned) continue;
      let fx = 0, fy = 0;

      for (const m of nodes) {
        if (m.id === n.id) continue;
        const dx = n.x - m.x || 0.01;
        const dy = n.y - m.y || 0.01;
        const dist = Math.sqrt(dx * dx + dy * dy) + 0.01;
        const force = REPEL / (dist * dist);
        fx += (dx / dist) * force;
        fy += (dy / dist) * force;
      }

      for (const link of links) {
        const other = link.source === n.id ? nodeMap.get(link.target)
          : link.target === n.id ? nodeMap.get(link.source) : null;
        if (!other) continue;
        const dx = other.x - n.x;
        const dy = other.y - n.y;
        const dist = Math.sqrt(dx * dx + dy * dy) + 0.01;
        const stretch = dist - REST_LEN;
        fx += (dx / dist) * stretch * SPRING;
        fy += (dy / dist) * stretch * SPRING;
      }

      fx += (W / 2 - n.x) * CENTER;
      fy += (H / 2 - n.y) * CENTER;

      n.vx = (n.vx + fx) * DAMPING;
      n.vy = (n.vy + fy) * DAMPING;
      n.x = Math.max(16, Math.min(W - 16, n.x + n.vx));
      n.y = Math.max(16, Math.min(H - 16, n.y + n.vy));
    }

    draw();
    rafRef.current = requestAnimationFrame(simTick);
  }, [draw]);

  // ── init graph when data arrives ──────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!graphData || !canvas || !container) return;

    const { width, height } = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    dprRef.current = dpr;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);

    // Reset pan/zoom
    panRef.current = { x: 0, y: 0 };
    zoomRef.current = 1;

    nodesRef.current = graphData.nodes.map(n => ({
      id: n.id, title: n.title,
      x: width / 2 + (Math.random() - 0.5) * width * 0.5,
      y: height / 2 + (Math.random() - 0.5) * height * 0.5,
      vx: 0, vy: 0, pinned: false,
    }));
    linksRef.current = graphData.links.map(l => ({ source: l.source, target: l.target }));

    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(simTick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [graphData, simTick]);

  // ── resize ────────────────────────────────────────────────────────────────

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const obs = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      if (width === 0 || height === 0) return;
      const dpr = window.devicePixelRatio || 1;
      dprRef.current = dpr;
      // Set physical buffer size
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      // CSS size stays at 100%/100% via style prop — no need to set here
      draw();
    });
    obs.observe(container);
    return () => obs.disconnect();
  }, [draw]);

  // ── pointer helpers ───────────────────────────────────────────────────────

  const toWorld = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const cx = clientX - rect.left;
    const cy = clientY - rect.top;
    return {
      wx: (cx - panRef.current.x) / zoomRef.current,
      wy: (cy - panRef.current.y) / zoomRef.current,
    };
  }, []);

  const nodeAt = useCallback((wx: number, wy: number) => {
    for (const node of nodesRef.current) {
      const dx = node.x - wx;
      const dy = node.y - wy;
      if (dx * dx + dy * dy <= 144) return node; // r=12 hit area
    }
    return null;
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isPanningRef.current) {
      panRef.current = {
        x: e.clientX - panStartRef.current.x + panStartRef.current.ox,
        y: e.clientY - panStartRef.current.y + panStartRef.current.oy,
      };
      return;
    }

    const { wx, wy } = toWorld(e.clientX, e.clientY);

    // Drag pinned node
    if (draggedIdRef.current !== null) {
      const node = nodesRef.current.find(n => n.id === draggedIdRef.current);
      if (node) { node.x = wx; node.y = wy; node.vx = 0; node.vy = 0; }
      return;
    }

    const node = nodeAt(wx, wy);
    hoveredIdRef.current = node ? node.id : null;
    canvasRef.current!.style.cursor = node ? "pointer" : "grab";

    if (node) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const _rect = canvasRef.current!.getBoundingClientRect();
      const sx = (node.x * zoomRef.current) + panRef.current.x;
      const sy = (node.y * zoomRef.current) + panRef.current.y;
      setTooltip({ title: node.title, x: sx, y: sy });
    } else {
      setTooltip(null);
    }
  }, [toWorld, nodeAt]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const { wx, wy } = toWorld(e.clientX, e.clientY);
    const node = nodeAt(wx, wy);
    if (node) {
      draggedIdRef.current = node.id;
      node.pinned = true;
      canvasRef.current!.style.cursor = "grabbing";
    } else {
      isPanningRef.current = true;
      panStartRef.current = { x: e.clientX, y: e.clientY, ox: panRef.current.x, oy: panRef.current.y };
      canvasRef.current!.style.cursor = "grabbing";
    }
  }, [toWorld, nodeAt]);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleMouseUp = useCallback((_e: React.MouseEvent<HTMLCanvasElement>) => {
    if (draggedIdRef.current !== null) {
      const node = nodesRef.current.find(n => n.id === draggedIdRef.current);
      if (node) node.pinned = false;
      draggedIdRef.current = null;
    }
    isPanningRef.current = false;
    canvasRef.current!.style.cursor = "grab";
  }, []);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const { wx, wy } = toWorld(e.clientX, e.clientY);
    const node = nodeAt(wx, wy);
    if (node) onSelectNote(node.id);
  }, [toWorld, nodeAt, onSelectNote]);

  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const rect = canvasRef.current!.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(0.2, Math.min(4, zoomRef.current * delta));
    // Zoom toward cursor
    panRef.current.x = cx - (cx - panRef.current.x) * (newZoom / zoomRef.current);
    panRef.current.y = cy - (cy - panRef.current.y) * (newZoom / zoomRef.current);
    zoomRef.current = newZoom;
  }, []);

  // ── render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 size={20} className="animate-spin th-text-muted" />
      </div>
    );
  }

  if (!graphData || graphData.nodes.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 th-text-muted">
        <div className="w-14 h-14 rounded-2xl th-bg-elevated border th-border flex items-center justify-center">
          <Link2 size={24} className="opacity-40" />
        </div>
        <p className="text-sm font-medium th-text">{t("notes.empty")}</p>
        <p className="text-xs th-text-muted">Tulis [[nama catatan]] untuk membuat backlink</p>
      </div>
    );
  }

  const linkCount = graphData.links.length;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-6 py-3 border-b th-border glass-surface shrink-0 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold th-text">{t("notes.graph")}</h2>
          <p className="text-xs th-text-muted">
            {graphData.nodes.length} catatan · {linkCount} backlink
            {linkCount === 0 && " — tulis [[judul]] untuk menghubungkan catatan"}
          </p>
        </div>
        <div className="flex items-center gap-3 text-[11px] th-text-muted">
          <span>Scroll = zoom</span>
          <span>Drag node = pindah</span>
          <span>Click = buka</span>
        </div>
      </div>

      {/* Canvas area */}
      <div ref={containerRef} className="flex-1 relative overflow-hidden">
        <canvas
          ref={canvasRef}
          style={{ display: "block", width: "100%", height: "100%", cursor: "grab" }}
          onMouseMove={handleMouseMove}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onMouseLeave={() => { isPanningRef.current = false; draggedIdRef.current = null; setTooltip(null); hoveredIdRef.current = null; }}
          onClick={handleClick}
          onWheel={handleWheel}
        />

        {/* Tooltip */}
        {tooltip && (
          <div
            className="absolute pointer-events-none z-10 card px-3 py-2 flex items-center gap-2 text-xs th-text shadow-lg"
            style={{
              left: tooltip.x + 14,
              top: tooltip.y - 16,
              maxWidth: 220,
              transform: "translateY(-50%)",
            }}
          >
            <FileText size={12} className="text-brand-400 shrink-0" />
            <span className="truncate font-medium">{tooltip.title}</span>
            <span className="th-text-muted shrink-0 text-[10px]">klik untuk buka</span>
          </div>
        )}

        {/* Legend */}
        <div className="absolute bottom-4 left-4 card px-3 py-2 flex items-center gap-3 text-[10px] th-text-muted">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-violet-500 inline-block" /> Catatan
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-4 h-px bg-slate-400/40 inline-block" /> Backlink
          </span>
        </div>
      </div>
    </div>
  );
}
