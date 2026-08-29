---
name: task-decomposition
description: Break user or system objectives into ordered specialist tasks for Magnet, Thermal, EMI, B1, and Gradient agents.
---

# Task decomposition

Use this skill when coordinating multi-subsystem work.

## Steps
1. Restate the objective and success criteria.
2. Identify which subsystems are implicated (thermal, B0/magnet, EMI, B1/RF, gradients).
3. Call specialist tools or agents in dependency order (observe → estimate → diagnose → propose).
4. Keep physical actuation out of scope unless safety/control layers are engaged.
5. Record the plan in working state with `set_working_state`.

## Tools
- `set_working_state`, `get_working_state`, `list_working_state_keys`
- Specialist tools only after the plan is clear
