#!/usr/bin/env python3
"""Build Tauri static updater latest.json from collected platform artifacts."""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path


def classify(path: Path) -> str | None:
    name = path.name.lower()
    if name.endswith(".sig"):
        return None
    if "darwin-aarch64" in name or (name.endswith(".app.tar.gz") and "aarch64" in name):
        return "darwin-aarch64"
    if "darwin-x86_64" in name or "darwin-x64" in name or (
        name.endswith(".app.tar.gz") and ("x86_64" in name or "x64" in name)
    ):
        return "darwin-x86_64"
    if name.endswith(".app.tar.gz"):
        return "darwin-aarch64"
    if name.endswith(".appimage") or "appimage" in name:
        return "linux-x86_64"
    if name.endswith(".exe") and "setup" in name:
        return "windows-x86_64"
    return None


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dir", required=True, type=Path)
    parser.add_argument("--tag", required=True)
    parser.add_argument("--repo", required=True, help="owner/name")
    parser.add_argument("--version", required=True)
    parser.add_argument("--notes", default="")
    parser.add_argument("--out", required=True, type=Path)
    args = parser.parse_args()

    platforms: dict[str, dict[str, str]] = {}
    root = args.dir
    files = [p for p in root.rglob("*") if p.is_file()]
    for path in files:
        key = classify(path)
        if key is None:
            continue
        sig = Path(str(path) + ".sig")
        if not sig.is_file():
            alt = path.with_suffix(path.suffix + ".sig")
            sig = alt if alt.is_file() else sig
        if not sig.is_file():
            print(f"skip {path.name}: missing .sig")
            continue
        url = f"https://github.com/{args.repo}/releases/download/{args.tag}/{path.name}"
        platforms[key] = {
            "url": url,
            "signature": sig.read_text(encoding="utf-8").strip(),
        }

    # Tauri 2 looks for `{os}-{arch}-{bundle}` first (darwin-aarch64-app),
    # then the unsuffixed key. Duplicate so either lookup succeeds.
    for key, value in list(platforms.items()):
        if key.startswith("darwin-") and not key.endswith("-app"):
            platforms[f"{key}-app"] = value

    if not platforms:
        print("no signed updater artifacts; skipping latest.json")
        if args.out.exists():
            args.out.unlink()
        return 0

    darwin = [k for k in platforms if k.startswith("darwin-")]
    if not darwin:
        print("warning: latest.json has no macOS platforms (need Adelpha-darwin-*.app.tar.gz.sig)")

    payload = {
        "version": args.version.lstrip("v"),
        "notes": args.notes,
        "pub_date": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "platforms": platforms,
    }
    args.out.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {args.out} with {len(platforms)} platform(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
