"""Clarification pipeline: one LLM call per round.

The LLM reads the prompt (+ composer context + earlier answers), asks what it
still needs, and always distils a `MatchBrief` for POST /match. Its output is
normalised here (ids, kinds, limits) so the frontend never gets a malformed
question. There are no predefined questions or slots: the LLM decides what it
needs to know for the best team / technology / grant recommendations, and asks
nothing once it knows enough. If the LLM fails, clarification ends and the
brief is built from the raw prompt + answers.
"""

from __future__ import annotations

import json
import logging
import re
import unicodedata
from typing import Any

from backend.schemas.clarify import (
    MAX_QUESTIONS,
    MAX_ROUNDS,
    AnsweredRound,
    ClarifyContext,
    ClarifyQuestion,
    ClarifyRequest,
    ClarifyResponse,
    MatchBrief,
    QuestionOption,
    Slot,
)
from backend.services.groups_repo import load_groups
from backend.services.llm import LLMError, get_chat_client
from backend.services.prompts import CLARIFY_SYSTEM

log = logging.getLogger(__name__)

NODES = ("Praha", "Brno", "Olomouc")
# The LLM's own "I know enough" level; at or above it no more questions are asked.
READY_THRESHOLD = 0.8
CHOICE_KINDS = {"single_choice", "multi_choice"}
YES_NO = [QuestionOption(id="ano", label="Ano"), QuestionOption(id="ne", label="Ne")]
CALL_LABELS = {
    "AZV": "AZV ČR",
    "GACR": "GA ČR",
    "TACR": "TA ČR",
    "HORIZON": "Horizon Europe",
    "unknown": "zatím nevím",
}


# ---- helpers ------------------------------------------------------------------------------


def _fold(s: str) -> str:
    """Lowercase, strip diacritics and titles — for loose name matching."""
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    return re.sub(r"\b(prof|doc|mudr|rndr|mgr|ing|phd|csc|drsc)\b\.?", " ", s)


