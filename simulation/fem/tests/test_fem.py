"""Unit and opt-in real-tool regression tests; no pytest dependency required."""
from dataclasses import replace
import json
import math
import os
from pathlib import Path
import sys
import tempfile
import unittest
import xml.etree.ElementTree as ET

from simulation.fem import Material, MeshOptions, Region, SimulationConfig, SolverOptions, inspect_step, run
from simulation.fem.meshgen import generate_mesh, gmsh_session
from simulation.fem.sifgen import generate_sif
from simulation.fem.solver import _execute, _validate_results


def config(path="magnet.step", **kwargs):
    return SimulationConfig(str(path), {"pm": Material(remanence=(0, 0, 1))},
                            (Region("magnet", (1,), "pm"),), **kwargs)


class ValidationTests(unittest.TestCase):
    def test_invalid_materials_and_mesh(self):
        for value in (0, -1, math.nan, math.inf, True):
            with self.assertRaises(ValueError):
                Material(relative_permeability=value)
            with self.assertRaises(ValueError):
                MeshOptions(size=value)
        with self.assertRaises(ValueError):
            Material(remanence=(0, math.inf, 0))
        with self.assertRaises(ValueError):
            SolverOptions(quadratic="false")

    def test_ambiguous_assignments(self):
        for regions in ((Region("a", (1,), "pm"), Region("b", (1,), "pm")),
                        (Region("a", (1,), "missing"),)):
            with self.assertRaises(ValueError):
                replace(config(), regions=regions)

    def test_json_roundtrip_and_relative_path(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "config.json"
            path.write_text(json.dumps(config().to_dict()))
            loaded = SimulationConfig.load(path)
            self.assertEqual(loaded.step_file, str((Path(tmp) / "magnet.step").resolve()))
            self.assertEqual(loaded.materials["pm"].remanence, [0, 0, 1])
            data = config().to_dict()
            data["mesh"]["misspelled_option"] = 1
            with self.assertRaises(TypeError):
                SimulationConfig.from_dict(data)

    def test_sif_remanence_scaling_and_manifest(self):
        with tempfile.TemporaryDirectory() as tmp:
            c = replace(config(), materials={"pm": Material(2, (0, 0, 1))})
            manifest = {"bodies": [{"id": 1, "name": "air"}, {"id": 2, "name": "magnet"}], "far_field_id": 7}
            text = generate_sif(c, manifest, tmp).read_text()
            line = next(line for line in text.splitlines() if "Magnetization 3" in line)
            self.assertAlmostEqual(float(line.split()[-1]), 1 / (8e-7 * math.pi))
            self.assertIn("Target Boundaries(1) = 7", text)
            manifest["bodies"].pop()
            with self.assertRaises(ValueError):
                generate_sif(c, manifest, tmp)

    def test_process_failures_and_timeout(self):
        with tempfile.TemporaryDirectory() as tmp:
            for source in ("raise SystemExit(2)", "print('ERROR: failed')", "print('not converged')"):
                with self.assertRaises(RuntimeError):
                    _execute([sys.executable, "-c", source], Path(tmp), "test.log", 5)
            with self.assertRaises(RuntimeError):
                _execute([sys.executable, "-c", "import time; time.sleep(5)"], Path(tmp), "test.log", .05)
            self.assertTrue((Path(tmp) / "test.log").exists())

    def test_reject_stale_output_directory(self):
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(FileExistsError):
                run(config(), tmp)

    def test_missing_and_nonfinite_results(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp)
            (path / "results").mkdir()
            with self.assertRaises(RuntimeError):
                _validate_results(path)
            arrays = ''.join(f'<DataArray Name="{name}" NumberOfComponents="3">NaN 0 0</DataArray>' for name in
                             ("magnetic flux density", "magnetic field strength", "magnetic vector potential"))
            (path / "results/a.vtu").write_text(f'<VTKFile><Piece NumberOfPoints="1"><PointData>{arrays}</PointData></Piece></VTKFile>')
            with self.assertRaisesRegex(RuntimeError, "Non-finite"):
                _validate_results(path)


@unittest.skipUnless(os.environ.get("FEM_INTEGRATION") == "1", "Set FEM_INTEGRATION=1 for real Gmsh/Elmer tests")
class IntegrationTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.directory = Path(self.tmp.name)
        self.addCleanup(self.tmp.cleanup)

    def step(self, name, build):
        path = self.directory / (name + ".step")
        with gmsh_session() as g:
            # STEP writer's default output unit is mm, while OCC is set to metres.
            build(g.model.occ)
            g.model.occ.synchronize()
            g.write(str(path))
        return path

    def test_sphere_analytical_field_and_refinement(self):
        path = self.step("sphere", lambda occ: occ.addSphere(0, 0, 0, .01))
        self.assertAlmostEqual(inspect_step(path)[0]["volume_m3"], 4 * math.pi * .01**3 / 3, places=11)
        errors = []
        for size in (.003, .0015):
            c = config(path, mesh=MeshOptions(size=size, air_size=.012, air_padding=.06, transition=.02))
            result = run(c, self.directory / f"run-{size}")
            root = ET.parse(result["results"][0]).getroot()
            points = list(map(float, root.find(".//Points/DataArray").text.split()))
            array = next(a for a in root.findall(".//PointData/DataArray") if a.get("Name") == "magnetic flux density")
            field = list(map(float, array.text.split()))
            interior = [field[i+2] for i in range(0, len(points), 3) if sum(x*x for x in points[i:i+3]) < .005**2]
            self.assertTrue(interior)
            mean = sum(interior) / len(interior)
            errors.append(abs(mean - 2/3) / (2/3))
            self.assertEqual(result["status"], "completed")
            self.assertGreater(result["mesh"]["quality"]["minimum"], .01)
        self.assertLess(errors[1], .05)
        self.assertLess(errors[1], errors[0])
        print("Sphere relative errors (coarse, fine):", errors)

    def test_touching_assembly_quadratic_and_permeability(self):
        def build(occ):
            occ.addBox(-.01, -.005, -.005, .01, .01, .01)
            occ.addBox(0, -.005, -.005, .01, .01, .01)
        path = self.step("assembly", build)
        c = SimulationConfig(str(path), {"pm": Material(1.05, (1.2, 0, 0)), "iron": Material(100)},
                             (Region("magnet", (1,), "pm"), Region("yoke", (2,), "iron")),
                             MeshOptions(size=.004, air_size=.015, air_padding=.03), SolverOptions(quadratic=True))
        result = run(c, self.directory / "assembly-run")
        from simulation.fem.fieldpreview import read_field_preview
        preview = read_field_preview(self.directory / "assembly-run")
        self.assertEqual({g['name'] for g in preview['groups']}, {'air', 'magnet', 'yoke'})
        self.assertEqual(sum(len(g['tetrahedra']) // 4 for g in preview['groups']), result['mesh']['tetrahedra'])
        self.assertEqual(len(result["mesh"]["bodies"]), 3)
        self.assertEqual(result["status"], "completed")

    def test_overlap_and_unassigned_solid_rejected(self):
        def build(occ):
            occ.addBox(0, 0, 0, .01, .01, .01)
            occ.addBox(.005, 0, 0, .01, .01, .01)
        path = self.step("overlap", build)
        with self.assertRaisesRegex(ValueError, "Every STEP solid"):
            generate_mesh(config(path), self.directory / "unassigned")
        c = replace(config(path), regions=(Region("magnet", (1, 2), "pm"),))
        with self.assertRaisesRegex(ValueError, "overlapping"):
            generate_mesh(c, self.directory / "overlap-run")

    def test_surface_step_explains_how_to_repair_geometry(self):
        path = self.step("surface", lambda occ: occ.addRectangle(0, 0, 0, .01, .01))
        with self.assertRaisesRegex(ValueError, "0 solid volume.*1 surface.*sew/stitch"):
            inspect_step(path)

    def test_missing_executable_persists_failed_status(self):
        path = self.step("box", lambda occ: occ.addBox(0, 0, 0, .01, .01, .01))
        c = config(path, solver=SolverOptions(elmer_grid="adelpha-nonexistent-elmer-grid"))
        directory = self.directory / "failed-job"
        with self.assertRaisesRegex(RuntimeError, "Executable not found"):
            run(c, directory)
        self.assertEqual(json.loads((directory / "status.json").read_text())["status"], "failed")
        self.assertTrue((directory / "gmsh.log").is_file())


if __name__ == "__main__":
    unittest.main()
