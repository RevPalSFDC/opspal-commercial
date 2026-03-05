#!/usr/bin/env python3
"""
Comprehensive Security Analysis for Account and Contact objects in the target org
Analyzes public accessibility and exposure risks for Commerce Cloud environment
"""

import subprocess
import json
import sys
import os
from datetime import datetime


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

def run_command(cmd, timeout=60):
    """Execute command and return result"""
    try:
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=timeout)
        return {
            'success': result.returncode == 0,
            'stdout': result.stdout,
            'stderr': result.stderr,
            'return_code': result.returncode
        }
    except subprocess.TimeoutExpired:
        return {
            'success': False,
            'stdout': '',
            'stderr': 'Command timed out',
            'return_code': -1
        }
    except Exception as e:
        return {
            'success': False,
            'stdout': '',
            'stderr': str(e),
            'return_code': -1
        }

def test_org_connection():
    """Test connection to the target org"""
    print(f"🔍 Testing connection to {ORG_ALIAS}...")
    
    result = run_command(f"sf org display --target-org {ORG_ALIAS} --json")
    if result['success']:
        org_info = json.loads(result['stdout'])
        print(f"✅ Connected to {ORG_ALIAS}")
        print(f"   Org ID: {org_info['result']['id']}")
        print(f"   Username: {org_info['result']['username']}")
        print(f"   Instance URL: {org_info['result']['instanceUrl']}")
        return True
    else:
        print(f"❌ Cannot connect to {ORG_ALIAS}")
        print(f"Error: {result['stderr']}")
        return False

def analyze_profiles():
    """Analyze profiles for guest user and community access"""
    print("\n🔍 Analyzing User Profiles...")
    
    profiles_to_check = [
        "Guest License User",
        "Customer Community User", 
        "Customer Community Plus User",
        "Partner Community User",
        "High Volume Customer Portal User",
        "Customer Portal Manager"
    ]
    
    profile_analysis = {}
    
    for profile_name in profiles_to_check:
        print(f"\n   Checking profile: {profile_name}")
        
        # Query for profile
        query = f"SELECT Id, Name, UserType FROM Profile WHERE Name = '{profile_name}'"
        result = run_command(f'sf data query --query "{query}" --target-org {ORG_ALIAS} --json')
        
        if result['success']:
            data = json.loads(result['stdout'])
            if data['result']['totalSize'] > 0:
                profile = data['result']['records'][0]
                profile_analysis[profile_name] = {
                    'exists': True,
                    'id': profile['Id'],
                    'user_type': profile.get('UserType', 'Standard')
                }
                print(f"   ✅ Found: {profile['Id']} (UserType: {profile.get('UserType', 'Standard')})")
            else:
                profile_analysis[profile_name] = {'exists': False}
                print(f"   ➖ Not found")
        else:
            print(f"   ❌ Error querying profile: {result['stderr']}")
    
    return profile_analysis

def analyze_object_permissions():
    """Analyze object-level permissions for Account and Contact"""
    print("\n🔍 Analyzing Object Permissions...")
    
    objects_to_check = ['Account', 'Contact']
    permission_analysis = {}
    
    for obj in objects_to_check:
        print(f"\n   Analyzing {obj} object permissions...")
        
        # Query PermissionSet with object permissions
        query = f"""
        SELECT PermissionSet.Name, PermissionSet.Type, PermissionSet.Profile.Name,
               PermissionsCreate, PermissionsRead, PermissionsEdit, PermissionsDelete,
               PermissionsViewAllRecords, PermissionsModifyAllRecords
        FROM ObjectPermissions 
        WHERE SobjectType = '{obj}'
        AND (PermissionSet.Profile.Name LIKE '%Guest%' 
             OR PermissionSet.Profile.Name LIKE '%Community%'
             OR PermissionSet.Profile.Name LIKE '%Portal%')
        """
        
        result = run_command(f'sf data query --query "{query}" --target-org {ORG_ALIAS} --json')
        
        if result['success']:
            data = json.loads(result['stdout'])
            permission_analysis[obj] = data['result']['records']
            print(f"   Found {len(data['result']['records'])} permission sets with {obj} access")
            
            for perm in data['result']['records']:
                pset_name = perm.get('PermissionSet', {}).get('Name', 'Unknown')
                profile_name = perm.get('PermissionSet', {}).get('Profile', {}).get('Name', 'N/A')
                print(f"     - {pset_name} (Profile: {profile_name})")
                print(f"       Read: {perm.get('PermissionsRead')}, Create: {perm.get('PermissionsCreate')}")
                print(f"       Edit: {perm.get('PermissionsEdit')}, Delete: {perm.get('PermissionsDelete')}")
        else:
            print(f"   ❌ Error querying object permissions: {result['stderr']}")
    
    return permission_analysis