def _slugify(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", _fold(s)).strip("-")[:40] or "x"


def resolve_own_group(*hints: str | None) -> list[str]:
    """Map a free-text group / PI name to NÚVR group slugs (exact PI or name match)."""
    out: list[str] = []
    for hint in hints:
        if not hint or len(hint.strip()) < 3:
            continue
        needle = " ".join(_fold(hint).split())
        for g in load_groups():
            pi, name = " ".join(_fold(g.pi).split()), " ".join(_fold(g.name).split())
            if needle and (needle in pi or needle == name or (len(needle) > 8 and needle in name)):
                if g.slug not in out:
                    out.append(g.slug)
    return out


def _answer_text(q: ClarifyQuestion, value: str | list[str] | None) -> str | list[str] | None:
    """Option ids → labels, so the LLM sees what the user actually picked."""
    if value is None:
        return None
    labels = {o.id: o.label for o in q.options or []}
    if isinstance(value, list):
        return [labels.get(v, v) for v in value]
    return labels.get(value, value)


def _history_payload(history: list[AnsweredRound]) -> list[dict[str, Any]]:
    rounds = []
    for r in history:
        by_id = {a.question_id: a for a in r.answers}
        items = []
        for q in r.questions:
            a = by_id.get(q.id)
            value = None if a is None or a.unknown else _answer_text(q, a.value)
            items.append({"slot_key": q.slot_key, "question": q.text, "answer": value})
        rounds.append(items)
    return rounds


def _context_payload(ctx: ClarifyContext) -> dict[str, Any]:
    return {
        "call": CALL_LABELS.get(ctx.call) if ctx.call else None,
        "own_group": ctx.own_group.model_dump(exclude_none=True) if ctx.own_group else None,
    }


def _asked_slots(history: list[AnsweredRound]) -> set[str]:
    return {q.slot_key for r in history for q in r.questions}


# ---- normalisation of LLM output ------------------------------------------------------------


def _str(v: Any) -> str | None:
    return v.strip() if isinstance(v, str) and v.strip() else None


def _options(raw: Any) -> list[QuestionOption]:
    if not isinstance(raw, list):
        return []
    out: list[QuestionOption] = []
    seen: set[str] = set()
    for o in raw[:6]:
        label = _str(o.get("label")) if isinstance(o, dict) else _str(o)
        if not label:
            continue
        oid = _slugify(_str(o.get("id")) if isinstance(o, dict) and _str(o.get("id")) else label)
        if oid in seen:
            continue
        seen.add(oid)
        out.append(QuestionOption(id=oid, label=label, hint=_str(o.get("hint")) if isinstance(o, dict) else None))
    return out


def _question(raw: Any, round_no: int) -> ClarifyQuestion | None:
    if not isinstance(raw, dict):
        return None
    slot_key, text, why = _str(raw.get("slot_key")), _str(raw.get("text")), _str(raw.get("why"))
    if not (slot_key and text and why):
        return None
    kind = raw.get("kind")
    options = _options(raw.get("options"))
    if kind in ("yes_no", "confirm_assumption"):
        options = options or YES_NO
        kind = "single_choice" if kind == "yes_no" else kind
    elif kind in CHOICE_KINDS:
        if len(options) < 2:
            kind, options = "free_text", []
    else:
        kind, options = "free_text", []

    suggested = raw.get("suggested")
    ids = {o.id for o in options}
    if options:
        # Suggested must be option ids; map labels/garbage away.
        def _to_id(v: Any) -> str | None:
            s = _str(v)
            if not s:
                return None
            if s in ids:
                return s
            if _slugify(s) in ids:  # raw id before normalisation
                return _slugify(s)
            return next((o.id for o in options if o.label.lower() == s.lower()), None)

        if kind == "multi_choice":
            vals = suggested if isinstance(suggested, list) else [suggested]
            suggested = [i for i in (_to_id(v) for v in vals) if i] or None
        else:
            suggested = _to_id(suggested[0] if isinstance(suggested, list) and suggested else suggested)
    else:
        suggested = _str(suggested)

    return ClarifyQuestion(
        id=f"r{round_no}-{_slugify(slot_key)}",
        slot_key=slot_key,
        kind=kind,
        text=text,
        why=why,
        placeholder=_str(raw.get("placeholder")) if not options else None,
        options=options or None,
        suggested=suggested,
    )


def _slots(raw: Any) -> list[Slot]:
    out: list[Slot] = []
    for s in raw if isinstance(raw, list) else []:
        if not isinstance(s, dict) or not _str(s.get("key")):
            continue
        try:
            out.append(Slot.model_validate(s))
        except ValueError:
            log.debug("Dropping malformed slot %r", s)
    return out


def _team_size(v: Any) -> int | None:
    """Only what the researcher said; None lets /match decide the team size."""
    if v is None:
        return None
    try:
        return max(2, min(6, int(v)))
    except (TypeError, ValueError):
        return None


def _readiness(v: Any) -> float:
    try:
        return max(0.0, min(1.0, float(v)))
    except (TypeError, ValueError):
        return 0.5


def _nodes(v: Any) -> list[str]:
    if not isinstance(v, list):
        return []
    folded = {_fold(n): n for n in NODES}
    return [folded[_fold(x)] for x in v if isinstance(x, str) and _fold(x) in folded]



# ---- fallback (no LLM) ----------------------------------------------------------------------


def _fallback_brief(req: ClarifyRequest) -> str:
    parts = [req.prompt.strip()]
    for r in _history_payload(req.history):
        for item in r:
            ans = item["answer"]
            if ans:
                parts.append(f"{item['question']} {', '.join(ans) if isinstance(ans, list) else ans}")
    return "\n".join(parts)


def _fallback(req: ClarifyRequest, round_no: int, warning: str) -> ClarifyResponse:
    """LLM down → no questions; go straight to matching with the prompt + answers so far."""
    log.warning("Clarify fallback: %s", warning)
    own = req.context.own_group
    return ClarifyResponse(
        round=round_no,
        ready=True,
        questions=[],
        title=req.prompt.split(".", 1)[0].strip()[:90] or "Nový výzkumný projekt",
        summary=req.prompt.strip()[:400],
        slots=[],
        readiness=1.0,
        brief=MatchBrief(
            query=_fallback_brief(req),
            exclude_slugs=resolve_own_group(own.name if own else None),
        ),
        warning=warning,
    )


def _complete_with_retry(system: str, user: str) -> dict[str, Any]:
    """One retry — the model occasionally returns truncated / invalid JSON."""
    try:
        return get_chat_client().complete_json(system=system, user=user)
    except LLMError as e:
        log.warning("Clarify LLM call failed, retrying once: %s", e)
        return get_chat_client().complete_json(system=system, user=user)


# ---- main -----------------------------------------------------------------------------------


def clarify(req: ClarifyRequest) -> ClarifyResponse:
    """The LLM asks while it lacks something that would change the recommendations,
    and returns no questions once it knows enough (possibly already in round 1).
    Also stops on `finish` or the MAX_ROUNDS safety stop."""
    round_no = len(req.history) + 1
    ask = not req.finish and round_no <= MAX_ROUNDS
    payload = {
        "prompt": req.prompt,
        "context": _context_payload(req.context),
        "history": _history_payload(req.history),
        "round": round_no,
        "ask": ask,
    }
    system = CLARIFY_SYSTEM.format(max_questions=MAX_QUESTIONS, ready_threshold=READY_THRESHOLD)
    user = json.dumps(payload, ensure_ascii=False)
    try:
        raw = _complete_with_retry(system, user)
    except LLMError as e:
        return _fallback(req, round_no, f"LLM nedostupný: {e}")

    readiness = _readiness(raw.get("readiness"))

    slots = _slots(raw.get("slots"))
    questions: list[ClarifyQuestion] = []
    if ask and readiness < READY_THRESHOLD:
        # Never ask the same thing twice (also covers "Nevím" answers).
        asked = _asked_slots(req.history)
        for q in (_question(x, round_no) for x in raw.get("questions") or []):
            if q and q.slot_key not in asked and all(q.id != o.id for o in questions):
                questions.append(q)
        questions = questions[:MAX_QUESTIONS]
    ready = not questions

    own = req.context.own_group
    brief = MatchBrief(
        query=_str(raw.get("brief")) or _fallback_brief(req),
        team_size=_team_size(raw.get("team_size")),
        nodes=_nodes(raw.get("nodes")),
        exclude_slugs=resolve_own_group(own.name if own else None, _str(raw.get("own_group"))),
    )
    return ClarifyResponse(
        round=round_no,
        ready=ready,
        questions=questions,
        reason=(_str(raw.get("reason")) or "Ještě mi chybí pár informací.") if questions else None,
        title=(_str(raw.get("title")) or req.prompt[:90])[:90],
        summary=_str(raw.get("summary")) or req.prompt[:400],
        slots=slots,
        readiness=1.0 if ready else readiness,
        brief=brief,
    )
