#!/usr/bin/env python3
"""Check a Pulseq .seq file and make it available to scan in Adelpha.

    python scripts/load_seq.py path/to/sequence.seq

Checks run with the same interpreter and PyPulseq the Adelpha session uses, so
a file that passes here is one the scanner can interpret. Whatever Python you
start it with, it re-runs itself under the session's interpreter
(runtime/python/.venv). On success the file is copied into the session's seq
library and marked as the latest. In Adelpha, add "Run .seq file" and Browse to
the same file, or scan with Sequence file left as latest.
"""

import argparse
import os
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
CONSOLE = REPO / "console"
SESSION_VENV = REPO / "runtime" / "python" / ".venv"
SESSION_PYTHON = SESSION_VENV / ("Scripts/python.exe" if os.name == "nt" else "bin/python")


def ensure_session_python():
    """Re-run under the Adelpha session's interpreter unless already there."""
    if Path(sys.prefix).resolve() == SESSION_VENV.resolve():
        return
    if not SESSION_PYTHON.exists():
        sys.exit(f"Adelpha's Python runtime is missing ({SESSION_PYTHON}). Run `make install` first.")
    # Compare prefixes, not executables: venv pythons are symlinks to the base interpreter.
    raise SystemExit(subprocess.call([str(SESSION_PYTHON), str(Path(__file__).resolve()), *sys.argv[1:]]))


def default_base() -> Path:
    """MRI4ALL base of the desktop app (Tauri sets ADELPHA_DATA_DIR to this)."""
    if os.environ.get("MRI4ALL_BASE"):
        return Path(os.environ["MRI4ALL_BASE"])
    home = Path.home()
    if sys.platform == "darwin":
        data = home / "Library" / "Application Support" / "org.adelpha.digital-twin-ui"
    elif sys.platform == "win32":
        data = Path(os.environ.get("APPDATA", home / "AppData" / "Roaming")) / "org.adelpha.digital-twin-ui"
    else:
        data = Path(os.environ.get("XDG_DATA_HOME", home / ".local" / "share")) / "org.adelpha.digital-twin-ui"
    return data / "mri4all"


def main() -> int:
    ensure_session_python()
    sys.path.insert(0, str(CONSOLE))
    from sequences.pulseq_file import check_seq_file, stage_seq_file

    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("seq", type=Path, help="the .seq file to load")
    parser.add_argument("--name", help="name in the library (default: the file name)")
    parser.add_argument("--base", type=Path, help="MRI4ALL base dir (default: the desktop app's)")
    parser.add_argument("--check-only", action="store_true", help="check, but do not load")
    parser.add_argument("--plot", type=Path, metavar="PNG",
                        help="save the MaRCoS instructions as a PNG (what the scanner will play)")
    args = parser.parse_args()

    seq_path = args.seq.resolve()
    if not seq_path.is_file():
        print(f"not found: {seq_path}")
        return 1

    base = args.base or default_base()
    os.environ["MRI4ALL_BASE"] = str(base)  # config and logs resolve against this

    print(f"Checking {seq_path.name}")
    problems = check_seq_file(seq_path, args.plot.resolve() if args.plot else None)
    if problems:
        print("FAILED:")
        for p in problems:
            print(f"  - {p}")
        return 1
    print("  OK")
    if args.plot:
        print(f"  plot: {args.plot.resolve()}")

    if args.check_only:
        return 0

    dest = stage_seq_file(seq_path, args.name)
    print(f"Loaded as {dest}")
    print('In Adelpha: Imaging Console -> add "Run .seq file" -> Browse… (or leave latest) -> scan.')
    return 0


if __name__ == "__main__":
    sys.exit(main())