def analyze_field_permissions():
    """Analyze field-level security for Account and Contact"""
    print("\n🔍 Analyzing Field-Level Security...")
    
    objects_to_check = ['Account', 'Contact']
    field_analysis = {}
    
    for obj in objects_to_check:
        print(f"\n   Analyzing {obj} field permissions...")
        
        # First get all fields for the object
        field_query = f"""
        SELECT QualifiedApiName, Label, DataType, IsCustom
        FROM FieldDefinition 
        WHERE EntityDefinition.QualifiedApiName = '{obj}'
        ORDER BY IsCustom DESC, QualifiedApiName
        """
        
        result = run_command(f'sf data query --query "{field_query}" --target-org {ORG_ALIAS} --json')
        
        if result['success']:
            data = json.loads(result['stdout'])
            fields = data['result']['records']
            print(f"   Found {len(fields)} fields on {obj}")
            
            # Check field permissions for community/guest profiles
            field_perms = {}
            
            for field in fields[:20]:  # Limit to first 20 fields to avoid timeout
                field_name = field['QualifiedApiName']
                
                perm_query = f"""
                SELECT PermissionSet.Name, PermissionSet.Profile.Name,
                       PermissionsRead, PermissionsEdit, Field
                FROM FieldPermissions 
                WHERE SobjectType = '{obj}' 
                AND Field = '{obj}.{field_name}'
                AND (PermissionSet.Profile.Name LIKE '%Guest%' 
                     OR PermissionSet.Profile.Name LIKE '%Community%'
                     OR PermissionSet.Profile.Name LIKE '%Portal%')
                """
                
                perm_result = run_command(f'sf data query --query "{perm_query}" --target-org {ORG_ALIAS} --json')
                
                if perm_result['success']:
                    perm_data = json.loads(perm_result['stdout'])
                    if perm_data['result']['totalSize'] > 0:
                        field_perms[field_name] = perm_data['result']['records']
                        
                        # Check for sensitive fields
                        if any(keyword in field_name.lower() for keyword in ['ssn', 'tax', 'dob', 'birth', 'credit', 'bank']):
                            print(f"   🚨 SENSITIVE FIELD EXPOSED: {field_name}")
                            for perm in perm_data['result']['records']:
                                print(f"      Profile: {perm.get('PermissionSet', {}).get('Profile', {}).get('Name')}")
                                print(f"      Read: {perm.get('PermissionsRead')}, Edit: {perm.get('PermissionsEdit')}")
            
            field_analysis[obj] = {
                'total_fields': len(fields),
                'custom_fields': [f for f in fields if f.get('IsCustom')],
                'field_permissions': field_perms
            }
            
        else:
            print(f"   ❌ Error querying fields: {result['stderr']}")
    
    return field_analysis

def analyze_sharing_settings():
    """Analyze organization-wide defaults and sharing rules"""
    print("\n🔍 Analyzing Sharing Settings...")
    
    sharing_analysis = {}
    
    # Check Organization-Wide Defaults
    print("   Checking Organization-Wide Defaults...")
    owd_query = """
    SELECT DurableId, DefaultCaseAccess, DefaultContactAccess, DefaultAccountAccess,
           DefaultOpportunityAccess, DefaultLeadAccess
    FROM OrganizationDefaultsMap
    """
    
    result = run_command(f'sf data query --query "{owd_query}" --target-org {ORG_ALIAS} --json')
    
    if result['success']:
        data = json.loads(result['stdout'])
        if data['result']['totalSize'] > 0:
            owd = data['result']['records'][0]
            sharing_analysis['organization_defaults'] = owd
            print(f"   Account OWD: {owd.get('DefaultAccountAccess')}")
            print(f"   Contact OWD: {owd.get('DefaultContactAccess')}")
        else:
            print("   ❌ No OWD settings found")
    else:
        print(f"   ❌ Error querying OWD: {result['stderr']}")
    
    # Check Sharing Rules
    print("   Checking Sharing Rules...")
    sharing_rules_query = """
    SELECT Id, Name, ShareType, AccessLevel, EntityType, Description
    FROM SharingRules
    WHERE EntityType IN ('Account', 'Contact')
    """
    
    result = run_command(f'sf data query --query "{sharing_rules_query}" --target-org {ORG_ALIAS} --json')
    
    if result['success']:
        data = json.loads(result['stdout'])
        sharing_analysis['sharing_rules'] = data['result']['records']
        print(f"   Found {len(data['result']['records'])} sharing rules")
        
        for rule in data['result']['records']:
            print(f"     - {rule.get('Name')} ({rule.get('EntityType')}): {rule.get('AccessLevel')}")
    else:
        print(f"   ❌ Error querying sharing rules: {result['stderr']}")
    
    return sharing_analysis

