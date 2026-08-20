from pydantic import BaseModel
from typing import Optional, Literal


class FolderCreate(BaseModel):
    name: str
    color: str = "#6366f1"
    icon: str = "folder"
    parent_id: Optional[int] = None
    sort_order: int = 0


class FolderUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None
    icon: Optional[str] = None
    parent_id: Optional[int] = None
    sort_order: Optional[int] = None


class NoteCreate(BaseModel):
    title: str = "Untitled"
    content: str = ""
    folder_id: Optional[int] = None


class NoteUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    folder_id: Optional[int] = None
    pinned: Optional[bool] = None


class NoteIndexRequest(BaseModel):
    kb_id: str


class NoteAiRequest(BaseModel):
    action: Literal["summarize", "continue", "ask"]
    prompt: Optional[str] = None
    selection: Optional[str] = None
