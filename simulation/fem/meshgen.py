"""STEP inspection and conforming, locally refined tetrahedral Gmsh meshes."""
from __future__ import annotations

from contextlib import contextmanager
import hashlib
import json
import math
from pathlib import Path

from .config import SimulationConfig
from .meshpreview import write_mesh_preview


@contextmanager
def gmsh_session(log_path=None):
    try:
        import gmsh
    except ImportError as exc:
        raise RuntimeError("Install the FEM dependencies: pip install -r simulation/fem/requirements.txt") from exc
    if gmsh.isInitialized():
        raise RuntimeError("Gmsh is already initialized; run FEM jobs in separate worker processes")
    gmsh.initialize([], readConfigFiles=False)
    gmsh.logger.start()
    try:
        gmsh.option.setNumber("General.Terminal", 0)
        # OCC converts STEP's declared units to metres; never guess mm from bounds.
        gmsh.option.setString("Geometry.OCCTargetUnit", "M")
        gmsh.model.add("magnetostatic")
        yield gmsh
    finally:
        if log_path is not None:
            Path(log_path).write_text("\n".join(gmsh.logger.get()) + "\n")
        gmsh.logger.stop()
        gmsh.finalize()


def _import(gmsh, filename):
    path = Path(filename).resolve()
    if path.suffix.lower() not in (".step", ".stp") or not path.is_file():
        raise ValueError(f"STEP file not found or unsupported extension: {path}")
    solids = sorted(gmsh.model.occ.importShapes(str(path), highestDimOnly=True))
    gmsh.model.occ.synchronize()
    if not solids or any(dim != 3 for dim, _ in solids):
        volumes = len(gmsh.model.getEntities(3))
        surfaces = len(gmsh.model.getEntities(2))
        curves = len(gmsh.model.getEntities(1))
        raise ValueError(
            f"STEP import found {volumes} solid volume(s), {surfaces} surface(s), and {curves} curve(s). "
            "FEM needs enclosed solid bodies to create a 3D volume mesh. A surface preview can look "
            "solid without enclosing a volume. In your CAD tool, sew/stitch the faces into a closed "
            "solid, repair gaps or missing faces, and export the solid bodies as STEP. If the assembly "
            "also contains construction surfaces or curves, exclude those from the export. "
            "Changing mesh size will not fix missing solid geometry."
        )
    return solids


def _inventory(gmsh, solids):
    return [dict(index=i, label=gmsh.model.getEntityName(3, tag),
                 bounds_m=list(gmsh.model.occ.getBoundingBox(3, tag)),
                 center_m=list(gmsh.model.occ.getCenterOfMass(3, tag)),
                 volume_m3=gmsh.model.occ.getMass(3, tag))
            for i, (_, tag) in enumerate(solids, 1)]


def inspect_step(filename):
    """Return one-based solid indices for explicit material assignment."""
    with gmsh_session() as gmsh:
        return _inventory(gmsh, _import(gmsh, filename))