def analyze_sites_and_communities():
    """Analyze Sites and Communities configuration"""
    print("\n🔍 Analyzing Sites and Communities...")
    
    sites_analysis = {}
    
    # Check for Sites
    sites_query = "SELECT Id, Name, Subdomain, Status, SiteType FROM Site"
    
    result = run_command(f'sf data query --query "{sites_query}" --target-org {ORG_ALIAS} --json')
    
    if result['success']:
        data = json.loads(result['stdout'])
        sites_analysis['sites'] = data['result']['records']
        print(f"   Found {len(data['result']['records'])} sites")
        
        for site in data['result']['records']:
            print(f"     - {site.get('Name')} ({site.get('SiteType')}): {site.get('Status')}")
    else:
        print(f"   ❌ Error querying sites: {result['stderr']}")
    
    # Check for Networks (Communities)
    networks_query = "SELECT Id, Name, Status, UrlPathPrefix FROM Network"
    
    result = run_command(f'sf data query --query "{networks_query}" --target-org {ORG_ALIAS} --json')
    
    if result['success']:
        data = json.loads(result['stdout'])
        sites_analysis['networks'] = data['result']['records']
        print(f"   Found {len(data['result']['records'])} networks/communities")
        
        for network in data['result']['records']:
            print(f"     - {network.get('Name')}: {network.get('Status')}")
    else:
        print(f"   ❌ Error querying networks: {result['stderr']}")
    
    return sites_analysis

def analyze_dvm_fields():
    """Specifically analyze the DVM-related custom fields"""
    print("\n🔍 Analyzing DVM Custom Fields...")
    
    dvm_fields = ['Is_DVM__c', 'Count_of_DVMs__c']
    dvm_analysis = {}
    
    for field_name in dvm_fields:
        print(f"\n   Analyzing {field_name}...")
        
        # Determine object based on field name
        obj = 'Contact' if field_name == 'Is_DVM__c' else 'Account'
        
        # Check if field exists
        field_query = f"""
        SELECT QualifiedApiName, Label, DataType, IsCustom
        FROM FieldDefinition 
        WHERE EntityDefinition.QualifiedApiName = '{obj}'
        AND QualifiedApiName = '{field_name}'
        """
        
        result = run_command(f'sf data query --query "{field_query}" --target-org {ORG_ALIAS} --json')
        
        if result['success']:
            data = json.loads(result['stdout'])
            if data['result']['totalSize'] > 0:
                field_info = data['result']['records'][0]
                print(f"   ✅ Field exists: {field_info['Label']} ({field_info['DataType']})")
                
                # Check field permissions for public/community access
                perm_query = f"""
                SELECT PermissionSet.Name, PermissionSet.Profile.Name,
                       PermissionsRead, PermissionsEdit, Field
                FROM FieldPermissions 
                WHERE SobjectType = '{obj}' 
                AND Field = '{obj}.{field_name}'
                AND (PermissionSet.Profile.Name LIKE '%Guest%' 
                     OR PermissionSet.Profile.Name LIKE '%Community%'
                     OR PermissionSet.Profile.Name LIKE '%Portal%'
                     OR PermissionSet.Profile.Name LIKE '%Site%')
                """
                
                perm_result = run_command(f'sf data query --query "{perm_query}" --target-org {ORG_ALIAS} --json')
                
                if perm_result['success']:
                    perm_data = json.loads(perm_result['stdout'])
                    field_permissions = perm_data['result']['records']
                    
                    if field_permissions:
                        print(f"   🚨 EXPOSED TO PUBLIC/COMMUNITY:")
                        for perm in field_permissions:
                            profile = perm.get('PermissionSet', {}).get('Profile', {}).get('Name', 'Unknown')
                            read = perm.get('PermissionsRead', False)
                            edit = perm.get('PermissionsEdit', False)
                            print(f"      Profile: {profile} | Read: {read} | Edit: {edit}")
                    else:
                        print(f"   ✅ Not exposed to public/community profiles")
                    
                    dvm_analysis[field_name] = {
                        'exists': True,
                        'object': obj,
                        'field_info': field_info,
                        'public_permissions': field_permissions
                    }
                else:
                    print(f"   ❌ Error checking permissions: {perm_result['stderr']}")
                    
            else:
                print(f"   ➖ Field not found on {obj}")
                dvm_analysis[field_name] = {'exists': False, 'object': obj}
        else:
            print(f"   ❌ Error querying field: {result['stderr']}")
    
    return dvm_analysis

