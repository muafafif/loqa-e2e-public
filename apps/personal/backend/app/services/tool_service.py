"""
Tool definitions and dispatcher for agentic chat (unified mode: finance + habit).

All chat goes through the single unified ChatWindow — there are no per-module
chat windows. UNIFIED_TOOLS combines both groups and the dispatcher routes by
tool name in the order: finance → habit.

Tools follow the OpenAI function-calling JSON schema format, which is also
used by llama_cpp and OpenAI-compatible servers.
"""

from typing import Any

from app.services import finance_service as fs
from app.services import habit_service as hab

# ── Finance tool schemas ───────────────────────────────────────────────────────

FINANCE_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "get_finance_summary",
            "description": (
                "Get KPI summary: total income, total expense, net balance, "
                "transaction count, and breakdown by category. "
                "Use this to answer questions about overall financial performance, "
                "totals, or balance for a given period."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "date_from": {
                        "type": "string",
                        "description": "Start date in YYYY-MM-DD format. Omit for all-time.",
                    },
                    "date_to": {
                        "type": "string",
                        "description": "End date in YYYY-MM-DD format. Omit for all-time.",
                    },
                    "pocket_id": {
                        "type": "integer",
                        "description": "Filter to a specific pocket ID. Omit for all pockets.",
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_transactions",
            "description": (
                "List recent transactions with optional filters. "
                "Use to answer questions about specific transactions, "
                "spending in a category, or recent activity."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "date_from": {"type": "string", "description": "Start date YYYY-MM-DD"},
                    "date_to": {"type": "string", "description": "End date YYYY-MM-DD"},
                    "type": {
                        "type": "string",
                        "enum": ["income", "expense", "transfer"],
                        "description": "Transaction type filter",
                    },
                    "category_id": {"type": "integer", "description": "Filter by category ID"},
                    "limit": {
                        "type": "integer",
                        "description": "Max rows to return (default 20, max 50)",
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_monthly_report",
            "description": (
                "Get monthly income and expense totals as a trend. "
                "Use for trend analysis, monthly comparisons, or cash flow questions."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "months": {
                        "type": "integer",
                        "description": "Number of past months to include (default 12)",
                    }
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_pl_report",
            "description": (
                "Get the Profit & Loss statement: gross income (Pendapatan Kotor), "
                "COGS (HPP), gross profit, operating expenses (Beban Operasional), "
                "net profit per month. Use for profitability analysis."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "months": {
                        "type": "integer",
                        "description": "Number of past months (default 12)",
                    }
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_accounts",
            "description": (
                "List all accounts with their current balances, type, and currency. "
                "Use for questions about account balances, types, or total assets."
            ),
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_categories",
            "description": (
                "List income or expense categories. "
                "Use when the user asks about categories or you need a category ID for another query."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "type": {
                        "type": "string",
                        "enum": ["income", "expense", "transfer"],
                        "description": "Filter by category type",
                    }
                },
                "required": [],
            },
        },
    },
]

# ── Habit tool schemas ─────────────────────────────────────────────────────────

HABIT_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "get_today_habit_status",
            "description": (
                "Get all active habits with today's check-in status. "
                "Use when the user asks what habits they have today, "
                "which habits are done, or what's left to check in."
            ),
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_habits",
            "description": (
                "List all habits (active and inactive) with their name, icon, "
                "frequency, and status. Use to answer questions about all habits "
                "or to find a habit_id for a follow-up query."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "active_only": {
                        "type": "boolean",
                        "description": "If true, return only active habits (default false).",
                    }
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_habit_stats",
            "description": (
                "Get detailed stats for a single habit: current streak, longest streak, "
                "total check-ins, completion rate for last 7 and 30 days, and 84-day heatmap. "
                "Use when the user asks about progress, streaks, or consistency for a specific habit. "
                "Call list_habits first to find the habit_id if needed."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "habit_id": {
                        "type": "integer",
                        "description": "The habit ID to retrieve stats for.",
                    }
                },
                "required": ["habit_id"],
            },
        },
    },
]

# ── Unified tool set (finance + habit combined) ────────────────────────────────

UNIFIED_TOOLS = FINANCE_TOOLS + HABIT_TOOLS

# ── Dispatcher ─────────────────────────────────────────────────────────────────


def dispatch_tool(name: str, args: dict, mode: str, pocket_id: int | None) -> Any:
    """
    Execute a tool by name and return a JSON-serializable result.
    Raises KeyError for unknown tool names.
    """
    try:
        if mode in ("finance", "unified"):
            try:
                return _dispatch_finance(name, args, pocket_id)
            except KeyError:
                if mode == "unified":
                    return _dispatch_habit(name, args)
                raise
        else:
            return _dispatch_habit(name, args)
    except Exception as e:
        return {"error": str(e)}


def _dispatch_finance(name: str, args: dict, pocket_id: int | None) -> Any:
    if name == "get_finance_summary":
        result = fs.get_summary(
            date_from=args.get("date_from"),
            date_to=args.get("date_to"),
            pocket_id=args.get("pocket_id", pocket_id),
        )
        if result.get("by_category"):
            result = dict(result)
            result["by_category"] = result["by_category"][:10]
        return result

    if name == "list_transactions":
        rows = fs.list_transactions(
            tx_type=args.get("type"),
            date_from=args.get("date_from"),
            date_to=args.get("date_to"),
            category_id=args.get("category_id"),
            pocket_id=pocket_id,
            limit=min(int(args.get("limit", 20)), 50),
        )
        return [
            {
                "id": r["id"],
                "date": r["date"],
                "type": r["type"],
                "amount": r["amount"],
                "category": r.get("category_name") or "—",
                "account": r.get("account_name") or "—",
                "description": r.get("description") or "",
            }
            for r in rows
        ]

    if name == "get_monthly_report":
        return fs.get_monthly(months=min(int(args.get("months", 12)), 24))

    if name == "get_pl_report":
        return fs.get_pl_report(months=min(int(args.get("months", 12)), 24))

    if name == "list_accounts":
        return fs.list_accounts()[:50]

    if name == "list_categories":
        return fs.list_categories(type_filter=args.get("type"))[:50]

    raise KeyError(f"Unknown finance tool: {name}")


def _dispatch_habit(name: str, args: dict) -> Any:
    if name == "get_today_habit_status":
        from datetime import date
        today = date.today().isoformat()
        habits = hab.get_today_status(today)
        return [
            {
                "id": h["id"],
                "name": h["name"],
                "icon": h.get("icon") or "",
                "frequency": h.get("frequency", "daily"),
                "checked_today": h.get("checked_today", False),
            }
            for h in habits
        ]

    if name == "list_habits":
        habits = hab.list_habits(active_only=bool(args.get("active_only", False)))
        return [
            {
                "id": h["id"],
                "name": h["name"],
                "icon": h.get("icon") or "",
                "frequency": h.get("frequency", "daily"),
                "active": h.get("active", True),
                "description": h.get("description") or "",
            }
            for h in habits
        ]

    if name == "get_habit_stats":
        habit_id = int(args["habit_id"])
        stats = hab.get_stats(habit_id)
        # Omit heatmap detail to keep token count low
        return {
            "habit_id": habit_id,
            "total_checkins": stats.get("total", 0),
            "current_streak": stats.get("current_streak", 0),
            "longest_streak": stats.get("longest_streak", 0),
            "rate_7_days": stats.get("rate_7", 0),
            "rate_30_days": stats.get("rate_30", 0),
        }

    raise KeyError(f"Unknown habit tool: {name}")
