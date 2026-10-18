"""Outreach drafts: one LLM call per target, run in parallel.

Targets are just names (group slug / name / PI, and/or a technology); the group
profile from data/groups.json is the context the LLM writes from.

Two kinds of target:
  - team member — invites the group into the project team.
  - technology (`technology` set) — asks the group's lab for access to a technology it runs.

Two modes of the same request:
  - generate (no `instruction`) — fresh e-mail from the group profile, role/technology and reason.
  - revise (`instruction` + per-target `current`/`history`) — copilot edits the
    e-mail or just answers a question about it.
"""

from __future__ import annotations

import json
import logging
from concurrent.futures import ThreadPoolExecutor
from typing import Any

from backend.models.domain import Group
from backend.schemas.drafts import (
    Draft,
    DraftError,
    DraftRequest,
    DraftResponse,
    DraftTarget,
    Language,
    Tone,
)
from backend.services.groups_repo import find_group, find_group_by_technology
from backend.services.llm import LLMError, get_chat_client
from backend.services.prompts import DRAFT_COPILOT_SYSTEM, DRAFT_SYSTEM, DRAFT_TECH_SYSTEM

log = logging.getLogger(__name__)

MAX_PARALLEL_LLM_CALLS = 4
COPILOT_HISTORY_LIMIT = 12

LANGUAGE_NAMES: dict[Language, str] = {"cs": "čeština", "en": "angličtina (English)"}
TONE_DESCRIPTIONS: dict[Tone, str] = {
    "formal": "formální, zdvořilý, akademický",
    "neutral": "věcný a profesionální, bez zbytečných formalit",
    "friendly": "přátelský a kolegiální, ale stále profesionální",
}


class UnknownGroups(LookupError):
    def __init__(self, refs: list[str]) -> None:
        super().__init__(f"No NÚVR group found for: {', '.join(refs)}")
        self.refs = refs


def _group_profile(g: Group) -> dict[str, Any]:
    return {
        "name": g.name,
        "pi": g.pi,
        "node": g.node,
        "faculties": g.faculties,
        "mission": g.mission[:400],
        "focus": g.focus[:800],
        "expertise": g.expertise,
        "publications": g.publications[:3],
        "collaborations": g.collaborations,
        "infrastructures": g.infrastructures,
    }


def _clean(value: Any) -> str | None:
    return value.strip() if isinstance(value, str) and value.strip() else None


def _generate(req: DraftRequest, target: DraftTarget, group: Group, partners: list[dict[str, str]]) -> Draft:
    template = DRAFT_TECH_SYSTEM if target.technology else DRAFT_SYSTEM
    system = template.format(
        language_name=LANGUAGE_NAMES[req.language], tone_desc=TONE_DESCRIPTIONS[req.tone]
    )
    payload = {
        "query": req.query,
        "group": _group_profile(group),
        "role": target.role.model_dump() if target.role else None,
        "technology": target.technology,
        "reason": target.reason,
        "partners": partners,
        "sender": req.sender.model_dump() if req.sender else None,
    }
    raw = get_chat_client().complete_json(system=system, user=json.dumps(payload, ensure_ascii=False))
    subject, body = _clean(raw.get("subject")), _clean(raw.get("body"))
    if subject is None or body is None:
        raise LLMError(f"Draft missing 'subject' or 'body': {str(raw)[:300]}")
    return _draft(target, group, subject=subject, body=body)


def _revise(req: DraftRequest, target: DraftTarget, group: Group) -> Draft:
    assert target.current is not None and req.instruction is not None
    system = DRAFT_COPILOT_SYSTEM.format(language_name=LANGUAGE_NAMES[req.language])
    payload = {
        "context": {
            "query": req.query,
            "group": _group_profile(group),
            "role": target.role.model_dump() if target.role else None,
            "technology": target.technology,
            "reason": target.reason,
            "sender": req.sender.model_dump() if req.sender else None,
            "tone": TONE_DESCRIPTIONS[req.tone],
        },
        "draft": target.current.model_dump(),
        "history": [t.model_dump() for t in target.history[-COPILOT_HISTORY_LIMIT:]],
        "instruction": req.instruction,
    }
    raw = get_chat_client().complete_json(system=system, user=json.dumps(payload, ensure_ascii=False))
    reply = _clean(raw.get("reply"))
    if reply is None:
        raise LLMError(f"Copilot response missing 'reply': {str(raw)[:300]}")
    # null subject/body = "keep as is" (question answered, or only one part edited)
    subject = _clean(raw.get("subject")) or target.current.subject
    body = _clean(raw.get("body")) or target.current.body
    changed = (subject, body) != (target.current.subject, target.current.body)
    return _draft(target, group, subject=subject, body=body, reply=reply, changed=changed)


def _draft(target: DraftTarget, group: Group, **content: Any) -> Draft:
    return Draft(
        group_slug=group.slug,
        group_name=group.name,
        recipient_name=group.pi,
        recipient_email=group.email,
        role=target.role,
        technology=target.technology,
        **content,
    )


def _resolve(target: DraftTarget) -> Group | None:
    if target.group is not None:
        return find_group(target.group)
    assert target.technology is not None
    return find_group_by_technology(target.technology)


def _ref(target: DraftTarget) -> str:
    return " @ ".join(x for x in (target.technology, target.group) if x)


def draft(req: DraftRequest) -> DraftResponse:
    """Raises UnknownGroups before any LLM call; raises LLMError only if *every* target failed."""
    resolved = [(t, _resolve(t)) for t in req.targets]
    missing = [_ref(t) for t, g in resolved if g is None]
    if missing:
        raise UnknownGroups(missing)

    # Dedupe after resolving — "Jiří Homola" and "jiri-homola" are the same recipient.
    # One group can still get two e-mails: as a team member and as a technology provider.
    jobs: list[tuple[DraftTarget, Group]] = []
    seen: set[tuple[str, str | None]] = set()
    for t, g in resolved:
        assert g is not None
        key = (g.slug, t.technology.casefold() if t.technology else None)
        if key not in seen:
            seen.add(key)
            jobs.append((t, g))

    def _one(target: DraftTarget, group: Group) -> Draft:
        if req.instruction is not None:
            return _revise(req, target, group)
        # Each e-mail mentions the other proposed team members — a consortium reads as more credible.
        # Technology providers aren't team members, so they're never listed as partners.
        partners = [
            {"group": g.name, "pi": g.pi, "role": t.role.name if t.role else ""}
            for t, g in jobs
            if t.technology is None and g.slug != group.slug
        ]
        return _generate(req, target, group, partners)

    drafts: list[Draft] = []
    errors: list[DraftError] = []
    with ThreadPoolExecutor(max_workers=min(len(jobs), MAX_PARALLEL_LLM_CALLS)) as pool:
        futures = [(t, g, pool.submit(_one, t, g)) for t, g in jobs]
        for target, group, future in futures:
            try:
                drafts.append(future.result())
            except LLMError as e:
                log.warning("Drafting failed for %s (technology=%s): %s", group.slug, target.technology, e)
                errors.append(DraftError(group_slug=group.slug, technology=target.technology, detail=str(e)))

    if not drafts:
        raise LLMError("; ".join(f"{e.group_slug}: {e.detail}" for e in errors))
    return DraftResponse(drafts=drafts, errors=errors)
