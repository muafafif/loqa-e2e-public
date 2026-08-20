from pydantic import BaseModel
from typing import Optional


class HabitCreate(BaseModel):
    name: str
    description: Optional[str] = None
    icon: str = "⭐"
    color: str = "#0284c7"
    frequency: list[int] = [0, 1, 2, 3, 4, 5, 6]  # 0=Sun … 6=Sat
    reminder_time: Optional[str] = None  # "HH:MM" or None


class HabitUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None
    frequency: Optional[list[int]] = None
    reminder_time: Optional[str] = None
    active: Optional[int] = None


class CheckInRequest(BaseModel):
    date: str  # YYYY-MM-DD
