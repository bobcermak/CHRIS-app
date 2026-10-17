"""Application copilot: opponent first (ARCHITECTURE §9.4.1).

oppose: deterministic formal checks (empty required sections, character / word limits,
        page estimate, unconfirmed template, unknown limits) + one LLM review of the
        whole application: severity-ordered objections, per-criterion score, chat reply.
        LLM failure → the formal checks alone with a note, never an invented review.
write:  one LLM call drafting a section; its weakest points come back as a comment.

Every LLM output is validated: unknown sections and severities are normalised, a
suggested edit survives only if the passage it replaces really is in the section.
"""

from __future__ import annotations

import json
import logging
import re
from html import escape
from typing import Any

from backend.models.domain import Group
from backend.schemas.copilot import (
    CopilotComment,
    CopilotRequest,
    CopilotResult,
    CopilotScore,
    CopilotSection,
    ScoreCriterion,
    SectionPatch,
    Severity,
)
from backend.services.grants_repo import get_grant
from backend.services.groups_repo import find_group
from backend.services.llm import LLMError, get_chat_client
from backend.services.prompts import COPILOT_OPPOSE_SYSTEM, COPILOT_WRITE_SYSTEM

log = logging.getLogger(__name__)

LLM_ATTEMPTS = 2
MAX_LLM_COMMENTS = 10
HISTORY_LIMIT = 12
# A4, 11 pt, single spacing ≈ 3 000 characters of running text (rough, labelled as an estimate).
CHARS_PER_PAGE = 3000

SEVERITY_RANK: dict[Severity, int] = {"blocker": 0, "warning": 1, "suggestion": 2, "info": 3}
LANGUAGE_NAMES = {"cs": "čeština", "en": "angličtina (English)"}


def _words(text: str) -> int:
    return len(re.findall(r"\S+", text))


def _n(value: int) -> str:
    """Czech thousands separator: 12 345."""
    return f"{value:,}".replace(",", " ")


def _clean(value: Any, limit: int) -> str | None:
    return value.strip()[:limit] if isinstance(value, str) and value.strip() else None


# ---- formal checks (no LLM) ----------------------------------------------------------------


def formal_checks(req: CopilotRequest) -> list[CopilotComment]:
    out: list[CopilotComment] = []
    generic = req.template.status == "generic"

    def add(key: str, severity: Severity, text: str, criterion: str) -> None:
        out.append(
            CopilotComment(
                id=f"f-{len(out) + 1}", section_key=key, mode="oppose", severity=severity, text=text, criterion=criterion
            )
        )

    for s in req.sections:
        text = s.content.strip()
        if s.required and not text:
            if generic:
                add(s.key, "warning", f"Sekce „{s.title}“ je prázdná. Ověřte, zda ji výzva vyžaduje; obecná osnova to neví.", "Obecná osnova (neověřeno)")
            else:
                add(s.key, "blocker", f"Povinná sekce „{s.title}“ je prázdná. Bez ní přihláška neprojde formální kontrolou.", "Povinné sekce šablony")
            continue
        limits = s.limits
        if limits and limits.max_chars and len(s.content) > limits.max_chars:
            add(
                s.key,
                "blocker",
                f"Sekce „{s.title}“ má {_n(len(s.content))} znaků, limit je {_n(limits.max_chars)}. "
                f"Zkraťte ji o {_n(len(s.content) - limits.max_chars)} znaků.",
                "Limit znaků podle šablony",
            )
        if limits and limits.max_words and _words(s.content) > limits.max_words:
            add(s.key, "blocker", f"Sekce „{s.title}“ má {_words(s.content)} slov, limit je {limits.max_words}.", "Limit slov podle šablony")

    doc = req.template.document_limits
    total_chars = sum(len(s.content) for s in req.sections)
    if doc and doc.max_pages and total_chars / CHARS_PER_PAGE > doc.max_pages:
        add(
            "",
            "warning",
            f"Odhadem {total_chars / CHARS_PER_PAGE:.1f} stran při {doc.font_pt or 11} pt, limit je {doc.max_pages}. "
            "Přesný počet ukáže export PDF.",
            "Limit stran dokumentu podle šablony",
        )

    unconfirmed = [s.title for s in req.sections if not s.confirmed]
    if req.template.status != "verified" and unconfirmed:
        add(
            "",
            "warning",
            f"{len(unconfirmed)} sekcí není potvrzených proti dokumentaci výzvy ({', '.join(unconfirmed[:4])}"
            f"{'…' if len(unconfirmed) > 4 else ''}). Kontroluji je jen obecně.",
            "Stav šablony",
        )
    if req.template.unknown:
        add(
            "",
            "info",
            "V dokumentaci výzvy dohledejte: " + "; ".join(req.template.unknown[:5]) + ". Bez toho limity nekontroluji.",
            "Neznámé limity šablony",
        )
    return out


