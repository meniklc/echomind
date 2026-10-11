from typing import List, Literal, Optional

from pydantic import BaseModel, Field, field_validator


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(..., min_length=1, max_length=800)


class ChatRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=1000)
    history: List[ChatMessage] = Field(default_factory=list, max_length=8)
    speak: bool = False

    @field_validator("question")
    @classmethod
    def strip_question(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Question cannot be empty")
        return cleaned


class PortfolioReference(BaseModel):
    type: Literal["profile", "project", "link"]
    label: str
    section: Optional[str] = None
    url: Optional[str] = None
    project_id: Optional[str] = None


class ChatResponse(BaseModel):
    answer: str
    references: List[PortfolioReference] = Field(default_factory=list)
    mode: Literal["llm", "fact_retrieval"]
    status: Literal["ok", "insufficient_info", "error"] = "ok"
