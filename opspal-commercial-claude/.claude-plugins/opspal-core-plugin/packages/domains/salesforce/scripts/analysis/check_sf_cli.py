#!/usr/bin/env python3
import argparse
import json
import subprocess
import sys
from pathlib import Path

LIB_DIR = Path(__file__).resolve().parent / "lib"
if not LIB_DIR.exists():
    LIB_DIR = Path(__file__).resolve().parent.parent / "lib"
sys.path.insert(0, str(LIB_DIR))

from instance_resolver import resolve_project_root, resolve_instance_root, resolve_org_alias


def parse_args():
    parser = argparse.ArgumentParser(
        description="Check Salesforce CLI installation and org authentication."
    )
    parser.add_argument(
        "--org",
        "--alias",
        "--target-org",
        dest="org_alias",
        help="Salesforce org alias to validate",
    )
    parser.add_argument(
        "--list-only",
        action="store_true",
        help="List authenticated orgs without validating a target alias",
    )
    return parser.parse_args()


def resolve_alias(explicit_alias):
    if explicit_alias:
        return explicit_alias
    project_root = resolve_project_root()
    instance_root = resolve_instance_root(project_root)
    return resolve_org_alias(project_root, instance_root)


def check_sf_cli():
    try:
        result = subprocess.run(
            ["sf", "--version"],
            capture_output=True,
            text=True,
            timeout=10,
        )
        if result.returncode != 0:
            print("❌ Salesforce CLI command failed.")
            if result.stderr:
                print(result.stderr.strip())
            return False
        print("✅ Salesforce CLI found:")
        print(result.stdout.strip())
        return True
    except FileNotFoundError:
        print("❌ Salesforce CLI not found. Please install it first:")
        print("npm install -g @salesforce/cli")
        return False
    except Exception as exc:
        print(f"❌ Error checking SF CLI: {exc}")
        return False


def list_authenticated_orgs():
    try:
        result = subprocess.run(
            ["sf", "org", "list", "--json"],
            capture_output=True,
            text=True,
            timeout=20,
        )
        if result.returncode != 0:
            print("❌ Could not list authenticated orgs.")
            if result.stderr:
                print(result.stderr.strip())
            return None

        payload = json.loads(result.stdout)
        return payload.get("result", {}).get("nonScratchOrgs", [])
    except Exception as exc:
        print(f"❌ Error checking authentication: {exc}")
        return None


def check_auth(org_alias, orgs):
    print("\n📋 Available authenticated orgs:")
    for org in orgs:
        print(f"  • {org.get('alias', 'N/A')} - {org.get('username', 'N/A')}")

    target_found = any(org.get("alias") == org_alias for org in orgs)
    if target_found:
        print(f"\n✅ Target org '{org_alias}' is authenticated")
        return True

    print(f"\n❌ Target org '{org_alias}' is not authenticated")
    return False


def check_org_display(org_alias):
    try:
        result = subprocess.run(
            ["sf", "org", "display", "--target-org", org_alias, "--json"],
            capture_output=True,
            text=True,
            timeout=20,
        )
        if result.returncode == 0:
            print(f"\n✅ Successfully connected to {org_alias}")
            return True
        print(f"\n❌ Cannot connect to {org_alias}")
        if result.stderr:
            print(result.stderr.strip())
        return False
    except Exception as exc:
        print(f"\n❌ Error connecting to org: {exc}")
        return False


def main():
    args = parse_args()
    print("🔍 Checking Salesforce CLI and authentication...")

    if not check_sf_cli():
        print("\n📦 Please install Salesforce CLI first")
        return 1

    orgs = list_authenticated_orgs()
    if orgs is None:
        return 1

    if args.list_only:
        return 0

    org_alias = resolve_alias(args.org_alias)
    if not org_alias:
        print("\n❌ No org alias resolved.")
        print("   Set SFDC_INSTANCE or SF_TARGET_ORG, or pass --org.")
        return 1

    if not check_auth(org_alias, orgs):
        print("\n🔐 Please authenticate first:")
        print(f"sf org login web --alias {org_alias}")
        return 1

    if not check_org_display(org_alias):
        return 1

    print("\n🚀 Ready to run RevOps assessment!")
    return 0


if __name__ == "__main__":
    sys.exit(main())
