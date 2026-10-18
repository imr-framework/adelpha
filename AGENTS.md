# Adelpha — Agent Design & Engineering Guide

This is the root guide for coding agents extending Adelpha. It records established product decisions and practical lessons from the STEP-based FEM workspace, visualization, and theme integration. Apply the shared principles across new features; apply FEM-specific details only to FEM.

**Baseline reviewed: 2026-10-14.** Source code is the authority for current APIs and limits. Recheck referenced implementations before changing them. Explicit user instructions govern the task; this guide does not authorize unrelated redesigns, installations, external publication, or destructive operations.

## 1. Product intent and scope

Adelpha is an MRI engineering and digital-twin application. Its UI combines scanner context, engineering projects, scientific visualization, and computational workflows. A feature should feel like part of that application, not a separately branded demo embedded inside it.

- Reuse the application shell, typography, icons, themes, navigation, and desktop integration.
- Give the scientific viewport room. Keep preparation and display controls organized outside the model.
- Preserve a clear distinction between geometry, mesh, simulation results, and diagnostic information.
- Favor restrained borders, consistent spacing, clear hierarchy, and useful interaction over decorative panels or effects.
- Make the current project, input source, job state, units, and selected result quantity discoverable.
- Respect the requested scope. A theme-only change must not alter geometry, physics, camera behavior, layout, or result values.
- Preserve unrelated working-tree changes. Inspect `git status` and relevant diffs before editing; do not assume existing modifications are disposable.

## 2. Start with the existing architecture

| Concern | Starting point |
| --- | --- |
| Application context and global header | `src/twin/shell/AppTopbar/AppTopbar.tsx` |
| Engineering Studio orchestration | `src/twin/EngineeringStudio.tsx` |
| Project categories and metadata | `src/twin/studio/library.ts` |
| Project entry and creation UI | `src/twin/studio/StudioHome.tsx` |
| Shared application styles and dark theme tokens | `src/styles.css` |
| Light-theme integration and overrides | `src/themes.css` |
| Theme definitions, persistence, and React hooks | `src/twin/consoleTheme.ts` |
| Shared engineering workspace layout | `src/twin/studio/hardwareWorkspace.css`, `src/twin/studio/studioWork.css` |
| FEM entry point | `src/twin/studio/FemStudio.tsx` |
| FEM study state and workflow | `src/twin/studio/ElmerStepStudio.tsx` |
| FEM workspace appearance | `src/twin/studio/femDesk.css`, `src/twin/studio/elmerStep.css` |
| CAD, mesh, and field viewers | `src/twin/studio/FemStepPreview.tsx`, `FemMeshPreview.tsx`, `FemFieldPreview.tsx` |
| Field-view controls and appearance | `src/twin/studio/femFieldPreview.css` |
| Field interpolation and geometry | `src/twin/studio/femFieldGeometry.ts` |
| Field-line computation | `src/twin/studio/femStreamlines.ts`, `femStreamlines.worker.ts` |
| Typed client API | `src/twin/mri/api.ts` |
| Runtime FEM routes and job supervision | `runtime/python/adelpha_runtime/fem.py` |
| FEM configuration, meshing, and solving | `simulation/fem/config.py`, `meshgen.py`, `sifgen.py`, `solver.py` |
| Mesh and VTU preview serialization | `simulation/fem/meshpreview.py`, `fieldpreview.py` |
| Desktop/browser export helper | `src/desktop/saveFile.ts` |
| Detailed FEM setup and numerical limitations | `simulation/fem/README.md` |

The frontend uses React, TypeScript, Vite, Three.js, React Three Fiber, Drei, and Lucide icons. Use the installed versions and existing conventions. Both Electron and Tauri integration exist: do not assume every browser API behaves identically in every desktop host.

## 3. Workspace composition

### Shared shell

Keep Adelpha's actual global header. It owns the brand, scanner/runtime context, workspace selection, and global controls. Do not recreate that header inside a feature or replace it with a concept illustration's branding.

FEM deliberately has **no second full-width project header**. Do not reintroduce one merely to hold the project title or duplicate exports.

### FEM Precision Desk layout

The established composition is:

1. **Left project drawer:** STEP source, assembly solids, setup navigation, and mesh access.
2. **Central viewport:** CAD / Mesh / Results tabs above the visualization.
3. **Right inspector:** preparation settings or the active viewer's controls, probes, and export actions.
4. **Bottom status strip:** current job state and available mesh counts/units.

