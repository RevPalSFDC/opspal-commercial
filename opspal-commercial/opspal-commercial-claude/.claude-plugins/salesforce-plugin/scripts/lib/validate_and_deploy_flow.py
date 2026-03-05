#!/usr/bin/env python3
"""
Enhanced Flow Validation and Deployment Script
Prevents creating duplicate flows by ensuring proper API name matching
"""

import xml.etree.ElementTree as ET
import argparse
import os
import re
import subprocess
import shutil
import sys
import json
import tempfile
from pathlib import Path




from instance_resolver import resolve_project_root, resolve_instance_root, require_sf_project, resolve_org_alias, require_org_alias

PROJECT_ROOT = resolve_project_root()
INSTANCE_ROOT = resolve_instance_root(PROJECT_ROOT)
require_sf_project(INSTANCE_ROOT)
ORG_ALIAS = require_org_alias(resolve_org_alias(PROJECT_ROOT, INSTANCE_ROOT))

def parse_args():
    parser = argparse.ArgumentParser(
        description="Validate and deploy a Flow with API name checks."
    )
    parser.add_argument(
        "--target-org",
        dest="target_org",
        help="Override the resolved org alias for the deployment.",
    )
    parser.add_argument(
        "--activate",
        action="store_true",
        help="Activate the latest Flow version after deployment.",
    )
    parser.add_argument(
        "--notification-email",
        dest="notification_email",
        help="Override the notification email displayed after deployment.",
    )
    parser.add_argument(
        "org_alias",
        nargs="?",
        help="(Deprecated) Positional org alias. Use --target-org instead.",
    )
    args = parser.parse_args()

    target_org = args.target_org or args.org_alias or ORG_ALIAS
    if args.org_alias and not args.target_org:
        print("⚠️ Positional org alias is deprecated; use --target-org instead.")

    return target_org, args.activate, args.notification_email

def escape_soql_string(value):
    return value.replace("\\", "\\\\").replace("'", "\\'")

def normalize_alias_env_suffix(alias):
    if not alias:
        return None
    return re.sub(r"[^A-Za-z0-9]", "_", alias).upper()

def load_env_file(env_path):
    """Parse a simple KEY=VALUE .env-style file."""
    values = {}
    try:
        for line in env_path.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            values[key] = value
    except Exception:
        return {}
    return values

def load_instance_config(project_root, instance_root, target_org):
    sfdc_roots = [
        project_root / "opspal-internal" / "SFDC",
        project_root / "SFDC",
    ]
    for sfdc_root in sfdc_roots:
        config_path = sfdc_root / "instances" / "config.json"
        if not config_path.exists():
            continue
        try:
            with open(config_path, "r", encoding="utf-8") as handle:
                config_data = json.load(handle)
        except Exception:
            continue
        instances = config_data.get("instances", {})
        inst = instances.get(target_org)
        if not inst and instance_root:
            for _, candidate in instances.items():
                directory = candidate.get("directory")
                if not directory:
                    continue
                candidate_path = Path(directory).expanduser().resolve()
                if candidate_path == instance_root:
                    inst = candidate
                    break
        if inst:
            return inst
    return None

def resolve_notification_email(instance_root, target_org, override_email=None):
    env_keys = ["FLOW_NOTIFICATION_EMAIL", "NOTIFICATION_EMAIL", "ADMIN_EMAIL"]

    if override_email:
        return override_email, "--notification-email"

    instance_env_path = instance_root / ".instance-env"
    if instance_env_path.exists():
        env_values = load_env_file(instance_env_path)
        for key in env_keys:
            value = env_values.get(key)
            if value:
                return value, str(instance_env_path)

    suffix = normalize_alias_env_suffix(target_org)
    if suffix:
        for key in env_keys:
            value = os.environ.get(f"{key}_{suffix}")
            if value:
                return value, f"env:{key}_{suffix}"

    inst_config = load_instance_config(PROJECT_ROOT, instance_root, target_org)
    if inst_config:
        for key in ["notificationEmail", "adminEmail", "alertEmail"]:
            value = inst_config.get(key)
            if value:
                return value, f"instances/config.json:{key}"

    allow_global = os.environ.get("ALLOW_GLOBAL_NOTIFICATION_EMAIL", "").lower() in ("1", "true", "yes", "y")
    if allow_global:
        for key in env_keys:
            value = os.environ.get(key)
            if value:
                return value, f"env:{key}"
    else:
        for key in env_keys:
            value = os.environ.get(key)
            if value:
                print(
                    f"⚠️ Global notification email ignored ({key}). "
                    "Set ALLOW_GLOBAL_NOTIFICATION_EMAIL=1 to use it."
                )
                break

    return None, None

