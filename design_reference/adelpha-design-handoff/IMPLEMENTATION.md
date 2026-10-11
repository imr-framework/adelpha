# Adelpha simulation workspace handoff

## Assignment

Implement the approved passive-shimming and gradient-coil workspaces in the existing application. Preserve the existing Adelpha top bar exactly. This is an implementation task, not another design exploration. Inspect the repository and its applicable instructions, identify the existing screen components, rendering stack, simulation APIs, and tests, then implement both screens end to end within the existing architecture.

## Reference order

1. The two `references/*-approved.png` images are the approved visual targets for their displayed states.
2. `references/*.fragment.html` provide inspectable CSS, layout, labels, and interaction examples. Use these to recover exact colors and dimensions rather than estimating them from pixels.
3. `tokens.css` consolidates the shared palette; it is a starting token layer, not a complete stylesheet.
4. The existing application's scientific behavior and actual solver outputs remain authoritative for calculations, data, units, supported geometry, and export.

The references cover only the workspace below the existing app bar. They are not production implementations. Do not copy demonstration simulation logic, placeholder geometry, example result values, preview-only messages, or the bottom concept disclaimer into production. Do not introduce window.openai dependencies from the reference fragments. The standalone previews wrap the fragments for inspection; they can depend on hosted resources for icons and reference-runtime styles.

## Visual fidelity

- Charcoal background, slightly lighter inspector, subtle neutral borders, cool grey secondary text, soft lavender primary buttons and selected controls. Use the supplied tokens exactly.
- One project header, dominant viewer on the left, compact inspector on the right, metrics below the viewer, and the primary run action at the inspector's bottom.
- No second persistent left sidebar. No nested rounded cards around every section. Separate inspector sections with thin horizontal rules.
- Maintain the source's 12px outer radius, 6–9px control radii, 16–22px typical section padding, 13px base text with 1.5 line height, 11–12px secondary text, and 23–25px metric values. Read exact per-screen values from the CSS.
- The original shimming source uses `Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif`; gradient uses the system stack. Resolve fonts deliberately: visual comparison must use the same actual font, not just the same nominal size. A missing Inter font falls back in the reference.
- Shimming inspector is 285 CSS px; gradient inspector is 280 CSS px. Viewer takes remaining width. Shimming stacks at 700px, gradient at 720px. These are source measurements, not a claim about the attached screenshots' browser viewport.
- The supplied screenshots are scaled captures. Do not interpret every image pixel as one CSS pixel. Measure the workspace crop and match its scale before comparison. Match source CSS geometry first; do not stretch the application to the screenshot's raw raster dimensions.
- On large desktop screens the viewer expands while controls stay compact. On narrow screens stack viewer and inspector without clipping controls. Keep the primary action reachable.
- Preserve keyboard focus visibility, readable contrast, labels, units, and touch targets. Do not reduce essential text to force a fit.

## Shared implementation structure

Adapt names to the repository; no framework migration is requested.

- WorkspaceShell: local header, viewer/inspector grid, responsive behavior.
- WorkspaceInspector and InspectorSection: section spacing, disclosure behavior, footer action.
- NumericField, SegmentedControl, PrimaryAction, MetricStrip: shared interaction and styling.
- Existing scientific viewer: real geometry and samples, with new framing, controls, materials, and labels.
- SimulationJobState: idle, invalid, running, cancelling, completed, failed, and stale-result states.
- Project draft: editable inputs separate from completed run snapshots and presentation preferences.

Reuse the current rendering engine and solver integrations. Restyle or compose them; do not replace the real viewer with reference SVG sketches. Keep camera state stable across inspector changes. View changes and visibility toggles must not rerun the solver.

## Passive shimming

### Default screen

Header: project name / Passive shimming; local project actions.
Viewer: 3D / Slice, tray visibility, Fit field, translucent trays, field samples, compact labeled color legend, region/geometry context.
Inspector: Setup, measured/synthetic source identity, Field map, Tray geometry, Shim magnets, advanced disclosures, Run shimming.
Metrics: standard deviation with units and peak-to-peak variation with units.

### Behavior

