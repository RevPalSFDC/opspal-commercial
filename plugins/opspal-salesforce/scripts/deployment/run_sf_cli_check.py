#!/usr/bin/env python3
import argparse
import subprocess
import sys
from pathlib import Path


LIB_DIR = Path(__file__).resolve().parent / "lib"
if not LIB_DIR.exists():
    LIB_DIR = Path(__file__).resolve().parent.parent / "lib"
sys.path.insert(0, str(LIB_DIR))

from instance_resolver import resolve_project_root, resolve_instance_root, require_sf_project

PROJECT_ROOT = resolve_project_root()
INSTANCE_ROOT = resolve_instance_root(PROJECT_ROOT)
require_sf_project(INSTANCE_ROOT)

SCRIPT_DIR = Path(__file__).resolve().parent


def parse_args():
    parser = argparse.ArgumentParser(description="Run Salesforce CLI readiness checks.")
    parser.add_argument(
        "--quick",
        action="store_true",
        help="Run only the base org connection test (legacy behavior).",
    )
    return parser.parse_args()


def run_script(label, script_path):
    if not script_path.exists():
        print(f"❌ {label} script not found: {script_path}")
        return False

    print(f"\n=== {label} ===")
    result = subprocess.run(
        [sys.executable, str(script_path)],
        capture_output=True,
        text=True,
        cwd=INSTANCE_ROOT,
    )

    if result.stdout:
        print(result.stdout)
    if result.stderr:
        print("STDERR:")
        print(result.stderr)

    if result.returncode != 0:
        print(f"❌ {label} failed (exit {result.returncode})")
        return False

    print(f"✅ {label} passed")
    return True


def run_check():
    args = parse_args()

    checks = []
    if not args.quick:
        checks.extend(
            [
                ("SF CLI installation check", SCRIPT_DIR.parent / "validation" / "check_sf_cli.py"),
                ("SF CLI org authentication check", SCRIPT_DIR.parent / "analysis" / "check_sf_cli.py"),
            ]
        )

    checks.append(("SF CLI org connection check", SCRIPT_DIR.parent / "validation" / "test_sf_cli.py"))

    for label, script_path in checks:
        if not run_script(label, script_path):
            return 1

    print("\n✅ All SF CLI checks completed successfully.")
    return 0


if __name__ == "__main__":
    sys.exit(run_check())