def get_flow_developer_name(flow_path):
    filename = Path(flow_path).name
    if filename.endswith(".flow-meta.xml"):
        return filename[:-len(".flow-meta.xml")]
    return filename

def query_flow_by_label(flow_label, org_alias):
    """Return the latest Flow record for the label, with FlowDefinition data if available."""
    safe_label = escape_soql_string(flow_label)
    query = (
        "SELECT Id, MasterLabel, DefinitionId, VersionNumber, Status "
        f"FROM Flow WHERE MasterLabel = '{safe_label}' "
        "ORDER BY VersionNumber DESC LIMIT 1"
    )

    cmd = [
        'sf', 'data', 'query', '--use-tooling-api',
        '--query', query,
        '--target-org', org_alias,
        '--json'
    ]

    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        error_output = result.stderr.strip() or result.stdout.strip()
        if error_output:
            print(f"⚠️ Flow lookup failed: {error_output}")
        return None

    data = json.loads(result.stdout)
    if not data.get('result', {}).get('records'):
        return None

    flow = data['result']['records'][0]
    definition_id = flow.get('DefinitionId')
    if definition_id:
        def_cmd = [
            'sf', 'data', 'query', '--use-tooling-api',
            '--query',
            (
                "SELECT Id, DeveloperName, ActiveVersionId, LatestVersionId "
                f"FROM FlowDefinition WHERE Id = '{definition_id}' LIMIT 1"
            ),
            '--target-org', org_alias,
            '--json'
        ]
        def_result = subprocess.run(def_cmd, capture_output=True, text=True)
        if def_result.returncode == 0:
            def_data = json.loads(def_result.stdout)
            def_records = def_data.get('result', {}).get('records', [])
            if def_records:
                flow['DeveloperName'] = def_records[0].get('DeveloperName')
                flow['ActiveVersionId'] = def_records[0].get('ActiveVersionId')
                flow['LatestVersionId'] = def_records[0].get('LatestVersionId')

    return flow

def discover_existing_flow(flow_label, org_alias):
    """Discover if flow already exists in org and get its DeveloperName"""
    print(f"🔍 Checking for existing flow: '{flow_label}'...")
    
    try:
        # First run flow discovery to ensure mappings are current
        discover_cmd = [
            'node',
            os.path.join(os.path.dirname(__file__), 'flow-discovery-mapper.js'),
            'discover',
            '--org', org_alias
        ]
        subprocess.run(discover_cmd, capture_output=True, text=True)
        
        flow = query_flow_by_label(flow_label, org_alias)
        if flow:
            print(f"✅ Found existing flow:")
            if flow.get('DeveloperName'):
                print(f"   DeveloperName: {flow['DeveloperName']}")
            else:
                print("   DeveloperName: (unavailable)")
            print(f"   Version: {flow['VersionNumber']}")
            print(f"   Status: {flow['Status']}")
            return flow
        
        print("ℹ️ No existing flow found - will create new")
        return None
        
    except Exception as e:
        print(f"⚠️ Could not check for existing flow: {e}")
        return None

