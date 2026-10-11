"""Chat orchestration: retrieve facts → generate answer → attach references."""

from __future__ import annotations

import logging
from typing import List

from app.core.config import Settings
from app.schemas.chat import ChatMessage, ChatResponse
from app.services.llm import BaseLLMProvider, FactRetrievalProvider, LLMError
from app.services.retrieval import retrieve_context

logger = logging.getLogger(__name__)


async def generate_chat_response(
    question: str,
    history: List[ChatMessage],
    settings: Settings,
    llm: BaseLLMProvider,
) -> ChatResponse:
    context = retrieve_context(question)
    history_payload = [{"role": m.role, "content": m.content} for m in history]

    try:
        answer = await llm.generate(question, context, history_payload)
        mode = llm.mode  # type: ignore[attr-defined]
        status = "ok"
        if not context.get("has_substantive_facts"):
            status = "insufficient_info"
    except LLMError as exc:
        logger.warning("LLM failed, falling back to fact retrieval: %s", exc)
        fallback = FactRetrievalProvider()
        answer = await fallback.generate(question, context, history_payload)
        mode = fallback.mode
        status = "ok"
        # Append brief note that external model was unavailable
        answer = (
            f"{answer} (Note: the configured language model was unavailable, "
            "so this reply used grounded fact retrieval.)"
        )

    return ChatResponse(
        answer=answer,
        references=context.get("references") or [],
        mode=mode,  # type: ignore[arg-type]
        status=status,  # type: ignore[arg-type]
    )