The study name belongs near the bottom-left of the drawer, with the FEM / Elmer identity beneath it. The source filename is a separate item; do not substitute it for the project name.

The drawer collapses to a narrow rail. Use a small chevron control and a one-pixel separator. Avoid a thick vertical grab bar or a large protruding handle. Collapsing the drawer must preserve study state and leave a discoverable way to reopen it.

The right inspector scrolls independently. Keep the run action accessible at its foot. Field and mesh viewers use `controlsHost` and React portals to place their controls there; do not accidentally restore a second overlaid control panel inside the central viewport.

Current sizing reference, not a universal requirement for all workspaces:

| Window range | FEM layout |
| --- | --- |
| Above 1150 px | 230 px drawer, flexible viewport, 300 px inspector |
| 801–1150 px | 190 px drawer, flexible viewport, 270 px inspector |
| Collapsed drawer | 48 px rail, or 44 px at the smaller breakpoint |
| At or below 800 px | Inspector moves below the viewport; drawer remains alongside |
| Status strip | 34 px row |

Use `min-width: 0`, `min-height: 0`, bounded overflow, and flexible grid tracks where needed. Preserve the model's aspect ratio when panels resize. Do not shrink the whole application with CSS transforms to fit a viewport.

Gradient coil, passive shimming, and acquisition workspaces also omit the full-width project header. Their project name, workspace identity, status, and project actions belong in a compact `ProjectPanel` inside the right inspector. Place a direct Close project icon at the far right of the project-name row, without a Project dropdown. Preserve View assembly where supported. Omit routine completed-result badges and duplicate run-button captions; retain actionable failure and stale-result warnings. Gradient and shimming viewport controls and captions float over the scene without full-width gradient scrims; retain the key-results footer. Acquisition uses a clean “A Bloch simulator” empty state and an image-focused result area without a bottom echo plot.

### Visual hierarchy and interaction

- Reuse Geist / Geist Mono and application font variables; use mono or tabular numerals for numerical readouts where useful.
- Reuse Lucide icons; do not introduce a parallel icon system for ordinary actions.
- Use compact, consistent controls and subtle grouping. Avoid wrapping every setting in a separate card.
- Put advanced settings in disclosure sections. Show common controls directly.
- Every icon-only action needs an accessible name. Expandable drawers need their expanded state exposed.
- Use native buttons, inputs, selects, and labels; keep keyboard focus visible.
- Do not communicate errors, selected states, or completion solely through color.
- Respect reduced-motion preferences and preserve keyboard access through collapsed and responsive states.
- The current desk has small secondary text; do not treat its smallest labels as the accessibility target for every new screen.

## 4. Theme integration: mandatory for new UI

Adelpha currently has four themes:

| Theme ID | Appearance |
| --- | --- |
| `adelpha` | Dark with violet accent |
| `mri4all` | Navy with gold accent |
| `porcelain` | Light with cobalt accent |
| `glacier` | Light with petrol-blue accent |

Theme selection is managed by `consoleTheme.ts`, persisted under `adelpha.consoleTheme`, applied to `html[data-console-theme]`, and announced through `CONSOLE_THEME_EVENT`. Use `useConsoleTheme()` for React content that must react to theme changes.

### Token rules

The application has two related token layers. Light themes provide `--theme-*` values; the existing `--m4-*` tokens resolve shared colors and have MRI4ALL-specific dark overrides. **Do not assume `--theme-*` values are defined in every dark theme.**

For new theme-aware workspace chrome, follow the FEM integration:

| Purpose | Token |
| --- | --- |
| Workspace background | `--m4-bg` |
| Drawer / inspector surface | `--m4-panel` |
| Raised controls | `--m4-chrome` |
| Input surface | `--m4-input` |
| Primary text / secondary text | `--m4-text` / `--m4-muted` |
| Accent / subtle selection | `--m4-accent` / `--m4-accent-soft` |
| Border | `var(--theme-border, var(--border))` |
| Hover surface | `var(--theme-hover, var(--m4-chrome))` |
| Status colors | `--m4-ok`, `--m4-warn`, `--m4-bad` |
| Text on accent | `--theme-on-accent` with a suitable fallback |