# ---- LLM context ---------------------------------------------------------------------------


def _group_profile(g: Group, role: str) -> dict[str, Any]:
    return {
        "group": g.name,
        "pi": g.pi,
        "role": role,
        "node": g.node,
        "faculties": g.faculties,
        "focus": g.focus[:600],
        "expertise": g.expertise[:12],
        "infrastructures": g.infrastructures[:8],
        "publications": g.publications[:3],
    }


def _context(req: CopilotRequest) -> dict[str, Any]:
    grant = get_grant(req.grant) if req.grant else None
    team = []
    for m in req.team:
        g = find_group(m.group)
        if g is None:
            log.info("Copilot: unknown team group %r skipped", m.group)
            continue
        team.append(_group_profile(g, m.role))
    return {
        "project": {"title": req.title, "description": req.project},
        "call": (
            {
                "name": grant.title,
                "agency": grant.agency,
                "programme": grant.programme,
                "budget": grant.budget,
                "duration": grant.duration,
                "eligible_applicants": grant.eligible_applicants,
                "description": grant.description,
            }
            if grant
            else {"scheme": req.template.scheme, "agency": req.template.agency}
        ),
        "template": {
            "status": req.template.status,
            "scheme": req.template.scheme,
            "document_limits": req.template.document_limits.model_dump(exclude_none=True)
            if req.template.document_limits
            else None,
            "unknown": req.template.unknown,
        },
        "language": LANGUAGE_NAMES[req.template.language],
        "team": team,
    }


def _section_meta(s: CopilotSection) -> dict[str, Any]:
    return {
        "key": s.key,
        "title": s.title,
        "required": s.required,
        "hint": s.hint,
        "limits": s.limits.model_dump(exclude_none=True) if s.limits else None,
        "confirmed": s.confirmed,
        "chars": len(s.content),
    }


def _sources(sections: list[CopilotSection]) -> str:
    # The application text must not be able to close its own tag (prompt injection).
    return "\n\n".join(
        f'<source id="section:{escape(s.key)}">\n{s.content.replace("</source", "</ source")}\n</source>'
        for s in sections
        if s.content.strip()
    )


def _user_message(payload: dict[str, Any], sections: list[CopilotSection]) -> str:
    return json.dumps(payload, ensure_ascii=False) + "\n\n" + (_sources(sections) or "(všechny sekce jsou prázdné)")


def _complete(system: str, user: str) -> dict[str, Any]:
    error: LLMError | None = None
    for attempt in range(LLM_ATTEMPTS):
        try:
            return get_chat_client().complete_json(system=system, user=user)
        except LLMError as e:
            log.warning("Copilot LLM attempt %d failed: %s", attempt + 1, e)
            error = e
    assert error is not None
    raise error


# ---- validation of the LLM output ----------------------------------------------------------


def _llm_comments(raw: Any, req: CopilotRequest) -> list[CopilotComment]:
    contents = {s.key: s.content for s in req.sections}
    out: list[CopilotComment] = []
    for item in raw if isinstance(raw, list) else []:
        if not isinstance(item, dict) or len(out) >= MAX_LLM_COMMENTS:
            continue
        text = _clean(item.get("text"), 1200)
        if text is None:
            continue
        key = item.get("section_key") if item.get("section_key") in contents else ""
        severity = item.get("severity") if item.get("severity") in SEVERITY_RANK else "suggestion"
        edit = _clean(item.get("suggested_edit"), 4000)
        quote = item.get("quote") if isinstance(item.get("quote"), str) and item.get("quote") else None
        if edit and quote is not None and (not key or quote not in contents[key]):
            # The passage isn't in the text: applying the edit would duplicate or misplace it.
            log.info("Copilot: dropping edit with a quote not found in section %r", key)
            edit, quote = None, None
        if edit and not key:
            edit, quote = None, None
        out.append(
            CopilotComment(
                id=f"c-{len(out) + 1}",
                section_key=key,
                mode="oppose",
                severity=severity,
                text=text,
                criterion=_clean(item.get("criterion"), 300),
                quote=quote if edit else None,
                suggested_edit=edit,
            )
        )
    return out


