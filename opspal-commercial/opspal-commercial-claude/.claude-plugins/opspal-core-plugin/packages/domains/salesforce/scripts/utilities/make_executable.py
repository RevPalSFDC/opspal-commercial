import os
import stat


from pathlib import Path


import sys

LIB_DIR = Path(__file__).resolve().parent / "lib"
if not LIB_DIR.exists():
    LIB_DIR = Path(__file__).resolve().parent.parent / "lib"
sys.path.insert(0, str(LIB_DIR))

from instance_resolver import resolve_project_root

PROJECT_ROOT = resolve_project_root()

SCRIPT_DIR = Path(__file__).resolve().parent
VALIDATION_DIR = SCRIPT_DIR.parent / "validation"

# Make shell script executable
script_path = SCRIPT_DIR / "add_is_dvm_to_contact_layout.sh"
current_permissions = os.stat(script_path).st_mode
os.chmod(script_path, current_permissions | stat.S_IEXEC)

print(f"Made {script_path} executable")

# List all relevant files
files = [
    SCRIPT_DIR / 'add_field_to_layout.py',
    SCRIPT_DIR / 'add_is_dvm_to_contact_layout.sh',
    VALIDATION_DIR / 'test_sf_cli.py',
    SCRIPT_DIR / 'direct_execution.py',
    SCRIPT_DIR / 'CONTACT_LAYOUT_SOLUTION.md'
]

print("\nCreated files for Contact layout modification:")
for file in files:
    if os.path.exists(file):
        size = os.path.getsize(file)
        print(f"  ✅ {file.name} ({size} bytes)")
    else:
        print(f"  ❌ {file} (not found)")

print(f"\nAll files are located in: {SCRIPT_DIR}")
