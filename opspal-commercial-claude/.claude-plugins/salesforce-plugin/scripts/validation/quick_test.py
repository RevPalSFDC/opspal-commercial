import subprocess
import os


from pathlib import Path


import sys

LIB_DIR = Path(__file__).resolve().parent / "lib"
if not LIB_DIR.exists():
    LIB_DIR = Path(__file__).resolve().parent.parent / "lib"
sys.path.insert(0, str(LIB_DIR))

from instance_resolver import resolve_project_root, resolve_instance_root, require_sf_project, resolve_org_alias, require_org_alias

PROJECT_ROOT = resolve_project_root()
INSTANCE_ROOT = resolve_instance_root(PROJECT_ROOT)
require_sf_project(INSTANCE_ROOT)
ORG_ALIAS = require_org_alias(resolve_org_alias(PROJECT_ROOT, INSTANCE_ROOT))

os.chdir(INSTANCE_ROOT)

# Test org connection
print("Testing org connection...")
cmd = ["sf", "org", "display", "--target-org", ORG_ALIAS]
try:
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
    print(f"Return code: {result.returncode}")
    print(f"Output: {result.stdout}")
    if result.stderr:
        print(f"Error: {result.stderr}")
        
    if result.returncode == 0:
        print("✓ Connection successful!")
    else:
        print("✗ Connection failed")
        
except subprocess.TimeoutExpired:
    print("Command timed out")
except FileNotFoundError:
    print("sf command not found")
except Exception as e:
    print(f"Error: {e}")

# Try querying for layouts if connection works
if result.returncode == 0:
    print("\nQuerying for Contact layouts...")
    query_cmd = ["sf", "data", "query", "--use-tooling-api", "--query", "SELECT Name FROM Layout WHERE TableEnumOrId = 'Contact'", "--target-org", ORG_ALIAS]
    try:
        query_result = subprocess.run(query_cmd, capture_output=True, text=True, timeout=30)
        print(f"Query return code: {query_result.returncode}")
        print(f"Query output: {query_result.stdout}")
        if query_result.stderr:
            print(f"Query error: {query_result.stderr}")
    except Exception as e:
        print(f"Query error: {e}")
