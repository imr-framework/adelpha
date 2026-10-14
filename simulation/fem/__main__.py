"""JSON CLI for worker processes and future UI integration."""
import argparse
import json
import sys

from .config import SimulationConfig
from .meshgen import inspect_step
from .solver import prepare, run


def main():
    parser = argparse.ArgumentParser(description="STEP assembly magnetostatics with Gmsh and Elmer")
    commands = parser.add_subparsers(dest="command", required=True)
    inspect = commands.add_parser("inspect", help="List STEP solids and their SI dimensions")
    inspect.add_argument("step_file")
    for name in ("prepare", "run"):
        sub = commands.add_parser(name)
        sub.add_argument("config", help="JSON configuration; STEP path is relative to this file")
        sub.add_argument("output", help="New job directory (must not already exist)")
    args = parser.parse_args()
    try:
        if args.command == "inspect":
            result = {"units": "m", "solids": inspect_step(args.step_file)}
        else:
            result = {"prepare": prepare, "run": run}[args.command](SimulationConfig.load(args.config), args.output)
        print(json.dumps(result, indent=2))
        return 0
    except Exception as exc:
        print(json.dumps({"status": "failed", "error": str(exc)}), file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
