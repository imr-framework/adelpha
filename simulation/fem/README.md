# STEP magnet and assembly FEM

This package runs 3D **linear magnetostatics** with Gmsh/OpenCASCADE and Elmer.
It imports closed STEP solids, builds a conforming surrounding air domain, assigns
materials and global remanence vectors, solves for magnetic vector potential,
and exports **B (tesla), H (A/m), and A (T m)** in VTU files.
Python functions and the JSON CLI are the backend integration boundary.
Engineering Studio exposes this workflow through the FEM workspace.

## Runtime

Python 3.10+, the Gmsh Python API, and `ElmerGrid` / `ElmerSolver` are required:

```sh
python -m pip install -r simulation/fem/requirements.txt
python -m simulation.fem --help
```

Elmer must include its `MagnetoDynamics` and `ResultOutputSolve` modules. Executables
must be on PATH or supplied as absolute paths in the solver configuration.
On this development Mac, Elmer and Gmsh 4.15.2 are installed through Homebrew;
the existing Gmsh Python API can be used without installing another copy:

```sh
export PYTHONPATH="/opt/homebrew/opt/gmsh/lib${PYTHONPATH:+:$PYTHONPATH}"
```

Direct SIF generation is intentional: pyelmer is not needed for this workflow.
Run commands from the repository root, using a Python interpreter with the API available.

## Start with the included assembly

```sh
python -m simulation.fem.examples.create_demo /tmp/magnet-demo
python -m simulation.fem inspect /tmp/magnet-demo/assembly.step
python -m simulation.fem run /tmp/magnet-demo/config.json /tmp/magnet-demo/run-01
```

The example creates two 10 mm magnet cubes, a 10 mm air gap, and extra refinement in
the gap. Open `run-01/results/fields_t0001.vtu` in ParaView to inspect the field.
`prepare` accepts the same arguments as `run` and stops after mesh conversion and
SIF generation, for inspection or manual Elmer use. To solve a prepared case manually,
run `ElmerSolver case.sif` inside its directory; manual execution does not update the
Python job status. Every automated run uses a **new** output directory to prevent
stale results and concurrent writes.

## Your STEP file

1. Run `inspect` to list one-based solid indices, CAD labels (when available),
   bounding boxes, centers of mass, and volumes.
2. Assign **every** imported solid exactly once to a region. Include passive solids
   with their own materials; the surrounding air is added automatically. Multiple
   solids can share one region. Reinspect after changing or re-exporting the CAD file:
   indices are not persistent CAD identifiers.
3. Specify each magnet's remanence in **global coordinates**. STEP files do not
   supply magnetic materials or local magnetization axes automatically.
4. Save a configuration, then run it in a new directory.

All lengths, mesh sizes, padding, and refinement coordinates are in **metres**.
The importer uses STEP unit metadata and asks OpenCASCADE to convert to metres;
a millimetre STEP file does not need an extra factor of 0.001. The source STEP must
have correct unit metadata. Remanence is in tesla, and permeability is relative.
For a specified magnetization M in A/m, enter `remanence = mu0 * mu_r * M`.

Example configuration for a STEP file with two solids:

```json
{
  "step_file": "assembly.step",
  "materials": {
    "magnet_z": {"relative_permeability": 1.05, "remanence": [0, 0, 1.2]},
    "linear_yoke": {"relative_permeability": 100}
  },
  "regions": [
    {"name": "magnet", "solids": [1], "material": "magnet_z", "mesh_size": 0.001},
    {"name": "yoke", "solids": [2], "material": "linear_yoke"}
  ],
  "mesh": {
    "size": 0.002,
    "air_size": 0.015,
    "air_padding": 0.08,
    "transition": 0.02,
    "minimum_quality": 0.01,
    "threads": 1,
    "refinement_boxes": [
      {"minimum": [-0.005, -0.005, -0.005], "maximum": [0.005, 0.005, 0.005], "size": 0.001}
    ]
  },
  "solver": {
    "tolerance": 1e-9,
    "max_iterations": 5000,
    "quadratic": false,
    "timeout": 1800,
    "elmer_grid": "ElmerGrid",
    "elmer_solver": "ElmerSolver"
  }
}
```

STEP paths in JSON are relative to the configuration file. Python API paths are
relative to the process working directory. Unknown configuration keys are rejected.
Region names use letters, numbers, underscores and hyphens, beginning with a letter;
`air` is reserved. A region's `mesh_size` overrides the global part size. Refinement
boxes are combined with part/interfacial sizing using the smallest requested size.
`transition` controls the distance from part surfaces to coarse air sizing.
`air_padding` expands the assembly bounding box on each side, including thin axes.

## Numerical quality and supported physics

- Boolean fragmentation gives touching solids and air shared mesh interfaces while
  preserving per-solid membership. Volume overlaps, missing assignments, open
  surfaces, and failed mesh quality checks stop the job.
