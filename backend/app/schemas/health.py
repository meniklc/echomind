from pydantic import BaseModel


class HealthResponse(BaseModel):
    status: str
    service: str
    version: str
    llm_mode: str
    tts_provider: str
