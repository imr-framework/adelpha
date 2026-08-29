"""Smoke test: root_agent imports with installed Google ADK."""

from __future__ import annotations


def test_root_agent_import():
    from dtam.agents.agent import root_agent

    assert root_agent.name == "dtam_supervisor"
    assert root_agent.tools
    assert root_agent.sub_agents