- Validate imported map shape, finite values, coordinates, and units using existing supported formats. Never silently substitute synthetic data.
- Keep original map coordinates and explicit alignment transform separate. Avoid cumulative transforms on repeated centering.
- With symmetry enabled, compute tray positions from center and separation. With symmetry disabled, expose independent positions and validate ordering. Do not impose a physical clearance rule guessed from the mockup's HTML min attributes.
- Geometry changes update real support geometry without fabricating a new field result.
- Preserve existing magnet and search parameters, including controls hidden under disclosures. Confirm spacing definitions/units from the implementation rather than inventing them.
- After completion, show actual before/after metrics and placements. Share region, reference, and scale across comparisons; expose clipping if a fixed scale clips data.
- Exports use the completed run's exact configuration. Editing a draft marks the associated result stale; it must not relabel old results as belonging to the new inputs.
- Maintain scientifically correct geometry proportions. Use camera framing/translucency to improve visibility, not independent scaling of the field or trays.

## Gradient coil design

### Default screen

Header: project name / Gradient coil design; result status.
Viewer tabs: 3D windings, Surface layout, Field quality.
Viewer controls: former visibility and Reset view. Orbit is a camera interaction, not a peer tab.
Inspector: four former options, X/Y/Z gradient direction, target gradient, relevant dimensions, contour levels, solver details, Run design.
Metrics: generated loops, efficiency with mT/m/A units if that is the solver's documented quantity, reported error with its actual definition.

### Behavior

- Use former-specific schemas from the actual solver adapter. Show only relevant inputs; retain separate drafts when switching shapes if practical. Do not assume example planar defaults or all axis/former combinations are supported.
- Render actual winding paths in subdued lavender, translucent neutral supports, and selection highlights. Multiple colors require a defined legend.
- Surface layout must use a valid parameterization of the support. Do not imply an unwrapped schematic is a fabrication-ready wire path. Show seams/coordinates where applicable.
- Field quality should display target-versus-achieved field and a defined error measure over the actual evaluation region. Include normalization/reference and units.
- The screenshot's 36 loops, 0.055 mT/m/A, and 115% error are reference content, not global defaults or expected outputs. Do not hardcode them into production.
- A reported 115% error does not alone establish a failure threshold. Use actual metric definitions and acceptance criteria. Where unavailable, explicitly report that interpretation is unavailable.
- Keep contour levels and generated loop counts distinct. Preserve existing advanced solver settings.
- Expose progress, cancellation, solver failures, and unavailable quality data truthfully. No mock success or simulated progress in production.

## Implementation sequence

1. Inspect both existing screens and map every current control/action to the redesigned location. Identify scientific semantics needing confirmation from code or documentation.
2. Build shared tokens and shell. Render the two default states with a clearly isolated, deterministic development fixture.
3. Match typography, surfaces, column sizing, section spacing, control sizes, and primary actions before polishing the scene.
4. Connect existing controls and simulation jobs. Preserve all previously supported workflows and exports.
5. Apply real viewer materials, camera framing, visibility controls, and comparison behavior.
6. Capture and compare screenshots, fix material differences, then run relevant behavioral checks.

## Verification and acceptance

- Existing top bar is unchanged in markup, styling, and behavior; workspace styles are scoped.
- Both approved default states have the same visual hierarchy, labels, palette, section order, and density as the references.
- Capture both screens at a desktop width, at the reference's normalized workspace width, and at 390px and 320px widths. Record CSS viewport size, browser zoom, device pixel ratio, actual font, fixture, and camera state.
- Compare the workspace crop only; exclude host preview framing. Use a semi-transparent overlay or image difference after aligning scale. Fix column boundaries, baseline spacing, button geometry, and typography before tiny rendering differences.
- Scene screenshots use a deterministic real fixture and fixed camera. Validate actual field/coil correctness independently; do not distort real geometry merely to reproduce the mock scene.
- Demonstrate import/validation, geometry edits, former/axis switching, disclosures, viewer controls, start/cancel/failure/completion, stale results, and exports where supported.
- No hidden global CSS changes, horizontal overflow, inaccessible controls, fake result values, or dead production actions.
- Deliver implementation notes, changed files, screenshots of both finished screens, test results, and any remaining deviations or backend limitations. Do not claim pixel-perfect reproduction without a screenshot comparison.

## Prompt to start the coding agent

Read this IMPLEMENTATION.md and all supplied references. Implement both approved workspaces in the current app, keeping the Adelpha top bar unchanged. Use the HTML/CSS as the visual specification and the existing app as the authority for scientific behavior. Reuse the rendering engine and solver APIs; do not copy mock geometry, demo metrics, or preview-only logic into production. Build shared components and tokens, connect real state transitions, and compare screenshots at normalized matching sizes. Continue through implementation and verification. Report concrete blockers and any remaining visual or behavioral deviations.
