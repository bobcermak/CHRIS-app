"""Call documentation → plain-text sources the template extractor cites.

Input is a link to a call (its web page, or a PDF/DOCX directly) or an uploaded
PDF/DOCX. A web page is scraped for its main text and its most promising linked
documents (template, outline, call documentation …) are followed too.

Each source is one citable place: a PDF page, or a part of a web page / DOCX.

Fetching user-supplied URLs is an SSRF surface, so every hop (redirects included)
must resolve to public IP addresses only, and every response is size-capped.
"""

from __future__ import annotations

import io
import ipaddress
import logging
import re
import socket
import unicodedata
from dataclasses import dataclass, field
from typing import Literal
from urllib.parse import unquote, urljoin, urlsplit

import httpx
from bs4 import BeautifulSoup
from docx import Document as load_docx
from pypdf import PdfReader
from pypdf.errors import PyPdfError

log = logging.getLogger(__name__)

MAX_BYTES = 15 * 1024 * 1024
MAX_REDIRECTS = 5
MAX_LINKED_DOCS = 3
MAX_PDF_PAGES = 80
CHUNK_CHARS = 3500
MAX_TOTAL_CHARS = 70_000
TIMEOUT = httpx.Timeout(20.0, connect=10.0)
HEADERS = {
    "User-Agent": "CHRIS-template-reader/0.1 (NUVR Research Matchmaker; Rakathon 2026)",  # headers are ASCII-only
    "Accept": "text/html,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document;q=0.9,*/*;q=0.5",
}
DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

# Link text / href words → weight: does the linked document hold the application outline?
# Without diacritics: matched against ASCII-folded text, since file names usually drop them.
LINK_KEYWORDS: dict[str, int] = {
    "sablon": 3, "osnov": 3, "zadavaci dokumentac": 3, "popis projektu": 3, "template": 3, "part b": 3,
    "information for applicants": 3, "information-for-applicants": 3, "guide for applicants": 3,
    "work programme": 3, "wp-call": 2, "rules for submission": 2, "rules-for-submission": 2,
    "application form": 2, "proposal": 2, "dokumentac": 1, "prihlask": 1, "priloh": 1, "pravidla": 1,
    "podminky": 1, "instructions": 1, "guide": 1, "call": 1, "vyzv": 1, "zadavaci": 1,
    # Documents about the call that never hold the outline.
    "statistic": -4, "result": -4, "vysledk": -4, "panel": -4, "member": -4, "clenu": -4, "privacy": -4,
    "gender": -3, "bias": -3, "reviewer": -3, "hodnotitel": -3, "quick start": -3, "dashboard": -3,
}
# Words that mark the pages carrying the outline and its limits (used when text must be cut).
OUTLINE_WORDS = (
    "osnov", "struktur", "kapitol", "sekce", "rozsah", "stran", "znaku", "pismo", "font", "page limit",
    "pages", "characters", "section", "part b", "template", "sablon", "popis projektu", "max",
)

Kind = Literal["pdf", "docx", "html"]


class DocumentError(ValueError):
    """The documentation can't be read. The message is shown to the user (Czech)."""


@dataclass(frozen=True)
class Source:
    id: str
    label: str
    text: str
    url: str = ""
    page: int | None = None


@dataclass
class Documents:
    title: str
    source_url: str
    sources: list[Source] = field(default_factory=list)
    # Things the user should know: scanned PDF, unreadable linked document, truncated text.
    notes: list[str] = field(default_factory=list)


# ---- safe download -------------------------------------------------------------------------


def _resolve(host: str, port: int) -> set[str]:
    return {info[4][0] for info in socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)}


def _check_url(url: str) -> None:
    parts = urlsplit(url)
    if parts.scheme not in ("http", "https") or not parts.hostname:
        raise DocumentError("Odkaz musí začínat http:// nebo https://.")
    if parts.username or parts.password:
        raise DocumentError("Odkaz nesmí obsahovat přihlašovací údaje.")
    try:
        port = parts.port or (443 if parts.scheme == "https" else 80)
        addresses = _resolve(parts.hostname, port)
    except (OSError, ValueError) as e:
        raise DocumentError("Adresu se nepodařilo najít. Zkontrolujte odkaz.") from e
    for raw in addresses:
        ip = ipaddress.ip_address(raw.split("%", 1)[0])
        if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped:
            ip = ip.ipv4_mapped
        if not ip.is_global:
            raise DocumentError("Odkaz míří na neveřejnou adresu. Načíst jde jen veřejný web.")


