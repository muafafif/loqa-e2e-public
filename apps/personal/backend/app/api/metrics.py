from fastapi import APIRouter
from app.services.metrics_service import (
    get_session_metrics,
    get_period_metrics,
    get_kb_metrics,
)

router = APIRouter(prefix="/metrics", tags=["metrics"])


@router.get("/session/{session_id}")
def session_metrics(session_id: str):
    return get_session_metrics(session_id)


@router.get("/period/{period}")
def period_metrics(period: str):
    if period not in ("day", "week", "month"):
        return {"error": "period must be day, week, or month"}
    return get_period_metrics(period)


@router.get("/kb")
def kb_metrics():
    return {"knowledge_bases": get_kb_metrics()}
