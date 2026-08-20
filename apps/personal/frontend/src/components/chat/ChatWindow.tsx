"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { ChatMessage } from "./ChatMessage";
import { ChatInput } from "./ChatInput";
import { ChatStatusBar } from "./ChatStatusBar";
import { streamChat, getConversation, summarizeConversation, setConversationPersona, getContextSummary, type ContextSummary } from "@/lib/api";
import { Message, MessageAction, MessageMetrics, ConversationDetail } from "@/types";
import { useConnection } from "@/lib/ConnectionContext";
import { RerankerWarningBanner } from "./RerankerWarningBanner";
import { WifiOff, UserCog, X, Check, Sparkles, Zap, Shield, Wallet, TrendingUp, RefreshCw } from "lucide-react";
import { useT } from "@/lib/i18n";

interface Props {
  kbId: string | null;
  chatOnly: boolean;
  sessionId: string;
  convId: string | null;
  onConvCreated: (convId: string, title: string) => void;
}

function generateId() {
  return Math.random().toString(36).slice(2);
}

const OFFLINE_MESSAGE =
  "⚠️ Model is offline. Your message was saved but could not be answered. Please check your model connection in Settings.";

export function ChatWindow({ kbId, chatOnly, sessionId, convId, onConvCreated }: Props) {
  const { phase } = useConnection();
  const t = useT();
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [lastMetrics, setLastMetrics] = useState<MessageMetrics | null>(null);
  const [loadedConvId, setLoadedConvId] = useState<string | null>(null);
  const [statusLabel, setStatusLabel] = useState<string | null>(null);
  const [personaPrompt, setPersonaPrompt] = useState<string>("");
  const [showPersonaEditor, setShowPersonaEditor] = useState(false);
  const [personaDraft, setPersonaDraft] = useState<string>("");
  const [personaSaving, setPersonaSaving] = useState(false);
  const [contextSummary, setContextSummary] = useState<ContextSummary | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<(() => void) | null>(null);
  const pendingThinkingRef = useRef<string>("");
  const streamingMsgIdRef = useRef<string | null>(null);

  const effectiveKbId = chatOnly ? null : kbId;
  const chatMode = chatOnly ? "unified" : "rag";

  const prevPhaseRef = useRef(phase);
  useEffect(() => {
    const wasActive = prevPhaseRef.current === "ready" || prevPhaseRef.current === "chat_only";
    if (wasActive && phase === "setup" && isStreaming) {
      cancelRef.current?.();
      setIsStreaming(false);
      setMessages((prev) =>
        prev.map((m) =>
          m.loading ? { ...m, loading: false, content: OFFLINE_MESSAGE, offline: true } : m
        )
      );
    }
    prevPhaseRef.current = phase;
  }, [phase, isStreaming]);

  useEffect(() => {
    if (convId === loadedConvId) return;
    if (!convId) {
      setMessages([]);
      setLoadedConvId(null);
      setLastMetrics(null);
      setPersonaPrompt("");
      return;
    }
    getConversation(convId).then((detail: ConversationDetail) => {
      const loaded: Message[] = detail.messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        citations: m.citations ?? undefined,
        error: !!m.failed,
      }));
      setMessages(loaded);
      setLoadedConvId(convId);
      setLastMetrics(null);
      setPersonaPrompt(detail.persona_prompt ?? "");
    }).catch(() => {});
  }, [convId, loadedConvId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Fetch context summary for empty-state quick actions (not needed in RAG/doc mode)
  useEffect(() => {
    if (chatMode !== "rag") {
      getContextSummary().then(setContextSummary).catch(() => {});
    }
  }, [chatMode]);

  const sessionTotals = useMemo(() => {
    return messages.reduce(
      (acc, m) => {
        if (m.metrics) {
          acc.input_tokens += m.metrics.input_tokens;
          acc.output_tokens += m.metrics.output_tokens;
          acc.latency_ms = m.metrics.latency_ms;
        }
        return acc;
      },
      { input_tokens: 0, output_tokens: 0, latency_ms: 0 }
    );
  }, [messages]);

  const isOffline = phase === "setup";

  function openPersonaEditor() {
    setPersonaDraft(personaPrompt);
    setShowPersonaEditor(true);
  }

  async function savePersona() {
    if (!convId) return;
    setPersonaSaving(true);
    try {
      await setConversationPersona(convId, personaDraft || null);
      setPersonaPrompt(personaDraft);
      setShowPersonaEditor(false);
    } finally {
      setPersonaSaving(false);
    }
  }

  const handleSend = (content: string) => {
    if (isStreaming) return;

    const userMsg: Message = { id: generateId(), role: "user", content };
    const assistantMsg: Message = { id: generateId(), role: "assistant", content: "", loading: true };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setIsStreaming(true);
    setStatusLabel(t("chat.statusThinking"));
    pendingThinkingRef.current = "";
    streamingMsgIdRef.current = assistantMsg.id;

    const historyToSend = convId
      ? [{ role: "user" as const, content }]
      : [...messages, userMsg].map((m) => ({ role: m.role, content: m.content }));

    // eslint-disable-next-line prefer-const, @typescript-eslint/no-unused-vars
    let activeConvId = convId;

    cancelRef.current = streamChat(
      historyToSend,
      effectiveKbId,
      sessionId,
      (token) => {
        setStatusLabel(null);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsg.id ? { ...m, content: m.content + token, loading: false } : m
          )
        );
      },
      (citations) => {
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantMsg.id ? { ...m, citations } : m))
        );
      },
      (metricsData) => {
        setLastMetrics(metricsData);
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantMsg.id ? { ...m, metrics: metricsData } : m))
        );
      },
      async (doneConvId) => {
        setIsStreaming(false);
        setStatusLabel(null);
        streamingMsgIdRef.current = null;
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantMsg.id ? { ...m, loading: false } : m))
        );
        if (doneConvId) {
          activeConvId = doneConvId;
          setLoadedConvId(doneConvId);
          const allMsgs = [...messages, userMsg];
          if (allMsgs.length > 20) {
            const olderMsgs = allMsgs.slice(0, allMsgs.length - 10);
            summarizeConversation(
              doneConvId,
              olderMsgs.map((m) => ({ role: m.role, content: m.content }))
            ).catch(() => {});
          }
        }
      },
      convId,
      (newConvId, title) => {
        activeConvId = newConvId;
        setLoadedConvId(newConvId);
        onConvCreated(newConvId, title);
      },
      chatMode,
      (errorMsg) => {
        setIsStreaming(false);
        setStatusLabel(null);
        streamingMsgIdRef.current = null;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsg.id
              ? { ...m, loading: false, content: errorMsg, error: true }
              : m
          )
        );
      },
      undefined,
      (action: MessageAction) => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsg.id ? { ...m, actions: [...(m.actions ?? []), action] } : m
          )
        );
        if (action.action === "tool_call") {
          setStatusLabel(t("chat.statusTooling") + ` (${action.label})`);
        } else if (action.action === "context_injection") {
          setStatusLabel(t("chat.statusContextInjection"));
        } else if (action.action === "tool_error") {
          setStatusLabel(t("chat.statusToolError"));
        }
      },
      (status) => {
        if (status === "thinking") {
          setStatusLabel(t("chat.statusThinking"));
        }
      },
      (thinkingContent) => {
        pendingThinkingRef.current += thinkingContent;
        const thinking = pendingThinkingRef.current;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsg.id ? { ...m, thinking } : m
          )
        );
      },
    );
  };

  const handleCancel = () => {
    cancelRef.current?.();
    setIsStreaming(false);
    setStatusLabel(null);
    setMessages((prev) =>
      prev.map((m) => (m.loading ? { ...m, loading: false } : m))
    );
  };

  return (
    <div className="flex flex-col h-full w-full" style={{ background: "rgb(var(--bg-base))" }}>
      {/* ── Header ── */}
      <div className="shrink-0 flex items-center justify-between px-5 py-2.5 border-b"
        style={{ borderColor: "rgb(var(--border))", background: "rgb(var(--bg-surface) / 0.6)", backdropFilter: "blur(12px)" }}>
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded-md flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, rgb(var(--accent-600)) 0%, rgb(var(--accent-500)) 100%)" }}>
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
              <path d="M7 1L12.196 4V10L7 13L1.804 10V4L7 1Z" fill="white" fillOpacity="0.9" />
            </svg>
          </div>
          <span className="text-sm font-semibold" style={{ color: "rgb(var(--tx-primary))" }}>
            {t("nav.chat")}
          </span>

          {isOffline && (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs"
              style={{ background: "rgb(239 68 68 / 0.12)", color: "rgb(248 113 113)", border: "1px solid rgb(239 68 68 / 0.2)" }}>
              <WifiOff size={10} />
              {t("chat.modelOffline")}
            </div>
          )}
        </div>

        {convId && (
          <button
            onClick={openPersonaEditor}
            title={t("chat.personaEdit")}
            className="p-1.5 rounded-lg transition-all duration-150"
            style={{
              background: personaPrompt ? "rgb(var(--accent-600) / 0.15)" : "transparent",
              color: personaPrompt ? "rgb(var(--accent-400))" : "rgb(var(--tx-muted))",
              border: personaPrompt ? "1px solid rgb(var(--accent-600) / 0.25)" : "1px solid transparent",
            }}
          >
            <UserCog size={14} />
          </button>
        )}
      </div>

      {/* ── Persona editor ── */}
      {showPersonaEditor && convId && (
        <div className="shrink-0 px-5 py-3 flex flex-col gap-2.5 border-b"
          style={{ borderColor: "rgb(var(--border))", background: "rgb(var(--bg-surface))" }}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold" style={{ color: "rgb(var(--tx-primary))" }}>
              {t("chat.personaTitle")}
            </span>
            <button onClick={() => setShowPersonaEditor(false)} style={{ color: "rgb(var(--tx-muted))" }}>
              <X size={14} />
            </button>
          </div>
          <p className="text-xs" style={{ color: "rgb(var(--tx-muted))" }}>{t("chat.personaHint")}</p>
          <textarea
            rows={3}
            value={personaDraft}
            onChange={(e) => setPersonaDraft(e.target.value)}
            placeholder={t("chat.personaPlaceholder")}
            className="w-full rounded-xl px-3 py-2 text-xs outline-none resize-none transition-all"
            style={{
              background: "rgb(var(--bg-elevated))",
              border: "1px solid rgb(var(--border))",
              color: "rgb(var(--tx-primary))",
            }}
            autoFocus
          />
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setShowPersonaEditor(false)}
              className="px-3 py-1.5 rounded-lg text-xs transition-colors"
              style={{ background: "rgb(var(--bg-elevated))", color: "rgb(var(--tx-secondary))", border: "1px solid rgb(var(--border))" }}
            >
              {t("common.cancel")}
            </button>
            <button
              onClick={savePersona}
              disabled={personaSaving}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-white font-semibold transition-colors disabled:opacity-40"
              style={{ background: "rgb(var(--accent-600))" }}
            >
              <Check size={12} />
              {personaSaving ? t("common.saving") : t("common.save")}
            </button>
          </div>
        </div>
      )}

      {/* ── Reranker warning ── */}
      <RerankerWarningBanner />

      {/* ── Messages ── */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {messages.length === 0 ? (
          <EmptyState onSuggest={handleSend} contextSummary={contextSummary} chatMode={chatMode} kbId={kbId} />
        ) : (
          <div className="max-w-3xl mx-auto py-6 w-full">
            {messages.map((m) => (
              <ChatMessage
                key={m.id}
                message={m}
                statusLabel={m.loading ? statusLabel : undefined}
              />
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* ── Status bar ── */}
      <ChatStatusBar
        sessionTotals={sessionTotals}
        lastMetrics={lastMetrics}
        messageCount={messages.filter((m) => m.role === "assistant" && !m.loading).length}
        isStreaming={isStreaming}
        sessionId={sessionId}
      />

      {/* ── Input ── */}
      <div className="shrink-0 px-4 pb-4 pt-2" style={{ background: "rgb(var(--bg-base))" }}>
        <div className="max-w-3xl mx-auto w-full">
          <ChatInput
            onSend={handleSend}
            disabled={isStreaming || isOffline}
            placeholder={isOffline ? t("chat.placeholderOffline") : t("chat.inputPlaceholder")}
            isStreaming={isStreaming}
            onCancel={handleCancel}
          />
          <p className="text-[10px] text-center mt-2" style={{ color: "rgb(var(--tx-muted))" }}>
            {t("chat.placeholder")}
          </p>
        </div>
      </div>
    </div>
  );
}

function fmtRp(n: number) {
  if (n >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(1)}M`;
  if (n >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(1)}jt`;
  if (n >= 1_000) return `Rp ${(n / 1_000).toFixed(0)}rb`;
  return `Rp ${n}`;
}

function CubeIcon({ mode }: { mode: "chat" | "doc" }) {
  const isDoc = mode === "doc";
  const particles = [
    { left: "12%", top: "70%", dur: "4.2s", delay: "0s" },
    { left: "84%", top: "60%", dur: "5.5s", delay: "-1.6s" },
    { left: "74%", top: "74%", dur: "3.8s", delay: "-0.9s" },
    { left: "18%", top: "76%", dur: "4.9s", delay: "-2.4s" },
    { left: "54%", top: "84%", dur: "6.3s", delay: "-3.2s" },
    { left: "36%", top: "66%", dur: "5.8s", delay: "-4.1s" },
  ];
  // Both modes use accent CSS vars so the cube always matches the chosen theme color
  const face = {
    front:  "linear-gradient(148deg, rgb(var(--accent-300)) 0%, rgb(var(--accent-400)) 28%, rgb(var(--accent-600)) 62%, rgb(var(--accent-700)) 100%)",
    top:    "linear-gradient(165deg, rgb(var(--accent-50)) 0%, rgb(var(--accent-300)) 55%, rgb(var(--accent-400)) 100%)",
    left:   "linear-gradient(165deg, rgb(var(--accent-300)) 0%, rgb(var(--accent-400)) 45%, rgb(var(--accent-500)) 100%)",
    right:  "linear-gradient(165deg, rgb(var(--accent-500)) 0%, rgb(var(--accent-600)) 50%, rgb(var(--accent-700)) 100%)",
    back:   "linear-gradient(165deg, rgb(var(--accent-600)) 0%, rgb(var(--accent-700)) 60%, rgb(var(--accent-700)) 100%)",
    bottom: "linear-gradient(165deg, rgb(var(--accent-700)) 0%, rgb(var(--accent-700)) 100%)",
  };
  const glowColor   = "rgb(var(--accent-600) / 0.65)";
  const glowInner   = "rgb(var(--accent-300) / 0.4)";
  const particleClr = "rgb(var(--accent-300) / 0.85)";
  const shadowColor = "rgb(var(--accent-600) / 0.6)";
  const animName    = isDoc ? "tumble-d" : "tumble-c";
  return (
    <div style={{ position: "relative", width: 100, height: 100, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ position: "absolute", inset: -40, borderRadius: "50%", pointerEvents: "none", zIndex: 0, filter: "blur(28px)", animation: "cube-glow-breathe 6s ease-in-out infinite", background: `radial-gradient(circle at 50% 58%, ${glowColor} 0%, transparent 68%)`, animationDelay: isDoc ? "-1.8s" : "0s" }} />
      <div style={{ position: "absolute", inset: 4, borderRadius: "50%", pointerEvents: "none", zIndex: 0, filter: "blur(12px)", animation: "cube-glow-breathe 6s ease-in-out infinite", background: `radial-gradient(circle at 50% 52%, ${glowInner} 0%, transparent 60%)`, animationDelay: isDoc ? "-2.3s" : "-0.5s" }} />
      <div style={{ position: "absolute", inset: -44, pointerEvents: "none", zIndex: 0 }}>
        {particles.map((p, i) => (
          <div key={i} style={{ position: "absolute", width: 2, height: 2, borderRadius: "50%", background: particleClr, left: p.left, top: p.top, animation: `cube-particle linear ${p.dur} ${p.delay} infinite` }} />
        ))}
      </div>
      <div style={{ width: 100, height: 100, perspective: 350, position: "relative", zIndex: 1 }}>
        <div style={{ width: 60, height: 60, position: "absolute", top: 20, left: 20, transformStyle: "preserve-3d", animation: `${animName} 8s cubic-bezier(.37,0,.63,1) infinite`, animationDelay: isDoc ? "-2s" : "0s" }}>
          <div style={{ position: "absolute", width: 60, height: 60, background: face.front, transform: "translateZ(30px)", boxShadow: "inset 0 1.5px 0 rgba(255,255,255,.35), inset 0 -1px 0 rgba(0,0,0,.1)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
            <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "radial-gradient(ellipse 70% 45% at 38% 28%, rgba(255,255,255,.38) 0%, transparent 100%), linear-gradient(135deg, rgba(255,255,255,.15) 0%, transparent 55%)" }} />
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 20, background: "linear-gradient(0deg, rgba(255,255,255,.08) 0%, transparent 100%)" }} />
            <div style={{ position: "absolute", top: 7, right: 8, width: 5, height: 5, animation: "cube-spark 6s ease-in-out infinite" }}>
              <div style={{ position: "absolute", width: 1.5, height: 5, left: 1.75, top: 0, background: "rgba(255,255,255,.9)", borderRadius: 1 }} />
              <div style={{ position: "absolute", width: 5, height: 1.5, left: 0, top: 1.75, background: "rgba(255,255,255,.9)", borderRadius: 1 }} />
            </div>
            {isDoc ? (
              <svg style={{ position: "relative", zIndex: 1, flexShrink: 0 }} width="30" height="30" viewBox="0 0 24 24" fill="none">
                <path d="M4 5C4 4.4 4.4 4 5 4h5.5C11.9 4 13 5.1 13 6.5V20c0-1.1-.9-1.5-2-1.5H5c-.6 0-1-.4-1-1V5z" fill="rgba(255,255,255,.88)" />
                <path d="M20 5c0-.6-.4-1-1-1h-5.5C12.1 4 11 5.1 11 6.5V20c0-1.1.9-1.5 2-1.5H19c.6 0 1-.4 1-1V5z" fill="rgba(255,255,255,.6)" />
                <line x1="12" y1="5" x2="12" y2="19.5" stroke="rgba(0,0,0,.18)" strokeWidth="1" />
                <line x1="6"    y1="9"  x2="10.5" y2="9"  stroke="rgba(0,0,0,.18)" strokeWidth="1" strokeLinecap="round" />
                <line x1="6"    y1="12" x2="10.5" y2="12" stroke="rgba(0,0,0,.18)" strokeWidth="1" strokeLinecap="round" />
                <line x1="6"    y1="15" x2="9"    y2="15" stroke="rgba(0,0,0,.18)" strokeWidth="1" strokeLinecap="round" />
                <line x1="13.5" y1="9"  x2="18"   y2="9"  stroke="rgba(0,0,0,.12)" strokeWidth="1" strokeLinecap="round" />
                <line x1="13.5" y1="12" x2="18"   y2="12" stroke="rgba(0,0,0,.12)" strokeWidth="1" strokeLinecap="round" />
                <line x1="13.5" y1="15" x2="16"   y2="15" stroke="rgba(0,0,0,.12)" strokeWidth="1" strokeLinecap="round" />
              </svg>
            ) : (
              <svg style={{ position: "relative", zIndex: 1, flexShrink: 0 }} width="30" height="30" viewBox="0 0 24 24" fill="none">
                <path d="M9.5 2C7 2 5 4 5 6.5c0 .8.2 1.5.5 2.1C4 9.2 3 10.5 3 12c0 1.2.5 2.3 1.3 3-.2.4-.3.9-.3 1.5C4 18.5 5.5 20 7.5 20c.3 0 .6 0 .9-.1.6.7 1.5 1.1 2.6 1.1h2c1.1 0 2-.4 2.6-1.1.3.1.6.1.9.1 2 0 3.5-1.5 3.5-3.5 0-.6-.1-1.1-.3-1.5C21.5 14.3 22 13.2 22 12c0-1.5-1-2.8-2.5-3.4.3-.6.5-1.3.5-2.1C20 4 18 2 15.5 2c-1 0-1.9.3-2.6.9-.3-.1-.6-.1-.9-.1s-.6 0-.9.1C10.4 2.3 9.5 2 9.5 2z" stroke="white" strokeOpacity=".9" strokeWidth="1.4" strokeLinejoin="round" fill="rgba(255,255,255,.1)" />
                <line x1="12" y1="6.5" x2="12" y2="17.5" stroke="white" strokeOpacity=".25" strokeWidth=".9" strokeDasharray="2 2.5" />
                <circle cx="8.5"  cy="9"  r="1.4" fill="white" fillOpacity=".95" />
                <circle cx="15.5" cy="9"  r="1.4" fill="white" fillOpacity=".95" />
                <circle cx="8"    cy="14" r="1.4" fill="white" fillOpacity=".95" />
                <circle cx="16"   cy="14" r="1.4" fill="white" fillOpacity=".95" />
                <line x1="8.5"  y1="9"  x2="12" y2="11.5" stroke="white" strokeOpacity=".3" strokeWidth=".85" />
                <line x1="15.5" y1="9"  x2="12" y2="11.5" stroke="white" strokeOpacity=".3" strokeWidth=".85" />
                <line x1="8"    y1="14" x2="12" y2="12.5" stroke="white" strokeOpacity=".3" strokeWidth=".85" />
                <line x1="16"   y1="14" x2="12" y2="12.5" stroke="white" strokeOpacity=".3" strokeWidth=".85" />
                <circle cx="12" cy="12" r="1.9" fill="white" fillOpacity=".98" />
              </svg>
            )}
          </div>
          <div style={{ position: "absolute", width: 60, height: 60, background: face.back,   transform: "rotateY(180deg) translateZ(30px)", border: "1px solid rgba(255,255,255,.05)" }}><div style={{ position: "absolute", inset: 0 }} className={isDoc ? "shade-d-b"  : "shade-c-b"} /></div>
          <div style={{ position: "absolute", width: 60, height: 60, background: face.right,  transform: "rotateY(90deg) translateZ(30px)",   border: "1px solid rgba(255,255,255,.05)" }}><div style={{ position: "absolute", inset: 0 }} className={isDoc ? "shade-d-r"  : "shade-c-r"} /></div>
          <div style={{ position: "absolute", width: 60, height: 60, background: face.left,   transform: "rotateY(-90deg) translateZ(30px)",  border: "1px solid rgba(255,255,255,.05)" }}><div style={{ position: "absolute", inset: 0 }} className={isDoc ? "shade-d-l"  : "shade-c-l"} /></div>
          <div style={{ position: "absolute", width: 60, height: 60, background: face.top,    transform: "rotateX(90deg) translateZ(30px)",   border: "1px solid rgba(255,255,255,.05)" }}><div style={{ position: "absolute", inset: 0 }} className={isDoc ? "shade-d-t"  : "shade-c-t"} /></div>
          <div style={{ position: "absolute", width: 60, height: 60, background: face.bottom, transform: "rotateX(-90deg) translateZ(30px)",  border: "1px solid rgba(255,255,255,.05)" }}><div style={{ position: "absolute", inset: 0 }} className={isDoc ? "shade-d-bt" : "shade-c-bt"} /></div>
        </div>
      </div>
      <div style={{ position: "absolute", bottom: -20, left: "50%", transform: "translateX(-50%)", width: 56, height: 7, borderRadius: "50%", filter: "blur(9px)", background: shadowColor, animation: "cube-shadow 6s cubic-bezier(.45,.05,.55,.95) infinite", animationDelay: isDoc ? "-1.8s" : "0s" }} />
      <style>{`
        @keyframes cube-glow-breathe { 0%,100%{opacity:.7;transform:scale(1)} 50%{opacity:1;transform:scale(1.18)} }
        @keyframes cube-particle { 0%{transform:translateY(4px) scale(1);opacity:0} 10%{opacity:1} 90%{opacity:1} 100%{transform:translateY(-38px) scale(.15);opacity:0} }
        @keyframes cube-shadow { 0%{opacity:.55;transform:translateX(-50%) scaleX(.92)} 18%{opacity:.2;transform:translateX(-50%) scaleX(.4)} 35%{opacity:.6;transform:translateX(-50%) scaleX(1)} 52%{opacity:.18;transform:translateX(-50%) scaleX(.38)} 68%{opacity:.62;transform:translateX(-50%) scaleX(1.04)} 83%{opacity:.22;transform:translateX(-50%) scaleX(.44)} 100%{opacity:.55;transform:translateX(-50%) scaleX(.92)} }
        @keyframes cube-spark { 0%,100%{opacity:.65;transform:scale(1) rotate(0deg)} 50%{opacity:1;transform:scale(1.35) rotate(18deg)} }
        @keyframes tumble-c { 0%{transform:rotateX(10deg) rotateY(0deg) rotateZ(0deg)} 14%{transform:rotateX(24deg) rotateY(58deg) rotateZ(6deg)} 28%{transform:rotateX(-10deg) rotateY(115deg) rotateZ(-5deg)} 42%{transform:rotateX(20deg) rotateY(172deg) rotateZ(9deg)} 56%{transform:rotateX(-14deg) rotateY(218deg) rotateZ(-7deg)} 70%{transform:rotateX(22deg) rotateY(272deg) rotateZ(4deg)} 84%{transform:rotateX(-6deg) rotateY(318deg) rotateZ(-3deg)} 100%{transform:rotateX(10deg) rotateY(360deg) rotateZ(0deg)} }
        @keyframes tumble-d { 0%{transform:rotateX(-8deg) rotateY(0deg) rotateZ(0deg)} 16%{transform:rotateX(18deg) rotateY(62deg) rotateZ(-8deg)} 32%{transform:rotateX(-16deg) rotateY(128deg) rotateZ(6deg)} 46%{transform:rotateX(12deg) rotateY(186deg) rotateZ(-5deg)} 60%{transform:rotateX(-20deg) rotateY(244deg) rotateZ(10deg)} 74%{transform:rotateX(14deg) rotateY(300deg) rotateZ(-6deg)} 88%{transform:rotateX(-5deg) rotateY(342deg) rotateZ(3deg)} 100%{transform:rotateX(-8deg) rotateY(360deg) rotateZ(0deg)} }
        .shade-c-r{animation:sc-r 8s cubic-bezier(.37,0,.63,1) infinite} .shade-c-l{animation:sc-l 8s cubic-bezier(.37,0,.63,1) infinite} .shade-c-t{animation:sc-t 8s cubic-bezier(.37,0,.63,1) infinite} .shade-c-b{animation:sc-b 8s cubic-bezier(.37,0,.63,1) infinite} .shade-c-bt{animation:sc-bt 8s cubic-bezier(.37,0,.63,1) infinite}
        .shade-d-r{animation:sc-r 8s cubic-bezier(.37,0,.63,1) infinite;animation-delay:-2s} .shade-d-l{animation:sc-l 8s cubic-bezier(.37,0,.63,1) infinite;animation-delay:-2s} .shade-d-t{animation:sc-t 8s cubic-bezier(.37,0,.63,1) infinite;animation-delay:-2s} .shade-d-b{animation:sc-b 8s cubic-bezier(.37,0,.63,1) infinite;animation-delay:-2s} .shade-d-bt{animation:sc-bt 8s cubic-bezier(.37,0,.63,1) infinite;animation-delay:-2s}
        @keyframes sc-r  {0%{background:rgba(0,0,0,.18)}14%{background:rgba(0,0,0,.02)}28%{background:rgba(0,0,0,.24)}42%{background:rgba(0,0,0,.05)}56%{background:rgba(0,0,0,.28)}70%{background:rgba(0,0,0,.03)}84%{background:rgba(0,0,0,.20)}100%{background:rgba(0,0,0,.18)}}
        @keyframes sc-l  {0%{background:rgba(0,0,0,.08)}14%{background:rgba(0,0,0,.26)}28%{background:rgba(0,0,0,.04)}42%{background:rgba(0,0,0,.22)}56%{background:rgba(0,0,0,.06)}70%{background:rgba(0,0,0,.30)}84%{background:rgba(0,0,0,.05)}100%{background:rgba(0,0,0,.08)}}
        @keyframes sc-t  {0%{background:rgba(0,0,0,.06)}28%{background:rgba(0,0,0,.14)}56%{background:rgba(0,0,0,.04)}84%{background:rgba(0,0,0,.11)}100%{background:rgba(0,0,0,.06)}}
        @keyframes sc-b  {0%{background:rgba(0,0,0,.32)}28%{background:rgba(0,0,0,.22)}56%{background:rgba(0,0,0,.38)}84%{background:rgba(0,0,0,.28)}100%{background:rgba(0,0,0,.32)}}
        @keyframes sc-bt {0%{background:rgba(0,0,0,.40)}28%{background:rgba(0,0,0,.30)}56%{background:rgba(0,0,0,.44)}84%{background:rgba(0,0,0,.34)}100%{background:rgba(0,0,0,.40)}}
      `}</style>
    </div>
  );
}

function EmptyState({ onSuggest, contextSummary, chatMode, kbId }: {
  onSuggest: (text: string) => void;
  contextSummary: ContextSummary | null;
  chatMode: string;
  kbId: string | null;
}) {
  // RAG / document mode — clean doc-focused prompt, no tool suggestions
  if (chatMode === "rag") {
    return (
      <div className="flex flex-col items-center justify-center min-h-full py-16 px-6 gap-6">
        <div className="flex flex-col items-center gap-3">
          <CubeIcon mode="doc" />
          <div className="text-center">
            <h3 className="text-base font-semibold mb-1" style={{ color: "rgb(var(--tx-primary))" }}>
              {kbId ? kbId : "Dokumen"}
            </h3>
            <p className="text-sm leading-relaxed max-w-xs" style={{ color: "rgb(var(--tx-muted))" }}>
              Ajukan pertanyaan tentang isi dokumen yang ada di Knowledge Base ini.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Main chat — finance quick actions
  const fin = contextSummary?.finance;

  const suggestions = [
    {
      icon: <Zap size={14} />,
      text: "Apa yang bisa kamu bantu hari ini?",
      color: "rgb(var(--accent-400))",
    },
    {
      icon: <Wallet size={14} />,
      text: fin
        ? `Saldo saya saat ini Rp ${fin.total_balance.toLocaleString("id-ID")}. Analisis kondisi keuangan saya.`
        : "Bagaimana kondisi keuangan saya bulan ini?",
      color: "#10b981",
    },
    {
      icon: fin ? <TrendingUp size={14} /> : <Sparkles size={14} />,
      text: fin
        ? `Bulan ini pemasukan ${fmtRp(fin.total_income)}, pengeluaran ${fmtRp(fin.total_expense)}. Beri saran penghematan.`
        : "Jelaskan fitur utama aplikasi LOQA Home.",
      color: fin ? "#10b981" : "rgb(var(--accent-400))",
    },
    {
      icon: <Shield size={14} />,
      text: "Bagaimana cara kerja mode lokal dan privasi data saya?",
      color: "rgb(var(--tx-muted))",
    },
  ];

  return (
    <div className="flex flex-col items-center justify-center min-h-full py-16 px-6 gap-10">
      {/* Logo mark */}
      <div className="flex flex-col items-center gap-4">
        <CubeIcon mode="chat" />
        <div className="text-center">
          <h3 className="text-lg font-semibold mb-1" style={{ color: "rgb(var(--tx-primary))" }}>
            Halo, saya LOQA
          </h3>
          <p className="text-sm leading-relaxed max-w-xs" style={{ color: "rgb(var(--tx-muted))" }}>
            Asisten keuangan pribadi. Tanya soal keuangan, dokumen, atau apa pun — semua dari sini.
          </p>
        </div>

        {/* Context badges */}
        {fin && (
          <div className="flex items-center gap-2 flex-wrap justify-center">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium"
              style={{ background: "rgb(16 185 129 / 0.1)", border: "1px solid rgb(16 185 129 / 0.2)", color: "#10b981" }}>
              <Wallet size={10} />
              Saldo {fmtRp(fin.total_balance)}
            </div>
          </div>
        )}
      </div>

      {/* Suggestions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg">
        {suggestions.map((s, i) => (
          <button
            key={i}
            onClick={() => onSuggest(s.text)}
            className="flex items-start gap-2.5 p-3 rounded-xl text-left transition-all duration-150"
            style={{
              background: "rgb(var(--bg-surface))",
              border: "1px solid rgb(var(--border))",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = "rgb(var(--accent-500) / 0.4)";
              (e.currentTarget as HTMLElement).style.background = "rgb(var(--bg-elevated))";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = "rgb(var(--border))";
              (e.currentTarget as HTMLElement).style.background = "rgb(var(--bg-surface))";
            }}
          >
            <span className="shrink-0 mt-0.5" style={{ color: s.color }}>
              {s.icon}
            </span>
            <span className="text-xs leading-snug" style={{ color: "rgb(var(--tx-secondary))" }}>
              {s.text}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
