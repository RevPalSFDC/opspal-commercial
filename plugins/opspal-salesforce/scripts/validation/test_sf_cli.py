import subprocess
import os
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

# Change to the correct directory
os.chdir(INSTANCE_ROOT)

print("Testing SF CLI installation and connection...")

# Test 1: SF CLI version
try:
    result = subprocess.run(['sf', '--version'], capture_output=True, text=True, timeout=10)
    if result.returncode == 0:
        print(f"✅ SF CLI installed: {result.stdout.strip()}")
    else:
        print("❌ SF CLI not working")
        sys.exit(1)
except:
    print("❌ SF CLI not found")
    sys.exit(1)

# Test 2: Org connection
try:
    result = subprocess.run(['sf', 'org', 'list'], capture_output=True, text=True, timeout=20)
    if result.returncode == 0:
        print("✅ SF CLI org list works")
        if ORG_ALIAS in result.stdout:
            print(f"✅ {ORG_ALIAS} org found")
        else:
            print(f"⚠️  {ORG_ALIAS} not found in org list")
            print("Available orgs:")
            print(result.stdout)
    else:
        print("❌ Could not list orgs")
        print(result.stderr)
except Exception as e:
    print(f"❌ Error listing orgs: {e}")

# Test 3: Direct org connection test
try:
    result = subprocess.run(['sf', 'org', 'display', '--target-org', ORG_ALIAS], 
                          capture_output=True, text=True, timeout=30)
    if result.returncode == 0:
        print(f"✅ Successfully connected to {ORG_ALIAS}")
        lines = result.stdout.split('\n')[:3]
        for line in lines:
            if line.strip():
                print(f"   {line}")
    else:
        print(f"❌ Cannot connect to {ORG_ALIAS}")
        print(f"Error: {result.stderr}")
except Exception as e:
    print(f"❌ Error connecting to org: {e}")

print("\nTest completed.")
