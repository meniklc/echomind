from pydantic import BaseModel


class HealthResponse(BaseModel):
    status: str
    service: str
    version: str
    llm_mode: str
    tts_provider: str
    llm_model: str | None = None
    tts_voice: str | None = None
