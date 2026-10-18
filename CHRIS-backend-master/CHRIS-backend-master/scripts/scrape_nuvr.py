"""Scrape NÚVR research groups into a denormalized JSON file.

Usage:
    uv run python scripts/scrape_nuvr.py --limit 5
    uv run python scripts/scrape_nuvr.py --limit 0 --output data/groups.json
    # Only (re)fill `photo_url` in an existing file, leaving every other field as is:
    uv run python scripts/scrape_nuvr.py --photos-only --output data/groups.json
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from pathlib import Path
from typing import Any

import httpx
from bs4 import BeautifulSoup

API_BASE = "https://www.nuvr.cz/wp-json/wp/v2"
GROUP_URL = "https://www.nuvr.cz/vedec/{slug}/"
HTTP_TIMEOUT = 20.0
RETRY = 1

SECTION_HEADINGS = {
    "publications": "VYBRANÉ PUBLIKACE",
    "expertise": "EXPERTIZA A TECHNOLOGIE",
    "collaborations": "SPOLUPRÁCE V NÚVR",
    "infrastructures": "ZAPOJENÍ DO INFRASTRUKTUR",
}

UPLOADS_PREFIX = "https://www.nuvr.cz/wp-content/uploads/"
EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
WHITESPACE_RE = re.compile(r"\s+")


def fetch(client: httpx.Client, url: str, *, params: dict | None = None) -> httpx.Response:
    last_exc: Exception | None = None
    for attempt in range(RETRY + 1):
        try:
            r = client.get(url, params=params, timeout=HTTP_TIMEOUT)
            r.raise_for_status()
            return r
        except httpx.HTTPError as e:
            last_exc = e
            if attempt < RETRY:
                time.sleep(0.5)
    raise last_exc  # type: ignore[misc]


def fetch_all_paged(client: httpx.Client, endpoint: str) -> list[dict]:
    """Fetch all pages from a WordPress REST endpoint (follows X-WP-TotalPages)."""
    results: list[dict] = []
    page = 1
    while True:
        r = fetch(client, f"{API_BASE}/{endpoint}", params={"per_page": 100, "page": page})
        results.extend(r.json())
        total_pages = int(r.headers.get("X-WP-TotalPages", "1"))
        if page >= total_pages:
            break
        page += 1
    return results


def load_taxonomy(client: httpx.Client, endpoint: str) -> dict[int, str]:
    terms = fetch_all_paged(client, endpoint)
    return {t["id"]: t["name"] for t in terms}


def clean_text(text: str) -> str:
    return WHITESPACE_RE.sub(" ", text).strip()


def extract_section_items(soup: BeautifulSoup, heading_text: str) -> list[str]:
    """Each tab lives in <section id="zalozkaN">. zalozka1 (intro) also holds the tab
    nav with matching heading text, so we skip it. Within the right tab, iterate
    `.column_attr` blocks and emit one item per <p>/<li> (or the whole block if
    neither is present)."""
    for heading_node in soup.find_all(string=re.compile(re.escape(heading_text), re.IGNORECASE)):
        section = heading_node.find_parent("section", id=re.compile(r"^zalozka\d+$"))
        if section is None or section.get("id") == "zalozka1":
            continue
        items: list[str] = []
        for block in section.find_all(class_="column_attr"):
            fragments = block.find_all(["li", "p"])
            if fragments:
                items.extend(clean_text(f.get_text(" ", strip=True)) for f in fragments)
            else:
                items.append(clean_text(block.get_text(" ", strip=True)))
        return [it for it in items if it]
    return []


def parse_mission_vision_focus(soup: BeautifulSoup) -> tuple[str, str, str]:
    """Mise/Vize sit in a <ul> at the top, intro paragraph is the 'focus' preview.
    Full focus continues in a hidden `.vedecTextVice` block (expanded by 'Více' button)."""
    mission = vision = ""
    focus_parts: list[str] = []

    mise_node = soup.find(string=re.compile(r"Mise\s*:"))
    if mise_node:
        li = mise_node.find_parent("li")
        if li:
            mission = clean_text(li.get_text(" ", strip=True)).removeprefix("Mise:").strip()
            ul = li.find_parent("ul")
            if ul:
                for item in ul.find_all("li"):
                    text = clean_text(item.get_text(" ", strip=True))
                    if text.lower().startswith("vize:"):
                        vision = text.removeprefix("Vize:").removeprefix("vize:").strip()

                # paragraphs after the ul = focus preview
                for sib in ul.find_all_next():
                    if sib.name == "p":
                        focus_parts.append(clean_text(sib.get_text(" ", strip=True)))
                    if sib.name in ("h1", "h2", "h3", "h4", "h5"):
                        break

    hidden = soup.find(class_="vedecTextVice")
    if hidden:
        focus_parts.append(clean_text(hidden.get_text(" ", strip=True)))

    focus = clean_text(" ".join(p for p in focus_parts if p))
    return mission, vision, focus


def parse_header(soup: BeautifulSoup) -> dict[str, str]:
    """Extract PI name, email, website from the header block."""
    out = {"pi": "", "email": "", "website": ""}

    pi_node = soup.find(string=re.compile(r"Vedoucí\s+skupiny\s*:"))
    if pi_node:
        parent = pi_node.find_parent()
        if parent:
            text = clean_text(parent.get_text(" ", strip=True))
            m = re.search(r"Vedoucí\s+skupiny\s*:\s*(.+?)(?:$|Uzel|Výzkumný)", text)
            if m:
                out["pi"] = m.group(1).strip()

    text_all = soup.get_text(" ", strip=True)
    email_match = EMAIL_RE.search(text_all)
    if email_match:
        out["email"] = email_match.group(0)

    for a in soup.find_all("a"):
        if "webové stránky pracoviště" in a.get_text(strip=True).lower():
            out["website"] = a.get("href", "")
            break

    return out


def parse_photo(soup: BeautifulSoup) -> str:
    """PI portrait. `og:image` is the square portrait on every group page; fall back
    to the image module in the content, then the (wide-cropped) featured image."""
    candidates: list[str] = []
    og = soup.find("meta", property="og:image")
    if og:
        candidates.append(og.get("content", ""))
    content_img = soup.select_one(".column_image img")
    if content_img:
        candidates.append(content_img.get("src", ""))
    featured = soup.select_one("img.wp-post-image")
    if featured:
        candidates.append(featured.get("src", ""))
    # Only images uploaded to the NÚVR site — never logos/flags from plugins or themes.
    return next((c for c in candidates if c.startswith(UPLOADS_PREFIX)), "")


def scrape_group(
    client: httpx.Client,
    api_record: dict,
    nodes: dict[int, str],
    faculties: dict[int, str],
    programs: dict[int, str],
) -> dict[str, Any]:
    slug = api_record["slug"]
    name = api_record.get("title", {}).get("rendered") or slug
    url = api_record.get("link") or GROUP_URL.format(slug=slug)

    r = fetch(client, url)
    soup = BeautifulSoup(r.text, "lxml")

    header = parse_header(soup)
    mission, vision, focus = parse_mission_vision_focus(soup)

    return {
        "slug": slug,
        "name": name,
        "pi": header["pi"] or name,
        "url": url,
        "email": header["email"],
        "website": header["website"],
        "photo_url": parse_photo(soup),
        "node": next((nodes[i] for i in api_record.get("uzel", []) if i in nodes), ""),
        "faculties": [faculties[i] for i in api_record.get("faktulty_ustavy", []) if i in faculties],
        "programs": [programs[i] for i in api_record.get("vyzkumny-program", []) if i in programs],
        "mission": mission,
        "vision": vision,
        "focus": focus,
        "publications": extract_section_items(soup, SECTION_HEADINGS["publications"]),
        "expertise": extract_section_items(soup, SECTION_HEADINGS["expertise"]),
        "collaborations": extract_section_items(soup, SECTION_HEADINGS["collaborations"]),
        "infrastructures": extract_section_items(soup, SECTION_HEADINGS["infrastructures"]),
    }


def fill_photos(path: Path, delay: float) -> int:
    """Add `photo_url` to an existing groups file in place; other fields stay untouched
    (so the embeddings built from them stay valid)."""
    groups = json.loads(path.read_text(encoding="utf-8"))
    missing: list[str] = []
    with httpx.Client(headers={"User-Agent": "nuvr-matchmaker-scraper/0.1"}) as client:
        for i, group in enumerate(groups, 1):
            try:
                soup = BeautifulSoup(fetch(client, group["url"]).text, "lxml")
                group["photo_url"] = parse_photo(soup)
            except httpx.HTTPError as e:
                print(f"    ✗ {group['slug']}: {e}")
            if not group.get("photo_url"):
                missing.append(group["slug"])
            print(f"  [{i}/{len(groups)}] {group['slug']}: {group.get('photo_url') or '—'}")
            if delay and i < len(groups):
                time.sleep(delay)
    path.write_text(json.dumps(groups, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n✓ fotky: {len(groups) - len(missing)}/{len(groups)}  → {path}")
    for slug in missing:
        print(f"  - bez fotky: {slug}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Scrape NÚVR research groups into denormalized JSON.")
    parser.add_argument("--limit", type=int, default=5, help="Max number of groups (0 = all).")
    parser.add_argument("--output", type=Path, default=Path("data/groups.json"))
    parser.add_argument("--delay", type=float, default=0.3, help="Seconds between HTTP requests.")
    parser.add_argument("--photos-only", action="store_true", help="Only fill `photo_url` in an existing --output file.")
    args = parser.parse_args()

    if args.photos_only:
        return fill_photos(args.output, args.delay)

    args.output.parent.mkdir(parents=True, exist_ok=True)

    with httpx.Client(headers={"User-Agent": "nuvr-matchmaker-scraper/0.1"}) as client:
        print("→ Fetching taxonomies (uzel, faktulty_ustavy, vyzkumny-program)...")
        nodes = load_taxonomy(client, "uzel")
        faculties = load_taxonomy(client, "faktulty_ustavy")
        programs = load_taxonomy(client, "vyzkumny-program")
        print(f"  uzly: {len(nodes)}  pracoviště: {len(faculties)}  VP: {len(programs)}")

        print("→ Fetching group index...")
        groups_index = fetch_all_paged(client, "vedec")
        print(f"  nalezeno {len(groups_index)} skupin")

        targets = groups_index if args.limit == 0 else groups_index[: args.limit]
        print(f"→ Scraping {len(targets)} skupin...")

        results: list[dict] = []
        failures: list[tuple[str, str]] = []
        for i, record in enumerate(targets, 1):
            slug = record["slug"]
            print(f"  [{i}/{len(targets)}] {slug}")
            try:
                results.append(scrape_group(client, record, nodes, faculties, programs))
            except Exception as e:  # noqa: BLE001
                failures.append((slug, repr(e)))
                print(f"    ✗ FAIL: {e}")
            if args.delay and i < len(targets):
                time.sleep(args.delay)

    args.output.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"\n✓ OK: {len(results)}  ✗ FAIL: {len(failures)}  → {args.output}")
    for slug, err in failures:
        print(f"  - {slug}: {err}")
    return 0 if not failures else 1


if __name__ == "__main__":
    sys.exit(main())