Example:

```css
.feature-panel {
  background: var(--m4-panel);
  color: var(--m4-text);
  border: 1px solid var(--theme-border, var(--border));
}
.feature-panel button:focus-visible {
  outline: 2px solid var(--m4-accent);
  outline-offset: 2px;
}
```

Gold needs a dark foreground for readable selected controls. The FEM desk has a scoped MRI4ALL `--theme-on-accent` override; inspect that pattern before using white on every accent.

Do not force `color-scheme: dark` or redefine the entire `--theme-*` palette inside a feature. This previously prevented FEM from following the app theme. Use semantic tokens rather than manually changing one hardcoded color at a time.

Inspect computed styles as well as component CSS. `themes.css` and shared workspace selectors can have higher specificity. An inherited legacy inspector class previously made the inspector light while its text remained hardcoded light. Fix the ownership/selector conflict; do not solve it with a growing set of unrelated `!important` overrides.

### WebGL, charts, and scientific colors

CSS cannot directly recolor a Three.js scene background. Resolve renderer colors through the theme hooks and update them when the selected theme changes. `lightThemePalette()` exposes resolved colors; `useThemeStageBackground()` supports existing stage conventions. FEM's field view currently uses the theme's workspace background rather than the shared gray light-stage color. Keep CSS and renderer backgrounds coordinated.

Theme changes affect UI chrome and readable annotations. They must **not** reinterpret scalar values, modify the field color ramp, remap material identities, smooth data, or change the model. Legends must retain readable labels on both light and dark surrounds. Check exported images separately from the live canvas; the current PNG export has its own annotation strip.

## 5. FEM workflow and state contract

### Established scope

The project category is **FEM**; Elmer is its solver. Keep user-facing category naming distinct from engine implementation details and preserve existing project identifiers/compatibility when editing metadata.

FEM is currently based **only on an imported CAD STEP file**. Do not silently use the scanner assembly or revive older assembly-source preferences. Accept `.step` and `.stp`; the current upload limit is 100 MB. Validate on the server as well as in the UI.

The setup sequence is Parts & roles → Materials → Geometry & mesh → Physics → Review & prepare. Assign each imported solid before allowing a solve. Replacing a STEP file invalidates previous solid assignments and result association; even a rejected replacement must not leave an older model runnable behind a new preview.

### Geometry validity and units

A successful CAD surface preview does not establish that the file contains closed solids. Volumetric FEM requires valid closed 3D bodies. If no solids are found, explain CAD-side repair: sew/stitch surfaces, close gaps, create solids, or model real thickness before exporting again. Reducing mesh size cannot turn a surface model into a solid.

Do not silently heal away parts, invent thickness, close arbitrary holes, or change dimensions. Those operations can change the physical problem.

The backend uses metres. UI mesh lengths and probe coordinates are presented in millimetres. Convert exactly at the boundary. STEP metadata is already converted to metres during import; do not apply another millimetre-to-metre conversion to imported vertices. Solid indices are one-based and are not persistent identities across re-exports.

### Jobs and persistence

The UI distinguishes `queued`, `meshing`, `converting`, `prepared`, `solving`, `completed`, and `failed`. Completion must come from the validated backend result, not a timer or a finished animation. Show actionable errors and preserve access to diagnostic downloads.

Project work is persisted by `ProjectPersistence.tsx` and `projectStorage.ts` in IndexedDB (`adelpha-studio`, `projects` store), keyed by project ID. Use `useProjectState()` for durable input/result state and `useProjectRun()` to capture input snapshots and archive runs without pruning history. Large STEP files and field-map inputs belong here, not localStorage.

The provider hydrates before mounting the workspace, serializes writes, exposes save failures/retry, and flushes pending writes before Close project. Saving happens quietly in the background; do not render routine saving/saved banners or reserve an empty status row. Do not add a shared run-history strip. Retain run records in storage and preserve existing workspace-specific history controls. Show actionable save errors only when needed. Close is not deletion. `library.deleteProject()` removes the durable record only through explicit project deletion. Keep late async callbacks from recreating deleted data. Existing FEM session drafts (`adelpha-fem-step-${projectId}`) and magnet-study records migrate on opening; already lost session data cannot be recovered. STEP preview files persist as Files, and legacy previews can be restored from the runtime upload endpoint.