def validate_flow_xml(flow_path, expected_developer_name=None):
    """Validate the Flow XML structure and check for API name match"""
    print("🔍 Validating Flow XML structure...")
    
    try:
        # Parse the XML
        tree = ET.parse(flow_path)
        root = tree.getroot()
        
        # Extract MasterLabel from XML
        namespace = "http://soap.sforce.com/2006/04/metadata"
        label_elem = root.find(f'.//{{{namespace}}}label')
        if label_elem is not None:
            master_label = label_elem.text
            print(f"   MasterLabel: {master_label}")
            
            # Check if file name matches expected developer name
            if expected_developer_name:
                file_name = os.path.basename(flow_path)
                expected_file = f"{expected_developer_name}.flow-meta.xml"
                
                if file_name != expected_file:
                    print(f"⚠️ WARNING: File name mismatch!")
                    print(f"   Current file: {file_name}")
                    print(f"   Should be: {expected_file}")
                    print(f"   This may create a NEW flow instead of updating existing!")
                    
                    response = input("\n   Continue anyway? (y/N): ").strip().lower()
                    if response != 'y':
                        print("❌ Deployment cancelled")
                        return False, master_label
            elif expected_developer_name is None:
                print("   DeveloperName unavailable; skipping filename check")
        
        # Check namespace
        expected_namespace = "http://soap.sforce.com/2006/04/metadata"
        if root.tag != f"{{{expected_namespace}}}Flow":
            print(f"❌ Invalid namespace. Expected: {expected_namespace}")
            return False
        
        # Count elements
        elements = {
            'actionCalls': len(root.findall('.//{http://soap.sforce.com/2006/04/metadata}actionCalls')),
            'decisions': len(root.findall('.//{http://soap.sforce.com/2006/04/metadata}decisions')),
            'formulas': len(root.findall('.//{http://soap.sforce.com/2006/04/metadata}formulas')),
            'recordCreates': len(root.findall('.//{http://soap.sforce.com/2006/04/metadata}recordCreates')),
            'recordUpdates': len(root.findall('.//{http://soap.sforce.com/2006/04/metadata}recordUpdates')),
            'start': len(root.findall('.//{http://soap.sforce.com/2006/04/metadata}start'))
        }
        
        print("✅ XML structure is valid")
        print(f"   Elements found: {elements}")
        
        # Validate recordCreates elements
        record_creates = root.findall('.//{http://soap.sforce.com/2006/04/metadata}recordCreates')
        record_create_names = []
        
        for rc in record_creates:
            name_elem = rc.find('.//{http://soap.sforce.com/2006/04/metadata}name')
            if name_elem is not None:
                record_create_names.append(name_elem.text)
        
        print(f"✅ Found {len(record_creates)} recordCreates elements: {record_create_names}")
        
        # Check for duplicates
        if len(record_create_names) != len(set(record_create_names)):
            print("❌ Duplicate recordCreates element names found!")
            return False, master_label if 'master_label' in locals() else None
        
        print("✅ No duplicate element names detected")
        return True, master_label if 'master_label' in locals() else None
        
    except ET.ParseError as e:
        print(f"❌ XML parsing error: {e}")
        return False, None
    except Exception as e:
        print(f"❌ Validation error: {e}")
        return False, None

def check_sf_auth(target_org):
    """Check if SF CLI is available and authenticated"""
    print("🔍 Checking SF CLI authentication...")
    
    try:
        sf_path = shutil.which('sf')
        if not sf_path:
            print("❌ Salesforce CLI (sf) not found")
            return False, 'sf'

        print(f"✅ Found Salesforce CLI: {sf_path}")
        
        # Check org authentication
        result = subprocess.run(['sf', 'org', 'display', '--target-org', target_org, '--json'],
                              capture_output=True, text=True)
        
        if result.returncode == 0:
            print(f"✅ Successfully authenticated to {target_org}")
            return True, 'sf'
        else:
            print(f"❌ Not authenticated to {target_org}")
            print(f"Please run: sf org login web --alias {target_org} --instance-url https://test.salesforce.com")
            return False, 'sf'
            
    except Exception as e:
        print(f"❌ Error checking SF CLI: {e}")
        return False, 'sf'

def deploy_flow(cli_cmd, flow_path, target_org, flow_label=None):
    """Deploy the flow using Salesforce CLI"""
    label = flow_label or "Flow"
    print(f"🚀 Deploying {label}...")
    
    try:
        cmd = [
            'sf', 'project', 'deploy', 'start',
            '--source-dir', str(flow_path),
            '--target-org', target_org,
            '--wait', '10'
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True, cwd=INSTANCE_ROOT)
        
        if result.returncode == 0:
            print("✅ Flow deployed successfully!")
            print(result.stdout)
            return True
        else:
            print("❌ Flow deployment failed!")
            print("STDOUT:", result.stdout)
            print("STDERR:", result.stderr)
            return False
            
    except Exception as e:
        print(f"❌ Deployment error: {e}")
        return False

