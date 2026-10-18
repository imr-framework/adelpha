"""Create a two-magnet STEP assembly and runnable configuration, in a new folder.

Usage: python -m simulation.fem.examples.create_demo /tmp/magnet-demo
"""
import argparse
import json
from pathlib import Path

from simulation.fem import Material, MeshOptions, RefinementBox, Region, SimulationConfig
from simulation.fem.meshgen import gmsh_session


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory")
    args = parser.parse_args()
    directory = Path(args.directory).resolve()
    directory.mkdir(parents=True, exist_ok=False)
    with gmsh_session() as g:
        for z in (-.015, .005):
            g.model.occ.addBox(-.005, -.005, z, .01, .01, .01)
        g.model.occ.synchronize()
        g.write(str(directory / "assembly.step"))
    config = SimulationConfig(
        "assembly.step", {"NdFeB": Material(1.05, (0, 0, 1.2))},
        (Region("lower_magnet", (1,), "NdFeB"), Region("upper_magnet", (2,), "NdFeB")),
        MeshOptions(size=.002, air_size=.012, air_padding=.06, transition=.02,
                    refinement_boxes=(RefinementBox((-.005, -.005, -.005), (.005, .005, .005), .0015),)),
    )
    (directory / "config.json").write_text(json.dumps(config.to_dict(), indent=2) + "\n")
    print(f"Created {directory / 'config.json'}")


if __name__ == "__main__":
    main()