def _download(client: httpx.Client, url: str) -> tuple[str, str, bytes]:
    """GET with manual redirects (each hop re-checked) and a byte cap → (final url, content type, body)."""
    for _ in range(MAX_REDIRECTS + 1):
        _check_url(url)
        try:
            with client.stream("GET", url, headers=HEADERS) as r:
                if r.is_redirect:
                    location = r.headers.get("location")
                    if not location:
                        raise DocumentError("Stránka přesměrovává bez cílové adresy.")
                    url = urljoin(url, location)
                    continue
                if r.status_code >= 400:
                    raise DocumentError(f"Stránka vrátila chybu HTTP {r.status_code}.")
                declared = r.headers.get("content-length", "")
                if declared.isdigit() and int(declared) > MAX_BYTES:
                    raise DocumentError("Dokument je větší než 15 MB.")
                body = bytearray()
                for chunk in r.iter_bytes():
                    body += chunk
                    if len(body) > MAX_BYTES:
                        raise DocumentError("Dokument je větší než 15 MB.")
                return str(r.url), r.headers.get("content-type", ""), bytes(body)
        except httpx.HTTPError as e:
            raise DocumentError("Stránku se nepodařilo načíst. Zkontrolujte odkaz nebo nahrajte PDF.") from e
    raise DocumentError("Odkaz přesměrovává příliš mnohokrát.")


# ---- parsing -------------------------------------------------------------------------------


def _kind(content_type: str, data: bytes, name: str) -> Kind | None:
    mime = content_type.split(";", 1)[0].strip().lower()
    path = urlsplit(name).path.lower() if "://" in name else name.lower()
    if data[:5] == b"%PDF-":
        return "pdf"
    if data[:2] == b"PK" and (mime == DOCX_MIME or path.endswith(".docx")):
        return "docx"
    head = data[:512].lstrip().lower()
    if mime in ("text/html", "application/xhtml+xml") or head.startswith((b"<!doctype html", b"<html")):
        return "html"
    return None


def _chunks(text: str) -> list[str]:
    """Split on line boundaries into ~CHUNK_CHARS blocks."""
    out: list[str] = []
    buf: list[str] = []
    size = 0
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        if size + len(line) > CHUNK_CHARS and buf:
            out.append("\n".join(buf))
            buf, size = [], 0
        buf.append(line[:CHUNK_CHARS])
        size += len(line) + 1
    if buf:
        out.append("\n".join(buf))
    return out


def _pdf_sources(data: bytes, name: str, url: str, prefix: str, notes: list[str]) -> list[Source]:
    try:
        reader = PdfReader(io.BytesIO(data))
        if reader.is_encrypted and not reader.decrypt(""):
            raise DocumentError(f"{name}: PDF je zaheslované.")
        pages = reader.pages
    except PyPdfError as e:
        raise DocumentError(f"{name}: PDF se nepodařilo přečíst.") from e

    sources: list[Source] = []
    for i, page in enumerate(pages):
        if i >= MAX_PDF_PAGES:
            notes.append(f"{name}: přečetl jsem jen prvních {MAX_PDF_PAGES} stran.")
            break
        try:
            text = page.extract_text() or ""
        except Exception:  # pypdf raises assorted errors on malformed pages; skip the page
            log.warning("Unreadable page %d in %s", i + 1, name, exc_info=True)
            continue
        text = re.sub(r"[ \t]+", " ", text).strip()
        if text:
            page_url = f"{url}#page={i + 1}" if url else ""
            sources.append(Source(f"{prefix}-p{i + 1}", f"{name}, str. {i + 1}", text, page_url, i + 1))
    if not sources:
        notes.append(f"{name}: PDF neobsahuje text (nejspíš sken), bez OCR z něj nic nevyčtu.")
    return sources


def _docx_sources(data: bytes, name: str, url: str, prefix: str) -> list[Source]:
    try:
        doc = load_docx(io.BytesIO(data))
    except Exception as e:  # python-docx surfaces zip/xml errors of a broken file
        raise DocumentError(f"{name}: DOCX se nepodařilo přečíst.") from e
    lines: list[str] = []
    for p in doc.paragraphs:
        text = p.text.strip()
        if not text:
            continue
        style = (p.style.name if p.style is not None else "").lower()
        # Keep headings visible — they usually are the outline.
        lines.append(f"## {text}" if style.startswith(("heading", "nadpis", "title")) else text)
    for table in doc.tables:
        for row in table.rows:
            cells = [c.text.strip() for c in row.cells if c.text.strip()]
            if cells:
                lines.append(" | ".join(dict.fromkeys(cells)))
    return [
        Source(f"{prefix}-c{i + 1}", f"{name}, část {i + 1}", chunk, url)
        for i, chunk in enumerate(_chunks("\n".join(lines)))
    ]


def _html(data: bytes, url: str) -> tuple[str, str, list[tuple[str, str]]]:
    """→ (title, main text, [(absolute href, link text)])."""
    soup = BeautifulSoup(data, "lxml")
    title = soup.title.get_text(" ", strip=True) if soup.title else ""
    links = [
        (urljoin(url, a["href"]), a.get_text(" ", strip=True))
        for a in soup.find_all("a", href=True)
        if not str(a["href"]).startswith(("#", "mailto:", "javascript:", "tel:"))
    ]
    for tag in soup(["script", "style", "noscript", "nav", "footer", "header", "form", "svg", "iframe", "template"]):
        tag.decompose()
    root = soup.find("main") or soup.find("article") or soup.body or soup
    return title, root.get_text("\n", strip=True), links


