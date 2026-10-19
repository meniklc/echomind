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
    history_payload = [{"role": m.role, "content": m.content} for m in history]
    context = retrieve_context(question, history=history_payload)

    has_facts = bool(context.get("has_substantive_facts"))

    try:
        answer = await llm.generate(question, context, history_payload)
        mode = llm.mode  # type: ignore[attr-defined]
        status = "ok" if has_facts else "insufficient_info"
    except LLMError as exc:
        # The provider genuinely failed: keep the grounded answer, but never label
        # it as a model response. The note makes the fallback explicit to the user.
        logger.warning("LLM unavailable (%s); falling back to grounded fact retrieval", exc)
        fallback = FactRetrievalProvider()
        answer = await fallback.generate(question, context, history_payload)
        mode = fallback.mode
        status = "ok" if has_facts else "insufficient_info"
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
