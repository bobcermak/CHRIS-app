"""A4 PDF of an application draft, rendered with fpdf2.

Fonts: DejaVu Sans (data/fonts, free licence) — full Czech coverage, which the PDF core
fonts lack. Section markdown is converted to the small HTML subset fpdf2's `write_html`
understands; every piece of text is HTML-escaped first, so nothing in a section can inject
markup.
"""

from __future__ import annotations

import html
import re
from datetime import date
from pathlib import Path

from fpdf import FPDF, TextStyle

from backend.schemas.application_pdf import ApplicationPdfRequest

FONT_DIR = Path(__file__).resolve().parents[3] / "data" / "fonts"
FONT = "DejaVu"
AI_DRAFT_NOTICE = "AI-assisted draft — oficiální podání pouze v ISVP/GRIS."
MONTHS = [
    "ledna", "února", "března", "dubna", "května", "června",
    "července", "srpna", "září", "října", "listopadu", "prosince",
]  # fmt: skip

# write_html defaults to dark-red headings and bullets; the document is black and plain.
HTML_STYLES = {
    "h4": TextStyle(font_family=FONT, font_style="B", font_size_pt=11, color=0, t_margin=3, b_margin=1.5),
    "p": TextStyle(font_family=FONT, font_size_pt=10.5, color=0, t_margin=0, b_margin=2.5),
    "ul": TextStyle(t_margin=0, b_margin=2.5),
    "ol": TextStyle(t_margin=0, b_margin=2.5),
    "li": TextStyle(l_margin=5, t_margin=0, b_margin=0.5),
}
BULLET = re.compile(r"^\s*[-*•]\s+")
NUMBERED = re.compile(r"^\s*\d+[.)]\s+")
HEADING = re.compile(r"^\s*#{1,6}\s+")
BOLD = re.compile(r"\*\*(.+?)\*\*")
ITALIC = re.compile(r"\*(.+?)\*")


def _inline(text: str) -> str:
    """Escaped text with **bold** → <b>, *italic* → <i>."""
    escaped = html.escape(text, quote=False)
    return ITALIC.sub(r"<i>\1</i>", BOLD.sub(r"<b>\1</b>", escaped))


def markdown_to_html(text: str) -> str:
    """The markdown subset of sections → write_html-compatible HTML."""
    lines = text.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    out: list[str] = []
    i = 0
    while i < len(lines):
        line = lines[i]
        if not line.strip():
            i += 1
            continue
        if HEADING.match(line):
            out.append(f"<h4>{_inline(HEADING.sub('', line))}</h4>")
            i += 1
            continue
        pattern = BULLET if BULLET.match(line) else NUMBERED if NUMBERED.match(line) else None
        if pattern is not None:
            tag = "ul" if pattern is BULLET else "ol"
            items: list[str] = []
            while i < len(lines) and pattern.match(lines[i]):
                items.append(f"<li>{_inline(pattern.sub('', lines[i]))}</li>")
                i += 1
            out.append(f"<{tag}>{''.join(items)}</{tag}>")
            continue
        para: list[str] = []
        while (
            i < len(lines)
            and lines[i].strip()
            and not HEADING.match(lines[i])
            and not BULLET.match(lines[i])
            and not NUMBERED.match(lines[i])
        ):
            para.append(lines[i].strip())
            i += 1
        out.append(f"<p>{_inline(' '.join(para))}</p>")
    return "".join(out)


class _ApplicationPdf(FPDF):
    def footer(self) -> None:
        self.set_y(-12)
        self.set_font(FONT, size=8)
        self.set_text_color(110)
        self.cell(0, 6, f"{self.page_no()} / {{nb}}", align="C")


def render(req: ApplicationPdfRequest, today: date | None = None) -> bytes:
    today = today or date.today()
    pdf = _ApplicationPdf(format="A4")
    pdf.set_margins(left=16, top=18, right=16)
    pdf.set_auto_page_break(auto=True, margin=20)
    pdf.add_font(FONT, "", FONT_DIR / "DejaVuSans.ttf")
    pdf.add_font(FONT, "B", FONT_DIR / "DejaVuSans-Bold.ttf")
    pdf.add_font(FONT, "I", FONT_DIR / "DejaVuSans-Oblique.ttf")
    pdf.add_font(FONT, "BI", FONT_DIR / "DejaVuSans-BoldOblique.ttf")
    pdf.set_title(req.title)
    pdf.set_creator("CHRIS — NÚVR Research Matchmaker")
    pdf.add_page()

    # Header: call line, title, date.
    if req.subtitle:
        pdf.set_font(FONT, size=8)
        pdf.set_text_color(90)
        pdf.multi_cell(0, 4.5, req.subtitle.upper(), new_x="LMARGIN", new_y="NEXT")
        pdf.ln(1)
    pdf.set_text_color(0)
    pdf.set_font(FONT, "B", 17)
    pdf.multi_cell(0, 8, req.title, new_x="LMARGIN", new_y="NEXT")
    pdf.set_font(FONT, size=8.5)
    pdf.set_text_color(90)
    pdf.cell(0, 6, f"Koncept přihlášky · {today.day}. {MONTHS[today.month - 1]} {today.year}", new_x="LMARGIN", new_y="NEXT")
    pdf.set_draw_color(170)
    pdf.line(pdf.l_margin, pdf.get_y() + 1, pdf.w - pdf.r_margin, pdf.get_y() + 1)
    pdf.ln(6)

    for n, section in enumerate(req.sections, 1):
        # Keep a heading together with the start of its text.
        if pdf.get_y() > pdf.h - pdf.b_margin - 25:
            pdf.add_page()
        pdf.set_text_color(0)
        pdf.set_font(FONT, "B", 12)
        pdf.multi_cell(0, 6.5, f"{n}. {section.title}", new_x="LMARGIN", new_y="NEXT")
        pdf.ln(1)
        pdf.set_font(FONT, size=10.5)
        if section.content_md.strip():
            pdf.write_html(
                markdown_to_html(section.content_md),
                font_family=FONT,
                tag_styles=HTML_STYLES,
                li_prefix_color=(0, 0, 0),
            )
        else:
            pdf.set_font(FONT, "I", 10.5)
            pdf.set_text_color(90)
            pdf.multi_cell(0, 6, "Sekce není vyplněná.", new_x="LMARGIN", new_y="NEXT")
        pdf.ln(4)

    # Notices at the end, the AI-draft one always.
    pdf.ln(4)
    pdf.set_draw_color(170)
    pdf.line(pdf.l_margin, pdf.get_y(), pdf.w - pdf.r_margin, pdf.get_y())
    pdf.ln(2)
    pdf.set_font(FONT, size=8)
    pdf.set_text_color(60)
    for notice in [AI_DRAFT_NOTICE, *(n for n in req.notices if n.strip() and n.strip() != AI_DRAFT_NOTICE)]:
        pdf.multi_cell(0, 4.5, notice, new_x="LMARGIN", new_y="NEXT")
    return bytes(pdf.output())