def _fold(text: str) -> str:
    return unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode().lower()


def _document_links(links: list[tuple[str, str]]) -> list[str]:
    """Linked PDF/DOCX files most likely to hold the outline, best first."""
    scored: dict[str, int] = {}
    for href, text in links:
        path = urlsplit(href).path.lower()
        if not path.endswith((".pdf", ".docx")):
            continue
        haystack = _fold(f"{text} {unquote(path)}")
        score = sum(w for k, w in LINK_KEYWORDS.items() if k in haystack)
        if score > 0:
            scored[href] = max(score, scored.get(href, 0))
    return sorted(scored, key=lambda h: -scored[h])[:MAX_LINKED_DOCS]


def _file_name(url: str) -> str:
    name = urlsplit(url).path.rstrip("/").rsplit("/", 1)[-1]
    return name or urlsplit(url).hostname or "dokument"


def _parse(kind: Kind, data: bytes, name: str, url: str, prefix: str, notes: list[str]) -> list[Source]:
    if kind == "pdf":
        return _pdf_sources(data, name, url, prefix, notes)
    if kind == "docx":
        return _docx_sources(data, name, url, prefix)
    raise AssertionError(kind)


def _outline_score(s: Source) -> float:
    text = _fold(s.text)
    hits = sum(text.count(w) for w in OUTLINE_WORDS)
    # Linked documents beat the web page; the density keeps long pages from winning on length alone.
    return hits / (1 + len(text) / 1000) + (0.5 if s.id.startswith("d") else 0)


def _budget(docs: Documents) -> Documents:
    """Keep the prompt bounded: past MAX_TOTAL_CHARS keep the pages most likely to hold the outline
    and limits, in their original order."""
    if sum(len(s.text) for s in docs.sources) <= MAX_TOTAL_CHARS:
        return docs
    keep: set[str] = set()
    total = 0
    for s in sorted(docs.sources, key=_outline_score, reverse=True):
        if total + len(s.text) <= MAX_TOTAL_CHARS:
            keep.add(s.id)
            total += len(s.text)
    docs.sources = [s for s in docs.sources if s.id in keep]
    docs.notes.append(
        "Dokumentace je dlouhá, vybral jsem z ní strany s osnovou a limity. Zkontrolujte, že žádná sekce nechybí."
    )
    return docs


# ---- public --------------------------------------------------------------------------------


def fetch_documents(url: str, *, client: httpx.Client | None = None) -> Documents:
    """Raises DocumentError when the link itself can't be read; linked documents fail softly (notes)."""
    own = client is None
    http = client or httpx.Client(timeout=TIMEOUT, follow_redirects=False)
    try:
        final_url, content_type, data = _download(http, url)
        kind = _kind(content_type, data, final_url)
        if kind is None:
            raise DocumentError("Odkaz nevede na webovou stránku, PDF ani DOCX.")
        if kind != "html":
            name = _file_name(final_url)
            notes: list[str] = []
            return _budget(Documents(name, final_url, _parse(kind, data, name, final_url, "d1", notes), notes))

        title, text, links = _html(data, final_url)
        docs = Documents(title or _file_name(final_url), final_url)
        docs.sources = [
            Source(f"w-{i + 1}", f"Web výzvy, část {i + 1}", chunk, final_url)
            for i, chunk in enumerate(_chunks(text))
        ]
        for n, href in enumerate(_document_links(links), start=1):
            name = _file_name(href)
            try:
                doc_url, doc_type, doc_data = _download(http, href)
                doc_kind = _kind(doc_type, doc_data, doc_url)
                if doc_kind in ("pdf", "docx"):
                    docs.sources += _parse(doc_kind, doc_data, name, doc_url, f"d{n}", docs.notes)
            except DocumentError as e:
                log.info("Linked document skipped: %s (%s)", href, e)
                docs.notes.append(f"Přílohu {name} se nepodařilo načíst.")
        return _budget(docs)
    finally:
        if own:
            http.close()


def read_upload(file_name: str, data: bytes, content_type: str = "") -> Documents:
    if len(data) > MAX_BYTES:
        raise DocumentError("Soubor je větší než 15 MB.")
    name = file_name.rsplit("/", 1)[-1].rsplit("\\", 1)[-1] or "dokument"
    kind = _kind(content_type, data, name)
    if kind not in ("pdf", "docx"):
        raise DocumentError("Nahrajte PDF nebo DOCX se zadávací dokumentací.")
    notes: list[str] = []
    return _budget(Documents(name, "", _parse(kind, data, name, "", "d1", notes), notes))
