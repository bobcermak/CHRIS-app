"""Resolve an unknown call into an application template (ARCHITECTURE §9.5, steps 2–3).

documentation (link or upload) → call_docs sources → LLM extraction (structured)
→ validation: every section / limit must cite a real source, the rest is dropped
and listed in `unknown`. Nothing usable → the generic outline with a `warning`.

Results are cached in memory by the documentation's content, so re-loading the
same call doesn't cost another LLM call.
"""

from __future__ import annotations

import hashlib
import json
import logging
import re
import unicodedata
from datetime import UTC, datetime
from html import escape
from typing import Any, get_args

from pydantic import ValidationError

from backend.models.domain import Grant
from backend.schemas.templates import (
    Agency,
    ApplicationTemplate,
    TemplateCitation,
    TemplateLimits,
    TemplateSection,
)
from backend.services.call_docs import Documents, Source
from backend.services.grants_repo import get_grant
from backend.services.llm import LLMError, get_chat_client
from backend.services.prompts import TEMPLATE_EXTRACT_SYSTEM

log = logging.getLogger(__name__)

LLM_ATTEMPTS = 2
MAX_SECTIONS = 30
MAX_UNKNOWN = 8
CACHE_SIZE = 64

KNOWN_KEYS = {
    "title", "abstract", "state", "aims", "methods", "team", "timeline", "outputs", "risks", "dmp",
    "references", "budget", "infrastructure", "impact", "excellence", "implementation", "ethics",
}

# Universal outline (§9.5 step 3) — same keys as the frontend's library, so text carries over.
GENERIC_SECTIONS: list[tuple[str, str]] = [
    ("state", "Stav poznání"),
    ("aims", "Cíle a hypotéza"),
    ("methods", "Metodika"),
    ("timeline", "Harmonogram"),
    ("team", "Tým a spolupráce"),
    ("infrastructure", "Infrastruktura"),
    ("risks", "Rizika"),
    ("budget", "Rozpočet"),
    ("outputs", "Dopad a výsledky"),
    ("dmp", "Data management plan"),
    ("references", "Literatura"),
]
GENERIC_UNKNOWN = ["Limity sekcí", "Hodnoticí kritéria", "Jazyk přihlášky"]

_cache: dict[str, ApplicationTemplate] = {}


def _now() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds")


def _agency(name: str) -> Agency:
    if re.search(r"AZV", name, re.I):
        return "AZV"
    if re.search(r"GA ?ČR|GACR", name, re.I):
        return "GACR"
    if re.search(r"TA ?ČR|TACR", name, re.I):
        return "TACR"
    if re.search(r"Horizon", name, re.I):
        return "HORIZON"
    return "OTHER"


def _slug(text: str) -> str:
    ascii_text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", ascii_text.lower()).strip("-")[:40] or "section"


def _text(value: Any, limit: int) -> str:
    return value.strip()[:limit] if isinstance(value, str) else ""


def _limits(raw: Any) -> TemplateLimits | None:
    if not isinstance(raw, dict):
        return None
    fields = {k: v for k, v in raw.items() if k in TemplateLimits.model_fields and isinstance(v, int | float) and v > 0}
    if not fields:
        return None
    try:
        return TemplateLimits.model_validate(fields)
    except ValidationError:
        return None


def _citations(raw: Any, known: set[str]) -> list[str]:
    if not isinstance(raw, list):
        return []
    return list(dict.fromkeys(c for c in raw if isinstance(c, str) and c in known))


def _payload(docs: Documents, grant: Grant | None) -> str:
    call = {"name": grant.title, "agency": grant.agency, "programme": grant.programme} if grant else {}
    call["title_of_documentation"] = docs.title
    blocks = [f"<call>{json.dumps(call, ensure_ascii=False)}</call>"]
    for s in docs.sources:
        # Sources must not be able to close their own tag (prompt injection via the documentation).
        text = s.text.replace("</source", "</ source")
        blocks.append(f'<source id="{s.id}" label="{escape(s.label)}">\n{text}\n</source>')
    return "\n\n".join(blocks)


def _extract(docs: Documents, grant: Grant | None) -> dict[str, Any]:
    user = _payload(docs, grant)
    error: LLMError | None = None
    for attempt in range(LLM_ATTEMPTS):
        try:
            return get_chat_client().complete_json(system=TEMPLATE_EXTRACT_SYSTEM, user=user)
        except LLMError as e:
            log.warning("Template extraction attempt %d failed: %s", attempt + 1, e)
            error = e
    assert error is not None
    raise error


def _citation(s: Source) -> TemplateCitation:
    return TemplateCitation(id=s.id, label=s.label, url=s.url, page=s.page, snippet=s.text[:300])


