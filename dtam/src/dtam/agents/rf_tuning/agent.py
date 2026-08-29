"""B1 agent (diagram: B1 Agent) — coil sensors and B1 map interpretation."""

from dtam.agents.factory import build_specialist_agent

b1_agent = build_specialist_agent(
    name="b1_agent",
    skill_group="b1",
    description=(
        "B1 / RF coil specialist: coil sensor measurements and B1 map interpretation."
    ),
    instruction=(
        "You are the DTAM B1 agent (RF coil / transmit field).\n"
        "Load coil-sensor-measurement and b1-map-interpretation skills.\n"
        "Use coil sensor and B1 map tools. Recommend tuning/matching checks "
        "in advisory mode only.\n"
        "Do not switch relays or change transmit gain without the control/"
        "safety stack."
    ),
)

# Existing package folder is rf_tuning — export both names.
rf_tuning_agent = b1_agent
agent = b1_agent