def verify_deployment(cli_cmd, target_org, flow_label):
    """Verify the flow is active after deployment"""
    print("🔍 Verifying flow deployment...")
    
    try:
        safe_label = escape_soql_string(flow_label)
        cmd = [
            'sf', 'data', 'query', '--use-tooling-api',
            '--query', (
                "SELECT Id, ApiName, Label, ProcessType, IsActive "
                f"FROM FlowDefinitionView WHERE Label = '{safe_label}'"
            ),
            '--target-org', target_org,
            '--json'
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True)
        
        if result.returncode == 0:
            print("✅ Flow verification successful!")
            print(result.stdout)
            return True
        else:
            print("⚠️ FlowDefinitionView query failed, falling back to Flow tooling query...")
            fallback_cmd = [
                'sf', 'data', 'query', '--use-tooling-api',
                '--query', (
                    "SELECT Id, MasterLabel, Status, VersionNumber "
                    f"FROM Flow WHERE MasterLabel = '{safe_label}' "
                    "ORDER BY VersionNumber DESC LIMIT 1"
                ),
                '--target-org', target_org,
                '--json'
            ]
            fallback = subprocess.run(fallback_cmd, capture_output=True, text=True)
            if fallback.returncode == 0:
                print("✅ Flow verification successful via Flow tooling query!")
                print(fallback.stdout)
                return True
            print("❌ Flow verification failed!")
            print(fallback.stderr or result.stderr)
            return False
            
    except Exception as e:
        print(f"❌ Verification error: {e}")
        return False

def activate_flow(flow_path, target_org, flow_label=None):
    """Activate the flow by deploying a temporary Active version."""
    display_name = flow_label or get_flow_developer_name(flow_path)
    print(f"🔄 Activating flow: {display_name}")

    temp_root = INSTANCE_ROOT / ".temp"
    temp_root.mkdir(parents=True, exist_ok=True)
    temp_dir = Path(tempfile.mkdtemp(prefix="flow-activation-", dir=str(temp_root)))
    temp_flow_path = temp_dir / Path(flow_path).name

    try:
        shutil.copy2(flow_path, temp_flow_path)
        content = temp_flow_path.read_text()

        if "<status>" not in content:
            print("❌ Flow activation failed: <status> tag not found in metadata.")
            return False

        updated = re.sub(r"<status>.*?</status>", "<status>Active</status>", content, flags=re.DOTALL)
        temp_flow_path.write_text(updated)

        cmd = [
            'sf', 'project', 'deploy', 'start',
            '--source-dir', str(temp_flow_path),
            '--target-org', target_org,
            '--wait', '10'
        ]

        result = subprocess.run(cmd, capture_output=True, text=True, cwd=INSTANCE_ROOT)
        if result.returncode != 0:
            print("❌ Flow activation failed!")
            print(result.stderr or result.stdout)
            return False

        print("✅ Flow activated successfully!")
        return True
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)

