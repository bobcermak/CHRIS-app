from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()  # must run before any module reads AZURE_APIM_* etc.

from backend.routers import application_pdf, clarify, copilot, deep_search, drafts, grants, groups, match, templates  # noqa: E402
from backend.services.grants_index import get_grants_index  # noqa: E402
from backend.services.grants_repo import load_grants  # noqa: E402
from backend.services.groups_index import get_index  # noqa: E402
from backend.services.groups_repo import load_groups  # noqa: E402

app = FastAPI(
    title="NÚVR Research Matchmaker",
    description="Match a researcher's idea to NÚVR groups, technologies, and grants.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(groups.router)
app.include_router(grants.router)
app.include_router(clarify.router)
app.include_router(match.router)
app.include_router(drafts.router)
app.include_router(deep_search.router)
app.include_router(templates.router)
app.include_router(copilot.router)
app.include_router(application_pdf.router)


@app.on_event("startup")
def warm_cache() -> None:
    load_groups()
    load_grants()
    get_index()
    get_grants_index()


@app.get("/health")
def health() -> dict[str, str | int]:
    return {
        "status": "ok",
        "groups": len(load_groups()),
        "grants": len(load_grants()),
    }