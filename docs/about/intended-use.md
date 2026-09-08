---
title: Adelpha MRI intended-use statement
description: Adelpha MRI is research and education software for low-field MRI consoles and digital twins, not a medical device and not for clinical diagnosis.
icon: lucide/badge-alert
---

# Intended use

Adelpha MRI is **research and education software**. It is an open-source console, digital twin, and engineering UI for **low-field MRI systems** (including simulated scanners and lab Red Pitaya / MaRCoS stacks).

## Who it is for

- Researchers, students, and engineers who already operate or build low-field MRI hardware
- Groups adapting MRI4ALL sequences and DTAM twin models
- Developers packaging or extending the Tauri desktop app

## Who it is not for

- Clinical diagnosis, screening, or patient management
- Use as a **medical device** or as a component of a cleared/approved imaging system unless you complete your own regulatory process
- Unsupervised scanning of human subjects without your institution’s ethics, safety, and hardware procedures

Images, DICOM exports, twin temperatures, \(B_0\) estimates, EMI/RF traces, and Agent chat are **not** diagnostic outputs. Provenance labels (`measured` / `estimated` / `predicted` / `nominal`) exist so forecasts are not mistaken for sensors; they are not a clinical audit trail.

## Hardware safety

MaRCoS bitstream copy, `marcos_server`, gradient/RF hardware, and magnet safety remain **your lab’s procedures**. Adelpha MRI can ping TCP 11111 and queue `scan.json`; it does not certify the scanner, SAR, or emergency stop. Hardware simulation mode exists so the UI can be used without a board.

## Warranty

The MIT license (desktop / DTAM) and GPL-3 (console) both disclaim warranty. See [Citation and licensing](citation.md).

If you redistribute Adelpha MRI with claims that it is safe for clinical imaging, that is **your** regulatory event, not something this repository asserts.
