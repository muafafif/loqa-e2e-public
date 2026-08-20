import json
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict
from typing import List, Optional
from app.services.llm_service import llm_service, _flatten_tool_messages, strip_tool_call_tokens
from app.services.knowledge_service import query_knowledge_base
from app.services.reranker_service import reranker_service
from app.services.settings_service import load_settings
from app.services.metrics_service import record_message
from app.services import conversation_service as cs
from app.services import lock_service as ls
from app.services import finance_service as fs
from app.services.tool_service import UNIFIED_TOOLS, dispatch_tool

router = APIRouter(prefix="/chat", tags=["chat"])


class Message(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    model_config = ConfigDict(protected_namespaces=())
    messages: List[Message]
    kb_id: Optional[str] = None
    use_rag: bool = True
    session_id: str = "default"
    conv_id: Optional[str] = None
    chat_mode: str = "rag"
    pocket_id: Optional[int] = None


async def generate_stream(request: ChatRequest):
    app_settings = load_settings()

    # Determine the new user message (last user message in request)
    user_message = next(
        (m.content for m in reversed(request.messages) if m.role == "user"), ""
    )

    # Create or continue conversation
    conv_id = request.conv_id
    is_new_conv = conv_id is None

    # Determine if this conversation is locked and get session key
    session_key = ls.get_key()
    if conv_id:
        conv_meta = cs.get_conversation(conv_id)
        is_conv_locked = bool(conv_meta and conv_meta.get("locked"))
        if is_conv_locked and session_key is None:
            yield f"data: {json.dumps({'type': 'error', 'message': 'Percakapan terkunci — masukkan PIN terlebih dahulu'})}\n\n"
            return
        msg_key = session_key if is_conv_locked else None
    else:
        msg_key = None

    if is_new_conv and user_message:
        conv = cs.create_conversation(
            user_message,
            kb_id=request.kb_id,
            chat_mode=request.chat_mode,
            pocket_id=request.pocket_id,
        )
        conv_id = conv["id"]
        yield f"data: {json.dumps({'type': 'conv_created', 'conv_id': conv_id, 'title': conv['title']})}\n\n"

    # Save the user message to DB
    user_msg_id = None
    if conv_id and user_message:
        user_msg_id = cs.add_message(conv_id, "user", user_message, key=msg_key)
    if session_key:
        ls.touch()

    # Build messages for LLM: if conv_id exists, load history from DB
    conv_meta: Optional[dict] = None
    if conv_id and not is_new_conv:
        context_msgs, needs_summary = cs.get_context_messages(
            conv_id, app_settings.chat.max_tokens, key=msg_key
        )
        conv_meta = cs.get_conversation(conv_id)
        summary = conv_meta["summary"] if conv_meta else None

        # Build message list from DB history
        llm_messages: List[dict] = []

        if needs_summary and summary:
            llm_messages.append({
                "role": "user",
                "content": f"[Summary of earlier conversation]\n{summary}",
            })
            llm_messages.append({"role": "assistant", "content": "Understood."})
        elif needs_summary:
            # Signal frontend to generate summary (we'll request it inline)
            yield f"data: {json.dumps({'type': 'needs_summary'})}\n\n"

        for m in context_msgs:
            llm_messages.append({"role": m["role"], "content": m["content"]})
    else:
        llm_messages = [m.model_dump() for m in request.messages]

    rag_used = False
    citations: List[dict] = []

    # Resolve effective persona: per-conversation persona_prompt > global system_prompt
    persona_prompt = (conv_meta or {}).get("persona_prompt") or app_settings.chat.system_prompt

    # Inject system prompt for unified mode (finance + inventory + order + project)
    if request.chat_mode == "unified":
        unified_system = {
            "role": "system",
            "content": (
                f"{persona_prompt}\n\n"
                "You are LOQA Work, an all-in-one business assistant with access to live data tools "
                "spanning finance, inventory, orders, and projects.\n\n"
                "AVAILABLE TOOL GROUPS:\n"
                "- Finance: get_finance_summary, list_transactions, get_monthly_report, "
                "get_pl_report, list_accounts, list_categories\n"
                "- Inventory: get_inventory_dashboard, get_stock_levels, list_products, "
                "get_brand_report, get_category_report, list_recent_movements, "
                "list_brands, list_inventory_categories, list_subcategories\n"
                "- Order: get_order_summary, list_orders\n"
                "- Project: get_project_dashboard, list_projects, get_project_detail, "
                "list_project_invoices, list_project_workers\n\n"
                "## CRITICAL RULES\n"
                "- NEVER write phrases like 'Saya akan memanggil tool...', 'Menunggu hasil...', "
                "'Karena saya tidak bisa menjalankan tool...', or any narration about tool calls.\n"
                "- NEVER assume or fabricate tool results. If a tool has not been called yet, call it — do not guess.\n"
                "- NEVER explain what you are about to do. Just do it (call the tool), then respond.\n\n"
                "## PHASE 1 — DATA RETRIEVAL\n"
                "For ANY question about business data, call the most relevant tool immediately.\n"
                "Tool selection guide:\n"
                "- Finance totals/balance/transactions → get_finance_summary, list_transactions, get_monthly_report\n"
                "- Inventory overview/low stock → get_inventory_dashboard\n"
                "- Sales/revenue/penjualan per category or subcategory → get_category_report\n"
                "- Sales/revenue/penjualan per brand → get_brand_report\n"
                "- Stock levels per product → get_stock_levels\n"
                "- Recent stock movements → list_recent_movements\n"
                "- Order KPIs and top products → get_order_summary\n"
                "- Project overview → get_project_dashboard, list_projects\n"
                "- For general or advice questions with no clear domain, call get_finance_summary first.\n\n"
                "## PHASE 2 — RESPONSE\n"
                "After tools return data, determine the response type from the question:\n\n"
                "TYPE A — Query only (e.g. 'tampilkan', 'berapa', 'daftar', 'cek'):\n"
                "  → Present the data clearly. Format numbers (e.g. Rp 1.500.000). Keep it concise.\n\n"
                "TYPE B — Advice only (e.g. 'beri saran', 'apa yang harus', 'bagaimana cara meningkatkan'):\n"
                "  → Use data as evidence. Structure: Temuan → Analisis → Rekomendasi.\n"
                "  → Each recommendation must cite a specific number from the data.\n"
                "  → Give 2–4 concrete, actionable recommendations. No generic advice.\n\n"
                "TYPE C — Query + Advice (both in one message):\n"
                "  → FIRST present the data summary (like Type A).\n"
                "  → THEN add a '### Analisis & Rekomendasi' section (like Type B).\n"
                "  → The recommendations must directly reference the data you just showed.\n\n"
                "Always use the user's language (Indonesian if they write in Indonesian).\n"
                "Never fabricate numbers — only use data returned by tools."
            ),
        }
        llm_messages = [unified_system] + [m for m in llm_messages if m.get("role") != "system"]

    if request.use_rag and request.kb_id:
        user_query = user_message or next(
            (m["content"] for m in reversed(llm_messages) if m["role"] == "user"), None
        )
        if user_query:
            fetch_n = app_settings.reranker.initial_fetch if app_settings.reranker.enabled else 5
            docs = query_knowledge_base(request.kb_id, user_query, n_results=fetch_n)

            if docs:
                if app_settings.reranker.enabled and app_settings.reranker.model_name:
                    try:
                        docs = reranker_service.rerank(
                            user_query, docs,
                            app_settings.reranker.model_name,
                            top_k=app_settings.reranker.top_k,
                            provider=app_settings.reranker.provider,
                            api_key=app_settings.reranker.api_key,
                            endpoint=getattr(app_settings.reranker, "endpoint", None),
                        )
                    except Exception:
                        pass

                rag_used = True

                for i, d in enumerate(docs):
                    meta = d["metadata"]
                    page = meta.get("page")
                    citations.append({
                        "index": i + 1,
                        "source": meta.get("source", "unknown"),
                        "page": page if page and page != -1 else None,
                        "chunk_index": meta.get("chunk_index"),
                        "score": round(d.get("rerank_score", d["score"]), 3),
                        "excerpt": d["content"][:200].strip(),
                    })

                context_parts = []
                for c in citations:
                    page_str = f" (page {c['page']})" if c["page"] else ""
                    context_parts.append(
                        f"[{c['index']}] Source: {c['source']}{page_str}\n{docs[c['index']-1]['content']}"
                    )
                context = "\n\n---\n\n".join(context_parts)

                system_msg = {
                    "role": "system",
                    "content": (
                        f"{persona_prompt}\n\n"
                        f"Use the following documents to answer. "
                        f"Cite sources using [1], [2], etc. markers in your answer.\n\n"
                        f"{context}"
                    ),
                }
                llm_messages = [system_msg] + [m for m in llm_messages if m.get("role") != "system"]

                yield f"data: {json.dumps({'type': 'citations', 'citations': citations})}\n\n"

    # Metrics: user message
    record_message(
        session_id=request.session_id,
        role="user",
        provider=app_settings.chat.provider,
        model_name=app_settings.chat.model_name,
        input_tokens=len(user_message) // 4,
        output_tokens=0,
        latency_ms=0,
        kb_id=request.kb_id,
        rag_used=rag_used,
    )

    # Run tool loop for unified mode
    tool_enhanced_messages = list(llm_messages)
    active_mode = request.chat_mode
    context_already_injected = False
    tool_loop_called_tool = False
    if active_mode == "unified" and app_settings.chat.supports_tools:
        try:
            async for item in _run_tool_loop(
                tool_enhanced_messages,
                UNIFIED_TOOLS,
                app_settings.chat,
                request.pocket_id,
                active_mode,
            ):
                if isinstance(item, list):
                    tool_enhanced_messages = item
                    tool_loop_called_tool = any(m.get("role") == "tool" for m in item)
                else:
                    yield item
        except NotImplementedError:
            yield f"data: {json.dumps({'type': 'action', 'action': 'context_injection', 'label': 'Context Injection', 'detail': 'Model does not support tool calling — full data snapshot injected as system context'})}\n\n"
            tool_enhanced_messages = _inject_context(llm_messages, _build_unified_context(request.pocket_id))
            context_already_injected = True
        except Exception:
            pass

    # When the model skips tool calling on a follow-up turn, silently inject a
    # compact context snapshot so it still has live data to answer from.
    if (
        active_mode == "unified"
        and app_settings.chat.supports_tools
        and not tool_loop_called_tool
        and not context_already_injected
    ):
        tool_enhanced_messages = _inject_context(list(llm_messages), _build_unified_context(request.pocket_id))

    # For local models, flatten tool_calls messages into plain text so the model
    # doesn't re-render <|tool_call> tokens in the final response.
    from app.models.settings import ChatProvider
    if app_settings.chat.provider == ChatProvider.LOCAL and active_mode == "unified" and app_settings.chat.supports_tools:
        tool_enhanced_messages = _flatten_tool_messages(tool_enhanced_messages)

    # Stream assistant response
    assistant_content = []
    asst_msg_id = cs.add_message(conv_id, "assistant", "", key=msg_key) if conv_id else None

    # Buffers for <think> detection (character-level) and cross-chunk strip buffer
    think_buf = ""
    in_think = False
    # strip_buf holds chars that might be the start of a multi-char token pattern;
    # flushed once we know they're safe or the stream ends.
    strip_buf = ""
    # Max lookahead: longest opener in strip patterns (e.g. "<｜tool▁call▁begin｜>" = 21 chars)
    STRIP_LOOKAHEAD = 25

    yield f"data: {json.dumps({'type': 'status', 'status': 'generating'})}\n\n"

    try:
        async for item in llm_service.stream_chat(tool_enhanced_messages, app_settings.chat):
            if isinstance(item, dict) and item.get("__metrics__"):
                record_message(
                    session_id=request.session_id,
                    role="assistant",
                    provider=app_settings.chat.provider,
                    model_name=app_settings.chat.model_name,
                    input_tokens=item["input_tokens"],
                    output_tokens=item["output_tokens"],
                    latency_ms=item["latency_ms"],
                    kb_id=request.kb_id,
                    rag_used=rag_used,
                )
                yield f"data: {json.dumps({'type': 'metrics', 'input_tokens': item['input_tokens'], 'output_tokens': item['output_tokens'], 'latency_ms': item['latency_ms']})}\n\n"
                continue

            # ── Stream filter ─────────────────────────────────────────────────
            # Pass 1: character loop to detect/capture <think>…</think> and emit
            #         thinking events; everything else goes into `pass1_out`.
            chunk = item
            pass1_out = ""
            for ch in chunk:
                if in_think:
                    think_buf += ch
                    if think_buf.endswith("</think>"):
                        thought = think_buf[: -len("</think>")]
                        yield f"data: {json.dumps({'type': 'thinking', 'content': thought})}\n\n"
                        think_buf = ""
                        in_think = False
                else:
                    # Look for <think> opener
                    if ch == "<" and not in_think:
                        # Could be start of <think>; buffer it
                        think_buf += ch
                    elif think_buf:
                        think_buf += ch
                        if "<think>" == think_buf:
                            think_buf = ""
                            in_think = True
                            yield f"data: {json.dumps({'type': 'status', 'status': 'thinking'})}\n\n"
                        elif not "<think>".startswith(think_buf):
                            # Not a <think> tag — flush buffer as normal output
                            pass1_out += think_buf
                            think_buf = ""
                    else:
                        pass1_out += ch

            # Pass 2: run strip_tool_call_tokens on (strip_buf + pass1_out).
            # Keep a STRIP_LOOKAHEAD-char tail in strip_buf in case a token
            # opener is split across chunks.
            combined = strip_buf + pass1_out
            cleaned = strip_tool_call_tokens(combined)
            if len(cleaned) > STRIP_LOOKAHEAD:
                safe = cleaned[:-STRIP_LOOKAHEAD]
                strip_buf = cleaned[-STRIP_LOOKAHEAD:]
            else:
                safe = ""
                strip_buf = cleaned

            if safe:
                assistant_content.append(safe)
                yield f"data: {json.dumps({'type': 'token', 'content': safe})}\n\n"

        # Flush remaining buffers at end of stream
        # think_buf: incomplete <think> opener — treat as literal text
        remaining = strip_tool_call_tokens(think_buf + strip_buf)
        if remaining:
            assistant_content.append(remaining)
            yield f"data: {json.dumps({'type': 'token', 'content': remaining})}\n\n"
    except Exception as e:
        error_msg = _format_model_error(e, app_settings.chat.provider, app_settings.chat.model_name)
        # Mark both the user message and assistant placeholder as failed
        if user_msg_id:
            cs.mark_failed(user_msg_id)
        if asst_msg_id:
            cs.update_message(asst_msg_id, error_msg, failed=True, key=msg_key)
        yield f"data: {json.dumps({'type': 'error', 'message': error_msg})}\n\n"
        yield f"data: {json.dumps({'type': 'done', 'conv_id': conv_id})}\n\n"
        return

    # Save completed assistant message
    if asst_msg_id and assistant_content:
        full_content = "".join(assistant_content)
        cs.update_message(asst_msg_id, full_content, citations if citations else None, key=msg_key)

    yield f"data: {json.dumps({'type': 'done', 'conv_id': conv_id})}\n\n"


async def _run_tool_loop(
    messages: list[dict],
    tools: list[dict],
    config,
    pocket_id: Optional[int],
    mode: str = "finance",
):
    """
    Async generator: runs tool-calling loop, yields SSE strings for tool_call events,
    then yields the updated message list as the final item.
    Raises NotImplementedError if provider doesn't support tools.
    """
    MAX_ROUNDS = 5
    msgs = list(messages)

    # When history already has tool messages from a prior turn, the model has
    # seen tool-call patterns and knows when to call again. Don't force it on
    # round 0 — that causes it to call redundant tools on follow-up questions.
    has_prior_tool_history = any(m.get("role") == "tool" for m in msgs)
    tool_was_called = False

    for round_idx in range(MAX_ROUNDS):
        force = (round_idx == 0) and not has_prior_tool_history
        try:
            result = await llm_service.complete_with_tools(msgs, config, tools, force_tool=force)
        except Exception as exc:
            if round_idx == 0:
                raise NotImplementedError(str(exc)) from exc
            break

        if result["finish_reason"] != "tool_calls" or not result.get("tool_calls"):
            # Model chose not to call a tool.
            # If no tool was called in this turn AND there is no prior history,
            # fall back to context injection so the model still has live data.
            if round_idx == 0 and not has_prior_tool_history and not tool_was_called:
                raise NotImplementedError("Model did not invoke any tools — falling back to context injection")
            break

        tool_was_called = True

        msgs.append({
            "role": "assistant",
            "content": result.get("content"),
            "tool_calls": result["tool_calls"],
        })

        for tc in result["tool_calls"]:
            tool_name = tc["function"]["name"]
            try:
                args = json.loads(tc["function"]["arguments"])
            except Exception:
                args = {}

            yield f"data: {json.dumps({'type': 'action', 'action': 'tool_call', 'label': tool_name, 'detail': json.dumps(args, ensure_ascii=False)})}\n\n"

            try:
                tool_result = dispatch_tool(tool_name, args, mode, pocket_id)
                result_str = json.dumps(tool_result, ensure_ascii=False, default=str)
                result_preview = result_str[:500] + ("…" if len(result_str) > 500 else "")
                yield f"data: {json.dumps({'type': 'action', 'action': 'tool_result', 'label': tool_name, 'detail': result_preview})}\n\n"
            except Exception as exc:
                error_str = str(exc)[:200]
                yield f"data: {json.dumps({'type': 'action', 'action': 'tool_error', 'label': tool_name, 'detail': error_str})}\n\n"
                tool_result = {"error": error_str}

            msgs.append({
                "role": "tool",
                "tool_call_id": tc["id"],
                "content": json.dumps(tool_result, ensure_ascii=False, default=str),
            })

    yield msgs


def _inject_context(messages: list[dict], context: str) -> list[dict]:
    result = []
    injected = False
    for m in messages:
        if m.get("role") == "system" and not injected:
            result.append({"role": "system", "content": m["content"] + "\n\n" + context})
            injected = True
        else:
            result.append(m)
    return result


def _build_finance_context(pocket_id: Optional[int]) -> str:
    """Build a plain-text finance summary to inject as system context."""
    try:
        summary = fs.get_summary(pocket_id=pocket_id)
        accounts = fs.list_accounts()
        pockets = fs.list_pockets()

        lines = []

        if pocket_id is not None:
            pocket = fs.get_pocket(pocket_id)
            pocket_name = pocket["name"] if pocket else f"Pocket #{pocket_id}"
            lines.append(f"## Pocket: {pocket_name}")
        else:
            lines.append("## All Pockets / Global View")

        lines.append(f"\n### Financial Summary (All Time)")
        lines.append(f"- Total Income:  {summary['total_income']:,.0f}")
        lines.append(f"- Total Expense: {summary['total_expense']:,.0f}")
        lines.append(f"- Net:           {summary['net']:,.0f}")
        lines.append(f"- Total Balance: {summary['total_balance']:,.0f}")
        lines.append(f"- Transactions:  {summary['tx_count']}")

        if accounts:
            lines.append(f"\n### Accounts ({len(accounts)})")
            for a in accounts:
                lines.append(f"- {a['name']} ({a['type']}, {a['currency']}): {a['balance']:,.0f}")

        if pockets:
            lines.append(f"\n### Pockets ({len(pockets)})")
            for p in pockets:
                lines.append(f"- {p['name']}" + (" [locked]" if p['locked'] else ""))

        if summary.get("by_category"):
            lines.append(f"\n### Spending by Category")
            for cat in summary["by_category"][:10]:
                name = cat["name"] or "Uncategorized"
                lines.append(f"- {name} ({cat['type']}): {cat['total']:,.0f} ({cat['count']} tx)")

        # Recent transactions
        recent = fs.list_transactions(pocket_id=pocket_id, limit=20)
        if recent:
            lines.append(f"\n### Recent Transactions (up to 20)")
            for tx in recent:
                cat = tx.get("category_name") or "-"
                lines.append(f"- [{tx['date']}] {tx['type']:8} {tx['amount']:>12,.0f}  {cat}  {tx.get('description') or ''}")

        return "\n".join(lines)
    except Exception:
        return "## Finance data not available"


def _build_project_context() -> str:
    """Build a plain-text project summary to inject as system context."""
    try:
        from app.services import project_service as proj
        dash = proj.get_dashboard()
        projects = proj.list_projects()

        lines = ["## Project Snapshot"]
        lines.append(f"- Total projects: {dash.get('total_projects', 0)}")
        lines.append(f"- Active: {dash.get('active_projects', 0)}")
        lines.append(f"- Completed: {dash.get('completed_projects', 0)}")
        lines.append(f"- On hold: {dash.get('on_hold_projects', 0)}")
        lines.append(f"- Total contract value: {dash.get('total_contract_value', 0):,.0f}")
        lines.append(f"- Total RAB (budget): {dash.get('total_rab', 0):,.0f}")
        lines.append(f"- Total paid to workers: {dash.get('total_paid_workers', 0):,.0f}")
        lines.append(f"- Pending invoices: {dash.get('invoices_pending_count', 0)} "
                     f"(Rp {dash.get('invoices_pending_value', 0):,.0f})")

        if projects:
            lines.append(f"\n### Projects ({len(projects)})")
            for p in projects[:20]:
                contract = f"Rp {p.get('contract_value', 0):,.0f}" if p.get("contract_value") else "—"
                lines.append(
                    f"- [{p['id']}] {p['name']} | {p['status']} | "
                    f"client: {p.get('client_name') or '—'} | contract: {contract}"
                )

        return "\n".join(lines)
    except Exception:
        return "## Project data not available"


def _build_unified_context(pocket_id: Optional[int]) -> str:
    """Build a combined finance + inventory + project context snapshot for models without tool calling."""
    parts = [_build_finance_context(pocket_id)]
    try:
        from app.services import inventory_service as inv
        dash = inv.get_dashboard()
        lines = ["\n## Inventory Snapshot"]
        lines.append(f"- Total asset value: {dash.get('total_asset_value', 0):,.0f}")
        lines.append(f"- Low stock items: {dash.get('low_stock_count', 0)}")
        lines.append(f"- HPP this month: {dash.get('hpp_this_month', 0):,.0f}")
        parts.append("\n".join(lines))
    except Exception:
        pass
    try:
        from app.services import order_service as ord_svc
        summary = ord_svc.get_order_summary(months=3)
        kpi = summary.get("kpi", {})
        lines = ["\n## Order Snapshot (last 30 days)"]
        lines.append(f"- Total orders: {kpi.get('total_orders', 0)}")
        lines.append(f"- Total revenue: {kpi.get('total_revenue', 0):,.0f}")
        lines.append(f"- Avg order value: {kpi.get('avg_order_value', 0):,.0f}")
        lines.append(f"- Cancelled: {kpi.get('cancelled_orders', 0)}")
        parts.append("\n".join(lines))
    except Exception:
        pass
    try:
        parts.append(_build_project_context())
    except Exception:
        pass
    return "\n\n".join(parts)


def _format_model_error(exc: Exception, provider: str, model_name: str) -> str:
    err = str(exc)
    if "FileNotFoundError" in type(exc).__name__ or "not found" in err.lower():
        return f"⚠️ Model '{model_name}' tidak ditemukan. Pastikan model sudah diunduh di Model Manager."
    if "Connection" in err or "connect" in err.lower() or "refused" in err.lower():
        return f"⚠️ Tidak dapat terhubung ke model ({provider}). Periksa konfigurasi di Settings."
    if "API" in err or "key" in err.lower() or "auth" in err.lower() or "401" in err:
        return f"⚠️ API key tidak valid atau kedaluwarsa ({provider}). Perbarui di Settings → Chat Model."
    if "quota" in err.lower() or "429" in err or "rate" in err.lower():
        return f"⚠️ Batas kuota tercapai ({provider}). Coba lagi nanti."
    return f"⚠️ Model gagal merespons: {err[:200]}"


@router.post("/stream")
async def chat_stream(request: ChatRequest):
    return StreamingResponse(
        generate_stream(request),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/context-summary")
async def context_summary():
    """
    Returns a lightweight snapshot of all modules for the unified chat empty-state.
    Used by the frontend to render context-aware quick actions.
    """
    result: dict = {}

    # Finance snapshot
    try:
        summary = fs.get_summary()
        result["finance"] = {
            "total_income": summary.get("total_income", 0),
            "total_expense": summary.get("total_expense", 0),
            "net": summary.get("net", 0),
            "total_balance": summary.get("total_balance", 0),
            "tx_count": summary.get("tx_count", 0),
        }
    except Exception:
        result["finance"] = None

    # Inventory snapshot
    try:
        from app.services import inventory_service as inv
        dash = inv.get_dashboard()
        result["inventory"] = {
            "total_asset_value": dash.get("total_asset_value", 0),
            "low_stock_count": dash.get("low_stock_count", 0),
            "hpp_this_month": dash.get("hpp_this_month", 0),
        }
    except Exception:
        result["inventory"] = None

    return result


@router.post("/summarize")
async def summarize_conversation(body: dict):
    """Generate and persist a summary for older messages in a conversation."""
    conv_id = body.get("conv_id")
    messages_to_summarize = body.get("messages", [])
    if not conv_id or not messages_to_summarize:
        return {"ok": False}

    app_settings = load_settings()
    prompt_parts = []
    for m in messages_to_summarize:
        role_label = "User" if m["role"] == "user" else "Assistant"
        prompt_parts.append(f"{role_label}: {m['content']}")
    conversation_text = "\n\n".join(prompt_parts)

    summarize_messages = [
        {
            "role": "user",
            "content": (
                "Please provide a concise summary of the following conversation. "
                "Focus on key topics discussed and important conclusions.\n\n"
                + conversation_text
            ),
        }
    ]

    summary_parts = []
    async for item in llm_service.stream_chat(summarize_messages, app_settings.chat):
        if isinstance(item, str):
            summary_parts.append(item)

    summary = "".join(summary_parts).strip()
    if summary:
        cs.update_summary(conv_id, summary)

    return {"ok": True, "summary": summary}