def _score(raw: Any) -> CopilotScore | None:
    if not isinstance(raw, dict):
        return None
    criteria: list[ScoreCriterion] = []
    for c in raw.get("criteria") or []:
        if not isinstance(c, dict):
            continue
        name, reason = _clean(c.get("name"), 120), _clean(c.get("reason"), 400)
        top, got = c.get("max"), c.get("score")
        if not name or not reason or not isinstance(top, int | float) or not isinstance(got, int | float) or top <= 0:
            continue
        top = int(round(top))
        criteria.append(ScoreCriterion(name=name, score=max(0, min(top, int(round(got)))), max=top, reason=reason))
    if not criteria:
        return None
    total = round(100 * sum(c.score for c in criteria) / sum(c.max for c in criteria))
    return CopilotScore(total=total, criteria=criteria[:8], general_criteria=raw.get("general_criteria") is True)


def _sorted(comments: list[CopilotComment]) -> list[CopilotComment]:
    return sorted(comments, key=lambda c: SEVERITY_RANK[c.severity])


# ---- public --------------------------------------------------------------------------------


def oppose(req: CopilotRequest) -> CopilotResult:
    """Never raises on an LLM failure: the formal checks still come back, with a note."""
    formal = formal_checks(req)
    payload = {
        **_context(req),
        "sections": [_section_meta(s) for s in req.sections],
        "focus_section": req.section_key,
        "already_reported": [f"{c.section_key or 'celá přihláška'}: {c.text}" for c in formal],
        "history": [t.model_dump() for t in req.history[-HISTORY_LIMIT:]],
        "instruction": req.instruction,
    }
    try:
        raw = _complete(COPILOT_OPPOSE_SYSTEM, _user_message(payload, req.sections))
    except LLMError:
        note = CopilotComment(
            id="f-llm",
            mode="oppose",
            severity="info",
            text="Posudek panelu se teď nepodařilo připravit. Formální kontrola je hotová, posudek zkuste za chvíli znovu.",
        )
        return CopilotResult(comments=_sorted([*formal, note]))

    reply = _clean(raw.get("reply"), 2000) if req.instruction else None
    if req.instruction and reply is None:
        reply = "Na dotaz jsem nedokázal odpovědět. Zkuste ho prosím formulovat konkrétněji."
    return CopilotResult(
        comments=_sorted([*formal, *_llm_comments(raw.get("comments"), req)]),
        score=_score(raw.get("score")),
        reply=reply,
    )


def write(req: CopilotRequest) -> CopilotResult:
    """Raises LLMError when no draft can be produced — there is nothing honest to fall back to."""
    assert req.section_key is not None
    section = next(s for s in req.sections if s.key == req.section_key)
    payload = {
        **_context(req),
        "section": _section_meta(section) | {"current_text": section.content},
        "other_sections": [_section_meta(s) for s in req.sections if s.key != section.key],
        "history": [t.model_dump() for t in req.history[-HISTORY_LIMIT:]],
        "instruction": req.instruction,
    }
    others = [s for s in req.sections if s.key != section.key]
    raw = _complete(COPILOT_WRITE_SYSTEM, _user_message(payload, others))
    content = _clean(raw.get("content"), 40_000)
    if content is None:
        raise LLMError(f"Copilot draft missing 'content': {str(raw)[:300]}")

    weak = [w.strip()[:400] for w in raw.get("weak_points") or [] if isinstance(w, str) and w.strip()][:3]
    missing = [m.strip()[:300] for m in raw.get("missing") or [] if isinstance(m, str) and m.strip()][:6]
    comments = [
        CopilotComment(
            id="w-1",
            section_key=section.key,
            mode="write",
            severity="warning",
            text=f"Návrh sekce „{section.title}“ je AI draft. "
            + (("Nejslabší místa: " + " ".join(f"{i}) {w}" for i, w in enumerate(weak, 1))) if weak else "Ověřte každé tvrzení."),
            criterion="Konkrétnost a ověřitelnost tvrzení",
        )
    ]
    if missing:
        comments.append(
            CopilotComment(
                id="w-2",
                section_key=section.key,
                mode="write",
                severity="info",
                text="Doplňte: " + "; ".join(missing) + ".",
            )
        )
    limits = section.limits
    if limits and limits.max_chars and len(content) > limits.max_chars:
        comments.insert(
            0,
            CopilotComment(
                id="w-0",
                section_key=section.key,
                mode="write",
                severity="blocker",
                text=f"Návrh má {len(content)} znaků, limit je {limits.max_chars}. Zkraťte ho.",
                criterion="Limit znaků podle šablony",
            ),
        )
    return CopilotResult(comments=comments, section_patch=SectionPatch(section_key=section.key, content_md=content))


def run(req: CopilotRequest) -> CopilotResult:
    return write(req) if req.mode == "write" else oppose(req)
