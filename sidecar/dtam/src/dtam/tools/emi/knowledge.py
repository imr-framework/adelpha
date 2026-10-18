"""EMI knowledge search tools."""

from __future__ import annotations

from typing import Any

from dtam.tools.orchestrator.knowledge import search_knowledge


def search_emi_knowledge(query: str) -> dict[str, Any]:
    """Search EMI domain knowledge base."""
    return search_knowledge(query=query, domain="emi")