Gradient, shim, and acquisition settings persist through the shared hooks. Magnet history is bridged from its existing store and retains its own selector. FEM history stores job references; the full solver artifacts remain in the runtime data directory. Browser/app storage is local persistence, not a portable backup. Shared scanner model assets and bindings retain their existing storage conventions.

Changing parameters marks prior results stale. Keep the relationship between inputs, run ID, and displayed results clear. Avoid presenting old results as a fresh solve. Restore/poll active jobs when returning to a study, and stop local polling on unmount. Closing the UI does not imply cancellation of its runtime job.

The runtime currently supervises one solve at a time and uses worker processes. Gmsh owns process-global state; do not run independent meshing jobs in request threads sharing one Gmsh session. Each run needs a fresh output directory. Inspect runtime code before changing concurrency, timeout, or recovery behavior.

### Integration boundary

Use typed helpers in `src/twin/mri/api.ts`. Client routes are under `/api/magnet/fem`:

- `POST /uploads`: inspect/store the STEP input.
- `GET /uploads/{id}/file`: restore a previously imported STEP file.
- `POST /jobs`: create a job from the validated configuration.
- `GET /jobs/{id}`: status and available metadata.
- `GET /jobs/{id}/mesh`: bounded mesh preview.
- `GET /jobs/{id}/fields`: bounded field preview.
- `GET /jobs/{id}/download`: result and diagnostic archive.

Respect the development proxy and authenticated desktop runtime gateway; do not hardcode an absolute localhost service URL in a feature component. Use `saveBlob()` for image exports and existing API download helpers for job archives. Keep backend filenames, paths, and commands out of ordinary controls unless they help the user troubleshoot or export.

## 6. Scientific visualization contract

### Implemented views

- **CAD:** tessellated STEP geometry preview, with validity determined separately by the backend.
- **Mesh:** actual generated mesh surfaces, body visibility, and edge inspection.
- **Results:** exported Elmer nodal fields, surfaces or movable cross-sections, probes, and exports.

Results support B in tesla, H in A/m, and A in tesla-metres; magnitude and XYZ components; air inclusion; mesh edges; solid-focused framing; auto/fixed color ranges; interpolated point probes; PNG export; and full data/log downloads.

Default field display is solid surfaces with mesh edges. A decorative translucent section plane must not appear in that mode. Cross-section controls remain available explicitly. Optional B field lines are off by default and available in surface mode.

### Preserve scientific meaning

- Render real output arrays. Concept images may guide layout but are not a source of computed fields or illustrative field lines to ship as results.
- Preserve per-body nodes at material interfaces. Coincident coordinates do not imply equal physical fields; do not average them indiscriminately.
- Read Elmer's body-recovered `magnetic flux density e`, `magnetic field strength e`, and `magnetic vector potential e` arrays when available. `Discontinuous Bodies` duplicates geometry but does not undo cross-interface projection in the plain nodal arrays. Keep the complete-set validation and nodal-only legacy compatibility in `simulation/fem/fieldpreview.py`.
- Cross-sections interpolate nodal vector components in tetrahedra before computing magnitude. Do not interpolate precomputed magnitudes as if equivalent.
- Probes must use the displayed geometry's interpolation and report the correct coordinate units.
- Fixed color limits clip colors, not underlying field/probe values. State the quantity, component, units, range, and whether the range is fixed or automatic.
- Do not normalize geometry independently along each axis. Keep model coordinates physically proportional.
- Mesh quality, solver convergence, and field accuracy are distinct. A completed solve or attractive contour plot does not certify mesh independence.

The current explorer reads supported ASCII VTU output and displays exported nodal values. It does not reevaluate Elmer's quadratic basis. Limits currently include 100 MB VTU files, 200,000 points, 250,000 cells, and a separate mesh-preview cap of 250,000 surface triangles. Verify constants before changing or documenting them. Oversized/unsupported data should produce an explicit download path, not an incomplete scene presented as complete.

B field lines use tetrahedral interpolation and bounded adaptive midpoint integration in a cancellable Web Worker, with up to 24 spatially balanced seeds per scene (surface fallback for bodies without valid interior seeds). Do not seed by arbitrary mesh-triangle order or force symmetry by mirroring computed paths. They are qualitative trajectories whose quality depends on the underlying mesh and nodal solution; local integration error control does not certify FEM accuracy. Keep expensive computation off the main interaction thread and dispose obsolete workers/resources.