def generate_mesh(config: SimulationConfig, directory):
    """Write mesh.msh (MSH2), mesh.json and return the physical-ID manifest."""
    directory = Path(directory)
    directory.mkdir(parents=True, exist_ok=True)
    with gmsh_session(directory / "gmsh.log") as g:
        solids = _import(g, config.step_file)
        inventory = _inventory(g, solids)
        assigned = {i for region in config.regions for i in region.solids}
        if assigned != set(range(1, len(solids) + 1)):
            raise ValueError("Every STEP solid must be assigned exactly once; inspect the STEP file first")
        bounds = [item["bounds_m"] for item in inventory]
        lo = [min(b[i] for b in bounds) - config.mesh.air_padding for i in range(3)]
        hi = [max(b[i + 3] for b in bounds) + config.mesh.air_padding for i in range(3)]
        air = g.model.occ.addBox(*lo, *(hi[i] - lo[i] for i in range(3)))
        _, mapping = g.model.occ.fragment([(3, air)], solids)
        g.model.occ.synchronize()
        parts = [{tag for dim, tag in entry if dim == 3} for entry in mapping[1:]]
        seen = set()
        for part in parts:
            if not part or seen.intersection(part):
                raise ValueError("STEP contains overlapping or degenerate solids; repair the assembly before simulation")
            seen.update(part)
        air_tags = {tag for dim, tag in mapping[0] if dim == 3} - seen
        if not air_tags:
            raise ValueError("Could not construct the surrounding air domain")
        g.model.addPhysicalGroup(3, sorted(air_tags), 1, "air")
        bodies = [dict(id=1, name="air", material=None, volumes=sorted(air_tags))]
        fields = []
        for body_id, region in enumerate(config.regions, 2):
            tags = sorted(set().union(*(parts[i - 1] for i in region.solids)))
            g.model.addPhysicalGroup(3, tags, body_id, region.name)
            bodies.append(dict(id=body_id, name=region.name, material=region.material, volumes=tags))
            surfaces = sorted({abs(tag) for dim, tag in g.model.getBoundary([(3, t) for t in tags], combined=False) if dim == 2})
            distance = g.model.mesh.field.add("Distance")
            g.model.mesh.field.setNumbers(distance, "SurfacesList", surfaces)
            g.model.mesh.field.setNumber(distance, "Sampling", 100)
            threshold = g.model.mesh.field.add("Threshold")
            for key, value in {"InField": distance, "SizeMin": region.mesh_size or config.mesh.size,
                               "SizeMax": config.mesh.air_size, "DistMin": 0,
                               "DistMax": config.mesh.transition}.items():
                g.model.mesh.field.setNumber(threshold, key, value)
            fields.append(threshold)
            # Restrict a constant field to volumes as well, refining part interiors.
            constant = g.model.mesh.field.add("MathEval")
            g.model.mesh.field.setString(constant, "F", str(region.mesh_size or config.mesh.size))
            restrict = g.model.mesh.field.add("Restrict")
            g.model.mesh.field.setNumber(restrict, "InField", constant)
            g.model.mesh.field.setNumbers(restrict, "VolumesList", tags)
            fields.append(restrict)
        for box in config.mesh.refinement_boxes:
            f = g.model.mesh.field.add("Box")
            for key, val in {"VIn": box.size, "VOut": config.mesh.air_size,
                             **{axis + "Min": box.minimum[i] for i, axis in enumerate("XYZ")},
                             **{axis + "Max": box.maximum[i] for i, axis in enumerate("XYZ")}}.items():
                g.model.mesh.field.setNumber(f, key, val)
            fields.append(f)
        minimum = g.model.mesh.field.add("Min")
        g.model.mesh.field.setNumbers(minimum, "FieldsList", fields)
        g.model.mesh.field.setAsBackgroundMesh(minimum)
        exterior = [abs(tag) for dim, tag in g.model.getBoundary(g.model.getEntities(3), combined=True) if dim == 2]
        g.model.addPhysicalGroup(2, sorted(exterior), 1, "far_field")
        for key, value in {"General.NumThreads": config.mesh.threads, "Mesh.Algorithm3D": 1,
                           "Mesh.MeshSizeFromPoints": 0, "Mesh.MeshSizeFromCurvature": 0,
                           "Mesh.MeshSizeExtendFromBoundary": 0, "Mesh.ElementOrder": 1,
                           "Mesh.MshFileVersion": 2.2, "Mesh.Binary": 0}.items():
            g.option.setNumber(key, value)
        g.model.mesh.generate(3)
        g.model.mesh.optimize("Netgen")
        _, element_tags, _ = g.model.mesh.getElements(3)
        tags = [int(t) for group in element_tags for t in group]
        qualities = list(g.model.mesh.getElementQualities(tags, "minSICN"))
        if not qualities or any(not math.isfinite(q) for q in qualities) or min(qualities) <= config.mesh.minimum_quality:
            raise RuntimeError("Mesh quality check failed; adjust mesh sizes or repair STEP geometry")
        g.write(str(directory / "mesh.msh"))
        write_mesh_preview(g, bodies, directory)
        manifest = dict(schema_version=1, units="m", gmsh_version=g.__version__, step_sha256=hashlib.sha256(Path(config.step_file).read_bytes()).hexdigest(),
                        solids=inventory, bodies=bodies, far_field_id=1,
                        nodes=len(g.model.mesh.getNodes()[0]), tetrahedra=len(tags),
                        quality=dict(metric="minSICN", minimum=float(min(qualities)), mean=float(sum(qualities) / len(qualities))))
        (directory / "mesh.json").write_text(json.dumps(manifest, indent=2) + "\n")
        return manifest
