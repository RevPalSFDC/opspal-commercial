#!/usr/bin/env python3
"""
Direct RevOps Assessment Runner for gamma-corp instance
"""

import sys
import os
import json

# Add the agents directory to the Python path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'agents', 'sfdc-revops-auditor'))

# Import the auditor
from main import SalesforceRevOpsAuditor

def main():
    org_alias = "gamma-corp"
    
    print(f"🚀 Starting comprehensive RevOps assessment for {org_alias}...")
    print("")
    
    try:
        # Create auditor instance
        auditor = SalesforceRevOpsAuditor(org_alias)
        
        # Run assessment
        report = auditor.run_comprehensive_assessment()
        
        # Save to file
        output_file = f"gamma-corp-revops-assessment.json"
        with open(output_file, 'w') as f:
            json.dump(report, f, indent=2, default=str)
        
        print(f"✅ Assessment completed successfully!")
        print(f"📄 Report saved to: {output_file}")
        
        # Also print the report to stdout for immediate viewing
        print("\n" + "="*80)
        print("EXECUTIVE SUMMARY")
        print("="*80)
        print(json.dumps(report, indent=2, default=str))
        
    except Exception as e:
        print(f"❌ Assessment failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()