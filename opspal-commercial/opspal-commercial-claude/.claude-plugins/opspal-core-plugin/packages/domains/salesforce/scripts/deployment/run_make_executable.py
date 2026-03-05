#!/usr/bin/env python3

import os
import stat
import subprocess
import sys


from pathlib import Path



LIB_DIR = Path(__file__).resolve().parent / "lib"
if not LIB_DIR.exists():
    LIB_DIR = Path(__file__).resolve().parent.parent / "lib"
sys.path.insert(0, str(LIB_DIR))

from instance_resolver import resolve_project_root, resolve_instance_root, require_sf_project, resolve_org_alias, require_org_alias

PROJECT_ROOT = resolve_project_root()
INSTANCE_ROOT = resolve_instance_root(PROJECT_ROOT)
require_sf_project(INSTANCE_ROOT)
ORG_ALIAS = require_org_alias(resolve_org_alias(PROJECT_ROOT, INSTANCE_ROOT))

SCRIPT_DIR = Path(__file__).resolve().parent
UTILITIES_DIR = SCRIPT_DIR.parent / "utilities"
VALIDATION_DIR = SCRIPT_DIR.parent / "validation"

# Execute the make_executable script
try:
    script_path = UTILITIES_DIR / "make_executable.py"
    result = subprocess.run([sys.executable, str(script_path)],
                          capture_output=True, text=True, cwd=UTILITIES_DIR)
    
    print("=== Making Files Executable ===")
    print(result.stdout)
    
    if result.stderr:
        print("Errors:")
        print(result.stderr)
    
    print(f"Exit code: {result.returncode}")
    
except Exception as e:
    print(f"Error: {e}")

# Also try to make all Python scripts executable
scripts = [
    UTILITIES_DIR / 'add_field_to_layout.py',
    VALIDATION_DIR / 'test_sf_cli.py',
    UTILITIES_DIR / 'direct_execution.py'
]

for script in scripts:
    try:
        current_permissions = os.stat(script).st_mode
        os.chmod(script, current_permissions | stat.S_IEXEC)
        print(f"✅ Made {script.name} executable")
    except:
        print(f"❌ Could not make {script} executable")

print("\n" + "="*50)
print("SUMMARY: Contact Layout Modification Solution")
print("="*50)
print(f"Location: {UTILITIES_DIR}/")
print()
print("Available execution options:")
print("1. Automated Python script: ./add_field_to_layout.py")
print("2. Shell script (semi-manual): ./add_is_dvm_to_contact_layout.sh") 
print("3. Test connection only: ./test_sf_cli.py")
print("4. Step-by-step execution: ./direct_execution.py")
print()
print("Documentation: CONTACT_LAYOUT_SOLUTION.md")
print()
print(f"Objective: Add Is_DVM__c checkbox field to Contact page layout in {ORG_ALIAS}")