def main():
    print("🚀 Enhanced Flow Deployment with API Name Validation")
    print("====================================================")
    
    # Get org alias from command line args or instance resolution
    target_org, activate_on_deploy, notification_override = parse_args()
    print(f"Target org: {target_org}\n")
    
    # Paths
    flow_path = INSTANCE_ROOT / "force-app/main/default/flows/Contract_Creation_Flow.flow-meta.xml"
    
    # Check if flow file exists
    if not os.path.exists(flow_path):
        print(f"❌ Flow file not found: {flow_path}")
        sys.exit(1)
    
    # Step 1: Validate XML and get MasterLabel
    valid, master_label = validate_flow_xml(flow_path)
    if not valid:
        print("❌ XML validation failed. Please fix the flow structure.")
        sys.exit(1)
    if not master_label:
        print("❌ Flow label not found in XML. Please set a label in the flow metadata.")
        sys.exit(1)
    
    # Step 2: Check for existing flow with same MasterLabel
    existing_flow = None
    if master_label:
        print(f"\n📋 Flow MasterLabel: '{master_label}'")
        existing_flow = discover_existing_flow(master_label, target_org)
        
        # If existing flow found, validate file name matches DeveloperName
        if existing_flow:
            valid, _ = validate_flow_xml(flow_path, existing_flow['DeveloperName'])
            if not valid:
                print("\n⚠️ To fix this issue:")
                print(f"   1. Rename your file to: {existing_flow['DeveloperName']}.flow-meta.xml")
                print(f"   2. Or retrieve the existing flow: sf project retrieve start --metadata 'Flow:{existing_flow['DeveloperName']}'")
                sys.exit(1)
        else:
            print("\n⚠️ This will CREATE a new flow (no existing flow with this label)")
            response = input("   Continue with creation? (y/N): ").strip().lower()
            if response != 'y':
                print("❌ Deployment cancelled")
                sys.exit(1)
    
    # Step 3: Check SF CLI auth
    is_authenticated, cli_cmd = check_sf_auth(target_org)
    if not is_authenticated:
        print("❌ Not authenticated to Salesforce org.")
        sys.exit(1)
    
    # Step 4: Deploy flow
    if not deploy_flow(cli_cmd, flow_path, target_org, master_label):
        print("❌ Flow deployment failed.")
        sys.exit(1)
    
    # Step 5: Verify deployment
    if not verify_deployment(cli_cmd, target_org, master_label):
        print("⚠️  Flow deployed but verification failed.")
    
    latest_flow = None
    if master_label:
        latest_flow = query_flow_by_label(master_label, target_org)

    if activate_on_deploy:
        print("")
        if latest_flow and latest_flow.get('Status') == 'Active':
            print("✅ Flow already active; skipping activation.")
        else:
            if not activate_flow(flow_path, target_org, master_label):
                print("❌ Activation failed.")
                sys.exit(1)
            latest_flow = query_flow_by_label(master_label, target_org) or latest_flow

    print("")
    if existing_flow:
        flow_name = (
            (latest_flow or {}).get('DeveloperName')
            or existing_flow.get('DeveloperName')
            or existing_flow.get('MasterLabel')
            or master_label
            or "Flow"
        )
        previous_version = existing_flow.get('VersionNumber')
        current_version = (latest_flow or {}).get('VersionNumber')
        if previous_version is not None and current_version is not None:
            if current_version == previous_version:
                print(f"✅ Successfully UPDATED flow: {flow_name} (version {previous_version} unchanged)")
            else:
                print(f"✅ Successfully UPDATED flow: {flow_name} (version {previous_version} → {current_version})")
        else:
            print(f"✅ Successfully UPDATED flow: {flow_name}")
    elif latest_flow:
        flow_name = latest_flow.get('DeveloperName') or latest_flow.get('MasterLabel') or master_label or "Flow"
        version = latest_flow.get('VersionNumber')
        if version is not None:
            print(f"✅ Successfully CREATED new flow: {flow_name} (version {version})")
        else:
            print(f"✅ Successfully CREATED new flow: {flow_name}")
    else:
        flow_name = master_label or "Flow"
        print(f"✅ Deployment completed for {flow_name}!")
    print("")
    print("🧪 Test the flow by:")
    print("1. Creating an Opportunity with Amount > 0")
    print("2. Setting StageName to 'Closed Won'") 
    print("3. Verifying Contract creation with proper Contracting_Entity__c")
    print("4. Verifying Renewal Opportunity generation")
    print("")
    notification_email, notification_source = resolve_notification_email(
        INSTANCE_ROOT,
        target_org,
        override_email=notification_override,
    )
    if notification_email:
        if notification_source and notification_source.startswith("env:"):
            print(f"📧 Monitor {notification_email} for error notifications ({notification_source})")
        else:
            print(f"📧 Monitor {notification_email} for error notifications")
    else:
        print("📧 Monitor your org's error notification recipients for errors")

if __name__ == "__main__":
    main()
