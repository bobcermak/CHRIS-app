"""POST /application/pdf — an A4 PDF of the application draft."""

from datetime import date

from fastapi.testclient import TestClient
from backend.main import app
from backend.schemas.application_pdf import ApplicationPdfRequest, PdfSection
from backend.services.application_pdf import markdown_to_html, render

client = TestClient(app)

BODY = {
    "title": "Rezistence karcinomu vaječníků: příliš žluťoučký kůň",
    "subtitle": "AZV ČR · standardní projekt",
    "sections": [
        {"title": "Abstrakt", "content_md": "Cílem je **ověřit hypotézu** o *rezistenci*.\n\n## Metody\n- organoidy\n- PDX modely\n\n1. první\n2. druhý"},
        {"title": "Harmonogram", "content_md": ""},
    ],
}


def test_returns_a_pdf_download() -> None:
    r = client.post("/application/pdf", json=BODY)
    assert r.status_code == 200, r.text
    assert r.headers["content-type"] == "application/pdf"
    assert r.content.startswith(b"%PDF")
    assert "attachment" in r.headers["content-disposition"]
    assert "filename*=UTF-8''P%C5%99ihl%C3%A1%C5%A1ka" in r.headers["content-disposition"]


def test_markdown_subset_is_escaped_html() -> None:
    out = markdown_to_html("A <script>x</script> **b** *i*\n- one\n- two\n\n1. x\n# Nadpis")
    assert "<script>" not in out and "&lt;script&gt;" in out
    assert "<b>b</b>" in out and "<i>i</i>" in out
    assert "<ul><li>one</li><li>two</li></ul>" in out
    assert "<ol><li>x</li></ol>" in out and "<h4>Nadpis</h4>" in out


def test_czech_text_and_long_content_render() -> None:
    long = "\n\n".join(f"Odstavec {i}: žluťoučký kůň úpěl ďábelské ódy." * 5 for i in range(80))
    req = ApplicationPdfRequest(title="Test", sections=[PdfSection(title="Dlouhá sekce", content_md=long)])
    pdf = render(req, today=date(2026, 10, 17))
    assert pdf.startswith(b"%PDF") and len(pdf) > 10_000


def test_empty_sections_list_is_rejected() -> None:
    assert client.post("/application/pdf", json={**BODY, "sections": []}).status_code == 422
