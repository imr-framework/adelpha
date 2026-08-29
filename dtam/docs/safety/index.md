---
icon: lucide/shield-alert
---

# Safety

## Intent

Safety is layered. Agent reasoning can discuss risk, but **deterministic validators must enforce limits**, capability checks, approvals, interlocks, and post-action validation.

## What exists in Phase 1

- Capability flags (including `automatic_control: false`)
- Operational mode gates (`allows_physical_mutation` / `allows_simulated_mutation`)
- Safety-oriented defaults in `configs/safety_limits/default.yaml` (thermal and frequency-compensation draft limits; intervention approval defaults)
- Physical Halbach adapter refuses I/O

The `src/dtam/safety/` package tree is **not implemented yet**. Do not treat empty modules as enforced safety.

## Planned layers (from architecture)

1. Agent reasoning  
2. Schema validation  
3. Capability validation  
4. Limit validation  
5. State validation  
6. Human approval  
7. Hardware interlock  
8. Runtime monitoring  
9. Post-action validation  
10. Emergency stop  

When control paths are added, mutating tools must declare approval requirements and never pass free-form agent text to hardware.
