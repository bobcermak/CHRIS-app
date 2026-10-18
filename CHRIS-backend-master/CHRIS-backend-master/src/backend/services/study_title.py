"""Study title generator service."""

from __future__ import annotations

import logging

from dataclasses import dataclass, field

from backend.services.llm import LLMError, get_chat_client
from backend.services.prompts import STUDY_TITLE_SYSTEM

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class StudyTitleResult:
    title: str
    archetype: str | None = None
    alternatives: list[str] = field(default_factory=list)


def generate_study_title_full(query: str, context: str | list[str] | None = None) -> StudyTitleResult:
    """Generate a memorable, impact-driven study title using Tomáš Studeník's methodology."""
    cleaned = (query or "").strip()
    if context:
        if isinstance(context, list):
            context_str = "\n".join(f"- {c.strip()}" for c in context if c and str(c).strip())
        else:
            context_str = str(context).strip()
        if context_str:
            cleaned = f"{cleaned}\n\nDoplňující informace a odpovědi:\n{context_str}"

    if len(cleaned) < 5:
        return StudyTitleResult(title="Nový výzkumný projekt")

    try:
        client = get_chat_client()
        raw = client.complete_json(system=STUDY_TITLE_SYSTEM, user=f"Výzkumný záměr: {cleaned}")
        title = raw.get("title")
        if isinstance(title, str) and title.strip():
            clean_title = title.strip().strip('"').strip("'")[:120]
            archetype = raw.get("archetype") if isinstance(raw.get("archetype"), str) else None
            alts_raw = raw.get("alternatives")
            alternatives = [a.strip() for a in alts_raw if isinstance(a, str) and a.strip()] if isinstance(alts_raw, list) else []
            return StudyTitleResult(title=clean_title, archetype=archetype, alternatives=alternatives)
    except LLMError as e:
        log.warning("Study title generation failed, using fallback: %s", e)
    except Exception as e:
        log.warning("Unexpected error during study title generation: %s", e)

    # Fallback: clean up first sentence
    first_sentence = cleaned.split(".")[0].strip()
    if len(first_sentence) > 90:
        fallback_title = first_sentence[:87] + "..."
    else:
        fallback_title = first_sentence or "Nový výzkumný projekt"
    return StudyTitleResult(title=fallback_title)


def generate_study_title(query: str) -> str:
    """Convenience string-only helper for team assemblers."""
    return generate_study_title_full(query).title