### Camera and resizing lessons

Perspective can make equal-sided cubes appear unequal when viewed obliquely or above/below the camera target. Before changing geometry to address an apparent stretch:

1. Check the source/model and exported mesh bounds in physical units.
2. Compare canvas drawing-buffer and displayed aspect ratios; account for device pixel ratio.
3. Check camera projection, aspect updates, CSS sizing, and panel resize behavior.
4. Reset with Fit view and compare orientations.

The included assembly uses two 10 × 10 × 10 mm magnets. Use it as a dimensional sanity check. An orthographic engineering view is a possible future enhancement, **not a currently implemented projection toggle**. Do not claim it exists or silently change camera behavior during a theme-only request.

### Physics scope

Current FEM supports 3D linear magnetostatics with constant isotropic relative permeability and prescribed global remanence. It does not currently implement B-H saturation, hysteresis, irreversible demagnetization, coil/current excitation, eddy currents, transient analysis, mechanical stress, or motion. New controls for those features require corresponding solver/configuration support and verification, not just frontend fields.

The outer air boundary is a finite-domain approximation. Mesh refinement and air-domain convergence require separate checks. Refer to `simulation/fem/README.md` for the numerical assumptions and backend contract. Direct SIF generation is intentional; pyelmer is not a required dependency.

### Hardware system profiles

Desktop Twin setup stores custom systems in `dtam_runtime.json` with the runtime preferences. The Python loader reads them through `ADELPHA_DTAM_PREFS`. Custom profiles define identity, architecture, and nominal field strength; they do not implement device transport. Physical profile sessions remain read-only and return an empty state until acquisition is implemented. Never force a physical profile into simulation or make missing hardware fatal to API startup. Scanner and environment changes use the authenticated `/runtime/twin/configuration` gateway endpoint to reconfigure the existing Twin session without restarting the console or agents. Validate the replacement before swapping it, serialize switches, and refresh telemetry immediately while rejecting older in-flight poll responses. Failed preference changes restore the previous configuration, and the frontend refreshes its runtime endpoint after recovery.

### Dashboard sensor states

Camera inputs are configured under Settings → Devices using `CameraInputSelector.tsx`, shared session state in `cameraInputStore.ts`, and browser media devices, including Camo Camera for USB phones with Camo Studio running. Switching or reconnecting stops export recording and clears the camera-relative reference pose; existing samples and the recording clock remain. Each exported sample includes `camera_source`. Motion exports use `saveBlob()` for native desktop dialogs and browser downloads, with cancellation/failure feedback in the HUD. Device loss stops tracking with an explicit reconnect action; do not silently substitute a different camera. Capture resolution/rate are best-effort preferences with a same-device default-format retry; measurement targets are 15/30/60 Hz (default 30), with an animation-frame render pump, video-time gating, and actual detected-pose throughput shown in the HUD. Do not depend exclusively on video-frame callbacks: the hidden source video can stop receiving them in desktop WebViews, and camera transport does not establish MRI motion-correction accuracy.

Camera motion export recording is opt-in through the HUD's Track / Stop control (`MotionRecordingControl.tsx`). Live webcam rendering, inference, overlays, and dashboard pose updates continue independently. `headMotionLog.ts` records real detected poses only: JSON includes `t_wall_ms` (local inference-completion wall time) and `t_recording_ms` (monotonic elapsed milliseconds from the first Track click, including pauses), plus recording metadata. Millisecond timestamp resolution does not imply a 1 kHz measurement rate; actual throughput is bounded by the selected 15/30/60 Hz target, available camera frames, and inference speed. Stop and unmount pause saving, Track resumes appending, and Clear log stops recording and resets its clock while preserving the reference pose. Recording stops 30 minutes after the first Track click (including pauses), with a 120,000-sample memory guard above the 108,000 samples expected at 60 Hz. A timer enforces the duration even without face detections; no earlier samples are dropped; export and clear before continuing.

Keep the real header, floating viewport navigation, and Logging / Terminal strip. In non-simulation mode with no recent measured sensor values, use `dashboard/SensorWaiting.tsx` for dashboard and telemetry empty states. Do not add a lower sensor-summary bar. Settings actions open Digital Twin settings; the guide is inline. `sensorAvailability.ts` checks measured provenance, finite values, and a 30-second freshness window. Nominal values, estimates alone, and API health do not prove sensor reception.

