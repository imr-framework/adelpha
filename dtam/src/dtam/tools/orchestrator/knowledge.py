"""Knowledge-base search tools."""

from __future__ import annotations

from typing import Any

from dtam.tools.base import error_result, ok_result
from dtam.tools.paths import knowledge_root


def search_knowledge(query: str, domain: str = "orchestrator") -> dict[str, Any]:
    """Search markdown/text knowledge files under data/knowledge/<domain>/."""
    root = knowledge_root() / domain
    if not root.is_dir():
        return error_result(
            "search_knowledge",
            f"Knowledge directory not found: {root}",
            error_code="KNOWLEDGE_DIR_MISSING",
            query=query,
            domain=domain,
        )

    needle = query.lower().strip()
    hits: list[dict[str, Any]] = []
    for path in sorted(root.rglob("*")):
        if not path.is_file() or path.suffix.lower() not in {".md", ".txt", ".json"}:
            continue
        text = path.read_text(encoding="utf-8", errors="ignore")
        if needle and needle not in text.lower() and needle not in path.name.lower():
            continue
        snippet = text[:280].replace("\n", " ")
        hits.append(
            {
                "path": str(path.relative_to(knowledge_root())),
                "snippet": snippet,
            }
        )
        if len(hits) >= 20:
            break

    return ok_result(
        "search_knowledge",
        query=query,
        domain=domain,
        hit_count=len(hits),
        hits=hits,
    )
