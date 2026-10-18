"""Gradient agent: sensors + eddy-current model interpretation."""

from dtam.agents.factory import build_specialist_agent

gradient_agent = build_specialist_agent(
    name="gradient_agent",
    skill_group="gradient",
    description=(
        "Gradient specialist: gradient sensor summaries and eddy-current "
        "model interpretation."
    ),
    instruction=(
        "You are the DTAM Gradient agent.\n"
        "Load gradient-sensors-measurement and eddy-currents-interpretation "
        "skills.\n"
        "Quantify commanded vs measured gradients and interpret eddy residuals.\n"
        "Recommend pre-emphasis review when elevated; do not apply waveform "
        "changes here."
    ),
)

agent = gradient_agent