- Gmsh generates first-order tetrahedra and optimizes them with Netgen. `mesh.json`
  records minimum/mean signed inverse condition number (`minSICN`), counts, physical
  IDs, the Gmsh version, and the source STEP SHA-256. Poor quality and inverted
  elements fail validation. Meshing details are saved in `gmsh.log`.
- Elmer uses the 3D Whitney edge-element A formulation. `quadratic: true` enables
  Elmer's quadratic field approximation; it does not curve the first-order CAD
  surface mesh. Curved parts still need adequate geometric mesh refinement.
- The outside air box has zero tangential A. This is a finite-domain approximation
  to open space. Increase air padding until the quantity of interest stops changing.
- Linear solver tolerance is **not** a field-accuracy guarantee. Refine magnets,
  small gaps, and regions of interest; compare B at the same physical locations
  across runs. Also enlarge the air domain independently. A good element-quality
  score alone does not establish mesh convergence.
- Constant isotropic permeability and prescribed remanence are supported. A linear
  yoke can approximate an unsaturated soft magnetic part, but this backend does not
  model B-H saturation, hysteresis, irreversible demagnetization, coils/currents,
  eddy currents, transient excitation, mechanical assembly stress, or motion.
- Large permeability contrast or fine assemblies can require more iterations and
  memory. Nonconvergence is reported as a failed job; it is not silently accepted.

## Python API

```python
from simulation.fem import SimulationConfig, inspect_step, run

solids = inspect_step("assembly.step")
config = SimulationConfig.load("config.json")
result = run(config, "output/new-fem-job")
print(result["results"])
```

Use one worker **process** per job: the Gmsh API owns global state and is not a
thread-safe per-request service. Calling while another Gmsh session is initialized
is rejected. `status.json` is atomically updated through `meshing`, `converting`,
`prepared`, `solving`, then `completed` or `failed`; failures contain an error message.
The CLI emits the result as JSON on stdout, or an error as JSON on stderr with exit
code 1. Elmer stdout/stderr are redirected to separate log files. Solver/converter
timeouts kill and wait for their subprocess. The timeout does not cover in-process
CAD import/meshing; the runtime worker enforces a separate two-hour total limit. There is currently no UI cancellation control.

Each job keeps `config.json`, `mesh.msh`, `mesh.json`, `mesh/`, `case.sif`,
`gmsh.log`, `elmergrid.log`, `elmersolver.log`, `status.json`, and `results/*.vtu`.
Conversion verifies physical body IDs before writing material assignments. Successful
completion requires Elmer's completion marker and nonempty, finite B/H/A field arrays.
VTU output includes geometry IDs and separate interface vertices per body.

## Tests

```sh
python -m unittest discover -s simulation/fem/tests -v
FEM_INTEGRATION=1 python -m unittest discover -s simulation/fem/tests -v
```

The opt-in suite uses real Gmsh and Elmer: STEP unit conversion, touching magnet/yoke
assembly with quadratic approximation, rejected overlaps and missing assignments,
failed-job status, and mesh refinement against a uniformly magnetized sphere. For
`mu_r = 1`, its analytical internal field is `B = 2 Br / 3`. The fine regression mesh
must be within 5% and improve on the coarse mesh. These small fixtures do not certify
accuracy for an arbitrary imported assembly; do a convergence study for each design.

