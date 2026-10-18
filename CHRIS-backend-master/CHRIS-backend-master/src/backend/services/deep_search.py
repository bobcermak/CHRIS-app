"""Deep search orchestrator: build per-entity prompt, call Perplexity, assemble result.

Prompts are entity-specific because each entity type has a different information
scope (CV/papers for a PI, past rounds/success rate for a grant, equipment/labs
for a technology). The prompt enforces: Czech output, markdown with inline
citations as `[n](url)`, 3-5 paragraphs.
"""

from __future__ import annotations

from datetime import datetime, timezone

from backend.models.domain import Grant, Group
from backend.schemas.deep_search import Citation, DeepSearchResult
from backend.services.perplexity import PerplexityAnswer, ask_perplexity

GROUP_PROMPT = """\
Najdi na internetu informace o vědci {pi} (vede výzkumnou skupinu "{name}" \
na NÚVR — Národní ústav pro výzkum rakoviny, Česká republika, uzel {node}).

Zahrň:
- biografie / profesní dráha (vzdělání, pozice, afiliace)
- hlavní vědecké přínosy, zejména v onkologii
- nedávné publikace (posledních 5 let)
- získané granty a projekty
- ocenění
- případné další zajímavosti

Odpověz v češtině v markdown formátu. 3-5 odstavců. Používej inline citace \
jako [1](url), [2](url) odkazující na konkrétní zdroje."""


GRANT_PROMPT = """\
Najdi informace o grantové výzvě "{title}" od agentury {agency} \
(program: {programme}). ID výzvy: {call_id}.

Zahrň:
- historii předchozích kol této výzvy
- úspěšnost (success rate), kolik % žádostí uspěje
- typické vítěze (jaká pracoviště, obor)
- hlavní kritéria hodnocení a tipy pro úspěšnou aplikaci
- aktuální deadline a termíny (pokud jsou veřejné)

Odpověz v češtině v markdown formátu. 3-5 odstavců. Používej inline citace \
jako [1](url), [2](url) na konkrétní zdroje (agentura, databáze projektů, atd.)."""


TECHNOLOGY_PROMPT = """\
Najdi informace o technologii / metodě "{name}" v kontextu biomedicínského / \
onkologického výzkumu.

Popis z našeho katalogu: {description}

Zahrň:
- jaké laboratoře v České republice tuto metodu používají (konkrétní jména \
pracovišť / center)
- jaké laboratoře ve světě jsou v této metodě špičkou
- hlavní review papery nebo seminal publications
- typický equipment, přibližná cena / dostupnost
- případné alternativní metody

Odpověz v češtině v markdown formátu. 3-5 odstavců. Používej inline citace \
jako [1](url), [2](url) na konkrétní zdroje."""


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _result(entity_type: str, ref: str, ans: PerplexityAnswer) -> DeepSearchResult:
    citations = [Citation(url=u) for u in ans.citation_urls]
    return DeepSearchResult(
        entity_type=entity_type,  # type: ignore[arg-type]
        ref=ref,
        summary=ans.content,
        citations=citations,
        generated_at=_now_iso(),
    )


def deep_search_group(group: Group) -> DeepSearchResult:
    prompt = GROUP_PROMPT.format(
        pi=group.pi or group.name,
        name=group.name,
        node=group.node or "neznámý uzel",
    )
    ans = ask_perplexity(prompt)
    return _result("group", group.slug, ans)


def deep_search_grant(grant: Grant) -> DeepSearchResult:
    prompt = GRANT_PROMPT.format(
        title=grant.title,
        agency=grant.agency,
        programme=grant.programme or "neuvedeno",
        call_id=grant.call_id or "neuvedeno",
    )
    ans = ask_perplexity(prompt)
    return _result("grant", grant.slug, ans)


def deep_search_technology(name: str, description: str) -> DeepSearchResult:
    prompt = TECHNOLOGY_PROMPT.format(name=name, description=description)
    ans = ask_perplexity(prompt)
    return _result("technology", name, ans)
