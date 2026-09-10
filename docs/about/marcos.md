---
title: Adelpha MRI and MaRCoS integration
description: "How Adelpha MRI talks to MaRCoS on a Red Pitaya: TCP ping on port 11111, bitstream copy, marcos_server, and why sequence I/O stays in Python."
icon: lucide/cpu
---

# MaRCoS integration

Adelpha MRI does not send pulse-sequence payloads from TypeScript. The Imaging Console FastAPI façade **probes** the board and **queues** work; MaRCoS still runs on the Red Pitaya.

## What MaRCoS is here

[MaRCoS](https://github.com/vnegnev/marcos_extras) (Magnetic Resonance Control System) is the FPGA + server stack MRI4ALL used on the Red Pitaya. Adelpha vendors extras and server sources under `console/external/` (`marcos_extras`, `marcos_server`). After every board power-up the MRI4ALL wiki sequence still applies:

```text
./copy_bitstream.sh <IP> rp-122     # password: root
ssh root@<IP>                       # password: root
~/marcos_server
```

Adelpha wraps that in `console/services/ui/marcos_boot.py`: locate `copy_bitstream.sh` or `marcos_fpga_rp-*.bit*`, SSH as `root`, and start `marcos_server`. Override the password with `ADELPHA_MARCOS_SSH_PASSWORD` (default `root`, same as the MRI4ALL docs).

## Reachability from the GUI

**Configuration → General → Scanner IP** defaults to MRI4ALL’s scanner Ethernet address `10.42.0.251`.

**Ping** (scanner button or System Status) opens **TCP port 11111**, then tries ICMP if that port is closed. Success looks like `MaRCoS at <ip>:11111`. A timeout usually means this computer is on Wi‑Fi instead of the `10.42.0.x` link.

```mermaid
flowchart LR
  UI[Imaging Console UI] --> API[MRI FastAPI façade]
  API -->|TCP 11111 ping| RP[Red Pitaya]
  API -->|scan.json queue| PY[Python SequenceBase]
  PY -->|FLOCRA / MaRCoS| RP
```

After you change the IP, ping uses it immediately. **Restart the Python runtime before you run sequences**, because MaRCoS still reads the IP at import time. See [Imaging Console](../guide/imaging-console.md).

## What the desktop never does

The packaged app **does not program the FPGA** as a silent installer step. Hardware access stays a lab procedure. Packaging notes:

- Desktop never flashes bitstreams on your behalf ([limitations](../packaging/limitations.md)).
- Linux udev rules for a future USB/network device are the operator’s job, not a postinst that writes FPGA images.
- Acquisition and Reconstruction **Start / Stop** on System Status are Linux systemd services. On macOS they stay **Unknown**. That is not a Red Pitaya failure.

## Hardware simulation

**Configuration → General → Hardware Simulation**:

| Value | Meaning |
| --- | --- |
| **False** | Sequences talk to MaRCoS on the configured IP |
| **True** | Stay in software; no board required |

The façade documents this in `console/services/api/app.py`: it probes `/device/ping`; it does not itself stream sequence payloads to the FPGA.