def generate_security_report(analysis_results):
    """Generate comprehensive security report"""
    print("\n" + "="*80)
    print("🔒 COMPREHENSIVE SECURITY ANALYSIS REPORT")
    print("="*80)
    print(f"Analysis Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"Target Org: {ORG_ALIAS}")
    print("="*80)
    
    # Executive Summary
    print("\n📋 EXECUTIVE SUMMARY")
    print("-" * 40)
    
    total_risks = 0
    high_risks = []
    medium_risks = []
    low_risks = []
    
    # Analyze results for risks
    if 'profiles' in analysis_results:
        community_profiles = [p for p in analysis_results['profiles'] if analysis_results['profiles'][p].get('exists')]
        if community_profiles:
            medium_risks.append(f"Community profiles found: {', '.join(community_profiles)}")
    
    if 'dvm_fields' in analysis_results:
        for field, data in analysis_results['dvm_fields'].items():
            if data.get('exists') and data.get('public_permissions'):
                high_risks.append(f"DVM field {field} exposed to public/community users")
    
    if 'sharing' in analysis_results:
        owd = analysis_results['sharing'].get('organization_defaults', {})
        if owd.get('DefaultAccountAccess') in ['Read', 'Edit']:
            medium_risks.append("Account OWD allows read access")
        if owd.get('DefaultContactAccess') in ['Read', 'Edit']:
            medium_risks.append("Contact OWD allows read access")
    
    total_risks = len(high_risks) + len(medium_risks) + len(low_risks)
    
    print(f"Total Security Issues Found: {total_risks}")
    print(f"High Risk Issues: {len(high_risks)}")
    print(f"Medium Risk Issues: {len(medium_risks)}")
    print(f"Low Risk Issues: {len(low_risks)}")
    
    # Risk Details
    if high_risks:
        print(f"\n🚨 HIGH RISK ISSUES ({len(high_risks)})")
        print("-" * 40)
        for i, risk in enumerate(high_risks, 1):
            print(f"{i}. {risk}")
    
    if medium_risks:
        print(f"\n⚠️  MEDIUM RISK ISSUES ({len(medium_risks)})")
        print("-" * 40)
        for i, risk in enumerate(medium_risks, 1):
            print(f"{i}. {risk}")
    
    if low_risks:
        print(f"\n💡 LOW RISK ISSUES ({len(low_risks)})")
        print("-" * 40)
        for i, risk in enumerate(low_risks, 1):
            print(f"{i}. {risk}")
    
    # Detailed Findings
    print(f"\n📊 DETAILED FINDINGS")
    print("-" * 40)
    
    for section, data in analysis_results.items():
        print(f"\n{section.upper()}:")
        if isinstance(data, dict):
            for key, value in data.items():
                print(f"  {key}: {value}")
        elif isinstance(data, list):
            for item in data:
                print(f"  - {item}")
    
    # Recommendations
    print(f"\n🛡️  SECURITY RECOMMENDATIONS")
    print("-" * 40)
    
    recommendations = [
        "1. Review and restrict field-level security for DVM custom fields",
        "2. Implement data masking for sensitive fields exposed to communities",
        "3. Regular audit of community user permissions and access",
        "4. Consider using separate objects for community-exposed data",
        "5. Implement monitoring for data access by guest/community users",
        "6. Review and tighten organization-wide defaults if overly permissive",
        "7. Document all intentional public data exposures for compliance",
        "8. Implement data classification policies for custom fields"
    ]
    
    for rec in recommendations:
        print(rec)
    
    print("\n" + "="*80)
    print("END OF SECURITY ANALYSIS REPORT")
    print("="*80)

def main():
    """Main execution function"""
    print("🔒 SALESFORCE SECURITY ANALYSIS")
    print("Analyzing Account and Contact public accessibility")
    print(f"Target: {ORG_ALIAS}")
    print("="*60)
    
    # Test connection first
    if not test_org_connection():
        print("\n❌ Cannot proceed without org connection")
        sys.exit(1)
    
    analysis_results = {}
    
    try:
        # Perform all analyses
        analysis_results['profiles'] = analyze_profiles()
        analysis_results['object_permissions'] = analyze_object_permissions()
        analysis_results['field_permissions'] = analyze_field_permissions()
        analysis_results['sharing'] = analyze_sharing_settings()
        analysis_results['sites_communities'] = analyze_sites_and_communities()
        analysis_results['dvm_fields'] = analyze_dvm_fields()
        
        # Generate comprehensive report
        generate_security_report(analysis_results)
        
    except Exception as e:
        print(f"\n❌ Error during analysis: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()
