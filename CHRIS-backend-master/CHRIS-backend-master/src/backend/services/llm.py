"""Chat/LLM abstraction.

Provider is selected via `CHAT_PROVIDER` env var:
  - `azure-apim` (default) — Azure OpenAI-compatible endpoint via the Rakathon APIM
                             gateway. Reads AZURE_APIM_{KEY,ENDPOINT,MODEL} +
                             AZURE_API_VERSION.
  - `mock`                 — static responses, for tests / offline dev.

The two Protocol methods map onto the typical uses:
  - complete_json: structured output (role plan, explanations). Uses OpenAI's
                   `response_format={"type": "json_object"}` so the gateway
                   enforces valid JSON.
  - complete_text: free-form text (future: human-readable summaries).
"""

from __future__ import annotations

import json
import os
from typing import Any, Protocol

import httpx

DEFAULT_MODEL = "deepseek-v4-pro-global"
DEFAULT_API_VERSION = "2024-10-21"
DEFAULT_TIMEOUT = 90.0


class LLMError(RuntimeError):
    """Raised when the chat endpoint fails or returns unparseable output."""


class ChatClient(Protocol):
    name: str

    def complete_json(self, system: str, user: str) -> dict[str, Any]: ...

    def complete_text(self, system: str, user: str) -> str: ...


class MockChatClient:
    """Returns canned responses. Only useful when AZURE_APIM_KEY is missing."""

    name = "mock-chat"

    def complete_json(self, system: str, user: str) -> dict[str, Any]:
        if "archetype" in system or "THE BIG CLAIM" in system:
            return {
                "title": "Precision Phage Delivery: Overcoming the Tumor Microbiome",
                "archetype": "THE BIG CLAIM",
                "alternatives": [
                    "Why Most Colorectal Tumors Rely on Fusobacterium",
                    "Target. Infiltrate. Eliminate.",
                ],
            }
        return {"mock": True, "echo": user[:200]}

    def complete_text(self, system: str, user: str) -> str:
        return f"[mock] {user[:200]}"


class AzureAPIMChatClient:
    """OpenAI-compatible chat completions via the Rakathon APIM gateway.

    The gateway exposes an OpenAI-shaped API (endpoint ends in `/openai/v1`), so
    we POST to `{endpoint}/chat/completions` with `model` in the request body —
    not Azure's deployment-in-URL convention.

    Auth: `api-key` header (APIM gateway rule, same name Azure OpenAI uses).
    """

    def __init__(
        self,
        *,
        endpoint: str,
        api_key: str,
        model: str = DEFAULT_MODEL,
        temperature: float = 0.2,
        timeout: float = DEFAULT_TIMEOUT,
    ) -> None:
        self.name = model
        self._endpoint = endpoint.rstrip("/")
        self._api_key = api_key
        self._model = model
        self._temperature = temperature
        self._client = httpx.Client(timeout=timeout)

    def _url(self) -> str:
        return f"{self._endpoint}/chat/completions"

    def _call(self, messages: list[dict[str, str]], *, json_mode: bool) -> str:
        body: dict[str, Any] = {
            "model": self._model,
            "messages": messages,
            "temperature": self._temperature,
        }
        if json_mode:
            body["response_format"] = {"type": "json_object"}

        try:
            r = self._client.post(
                self._url(),
                headers={"api-key": self._api_key, "Content-Type": "application/json"},
                json=body,
            )
            r.raise_for_status()
        except httpx.HTTPError as e:
            raise LLMError(f"APIM request failed: {e!r}") from e

        try:
            data = r.json()
            content = data["choices"][0]["message"]["content"]
            if not isinstance(content, str):
                raise LLMError(f"Unexpected content type: {type(content).__name__}")
            return content
        except (KeyError, IndexError, ValueError) as e:
            raise LLMError(f"Malformed APIM response: {e!r}; body={r.text[:400]}") from e

    def complete_json(self, system: str, user: str) -> dict[str, Any]:
        raw = self._call(
            [{"role": "system", "content": system}, {"role": "user", "content": user}],
            json_mode=True,
        )
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError as e:
            raise LLMError(f"LLM returned invalid JSON: {e!r}; raw={raw[:400]}") from e
        if not isinstance(parsed, dict):
            raise LLMError(f"LLM returned non-object JSON: {type(parsed).__name__}")
        return parsed

    def complete_text(self, system: str, user: str) -> str:
        return self._call(
            [{"role": "system", "content": system}, {"role": "user", "content": user}],
            json_mode=False,
        )


def get_chat_client() -> ChatClient:
    provider = os.environ.get("CHAT_PROVIDER", "azure-apim").lower()
    if provider == "mock":
        return MockChatClient()
    if provider == "azure-apim":
        key = os.environ.get("AZURE_APIM_KEY")
        endpoint = os.environ.get("AZURE_APIM_ENDPOINT")
        if not key or not endpoint:
            raise LLMError(
                "AZURE_APIM_KEY and AZURE_APIM_ENDPOINT must be set in .env "
                "(or set CHAT_PROVIDER=mock to run without the gateway)."
            )
        return AzureAPIMChatClient(
            endpoint=endpoint,
            api_key=key,
            model=os.environ.get("AZURE_APIM_MODEL", DEFAULT_MODEL),
        )
    raise LLMError(f"Unknown CHAT_PROVIDER: {provider!r}")
