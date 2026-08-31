---
icon: lucide/settings
---

# Settings

Open **Settings** from the gear in the top-right. Changes that matter to the live app are listed here. A few older rows are still a local draft and do not drive the twin.

## Scanner models

**Settings → 3D Model → General** chooses the magnet you see in the Digital Twin viewport and on Imaging Console → System Status.

| Profile | What it is |
| --- | --- |
| **48 / 47 / 64 mT Halbach** | Bundled Halbach family (shared CAD) |
| **Delta v2** | Bundled GLB assembly |
| **MRI4ALL Zeugmatron Z1** | Console-oriented profile (no bundled CAD mesh) |
| **Imported models** | Files you add on this computer |

Scale in the viewport goes from a small fraction up to **10×**. That slider is per session and does not rewrite the imported file.

You can also assign a **device picture** so the Devices list and System Status show a photo instead of the default card.

## Import a CAD model

Use **Settings → 3D Model → Files**.

1. Click **Choose file**.
2. Pick a **glTF binary (`.glb`)** or a **STEP (`.step` / `.stp`)** file, up to 80 MB.
3. STEP is tessellated on this computer, then stored like a GLB.
4. The new model becomes the active scanner.

Imports live only on this Mac or PC (IndexedDB + a short catalog in local storage). They are not uploaded anywhere.

If a file is too heavy or damaged, Adelpha falls back to the bundled Halbach instead of leaving a black window. **Clear all imports** on the same Files page removes every imported model.

!!! tip "Packaged app"
    Import and the 3D view work in the DMG the same way as in `make tauri-dev`. After you change Rust or packaging settings, rebuild the installer. An older DMG will not pick those fixes up.

## Digital Twin runtime

**Settings → Digital Twin** (desktop app only) controls the Python twin that Adelpha starts for you.

| Control | Meaning |
| --- | --- |
| **Scanner profile** | Simulated scanner, or the 48 mT Halbach profile |
| **Environment** | Development vs other bundled environments |
| **Open config folder** | Reveals user DTAM YAML (preferred over the copy inside the app) |
| **Restart** | Restarts the Python runtime after you save |

Twin and Imaging Console start automatically. Agents start after you save a Google API key.

## AI and Agents

**Settings → AI & Agents**

1. Paste a **Google AI / Gemini** API key.
2. Choose the **model** and **mode** the supervisor should use.
3. Save. Adelpha stores the key in the OS config directory (`google_api_key`), never inside the `.app`.

The Agents tab stays offline until that key is present and the Agents service is healthy.

## Updates

**Settings → Updates** (packaged app)

- **Check for updates** reads the latest signed build from GitHub Releases.
- **Automatic updates** is off by default. When on, Adelpha checks shortly after launch, then can download, install, and relaunch.

Local unsigned builds will not install from that feed. Gatekeeper signing (Apple / Windows) is separate from this updater signature. See [Signing](../packaging/signing.md).

## Camera

The viewport **Camera** tool uses the webcam for optional head-pose tracking.

On macOS the first time, allow Adelpha under **System Settings → Privacy & Security → Camera**. If the prompt never appears after a rebuild:

```bash
tccutil reset Camera org.adelpha.digital-twin-ui
```

Then open Adelpha and select the Camera tool again. The live picture should appear first; face tracking loads next (one download of the vision models).
