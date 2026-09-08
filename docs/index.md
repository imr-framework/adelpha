---
icon: lucide/monitor
---

# What is Adelpha?

**Adelpha** is an open-source, intelligent digital-twin platform for developing, monitoring, and operating low-field MRI systems. It integrates scanner visualization, real-time system data, imaging workflows, engineering tools, and AI-assisted capabilities within a unified environment. Its modular architecture can also be adapted to other MRI systems and research applications.

<!-- <p>
  <a class="adelpha-download-cta" href="start/download.md">Download for macOS</a>
</p> -->

<figure class="adelpha-preview">
  <img src="assets/adelpha-preview.png" alt="Adelpha Digital Twin workspace showing the 3D scanner, the Digital Twin workspace control in the top bar, live telemetry, and the terminal." width="1440" />
  <figcaption>Digital Twin workspace. The workspace control in the top bar switches to Imaging Console or Engineering Studio.</figcaption>
</figure>

## What you can do

<div class="adelpha-cards">
  <a class="adelpha-card" href="guide/workspaces.md">
    <span class="adelpha-card__icon" aria-hidden="true">
      <svg viewBox="0 0 24 24"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="M3.27 6.96 12 12.01l8.73-5.05"/><path d="M12 22.08V12"/></svg>
    </span>
    <strong>Digital Twin</strong>
    <span>3D magnet, live thermal / B₀ / EMI / RF, Agents, logging, and a real terminal.</span>
  </a>
  <a class="adelpha-card" href="guide/imaging-console.md">
    <span class="adelpha-card__icon" aria-hidden="true">
      <svg viewBox="0 0 24 24"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><circle cx="12" cy="12" r="3"/><path d="m16 16-1.1-1.1"/></svg>
    </span>
    <strong>Imaging Console</strong>
    <span>Register a patient, queue sequences, view studies, and ping a Red Pitaya.</span>
  </a>
  <a class="adelpha-card" href="guide/workspaces.md">
    <span class="adelpha-card__icon" aria-hidden="true">
      <svg viewBox="0 0 24 24"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
    </span>
    <strong>Engineering Studio</strong>
    <span>Reserved for later coil and gradient tools. The shell is ready.</span>
  </a>
  <a class="adelpha-card" href="guide/settings.md">
    <span class="adelpha-card__icon" aria-hidden="true">
      <svg viewBox="0 0 24 24"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
    </span>
    <strong>Settings</strong>
    <span>Import GLB or STEP, choose a twin profile, add a Gemini key, check for updates.</span>
  </a>
</div>

Every live number is labeled **measured**, **estimated**, **predicted**, or **nominal**, so a forecast is never mistaken for a sensor.

!!! tip "One installer"
    A packaged Adelpha starts its own Twin, Imaging Console, and (after you add a key) Agents services. See [Desktop packaging](packaging/index.md).

    Developers who open the UI in a browser still start those APIs themselves. See [Getting started](start/index.md).

## Open the app

=== "I have a DMG or installer"

    Install Adelpha, then open it.

    On an unsigned Mac build, use **Right-click → Open** the first time. The window is dark on purpose; the interface appears after a short intro.

    Next: [Settings](guide/settings.md) for a scanner model and, if you want Agents, a Google API key.

=== "I am developing"

    ```bash
    make install
    make tauri-dev
    ```

    DTAM lives in this repo at `dtam/`. The supervisor starts with the window. Details: [Getting started](start/index.md).

Use **⌘K** (Ctrl+K on Windows/Linux) to switch workspaces. Add `?replayIntro=1` to the URL if you want the launch animation again.

## Stack

Tauri v2, React, Three.js, MediaPipe (camera), and a Python supervisor that mounts DTAM, the MRI façade, and optional Google ADK.

## Where to go next

<div class="adelpha-cards">
  <a class="adelpha-card" href="start/download.md">
    <span class="adelpha-card__icon" aria-hidden="true">
      <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>
    </span>
    <strong>Download</strong>
    <span>Get the desktop installer for your computer.</span>
  </a>
  <a class="adelpha-card" href="start/index.md">
    <span class="adelpha-card__icon" aria-hidden="true">
      <svg viewBox="0 0 24 24"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.4 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></svg>
    </span>
    <strong>Getting started</strong>
    <span>Install Adelpha, first launch, and the developer setup.</span>
  </a>
  <a class="adelpha-card" href="guide/workspaces.md">
    <span class="adelpha-card__icon" aria-hidden="true">
      <svg viewBox="0 0 24 24"><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></svg>
    </span>
    <strong>Workspaces</strong>
    <span>Digital Twin, Imaging Console, and Engineering Studio.</span>
  </a>
  <a class="adelpha-card" href="guide/settings.md">
    <span class="adelpha-card__icon" aria-hidden="true">
      <svg viewBox="0 0 24 24"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
    </span>
    <strong>Settings</strong>
    <span>CAD import, twin profile, Agents key, camera, and updates.</span>
  </a>
  <a class="adelpha-card" href="guide/imaging-console.md">
    <span class="adelpha-card__icon" aria-hidden="true">
      <svg viewBox="0 0 24 24"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><rect width="10" height="8" x="7" y="8" rx="1"/></svg>
    </span>
    <strong>Imaging Console</strong>
    <span>Exams, sequences, studies, and the Red Pitaya.</span>
  </a>
  <a class="adelpha-card" href="guide/dashboard.md">
    <span class="adelpha-card__icon" aria-hidden="true">
      <svg viewBox="0 0 24 24"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>
    </span>
    <strong>Dashboard</strong>
    <span>Viewport, telemetry, Agents, and the terminal.</span>
  </a>
  <a class="adelpha-card" href="packaging/index.md">
    <span class="adelpha-card__icon" aria-hidden="true">
      <svg viewBox="0 0 24 24"><path d="m16.5 9.4-9-5.19"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="M3.29 7 12 12l8.71-5"/><path d="M12 22V12"/></svg>
    </span>
    <strong>Desktop packaging</strong>
    <span>Sidecar, installers, signing, and in-app updates.</span>
  </a>
</div>