Implementation references: [Gmsh API manual](https://gmsh.info/doc/texinfo/),
[Elmer Models Manual, Computation of Magnetic Fields in 3D](https://www.nic.funet.fi/pub/org/net/CSC/software/elmer/doc/ElmerModelsManual.pdf),
and the [Elmer magnetodynamics regression example](https://github.com/ElmerCSC/elmerfem/blob/devel/fem/tests/mgdyn_airgap_force/case.sif).

## Engineering Studio UI

For a short walkthrough, see [FEM simulation](../../docs/guide/fem.md).

Open **Engineering Studio → New project → Hardware → FEM**. Choose a STEP file, assign every solid a permanent magnet, linear magnetic yoke, or nonmagnetic
material, adjust the mesh controls in millimetres, and select **Run simulation**.
The screen polls background job status and offers a ZIP with STEP geometry,
configuration, mesh, B/H/A VTU results, and diagnostic logs. Projects persist their
STEP file, setup, and run history locally in IndexedDB. Select **Results** to inspect computed fields in Adelpha, or open the downloaded VTU
in ParaView. The CAD preview is rebuilt from the saved STEP file after a reload.
Closing a project retains its work; deleting the project removes its local history.
Run history restores previous inputs and run references. Runtime solver artifacts
and exported archives are separate from the local project record.

The runtime exposes `/api/magnet/fem/uploads`, `/api/magnet/fem/jobs`,
`/api/magnet/fem/jobs/{id}`, and `/api/magnet/fem/jobs/{id}/download`.
Uploaded files and job artifacts live under the runtime data directory's `fem/`
folder. Uploads are limited to 100 MB. One solve runs at a time per runtime;
workers have a two-hour total time limit. The UI can close while a run continues.
Restarting the runtime during a job is not a supported way to resume it.

In development, Vite starts the magnet service on loopback port 8005 and proxies
`/api/magnet` there. Desktop builds use the authenticated runtime gateway.
An ordinary Python interpreter with Gmsh and an Elmer installation are still
required, including for packaged desktop builds. Set `ADELPHA_FEM_PYTHON` to that
interpreter if it differs from the runtime interpreter (or system `python3` for
frozen builds). Homebrew Gmsh API paths are detected on macOS. The sidecar includes
the FEM Python sources but does not bundle Elmer or an external Python interpreter.

After meshing finishes, select **Mesh view** in the central viewport to inspect
the actual Gmsh surface triangles of the volume mesh. Drag to rotate and scroll
to zoom; toggle **Wireframe** or **Show air domain** as needed. **CAD view** switches
back to the imported geometry. Mesh previews remain available if a later solver
stage fails. This is a mesh inspection view, not a magnetic field result map.
The preview is served by `/api/magnet/fem/jobs/{id}/mesh`. Previews exceeding
250,000 surface triangles show a size-limit message; download the job archive
to inspect its full `mesh.msh` in Gmsh instead.

UI and API checks:

```sh
npm test -- --run src/twin/studio/ElmerStepStudio.test.tsx
FEM_INTEGRATION=1 PYTHONPATH=.:runtime/python python -m pytest runtime/python/tests/test_fem_studio.py -q
```

### Geometry errors and the FEM workspace

The project category is **FEM** (the solver is Elmer). FEM projects use imported
STEP geometry only, with the tree / preview / inspector layout. Scanner assembly
geometry and older assembly-source preferences are not used by FEM. Select a STEP
file and assign every imported solid a material before running.

A STEP preview displays tessellated surfaces; a successful preview does not prove
that the CAD file contains solid volumes. If import reports zero solids, check the
original CAD model for sheet/surface bodies or unsewn shells. Sew/stitch faces into
closed shells, repair open edges or missing faces, then create solid bodies and
export them as STEP. Exclude construction geometry from a mixed export. Sheet
parts intended to represent real volumes need their actual thickness modeled.
Changing FEM element size cannot convert a surface model into a solid.

The importer reports the counts of volumes, surfaces and curves when it rejects
an export. It does not automatically close holes, choose sheet thicknesses, or
remove assembly parts: these choices can change the physical simulation. Gmsh's
OpenCASCADE API offers `healShapes` with sewing and solid creation, but success
still depends on the source geometry; CAD-side repair is the recommended first
step. See the [Gmsh OpenCASCADE API](https://gmsh.info/doc/texinfo/#Namespace-gmsh_002fmodel_002focc).

### In-app field explorer

**Results** opens the completed Elmer solution in the central viewport, including
runs saved before this viewer was added. New runs open the field explorer when
solving completes. The existing CAD and mesh views remain available.

- Select B (tesla), H (A/m), or A (tesla-metres), then magnitude or an XYZ component.
- Switch between body surfaces and an XY, XZ, or YZ cross-section; move the plane
  with the position slider. Sections include air by default to show the gap field.
- Toggle air and mesh edges. Frame solids focuses on the assembly; turn it off
  to fit the entire air domain. Drag/zoom or use the orientation gizmo.
- Click a colored face to inspect the interpolated vector and coordinates in mm.
- Use auto color scaling or set a fixed range for comparisons. Fixed limits clip
  out-of-range colors, not the underlying probe values.
- Export a PNG containing the viewport, field/unit label, section position and
  color scale. The complete VTU and solver logs remain downloadable.

The `/api/magnet/fem/jobs/{id}/fields` route reads the final ASCII VTU and retains
Elmer's discontinuous body nodes. Surfaces are extracted separately per body;
sections interpolate the nodal vectors within each linear tetrahedron before
computing magnitude. This displays the exported nodal solution, including when
quadratic field approximation was used; it does not reevaluate the solver basis.
No field smoothing or geometry decimation is applied. Interactive results are
limited to 100 MB VTU files, 200,000 points and 250,000 cells; larger or unsupported
results give a download instruction instead of an incomplete visualization.

### Precision Desk layout

FEM uses the existing Adelpha application header with no second project header.
The left project drawer collapses with its chevron; the study name is anchored
at the bottom. CAD / Mesh / Results tabs stay above the viewport. Setup, mesh
inspection, field controls, point readings, and exports occupy the right inspector.
The inspector scrolls independently; Run simulation remains accessible at its foot.
On narrow windows the inspector moves below the viewport. The workspace follows
Adelpha, MRI4ALL, Porcelain, and Glacier themes; scientific field colors are unchanged.

The default result view shows colored solid surfaces and mesh edges, without a
section plane. Cross-sections remain available explicitly. Optional **B field
lines** trace the exported B vectors using barycentric interpolation in tetrahedra
and midpoint integration, with up to 24 surface seeds and bounded path lengths.
Computation runs in a cancellable worker. These trajectories are qualitative;
mesh refinement and the nodal field quality determine their accuracy. They are
available in surface mode and are off by default. No illustrative curves from
the concept mockup are used as scientific results.
