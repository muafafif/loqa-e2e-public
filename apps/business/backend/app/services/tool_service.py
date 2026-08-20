"""
Tool definitions and dispatcher for agentic chat (unified mode: finance + inventory + project).

All chat goes through the single unified ChatWindow — there are no per-module
chat windows. UNIFIED_TOOLS combines all three groups and the dispatcher
routes by tool name in the order: finance → inventory → project.

Tools follow the OpenAI function-calling JSON schema format, which is also
used by llama_cpp and OpenAI-compatible servers.
"""

import json
from typing import Any

from app.services import finance_service as fs
from app.services import inventory_service as inv
from app.services import order_service as ord_svc
from app.services import project_service as proj

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

# ── Inventory tool schemas ─────────────────────────────────────────────────────

INVENTORY_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "get_inventory_dashboard",
            "description": (
                "Get inventory KPIs: total asset value, trade stock value, "
                "HPP this month, annual COGS, inventory turnover, low stock count, "
                "gross margin. Use for high-level summary questions."
            ),
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_stock_levels",
            "description": (
                "Get current stock quantity and average cost per variant per warehouse. "
                "Always filter by brand_id/category_id/subcategory_id/product_name_search when user asks about specific items. "
                "Returns up to 50 with total_count — tell the user if truncated."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "warehouse_id": {
                        "type": "integer",
                        "description": "Filter to a specific warehouse",
                    },
                    "brand_id": {
                        "type": "integer",
                        "description": "Filter by brand ID",
                    },
                    "category_id": {
                        "type": "integer",
                        "description": "Filter by category ID",
                    },
                    "subcategory_id": {
                        "type": "integer",
                        "description": "Filter by subcategory ID",
                    },
                    "product_name_search": {
                        "type": "string",
                        "description": "Partial product name match (case-insensitive)",
                    },
                    "low_stock_only": {
                        "type": "boolean",
                        "description": "If true, return only items at or below minimum stock",
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_products",
            "description": (
                "List products with variants, SKU, unit, and min stock. "
                "Always use filters when the user mentions a brand, category, subcategory, or product name. "
                "Returns up to 30 with total_count — tell the user if truncated."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "brand_id": {"type": "integer", "description": "Filter by brand ID"},
                    "category_id": {"type": "integer", "description": "Filter by category ID"},
                    "subcategory_id": {"type": "integer", "description": "Filter by subcategory ID"},
                    "name_search": {"type": "string", "description": "Partial product name match (case-insensitive)"},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_brand_report",
            "description": (
                "Per-brand report this month: product count, stock value, HPP (cost of goods sold), "
                "revenue (penjualan), gross margin, and margin percentage. "
                "Use to answer questions about which brand has the highest sales, revenue, or profit."
            ),
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_category_report",
            "description": (
                "Per-category and per-subcategory report this month: product count, stock value, "
                "HPP (cost of goods sold), revenue (penjualan), gross margin, and margin percentage. "
                "Use this to answer questions about which category or subcategory has the highest sales, "
                "revenue, profit margin, or HPP. Sort results by revenue_month DESC to find top sellers."
            ),
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_recent_movements",
            "description": (
                "List recent stock movements (in/out/opname/adjustment) "
                "with product, warehouse, cost, and date. "
                "Use for movement history or stock flow questions."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "limit": {"type": "integer", "description": "Max rows (default 20)"},
                    "type": {
                        "type": "string",
                        "enum": ["in", "out", "opname", "adjustment"],
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_brands",
            "description": (
                "List brands with product count. Supports filtering — always pass filters when the user mentions "
                "a category, subcategory, or partial brand name to avoid fetching all brands. "
                "Returns up to 50 with total_count."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "category_id": {
                        "type": "integer",
                        "description": "Only return brands that have products in this category ID",
                    },
                    "subcategory_id": {
                        "type": "integer",
                        "description": "Only return brands that have products in this subcategory ID",
                    },
                    "name_search": {
                        "type": "string",
                        "description": "Partial name match (case-insensitive)",
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_inventory_categories",
            "description": (
                "List product categories with subcategory count. "
                "Pass name_search when user mentions a category name to avoid fetching all. "
                "Returns up to 50 with total_count."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "name_search": {
                        "type": "string",
                        "description": "Partial name match (case-insensitive)",
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_subcategories",
            "description": (
                "List subcategories. Always filter by category_id when possible. "
                "Use name_search for partial name lookup. Returns up to 50 with total_count."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "category_id": {
                        "type": "integer",
                        "description": "Filter to subcategories under this category ID",
                    },
                    "name_search": {
                        "type": "string",
                        "description": "Partial name match (case-insensitive)",
                    },
                },
                "required": [],
            },
        },
    },
]

# ── Order tool schemas ────────────────────────────────────────────────────────

ORDER_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "get_order_summary",
            "description": (
                "Get order KPIs and trends: total orders, total revenue, average order value, "
                "cancelled orders, monthly revenue trend, top products by revenue, "
                "daily trend for current month, and status breakdown. "
                "Use for sales performance, revenue questions, or order analytics."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "date_from": {
                        "type": "string",
                        "description": "Start date YYYY-MM-DD for KPI period. Omit for last 30 days.",
                    },
                    "date_to": {
                        "type": "string",
                        "description": "End date YYYY-MM-DD for KPI period. Omit for today.",
                    },
                    "months": {
                        "type": "integer",
                        "description": "Number of past months for monthly trend (default 6).",
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_orders",
            "description": (
                "List orders with status, customer, total amount, and date. "
                "Filter by status when user asks about pending, completed, or cancelled orders. "
                "Use q to search by order number or customer name. "
                "Returns up to 20 with total count."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "status": {
                        "type": "string",
                        "enum": ["draft", "waiting_for_payment", "on_process", "completed", "cancelled"],
                        "description": "Filter by order status. Omit to return all.",
                    },
                    "q": {
                        "type": "string",
                        "description": "Search by order number or customer name.",
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Max rows to return (default 20, max 50).",
                    },
                },
                "required": [],
            },
        },
    },
]

# ── Project tool schemas ───────────────────────────────────────────────────────

PROJECT_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "get_project_dashboard",
            "description": (
                "Get project KPIs: total projects, active/completed/on-hold count, "
                "total contract value, total RAB (budget), total worker payments, "
                "and pending invoices. Use for high-level project overview questions."
            ),
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_projects",
            "description": (
                "List projects with status, client, contract value, and dates. "
                "Use when the user asks about specific projects or wants to see a project list. "
                "Filter by status when the user mentions active, completed, or on-hold projects."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "status": {
                        "type": "string",
                        "enum": ["active", "completed", "on_hold"],
                        "description": "Filter by project status. Omit to return all projects.",
                    }
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_project_detail",
            "description": (
                "Get full detail for a single project: budget items (RAB), workers, "
                "worker payments, and invoices. Use when the user asks about a specific project "
                "by name or ID. First call list_projects to find the project_id if needed."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "project_id": {
                        "type": "integer",
                        "description": "The project ID to retrieve details for.",
                    }
                },
                "required": ["project_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_project_invoices",
            "description": (
                "List invoices for a specific project: invoice number, amount, status "
                "(draft/sent/paid/cancelled), issued date, due date, and paid date. "
                "Use for questions about billing, receivables, or invoice status."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "project_id": {
                        "type": "integer",
                        "description": "The project ID to list invoices for.",
                    }
                },
                "required": ["project_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_project_workers",
            "description": (
                "List workers assigned to a project: name, role, rate type, rate amount, "
                "total paid to date, and status. Use for workforce or payment cost questions."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "project_id": {
                        "type": "integer",
                        "description": "The project ID to list workers for.",
                    }
                },
                "required": ["project_id"],
            },
        },
    },
]

# ── Unified tool set (finance + inventory + order + project combined) ─────────

UNIFIED_TOOLS = FINANCE_TOOLS + INVENTORY_TOOLS + ORDER_TOOLS + PROJECT_TOOLS

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
                    try:
                        return _dispatch_inventory(name, args)
                    except KeyError:
                        try:
                            return _dispatch_order(name, args)
                        except KeyError:
                            return _dispatch_project(name, args)
                raise
        else:
            return _dispatch_inventory(name, args)
    except Exception as e:
        return {"error": str(e)}


def _dispatch_finance(name: str, args: dict, pocket_id: int | None) -> Any:
    if name == "get_finance_summary":
        result = fs.get_summary(
            date_from=args.get("date_from"),
            date_to=args.get("date_to"),
            pocket_id=args.get("pocket_id", pocket_id),
        )
        # Drop the verbose by_category list from top-level summary; keep top 10
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
        # Strip heavy fields to keep token count low
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
        rows = fs.list_accounts()
        return rows[:50]

    if name == "list_categories":
        rows = fs.list_categories(type_filter=args.get("type"))
        return rows[:50]

    raise KeyError(f"Unknown finance tool: {name}")


def _dispatch_inventory(name: str, args: dict) -> Any:
    if name == "get_inventory_dashboard":
        dash = inv.get_dashboard()
        # Drop the detailed low_stock_items list (it's large); keep the count
        result = {k: v for k, v in dash.items() if k != "monthly_hpp"}
        return result

    if name == "get_stock_levels":
        LIMIT = 50
        levels = inv.list_stock_levels(
            warehouse_id=args.get("warehouse_id"),
            brand_id=args.get("brand_id"),
            category_id=args.get("category_id"),
            subcategory_id=args.get("subcategory_id"),
            product_name_search=args.get("product_name_search"),
        )
        if args.get("low_stock_only"):
            levels = [s for s in levels if s.get("qty", 0) <= s.get("min_stock", 0)]
        elif not args.get("low_stock_only"):
            levels = [s for s in levels if s.get("qty", 0) > 0]
        total = len(levels)
        sliced = levels[:LIMIT]
        rows = [
            {
                "product": s.get("product_name", ""),
                "variant": s.get("variant_name", ""),
                "warehouse": s.get("warehouse_name", ""),
                "qty": s.get("qty", 0),
                "unit": s.get("unit", ""),
                "min_stock": s.get("min_stock", 0),
                "avg_cost": s.get("avg_cost", 0),
            }
            for s in sliced
        ]
        return {"total_count": total, "showing": len(rows), "items": rows}

    if name == "list_products":
        LIMIT = 30
        products = inv.list_products(
            brand_id=args.get("brand_id"),
            category_id=args.get("category_id"),
            subcategory_id=args.get("subcategory_id"),
            name_search=args.get("name_search"),
            active_only=True,
        )
        total = len(products)
        sliced = products[:LIMIT]
        result = []
        for p in sliced:
            entry = {
                "id": p["id"],
                "name": p["name"],
                "sku": p.get("sku") or "",
                "unit": p.get("unit", "pcs"),
                "min_stock": p.get("min_stock", 0),
                "brand": p.get("brand_name") or "—",
                "category": p.get("category_name") or "—",
                "subcategory": p.get("subcategory_name") or "—",
                # Only first 5 variants — a product with 50 variants is extremely rare
                "variants": [
                    {
                        "name": v["name"],
                        "sku_suffix": v.get("sku_suffix") or "",
                        "selling_price": v.get("selling_price", 0),
                    }
                    for v in p.get("variants", [])[:5]
                ],
            }
            result.append(entry)
        return {"total_count": total, "showing": len(result), "items": result}

    if name == "get_brand_report":
        return inv.get_brand_report()

    if name == "get_category_report":
        return inv.get_category_report()

    if name == "list_recent_movements":
        limit = min(int(args.get("limit", 20)), 50)
        result = inv.list_movements(mv_type=args.get("type"), limit=limit)
        movements = result.get("movements", [])
        return [
            {
                "date": m["date"],
                "type": m["type"],
                "qty": m["qty"],
                "unit": m.get("unit", ""),
                "product": m.get("product_name", ""),
                "variant": m.get("variant_name", ""),
                "warehouse": m.get("warehouse_name", ""),
                "total_cost": m.get("total_cost") or 0,
                "selling_price_total": (
                    (m.get("selling_price") or 0) * m["qty"] if m.get("selling_price") else 0
                ),
            }
            for m in movements
        ]

    if name == "list_brands":
        LIMIT = 50
        brands = inv.list_brands(
            category_id=args.get("category_id"),
            subcategory_id=args.get("subcategory_id"),
            name_search=args.get("name_search"),
        )
        total = len(brands)
        rows = [
            {
                "id": b["id"],
                "name": b["name"],
                "product_count": b.get("product_count", 0),
            }
            for b in brands[:LIMIT]
        ]
        return {"total_count": total, "showing": len(rows), "items": rows}

    if name == "list_inventory_categories":
        LIMIT = 50
        cats = inv.list_categories(name_search=args.get("name_search"))
        total = len(cats)
        rows = [
            {
                "id": c["id"],
                "name": c["name"],
                "subcategory_count": c.get("subcategory_count", 0),
            }
            for c in cats[:LIMIT]
        ]
        return {"total_count": total, "showing": len(rows), "items": rows}

    if name == "list_subcategories":
        LIMIT = 50
        subs = inv.list_subcategories(
            category_id=args.get("category_id"),
            name_search=args.get("name_search"),
        )
        total = len(subs)
        rows = [
            {
                "id": s["id"],
                "name": s["name"],
                "category": s.get("category_name") or "—",
                "product_count": s.get("product_count", 0),
            }
            for s in subs[:LIMIT]
        ]
        return {"total_count": total, "showing": len(rows), "items": rows}

    raise KeyError(f"Unknown inventory tool: {name}")


def _dispatch_order(name: str, args: dict) -> Any:
    if name == "get_order_summary":
        summary = ord_svc.get_order_summary(
            date_from=args.get("date_from"),
            date_to=args.get("date_to"),
            months=min(int(args.get("months", 6)), 24),
        )
        # Truncate top_products and daily to keep token count low
        summary["top_products"] = summary.get("top_products", [])[:10]
        summary["daily"] = summary.get("daily", [])[:31]
        return summary

    if name == "list_orders":
        limit = min(int(args.get("limit", 20)), 50)
        result = ord_svc.list_orders(
            status=args.get("status"),
            q=args.get("q"),
            limit=limit,
        )
        orders = result.get("orders", [])
        return {
            "total": result.get("total", 0),
            "showing": len(orders),
            "orders": [
                {
                    "id": o["id"],
                    "order_number": o["order_number"],
                    "customer_name": o.get("customer_name") or "—",
                    "status": o["status"],
                    "total_amount": o["total_amount"],
                    "date": o["date"],
                    "warehouse": o.get("warehouse_name") or "—",
                }
                for o in orders
            ],
        }

    raise KeyError(f"Unknown order tool: {name}")


def _dispatch_project(name: str, args: dict) -> Any:
    if name == "get_project_dashboard":
        return proj.get_dashboard()

    if name == "list_projects":
        projects = proj.list_projects(status=args.get("status"))
        return [
            {
                "id": p["id"],
                "name": p["name"],
                "client_name": p.get("client_name") or "—",
                "status": p["status"],
                "start_date": p.get("start_date") or "",
                "end_date": p.get("end_date") or "",
                "contract_value": p.get("contract_value") or 0,
            }
            for p in projects
        ]

    if name == "get_project_detail":
        project_id = int(args["project_id"])
        project = proj.get_project(project_id)
        if not project:
            return {"error": f"Project {project_id} not found"}
        budget_items = proj.list_budget_items(project_id)
        workers = proj.list_workers(project_id)
        payments = proj.list_worker_payments(project_id)
        invoices = proj.list_invoices(project_id)

        rab_total = sum(i.get("total_price", 0) for i in budget_items)
        total_paid_workers = sum(p.get("amount", 0) for p in payments)

        budget_by_category: dict[str, float] = {}
        for item in budget_items:
            cat = item.get("category", "Umum")
            budget_by_category[cat] = budget_by_category.get(cat, 0) + item.get("total_price", 0)

        return {
            "id": project["id"],
            "name": project["name"],
            "client_name": project.get("client_name") or "—",
            "status": project["status"],
            "start_date": project.get("start_date") or "",
            "end_date": project.get("end_date") or "",
            "contract_value": project.get("contract_value") or 0,
            "description": project.get("description") or "",
            "rab_total": rab_total,
            "total_paid_workers": total_paid_workers,
            "budget_by_category": budget_by_category,
            "worker_count": len(workers),
            "invoice_count": len(invoices),
            "invoices_paid": sum(i["amount"] for i in invoices if i["status"] == "paid"),
            "invoices_pending": sum(
                i["amount"] for i in invoices if i["status"] in ("draft", "sent")
            ),
        }

    if name == "list_project_invoices":
        project_id = int(args["project_id"])
        invoices = proj.list_invoices(project_id)
        return [
            {
                "id": invoice["id"],
                "invoice_number": invoice["invoice_number"],
                "amount": invoice["amount"],
                "status": invoice["status"],
                "issued_date": invoice["issued_date"],
                "due_date": invoice.get("due_date") or "",
                "paid_date": invoice.get("paid_date") or "",
                "finance_linked": bool(invoice.get("finance_tx_id")),
            }
            for invoice in invoices
        ]

    if name == "list_project_workers":
        project_id = int(args["project_id"])
        workers = proj.list_workers(project_id)
        return [
            {
                "id": w["id"],
                "name": w["name"],
                "role": w.get("role") or "—",
                "rate_type": w["rate_type"],
                "rate_amount": w["rate_amount"],
                "status": w["status"],
                "total_paid": w.get("total_paid") or 0,
            }
            for w in workers
        ]

    raise KeyError(f"Unknown project tool: {name}")
