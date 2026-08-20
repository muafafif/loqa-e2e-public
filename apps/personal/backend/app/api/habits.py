from fastapi import APIRouter, HTTPException
from app.models.habit import HabitCreate, HabitUpdate, CheckInRequest
import app.services.habit_service as hs

router = APIRouter(prefix="/habits", tags=["habits"])


@router.get("")
def list_habits(active_only: bool = False):
    return hs.list_habits(active_only=active_only)


@router.post("", status_code=201)
def create_habit(body: HabitCreate):
    return hs.create_habit(body.model_dump())


@router.get("/today")
def today_status(date: str):
    return hs.get_today_status(date)


@router.get("/{habit_id}")
def get_habit(habit_id: int):
    habit = hs.get_habit(habit_id)
    if not habit:
        raise HTTPException(status_code=404, detail="Habit not found")
    return habit


@router.patch("/{habit_id}")
def update_habit(habit_id: int, body: HabitUpdate):
    habit = hs.update_habit(habit_id, body.model_dump(exclude_unset=True))
    if not habit:
        raise HTTPException(status_code=404, detail="Habit not found")
    return habit


@router.delete("/{habit_id}", status_code=204)
def delete_habit(habit_id: int):
    if not hs.delete_habit(habit_id):
        raise HTTPException(status_code=404, detail="Habit not found")


@router.post("/{habit_id}/checkin")
def check_in(habit_id: int, body: CheckInRequest):
    habit = hs.get_habit(habit_id)
    if not habit:
        raise HTTPException(status_code=404, detail="Habit not found")
    return hs.check_in(habit_id, body.date)


@router.get("/{habit_id}/logs")
def get_logs(habit_id: int, date_from: str, date_to: str):
    habit = hs.get_habit(habit_id)
    if not habit:
        raise HTTPException(status_code=404, detail="Habit not found")
    return hs.get_logs_range(habit_id, date_from, date_to)


@router.get("/{habit_id}/stats")
def get_stats(habit_id: int):
    habit = hs.get_habit(habit_id)
    if not habit:
        raise HTTPException(status_code=404, detail="Habit not found")
    return hs.get_stats(habit_id)
