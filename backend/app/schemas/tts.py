from pydantic import BaseModel, Field, field_validator


class TTSRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=1200)
    voice: str | None = Field(default=None, max_length=80)

    @field_validator("text")
    @classmethod
    def strip_text(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Text cannot be empty")
        return cleaned
