"use client";

import { useState, useEffect, useRef } from "react";
import {
  getKnowledgeBases, uploadDocument, deleteKnowledgeBase,
  getReindexPlan, streamReindex, getKbConsistency, lockKnowledgeBase,
} from "@/lib/api";
import { KbInfo, ReindexPlan, ConsistencyReport } from "@/types";
import {
  Database, Plus, Trash2, Upload, X, AlertTriangle,
  RefreshCw, CheckCircle, ChevronDown, ChevronRight, FileText, Lock, LockOpen,
} from "lucide-react";
import { useLock } from "@/lib/LockContext";
import { LockPopup } from "@/components/lock/LockPopup";
import { clsx } from "clsx";

interface Props {
  selectedKb: string | null;
  onSelectKb: (kb: string | null) => void;
}

export function KnowledgePanel({ selectedKb, onSelectKb }: Props) {
  const { status: lockStatus } = useLock();
  const [kbs, setKbs] = useState<KbInfo[]>([]);
  const [newKbName, setNewKbName] = useState("");
  const [creating, setCreating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [lockMsg, setLockMsg] = useState<string | null>(null);
  const [pendingLockedKb, setPendingLockedKb] = useState<KbInfo | null>(null);
  const [expandedKb, setExpandedKb] = useState<string | null>(null);
  const [consistencyReports, setConsistencyReports] = useState<Record<string, ConsistencyReport>>({});
  const [reindexPlan, setReindexPlan] = useState<ReindexPlan | null>(null);
  const [reindexing, setReindexing] = useState(false);
  const [reindexProgress, setReindexProgress] = useState<{ done: number; total: number; current: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { loadKbs(); }, []);

  const loadKbs = async () => {
    const data = await getKnowledgeBases();
    setKbs(data.knowledge_bases ?? []);
  };

  const handleCreate = () => {
    const name = newKbName.trim();
    if (!name) return;
    setKbs((prev) => [...prev, { kb_id: name, consistent: true, file_count: 0 }]);
    onSelectKb(name);
    setNewKbName("");
    setCreating(false);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedKb || !e.target.files?.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(e.target.files)) {
        await uploadDocument(selectedKb, file);
      }
      await loadKbs();
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleDelete = async (kb: string) => {
    await deleteKnowledgeBase(kb);
    if (selectedKb === kb) onSelectKb(null);
    setKbs((prev) => prev.filter((k) => k.kb_id !== kb));
  };

  const handleLockKb = async (e: React.MouseEvent, kb: KbInfo) => {
    e.stopPropagation();
    if (!lockStatus?.pin_set) {
      setLockMsg("Buat PIN dulu di Settings → Keamanan");
      setTimeout(() => setLockMsg(null), 3000);
      return;
    }
    if (!lockStatus?.unlocked) {
      setLockMsg("Masukkan PIN terlebih dahulu");
      setTimeout(() => setLockMsg(null), 3000);
      return;
    }
    const res = await lockKnowledgeBase(kb.kb_id, !kb.locked);
    if (res.detail) {
      setLockMsg(res.detail);
      setTimeout(() => setLockMsg(null), 3000);
    } else {
      await loadKbs();
    }
  };

  const handleExpand = async (kbId: string) => {
    if (expandedKb === kbId) { setExpandedKb(null); return; }
    setExpandedKb(kbId);
    if (!consistencyReports[kbId]) {
      const report = await getKbConsistency(kbId);
      setConsistencyReports((p) => ({ ...p, [kbId]: report }));
    }
  };

  const handleCheckReindex = async (kbId: string) => {
    const { getSettings } = await import("@/lib/api");
    const settings = await getSettings();
    const plan = await getReindexPlan(settings.embed.model_name);
    setReindexPlan(plan);
  };

  const handleReindex = (plan: ReindexPlan) => {
    setReindexing(true);
    setReindexProgress({ done: 0, total: plan.file_count, current: "" });
    streamReindex(
      plan.new_model,
      (e) => {
        if (e.type === "progress") {
          setReindexProgress({ done: e.done ?? 0, total: e.total ?? 0, current: e.filename ?? "" });
        }
      },
      async () => {
        setReindexing(false);
        setReindexProgress(null);
        setReindexPlan(null);
        setConsistencyReports({});
        await loadKbs();
      }
    );
  };

  return (
    <div className="flex flex-col h-full p-3 gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold th-text-muted uppercase tracking-wider">
          Knowledge Bases
        </span>
        <button
          onClick={() => setCreating(true)}
          className="w-6 h-6 rounded-lg th-bg-elevated hover:opacity-80 flex items-center justify-center transition-opacity th-text-2"
        >
          <Plus size={12} />
        </button>
      </div>

      {creating && (
        <div className="flex gap-1">
          <input
            autoFocus
            value={newKbName}
            onChange={(e) => setNewKbName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreate();
              if (e.key === "Escape") setCreating(false);
            }}
            placeholder="kb-name"
            className="input-field flex-1 text-sm px-2 py-1 rounded-lg"
          />
          <button onClick={handleCreate} className="text-brand-500 hover:text-brand-400 px-1"><Plus size={14} /></button>
          <button onClick={() => setCreating(false)} className="th-text-muted hover:th-text-2 px-1"><X size={14} /></button>
        </div>
      )}

      {/* Reindex plan warning */}
      {reindexPlan && !reindexing && (
        <ReindexWarning
          plan={reindexPlan}
          onConfirm={() => handleReindex(reindexPlan)}
          onDismiss={() => setReindexPlan(null)}
        />
      )}

      {/* Reindex progress */}
      {reindexing && reindexProgress && (
        <div className="th-bg-elevated rounded-xl p-3 flex flex-col gap-2">
          <div className="flex items-center gap-2 text-xs text-brand-500">
            <RefreshCw size={12} className="animate-spin" />
            Re-indexing...
          </div>
          <div className="w-full h-1.5 th-bg-base rounded-full overflow-hidden">
            <div
              className="h-full bg-brand-500 transition-all"
              style={{ width: `${reindexProgress.total ? Math.round(reindexProgress.done / reindexProgress.total * 100) : 0}%` }}
            />
          </div>
          <p className="text-[10px] th-text-muted truncate">{reindexProgress.current}</p>
        </div>
      )}

      {/* Lock message */}
      {lockMsg && (
        <div className="px-2 py-1.5 rounded-lg bg-yellow-500/15 border border-yellow-500/30 text-[10px] text-yellow-400">
          {lockMsg}
        </div>
      )}

      {/* KB list */}
      <div className="flex flex-col gap-1 flex-1 overflow-y-auto scrollbar-thin">
        {kbs.map((kb) => (
          <div key={kb.kb_id}>
            <div
              onClick={() => {
                if (kb.locked && !lockStatus?.unlocked) {
                  setPendingLockedKb(kb);
                  return;
                }
                onSelectKb(kb.kb_id === selectedKb ? null : kb.kb_id);
              }}
              className={clsx(
                "flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer group transition-colors",
                kb.kb_id === selectedKb
                  ? "bg-brand-600/20 text-brand-500"
                  : "hover:th-bg-elevated th-text-2"
              )}
            >
              {kb.locked ? (
                <Lock size={13} className="text-amber-400 shrink-0" />
              ) : (
                <Database size={13} className="shrink-0" />
              )}
              <span className="flex-1 text-sm truncate">{kb.kb_id}</span>

              {!kb.consistent && (
                <button
                  onClick={(e) => { e.stopPropagation(); handleExpand(kb.kb_id); }}
                  title="Version inconsistency detected"
                  className="text-yellow-500 hover:text-yellow-400"
                >
                  <AlertTriangle size={13} />
                </button>
              )}

              <button
                onClick={(e) => handleLockKb(e, kb)}
                className={`opacity-0 group-hover:opacity-100 transition-all ${
                  kb.locked ? "text-amber-400 hover:text-amber-300" : "th-text-muted hover:text-amber-400"
                }`}
                title={kb.locked ? "Buka kunci KB" : "Kunci KB"}
              >
                {kb.locked ? <LockOpen size={12} /> : <Lock size={12} />}
              </button>

              <button
                onClick={(e) => { e.stopPropagation(); handleExpand(kb.kb_id); }}
                className="opacity-0 group-hover:opacity-100 transition-opacity th-text-muted hover:th-text-2"
              >
                {expandedKb === kb.kb_id ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              </button>

              <button
                onClick={(e) => { e.stopPropagation(); handleDelete(kb.kb_id); }}
                className="opacity-0 group-hover:opacity-100 transition-opacity th-text-muted hover:text-red-400"
              >
                <Trash2 size={12} />
              </button>
            </div>

            {expandedKb === kb.kb_id && consistencyReports[kb.kb_id] && (
              <ConsistencyDetail
                report={consistencyReports[kb.kb_id]}
                onReindex={() => handleCheckReindex(kb.kb_id)}
              />
            )}
          </div>
        ))}
      </div>

      {selectedKb && (
        <div>
          <input
            ref={fileRef}
            type="file"
            multiple
            accept=".pdf,.docx,.doc,.txt,.md"
            onChange={handleUpload}
            className="hidden"
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-xl th-bg-elevated hover:opacity-80 disabled:opacity-50 text-sm th-text-2 transition-opacity"
          >
            <Upload size={14} />
            {uploading ? "Uploading..." : "Upload Documents"}
          </button>
        </div>
      )}

      {pendingLockedKb && (
        <LockPopup
          itemLabel={pendingLockedKb.kb_id}
          onUnlocked={() => {
            onSelectKb(pendingLockedKb.kb_id);
            setPendingLockedKb(null);
          }}
          onClose={() => setPendingLockedKb(null)}
        />
      )}
    </div>
  );
}

function ConsistencyDetail({ report, onReindex }: { report: ConsistencyReport; onReindex: () => void }) {
  return (
    <div className="ml-2 mt-1 mb-1 border-l-2 th-border pl-2 flex flex-col gap-1">
      {Object.entries(report.files).map(([fname, finfo]) => {
        const statuses = Object.values(finfo.models).map((m) => m.status);
        const hasIssue = statuses.some((s) => s !== "ok");
        return (
          <div key={fname} className="flex items-center gap-1.5">
            <FileText size={10} className={hasIssue ? "text-yellow-500" : "text-green-500"} />
            <span className="text-[10px] th-text-muted truncate flex-1" title={fname}>{fname}</span>
            {hasIssue
              ? <span className="text-[10px] text-yellow-500 shrink-0">outdated</span>
              : <CheckCircle size={10} className="text-green-500 shrink-0" />
            }
          </div>
        );
      })}
      {!report.consistent && (
        <button
          onClick={onReindex}
          className="mt-1 text-[10px] text-brand-500 hover:text-brand-400 text-left"
        >
          Re-index for current model →
        </button>
      )}
    </div>
  );
}

function ReindexWarning({ plan, onConfirm, onDismiss }: {
  plan: ReindexPlan;
  onConfirm: () => void;
  onDismiss: () => void;
}) {
  const isTier3 = plan.tier === 3;
  return (
    <div className={clsx(
      "rounded-xl border p-3 flex flex-col gap-2",
      isTier3
        ? "bg-red-950/30 border-red-800/50"
        : "bg-yellow-950/20 border-yellow-800/40"
    )}>
      <div className="flex items-start gap-1.5">
        <AlertTriangle size={13} className={isTier3 ? "text-red-400 shrink-0 mt-0.5" : "text-yellow-400 shrink-0 mt-0.5"} />
        <div className="flex flex-col gap-0.5">
          <p className="text-xs font-medium th-text">
            {isTier3 ? "Large re-index required" : "Re-index required"}
          </p>
          <p className="text-[10px] th-text-muted">
            {plan.file_count} file{plan.file_count !== 1 ? "s" : ""} in {plan.kb_count} KB · {plan.total_mb} MB
          </p>
          {isTier3 && (
            <p className="text-[10px] text-red-400 mt-0.5">
              This is a large operation and may take several minutes.
            </p>
          )}
        </div>
      </div>
      <div className="flex gap-1.5">
        <button
          onClick={onConfirm}
          className={clsx(
            "flex-1 py-1 rounded-lg text-xs font-medium transition-colors",
            isTier3
              ? "bg-red-700 hover:bg-red-600 text-white"
              : "bg-brand-600 hover:bg-brand-700 text-white"
          )}
        >
          Start Re-index
        </button>
        <button
          onClick={onDismiss}
          className="flex-1 py-1 rounded-lg text-xs th-text-2 th-bg-elevated hover:opacity-80"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