def _build(raw: dict[str, Any], docs: Documents, grant: Grant | None, digest: str) -> ApplicationTemplate | None:
    """Validated template from the LLM output, or None when no section survives."""
    by_id = {s.id: s for s in docs.sources}
    known = set(by_id)
    unknown: list[str] = []
    sections: list[TemplateSection] = []
    used_keys: set[str] = set()

    for item in raw.get("sections") or []:
        if not isinstance(item, dict) or len(sections) >= MAX_SECTIONS:
            continue
        title = _text(item.get("title"), 200)
        if not title:
            continue
        cites = _citations(item.get("citation_ids"), known)
        if not cites:
            # No claim without a source: an uncited section is a guess, not part of the call.
            log.info("Dropping uncited template section %r", title)
            unknown.append(f"Sekce „{title}“: v dokumentaci jsem nenašel, kde je uvedena.")
            continue
        key = _text(item.get("key"), 40).lower()
        if key not in KNOWN_KEYS:
            key = _slug(key or title)
        if key in used_keys:  # a second "aims" is named after its own title
            key = _slug(title)
        base, n = key, 2
        while key in used_keys:
            key, n = f"{base}-{n}", n + 1
        used_keys.add(key)
        sections.append(
            TemplateSection(
                key=key,
                title=title,
                required=item.get("required") is not False,
                hint=_text(item.get("hint"), 400),
                limits=_limits(item.get("limits")),
                confirmed=False,
                citation_ids=cites,
            )
        )

    if not sections:
        return None

    doc_raw = raw.get("document_limits")
    doc_limits = None
    if isinstance(doc_raw, dict):
        doc_cites = _citations(doc_raw.get("citation_ids"), known)
        doc_limits = _limits(doc_raw) if doc_cites else None
    else:
        doc_cites = []
    if doc_limits is None:
        unknown.append("Limity celého dokumentu (počet stran, písmo, velikost souboru)")

    llm_unknown = [u.strip()[:300] for u in raw.get("unknown") or [] if isinstance(u, str) and u.strip()]
    unknown += llm_unknown[:MAX_UNKNOWN]

    cited = dict.fromkeys([c for s in sections for c in s.citation_ids] + (doc_cites if doc_limits else []))
    language = raw.get("language") if raw.get("language") in ("cs", "en") else "cs"
    agency = _agency(grant.agency) if grant else (raw.get("agency") if raw.get("agency") in get_args(Agency) else "OTHER")
    scheme = _text(raw.get("scheme"), 200) or (grant.title if grant else "") or docs.title or "Výzva z dokumentace"

    return ApplicationTemplate(
        id=f"extracted-{digest[:16]}",
        status="extracted",
        agency=agency,
        scheme=scheme,
        language=language,
        sections=sections,
        document_limits=doc_limits,
        source_url=docs.source_url or (grant.url if grant else ""),
        fetched_at=_now(),
        unknown=list(dict.fromkeys(unknown)),
        citations=[_citation(by_id[c]) for c in cited],
        warning=" ".join(docs.notes) or None,
    )


def generic_template(*, grant: Grant | None, source_url: str, warning: str | None, digest: str = "") -> ApplicationTemplate:
    return ApplicationTemplate(
        id=f"generic-{digest[:16] or (grant.slug if grant else 'call')}",
        status="generic",
        agency=_agency(grant.agency) if grant else "OTHER",
        scheme=f"Obecná osnova · {grant.title}" if grant else "Obecná osnova",
        sections=[
            TemplateSection(key=k, title=t, hint="Ověřte, zda výzva tuto sekci vyžaduje.") for k, t in GENERIC_SECTIONS
        ],
        source_url=source_url or (grant.url if grant else ""),
        fetched_at=_now(),
        unknown=list(GENERIC_UNKNOWN),
        warning=warning,
    )


def resolve(docs: Documents, *, grant_slug: str | None = None) -> ApplicationTemplate:
    """Never raises for bad content: the worst case is the generic outline with a warning."""
    grant = get_grant(grant_slug) if grant_slug else None
    notes = " ".join(docs.notes)
    if not docs.sources:
        reason = notes or "V dokumentaci jsem nenašel žádný text."
        return generic_template(grant=grant, source_url=docs.source_url, warning=f"{reason} Nabízím obecnou osnovu.")

    digest = hashlib.sha256(
        json.dumps([grant_slug, [(s.id, s.text) for s in docs.sources]], ensure_ascii=False).encode()
    ).hexdigest()
    if digest in _cache:
        return _cache[digest].model_copy(update={"fetched_at": _now()})

    try:
        raw = _extract(docs, grant)
    except LLMError:
        return generic_template(
            grant=grant,
            source_url=docs.source_url,
            warning="Osnovu se teď nepodařilo z dokumentace vytáhnout. Nabízím obecnou osnovu, zkuste to později znovu.",
            digest=digest,
        )

    template = _build(raw, docs, grant, digest)
    if template is None:
        template = generic_template(
            grant=grant,
            source_url=docs.source_url,
            warning="V dokumentaci jsem nenašel osnovu přihlášky. Nabízím obecnou osnovu. "
            "Zkuste odkaz přímo na PDF se šablonou nebo zadávací dokumentací.",
            digest=digest,
        )
    if len(_cache) >= CACHE_SIZE:
        _cache.pop(next(iter(_cache)))
    _cache[digest] = template
    return template
