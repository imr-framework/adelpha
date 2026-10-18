---
title: Adelpha MRI FEM simulation
description: Import a STEP assembly, run an Elmer magnetic simulation, and inspect meshes and results in Adelpha.
icon: lucide/box
---

# FEM simulation

Simulate magnets and assemblies from an imported STEP file. Gmsh creates the mesh; Elmer solves the magnetic field. FEM uses its own geometry, independently of the scanner model.

## Before you start

You need Python with the Gmsh API, plus `ElmerGrid` and `ElmerSolver`. These tools are required for desktop builds too. If necessary, set `ADELPHA_FEM_PYTHON` to the Python interpreter that has Gmsh installed.

Your `.step` or `.stp` file must contain closed 3D solids and be smaller than 100 MB.

## Run a study

1. Open **Engineering Studio → New project → Hardware → FEM**.
2. Name the project and import your STEP file.
3. Assign every solid a material: permanent magnet, linear magnetic yoke, or nonmagnetic material.
4. For magnets, set the remanence vector in global X, Y, Z coordinates, in tesla.
5. Set the mesh sizes and surrounding air region. Length controls use millimetres.
6. Select **Run simulation**. The status strip shows progress; Results opens when the solve completes.

The left drawer contains the assembly and setup steps. Collapse it with the chevron for more viewing space. The right inspector holds settings and display controls.

## Inspect the model

| View | What it shows |
| --- | --- |
| **CAD** | Imported geometry; a surface preview does not validate solid volumes |
| **Mesh** | Generated surface triangles, with wireframe and air-domain controls |
| **Results** | Computed magnetic fields on surfaces or cross-sections |

Drag to rotate, scroll to zoom, and use **Fit view** in Results to reset framing. **Frame solids** focuses on the assembly instead of the surrounding air.

## Explore results

Choose a field and its magnitude or X, Y, Z component:

| Field | Units |
| --- | --- |
| **B — Magnetic flux density** | T |
| **H — Magnetic field strength** | A/m |
| **A — Magnetic vector potential** | T·m |

- **Surfaces** shows the solid boundaries. **Cross-section** displays a movable section through the mesh.
- **Include air** reveals the surrounding field. **Mesh edges** overlays the triangles.
- **B field lines** adds qualitative trajectories in surface mode; it is off by default.
- Click a colored surface to probe the interpolated field and position in millimetres.
- Use **Color range** to set fixed limits when comparing runs. Clipped colors do not change probe values.

The workspace follows the app's four [themes](settings.md#appearance). Changing the theme does not change field colors or values.

## Save your results

**Export image** saves a PNG with the view, field label, and color scale. **Download results & logs** saves the job archive, including configuration, mesh, VTU fields, and diagnostics. Open VTU files in ParaView for further analysis.

Projects save automatically on this computer, including STEP geometry, material assignments, mesh settings, and run history. Closing a project or restarting Adelpha does not delete it. Reopening restores the latest saved setup and result.

Only **Delete project** in the project list removes the saved project and its local history. FEM result files remain in the runtime data directory; exported archives remain wherever you saved them. Download an archive for a portable backup. Clearing application/browser storage or removing runtime data can still remove saved work.

If saving fails, Adelpha shows a message and a **Retry save** action. Keep the project open until saving succeeds.

## Common questions

**“STEP must contain closed 3D solids”**

The file may contain surfaces or open shells. In your CAD application, repair gaps, stitch faces into closed shells, and create solid bodies before exporting again. Sheet parts need their actual thickness modeled. A finer mesh will not fix an open solid.

**Mesh or Results is unavailable**

Mesh becomes available after meshing; Results requires a completed solve. Read the reported error and download diagnostic logs if a job fails. Mesh inspection can remain available even if a later solver stage fails.

**The objects look stretched**

Perspective and viewing angle can change their apparent proportions. Try **Fit view** and rotate the model. If it still looks wrong, check the CAD dimensions and STEP unit metadata. There is currently no orthographic-view toggle.

**The preview is too large**

Interactive previews have size limits. Download the archive and inspect the full mesh in Gmsh or fields in ParaView.

## Current limits

FEM supports linear magnetostatics with prescribed magnet remanence and constant relative permeability. It does not yet model saturation, hysteresis, coils/currents, time-varying fields, or mechanical stress.

One solve runs at a time per runtime, with a two-hour total limit. Closing the study does not cancel the solve; restarting the runtime interrupts it. There is no cancel button yet.

A completed solve is not an accuracy guarantee. Refine the mesh and enlarge the air region separately, comparing the field at the same locations.

## Sample STEP file

From a source checkout with Gmsh available, run:

```sh
python -m simulation.fem.examples.create_demo /tmp/magnet-demo
```

Import `/tmp/magnet-demo/assembly.step`. It contains two 10 mm magnet cubes separated by a 10 mm gap. Use a suitable writable output path on your platform.