The EMI dashboard is an environmental sensor spectrum, not an MRI phantom signal. Simulation uses a white-noise floor plus narrow interference peaks, labeled simulated and in arbitrary units. Hardware summaries do not contain spectral arrays; never synthesize a measured spectrum from RMS/peak values. Keep hardware unavailable states honest, including partial connections and mode transitions.

## 7. Failure containment and performance

Lazy-load heavy CAD/mesh/field viewers and keep a local error boundary around optional preview code. A viewer import/render failure must not replace the entire app or erase the study. Preserve setup and diagnostic access when visualization fails.

A past interface failure reported an unresolved default import through star exports. Check actual module exports, lazy import shape, bundler behavior, and desktop loading before blaming the user's STEP file. `export *` does not re-export a default export. Do not recommend clearing imported models for an unrelated JavaScript module failure.

Dispose Three.js geometries/materials and workers when replaced. Keep asynchronous results bound to the originating run/request; prevent a late response from overwriting a newer study. Treat performance limits as visible product states with an export fallback.

## 8. Validation and delivery

Use focused checks proportional to the change. Do not add tests that merely repeat CSS declarations. For layout/theme edits, inspect the rendered UI; for scientific or state changes, test meaningful numerical/behavioral invariants.

Frontend baseline:

```sh
npm run build
npm test -- --run src/twin/studio/ElmerStepStudio.test.tsx src/twin/studio/FemFieldPreview.test.tsx src/twin/studio/FemStudio.test.tsx src/twin/studio/femFieldGeometry.test.ts src/twin/studio/femStreamlines.test.ts
```

Backend checks when the affected code requires them:

```sh
python -m unittest discover -s simulation/fem/tests -v
# Requires a working Gmsh Python API and Elmer executables:
FEM_INTEGRATION=1 python -m unittest discover -s simulation/fem/tests -v
FEM_INTEGRATION=1 PYTHONPATH=.:runtime/python python -m pytest runtime/python/tests/test_fem_studio.py -q
```

Use an available environment with the required dependencies. Do not install packages or claim real solver validation merely because frontend tests pass. Consult `simulation/fem/README.md` for the demo generator and environment-specific setup; avoid hardcoding one developer's Homebrew paths into portable runtime code.

Visual checks for affected UI:

- All four themes, including switching while a viewer is mounted.
- Text, legends, focus outlines, inputs, hover states, selected controls, disabled controls, and warnings.
- Open/collapsed drawer, narrow-window inspector layout, long filenames/project names, and scrollable inspectors.
- Empty, loading, failure, completed, and stale-result states where relevant.
- CAD/Mesh/Results navigation, restored completed runs, field selection, and exports where affected.
- Canvas aspect ratio and fitting after a panel resize.

Use generated sample data for isolated visual harnesses. Do not overwrite real studies, alter the user's saved theme merely to test, or upload private CAD without authorization. Temporary harnesses should use separate identifiers, be removed after validation, and leave only intentional deliverables. A mocked browser response validates rendering, not the backend or solver.

When delivering, state what changed, which checks actually passed, and any material limitations. Distinguish implementation from visual verification, frontend tests from real solver runs, and existing warnings from new failures. Include a screenshot when it materially helps assess a visual change.

## 9. Extending Adelpha without accumulating inconsistencies

For a new feature, first identify its project/category entry, state ownership, backend contract, renderer, and theme dependencies. Extend existing boundaries rather than copying an entire workspace into an unrelated component.

Before calling the feature complete, confirm:

- The user can discover it through existing Adelpha navigation.
- It uses the real app shell and all supported themes.
- Input validation and units agree between frontend and backend.
- Busy, failure, retry, and stale states are truthful and recoverable.
- Persistence promises match the actual storage mechanism.
- Numerical displays and exports retain provenance, quantities, and units.
- The change preserves existing workflows outside its intended scope.
- Documentation names the actual shipped behavior and identifies future ideas explicitly.

Update this guide when an established convention or architecture boundary changes. Keep implementation details linked to source rather than copying large code blocks that will become stale. Do not use this document as justification to perform an unsolicited refactor of every older screen.
