"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";
import { useConnection } from "@/lib/ConnectionContext";
import { useState } from "react";
import { clsx } from "clsx";

export function RerankerWarningBanner() {
  const { rerankerStatus, recheckReranker } = useConnection();
  const [rechecking, setRechecking] = useState(false);

  // Only show when reranker is enabled but not OK
  if (!rerankerStatus || rerankerStatus.ok || !rerankerStatus.enabled) return null;

  const handleRecheck = async () => {
    setRechecking(true);
    await recheckReranker();
    setRechecking(false);
  };

  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-yellow-950/40 border-b border-yellow-800/50 text-yellow-400 text-xs">
      <AlertTriangle size={13} className="shrink-0" />
      <span className="flex-1 truncate">
        Reranker disconnected — RAG responses will use default ranking.
        {rerankerStatus.error && (
          <span className="text-yellow-600 ml-1" title={rerankerStatus.error}>({rerankerStatus.error.slice(0, 60)}{rerankerStatus.error.length > 60 ? "…" : ""})</span>
        )}
      </span>
      <button
        onClick={handleRecheck}
        disabled={rechecking}
        className={clsx(
          "flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium border border-yellow-700/60 hover:bg-yellow-900/40 transition-colors shrink-0 disabled:opacity-50",
        )}
        title="Retry reranker connection"
      >
        <RefreshCw size={10} className={rechecking ? "animate-spin" : ""} />
        Retry
      </button>
    </div>
  );
}
