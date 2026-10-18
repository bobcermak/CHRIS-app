"""Perplexity Agent API client.

Perplexity migrated Sonar to the Agent API in 2026. We call `/v1/responses`
with a `preset` (intensity) and `input` (query); the API autonomously picks a
model, runs web search, and returns a structured response with text + source
results.

Response shape (observed):
    {
      "model": "<provider/model>",
      "output": [
        {"queries": [...], "results": [{"url", "title", "snippet", ...}]},
        {"type": "message", "content": [{"type": "output_text", "text": "..."}]}
      ]
    }
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any

import httpx

PERPLEXITY_URL = "https://api.perplexity.ai/v1/responses"
# Intensity presets accepted by the API: fast | low | medium | high | xhigh.
# `high` is a reasonable deep-research default: thorough enough to cite several
# sources, fast enough to keep UI latency under a minute.
DEFAULT_PRESET = "high"
DEFAULT_TIMEOUT_S = 180.0


class DeepSearchError(RuntimeError):
    """Perplexity call failed (missing key, network, non-200, bad shape)."""


@dataclass(frozen=True)
class PerplexityAnswer:
    content: str                 # markdown narrative
    citation_urls: list[str]     # ordered, deduplicated source URLs


def _api_key() -> str:
    key = os.environ.get("PERPLEXITY_API_KEY", "").strip()
    if not key:
        raise DeepSearchError("PERPLEXITY_API_KEY not configured.")
    return key


def _extract_text(output: list[dict[str, Any]]) -> str:
    """Find the final answer text in the agent output list."""
    for item in output:
        if item.get("type") != "message":
            continue
        for piece in item.get("content", []):
            if piece.get("type") == "output_text":
                text = piece.get("text")
                if isinstance(text, str) and text.strip():
                    return text
    # Fallback: concat any text we can find.
    chunks: list[str] = []
    for item in output:
        for piece in item.get("content", []) or []:
            text = piece.get("text") if isinstance(piece, dict) else None
            if isinstance(text, str):
                chunks.append(text)
    return "\n".join(chunks).strip()


def _extract_urls(output: list[dict[str, Any]]) -> list[str]:
    """Pull ordered, deduplicated URLs from any `results` arrays in the output."""
    seen: set[str] = set()
    urls: list[str] = []
    for item in output:
        for result in item.get("results", []) or []:
            if not isinstance(result, dict):
                continue
            url = result.get("url")
            if isinstance(url, str) and url and url not in seen:
                seen.add(url)
                urls.append(url)
    return urls


def ask_perplexity(prompt: str, preset: str = DEFAULT_PRESET) -> PerplexityAnswer:
    """One-shot Agent API call with web search. Raises DeepSearchError on failure."""
    headers = {
        "Authorization": f"Bearer {_api_key()}",
        "Content-Type": "application/json",
    }
    body = {"preset": preset, "input": prompt}
    try:
        resp = httpx.post(PERPLEXITY_URL, json=body, headers=headers, timeout=DEFAULT_TIMEOUT_S)
    except httpx.HTTPError as e:
        raise DeepSearchError(f"Network error calling Perplexity: {e}") from e
    if resp.status_code != 200:
        raise DeepSearchError(f"Perplexity returned {resp.status_code}: {resp.text[:300]}")
    try:
        data = resp.json()
    except ValueError as e:
        raise DeepSearchError(f"Perplexity returned non-JSON body: {resp.text[:200]}") from e
    output = data.get("output")
    if not isinstance(output, list) or not output:
        raise DeepSearchError(f"Unexpected Perplexity response (no `output`): {str(data)[:300]}")
    content = _extract_text(output)
    if not content:
        raise DeepSearchError(f"Perplexity returned empty answer: {str(data)[:300]}")
    return PerplexityAnswer(content=content, citation_urls=_extract_urls(output))
