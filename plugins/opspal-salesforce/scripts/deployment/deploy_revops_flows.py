#!/usr/bin/env python3
"""
Deploy RevOps Automation Flows to delta-corp Sandbox
This script deploys the Contract Creation Flow and Renewal Opportunity Generation Flow
"""
import subprocess
import os
import sys
import json
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

class FlowDeployer:
    def __init__(self):
        self.base_dir = INSTANCE_ROOT
        self.target_org = ORG_ALIAS
        
    def check_cli_available(self):
        """Check if Salesforce CLI is available"""
        try:
            result = subprocess.run(['sf', '--version'], 
                                  capture_output=True, 
                                  text=True, 
                                  timeout=10)
            if result.returncode == 0:
                print(f"✅ Salesforce CLI available: {result.stdout.strip()}")
                return True
            else:
                print("❌ Salesforce CLI not available")
                return False
        except Exception as e:
            print(f"❌ Error checking Salesforce CLI: {e}")
            return False
    
    def check_auth(self):
        """Check if authenticated to the target org"""
        try:
            result = subprocess.run(['sf', 'org', 'display', '--target-org', self.target_org],
                                  capture_output=True, 
                                  text=True, 
                                  timeout=15)
            if result.returncode == 0:
                print(f"✅ Authenticated to {self.target_org}")
                return True
            else:
                print(f"❌ Not authenticated to {self.target_org}")
                print(f"Run: sf auth web login --alias {ORG_ALIAS}")
                return False
        except Exception as e:
            print(f"❌ Error checking authentication: {e}")
            return False
    
    def deploy_flow(self, flow_name, flow_file):
        """Deploy a single flow"""
        try:
            print(f"\n📦 Deploying {flow_name}...")
            
            # Use project deploy start with source-dir
            result = subprocess.run([
                'sf', 'project', 'deploy', 'start',
                '--source-dir', str(flow_file),
                '--target-org', self.target_org,
                '--wait', '10',
                '--json'
            ], capture_output=True, text=True, timeout=120)
            
            if result.returncode == 0:
                response = json.loads(result.stdout)
                if response.get('result', {}).get('status') == 'Succeeded':
                    print(f"✅ {flow_name} deployed successfully")
                    return True
                else:
                    print(f"❌ {flow_name} deployment failed: {response}")
                    return False
            else:
                print(f"❌ {flow_name} deployment error: {result.stderr}")
                return False
                
        except Exception as e:
            print(f"❌ Error deploying {flow_name}: {e}")
            return False
    
    def verify_flows(self):
        """Verify that flows were deployed successfully"""
        try:
            print("\n🔍 Verifying flow deployment...")
            
            query = """
            SELECT Id, DeveloperName, MasterLabel, Status, ProcessType 
            FROM FlowDefinition 
            WHERE DeveloperName IN ('Contract_Creation_Flow', 'Renewal_Opportunity_Generation_Flow')
            """
            
            result = subprocess.run([
                'sf', 'data', 'query',
                '--query', query,
                '--target-org', self.target_org,
                '--json'
            ], capture_output=True, text=True, timeout=30)
            
            if result.returncode == 0:
                response = json.loads(result.stdout)
                flows = response.get('result', {}).get('records', [])
                
                print(f"\n📊 Found {len(flows)} deployed flows:")
                for flow in flows:
                    print(f"  • {flow['MasterLabel']} ({flow['DeveloperName']}) - Status: {flow['Status']}")
                
                return len(flows) >= 2
            else:
                print(f"❌ Error verifying flows: {result.stderr}")
                return False
                
        except Exception as e:
            print(f"❌ Error verifying flows: {e}")
            return False
    
    def run_deployment(self):
        """Run the complete deployment process"""
        print("🚀 RevOps Automation Flows Deployment")
        print("=" * 50)
        
        # Step 1: Check CLI availability
        if not self.check_cli_available():
            return False
        
        # Step 2: Check authentication
        if not self.check_auth():
            return False
        
        # Step 3: Deploy flows
        flows_to_deploy = [
            ("Contract Creation Flow", self.base_dir / "force-app/main/default/flows/Contract_Creation_Flow.flow-meta.xml"),
            ("Renewal Opportunity Generation Flow", self.base_dir / "force-app/main/default/flows/Renewal_Opportunity_Generation_Flow.flow-meta.xml")
        ]
        
        success_count = 0
        for flow_name, flow_file in flows_to_deploy:
            if flow_file.exists():
                if self.deploy_flow(flow_name, flow_file):
                    success_count += 1
                else:
                    print(f"❌ Failed to deploy {flow_name}")
            else:
                print(f"❌ Flow file not found: {flow_file}")
        
        # Step 4: Verify deployment
        if success_count == len(flows_to_deploy):
            if self.verify_flows():
                print("\n🎉 All RevOps automation flows deployed successfully!")
                print("\nNext Steps:")
                print("1. Test Contract Creation Flow by updating an Opportunity to 'Closed Won'")
                print("2. Verify Renewal Flow is scheduled in Setup > Process Automation > Flows")
                print("3. Monitor flow execution through the Flow monitoring dashboard")
                return True
            else:
                print("\n⚠️ Flows deployed but verification failed")
                return False
        else:
            print(f"\n❌ Deployment failed. {success_count}/{len(flows_to_deploy)} flows deployed")
            return False

def main():
    deployer = FlowDeployer()
    success = deployer.run_deployment()
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()