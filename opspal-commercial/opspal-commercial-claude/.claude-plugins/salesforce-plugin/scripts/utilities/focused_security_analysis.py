#!/usr/bin/env python3
"""
Focused Security Analysis for Account and Contact objects in the target org
Step-by-step analysis with detailed security findings
"""

import subprocess
import json
import os
from datetime import datetime


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

# Security findings storage
security_findings = {
    'high_risk': [],
    'medium_risk': [],
    'low_risk': [],
    'info': []
}

def run_cmd(command, timeout=60):
    """Run a command and return result"""
    try:
        if isinstance(command, str):
            result = subprocess.run(command, shell=True, capture_output=True, text=True, timeout=timeout)
        else:
            result = subprocess.run(command, capture_output=True, text=True, timeout=timeout)
        return result
    except Exception as e:
        print(f"❌ Command failed: {e}")
        return None

def log_finding(level, category, description, details=""):
    """Log a security finding"""
    finding = {
        'category': category,
        'description': description,
        'details': details,
        'timestamp': datetime.now().isoformat()
    }
    security_findings[level].append(finding)
    
    # Also print immediately
    icon = {'high_risk': '🚨', 'medium_risk': '⚠️', 'low_risk': '💡', 'info': 'ℹ️'}[level]
    print(f"   {icon} {level.upper()}: {description}")
    if details:
        print(f"      Details: {details}")

def step1_test_connection():
    """Step 1: Test org connection"""
    print(f"🔍 STEP 1: Testing {ORG_ALIAS} connection")
    print("-" * 50)
    
    result = run_cmd(['sf', 'org', 'display', '--target-org', ORG_ALIAS, '--json'])
    
    if result and result.returncode == 0:
        try:
            org_info = json.loads(result.stdout)
            username = org_info['result']['username']
            instance_url = org_info['result']['instanceUrl']
            
            print(f"✅ Connected to {ORG_ALIAS}")
            print(f"   Username: {username}")
            print(f"   Instance: {instance_url}")
            
            log_finding('info', 'Connection', f'Successfully connected to org: {username}', instance_url)
            return True
        except json.JSONDecodeError:
            print("❌ Failed to parse org info")
            return False
    else:
        print(f"❌ Cannot connect to {ORG_ALIAS}")
        if result:
            print(f"   Error: {result.stderr}")
        return False

def step2_check_profiles():
    """Step 2: Check for guest and community profiles"""
    print("\n🔍 STEP 2: Analyzing Guest and Community Profiles")
    print("-" * 50)
    
    risky_profiles = [
        "Guest License User",
        "Customer Community User",
        "Customer Community Plus User", 
        "Partner Community User",
        "High Volume Customer Portal User",
        "Customer Portal Manager"
    ]
    
    found_profiles = []
    
    for profile_name in risky_profiles:
        query = f"SELECT Id, Name, UserType FROM Profile WHERE Name = '{profile_name}'"
        result = run_cmd(['sf', 'data', 'query', '--query', query, '--target-org', ORG_ALIAS, '--json'])
        
        if result and result.returncode == 0:
            try:
                data = json.loads(result.stdout)
                if data['result']['totalSize'] > 0:
                    profile = data['result']['records'][0]
                    found_profiles.append(profile)
                    
                    print(f"   Found: {profile_name}")
                    log_finding('medium_risk', 'Profile Exposure', 
                              f'Community/Guest profile exists: {profile_name}',
                              f"Profile ID: {profile['Id']}, UserType: {profile.get('UserType', 'Standard')}")
                else:
                    print(f"   Not found: {profile_name}")
            except json.JSONDecodeError:
                print(f"   Error parsing results for {profile_name}")
    
    if not found_profiles:
        log_finding('info', 'Profile Security', 'No community or guest user profiles found')
    
    return found_profiles

def step3_check_owd():
    """Step 3: Check Organization-Wide Defaults"""
    print("\n🔍 STEP 3: Checking Organization-Wide Defaults")
    print("-" * 50)
    
    query = "SELECT DefaultAccountAccess, DefaultContactAccess FROM OrganizationDefaultsMap"
    result = run_cmd(['sf', 'data', 'query', '--query', query, '--target-org', ORG_ALIAS, '--json'])
    
    if result and result.returncode == 0:
        try:
            data = json.loads(result.stdout)
            if data['result']['totalSize'] > 0:
                owd = data['result']['records'][0]
                account_access = owd.get('DefaultAccountAccess', 'Not found')
                contact_access = owd.get('DefaultContactAccess', 'Not found')
                
                print(f"   Account OWD: {account_access}")
                print(f"   Contact OWD: {contact_access}")
                
                # Assess risk levels
                if account_access == 'Public':
                    log_finding('high_risk', 'Data Exposure', 'Account OWD set to Public', 
                              'All users can read all Account records')
                elif account_access in ['Read', 'Edit']:
                    log_finding('medium_risk', 'Data Exposure', f'Account OWD allows {account_access} access',
                              'Account records may be accessible to unintended users')
                else:
                    log_finding('info', 'Data Security', f'Account OWD is restrictive: {account_access}')
                
                if contact_access == 'Public':
                    log_finding('high_risk', 'Data Exposure', 'Contact OWD set to Public',
                              'All users can read all Contact records')
                elif contact_access in ['Read', 'Edit']:
                    log_finding('medium_risk', 'Data Exposure', f'Contact OWD allows {contact_access} access',
                              'Contact records may be accessible to unintended users')
                else:
                    log_finding('info', 'Data Security', f'Contact OWD is restrictive: {contact_access}')
                
                return {'account': account_access, 'contact': contact_access}
            else:
                print("   ❌ No OWD settings found")
                log_finding('medium_risk', 'Configuration', 'Unable to retrieve Organization-Wide Defaults')
        except json.JSONDecodeError:
            print("   ❌ Error parsing OWD results")
            log_finding('medium_risk', 'Configuration', 'Error retrieving Organization-Wide Defaults')
    
    return None

def step4_check_dvm_fields():
    """Step 4: Check DVM custom field security"""
    print("\n🔍 STEP 4: Analyzing DVM Custom Fields Security")
    print("-" * 50)
    
    dvm_fields = [
        ('Contact', 'Is_DVM__c'),
        ('Account', 'Count_of_DVMs__c')
    ]
    
    field_analysis = {}
    
    for obj, field in dvm_fields:
        print(f"\n   Analyzing {obj}.{field}...")
        
        # Check if field exists
        field_query = f"""SELECT QualifiedApiName, Label, DataType, IsCustom 
                         FROM FieldDefinition 
                         WHERE EntityDefinition.QualifiedApiName = '{obj}' 
                         AND QualifiedApiName = '{field}'"""
        
        result = run_cmd(['sf', 'data', 'query', '--query', field_query, '--target-org', ORG_ALIAS, '--json'])
        
        if result and result.returncode == 0:
            try:
                data = json.loads(result.stdout)
                if data['result']['totalSize'] > 0:
                    field_info = data['result']['records'][0]
                    print(f"     ✅ Field exists: {field_info['Label']} ({field_info['DataType']})")
                    
                    # Check field permissions for public access
                    perm_query = f"""SELECT PermissionSet.Name, PermissionSet.Profile.Name, 
                                           PermissionsRead, PermissionsEdit, Field
                                    FROM FieldPermissions 
                                    WHERE SobjectType = '{obj}' AND Field = '{obj}.{field}' 
                                    AND (PermissionSet.Profile.Name LIKE '%Guest%' 
                                         OR PermissionSet.Profile.Name LIKE '%Community%'
                                         OR PermissionSet.Profile.Name LIKE '%Portal%')"""
                    
                    perm_result = run_cmd(['sf', 'data', 'query', '--query', perm_query, '--target-org', ORG_ALIAS, '--json'])
                    
                    if perm_result and perm_result.returncode == 0:
                        try:
                            perm_data = json.loads(perm_result.stdout)
                            permissions = perm_data['result']['records']
                            
                            if permissions:
                                print(f"     🚨 EXPOSED TO PUBLIC/COMMUNITY USERS:")
                                log_finding('high_risk', 'Field Exposure', 
                                          f'{field} field accessible to public/community users',
                                          f'Field contains business-sensitive DVM classification data')
                                
                                for perm in permissions:
                                    profile_name = perm.get('PermissionSet', {}).get('Profile', {}).get('Name', 'Unknown')
                                    read_perm = perm.get('PermissionsRead', False)
                                    edit_perm = perm.get('PermissionsEdit', False)
                                    
                                    print(f"       Profile: {profile_name} | Read: {read_perm} | Edit: {edit_perm}")
                                    
                                    if edit_perm:
                                        log_finding('high_risk', 'Data Integrity', 
                                                  f'{field} editable by {profile_name}',
                                                  'External users can modify DVM classification data')
                            else:
                                print(f"     ✅ Not exposed to public/community profiles")
                                log_finding('info', 'Field Security', f'{field} properly secured from public access')
                            
                            field_analysis[field] = {
                                'exists': True,
                                'object': obj,
                                'exposed_to_public': len(permissions) > 0,
                                'permissions': permissions
                            }
                            
                        except json.JSONDecodeError:
                            print(f"     ❌ Error parsing field permissions")
                    else:
                        print(f"     ❌ Error checking field permissions: {perm_result.stderr if perm_result else 'Unknown error'}")
                else:
                    print(f"     ➖ Field not found")
                    field_analysis[field] = {'exists': False, 'object': obj}
            except json.JSONDecodeError:
                print(f"     ❌ Error parsing field info")
    
    return field_analysis

def step5_check_sites_communities():
    """Step 5: Check Sites and Communities"""
    print("\n🔍 STEP 5: Analyzing Sites and Communities")
    print("-" * 50)
    
    sites_communities = {}
    
    # Check Sites
    print("   Checking Sites...")
    sites_query = "SELECT Id, Name, Subdomain, Status, SiteType FROM Site"
    result = run_cmd(['sf', 'data', 'query', '--query', sites_query, '--target-org', ORG_ALIAS, '--json'])
    
    if result and result.returncode == 0:
        try:
            data = json.loads(result.stdout)
            sites = data['result']['records']
            sites_communities['sites'] = sites
            
            print(f"     Found {len(sites)} sites")
            for site in sites:
                print(f"       - {site.get('Name')} ({site.get('SiteType')}): {site.get('Status')}")
                
                if site.get('Status') == 'Active':
                    log_finding('medium_risk', 'Public Access', 
                              f'Active site found: {site.get("Name")}',
                              f'Site type: {site.get("SiteType")}, may expose data publicly')
        except json.JSONDecodeError:
            print("     ❌ Error parsing sites data")
    
    # Check Networks (Communities)
    print("   Checking Communities...")
    networks_query = "SELECT Id, Name, Status, UrlPathPrefix FROM Network"
    result = run_cmd(['sf', 'data', 'query', '--query', networks_query, '--target-org', ORG_ALIAS, '--json'])
    
    if result and result.returncode == 0:
        try:
            data = json.loads(result.stdout)
            networks = data['result']['records']
            sites_communities['communities'] = networks
            
            print(f"     Found {len(networks)} communities")
            for network in networks:
                print(f"       - {network.get('Name')}: {network.get('Status')}")
                
                if network.get('Status') == 'Live':
                    log_finding('medium_risk', 'Community Access',
                              f'Live community found: {network.get("Name")}',
                              'Community may provide external access to Salesforce data')
        except json.JSONDecodeError:
            print("     ❌ Error parsing communities data")
    
    return sites_communities

def step6_generate_report():
    """Step 6: Generate comprehensive security report"""
    print("\n" + "="*80)
    print("🔒 COMPREHENSIVE SECURITY ANALYSIS REPORT")
    print("="*80)
    print(f"Analysis Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"Target Org: {ORG_ALIAS}")
    print("="*80)
    
    # Summary
    total_high = len(security_findings['high_risk'])
    total_medium = len(security_findings['medium_risk'])
    total_low = len(security_findings['low_risk'])
    total_info = len(security_findings['info'])
    
    print(f"\n📊 EXECUTIVE SUMMARY")
    print("-" * 40)
    print(f"High Risk Issues: {total_high}")
    print(f"Medium Risk Issues: {total_medium}")
    print(f"Low Risk Issues: {total_low}")
    print(f"Informational: {total_info}")
    print(f"Total Issues: {total_high + total_medium + total_low}")
    
    # Risk assessment
    if total_high > 0:
        print(f"\n🚨 CRITICAL: {total_high} high-risk security issues require immediate attention!")
    elif total_medium > 0:
        print(f"\n⚠️  WARNING: {total_medium} medium-risk issues should be reviewed.")
    else:
        print(f"\n✅ GOOD: No high-risk security issues identified.")
    
    # Detailed findings
    for level in ['high_risk', 'medium_risk', 'low_risk']:
        findings = security_findings[level]
        if findings:
            level_name = level.replace('_', ' ').title()
            icon = {'High Risk': '🚨', 'Medium Risk': '⚠️', 'Low Risk': '💡'}[level_name]
            
            print(f"\n{icon} {level_name.upper()} FINDINGS ({len(findings)})")
            print("-" * 50)
            
            for i, finding in enumerate(findings, 1):
                print(f"{i}. {finding['category']}: {finding['description']}")
                if finding['details']:
                    print(f"   Details: {finding['details']}")
    
    # Recommendations
    print(f"\n🛡️  SECURITY RECOMMENDATIONS")
    print("-" * 50)
    
    recommendations = []
    
    if total_high > 0:
        recommendations.extend([
            "IMMEDIATE: Review and restrict field-level security for exposed DVM fields",
            "IMMEDIATE: Audit community/guest user access to sensitive data",
        ])
    
    if total_medium > 0:
        recommendations.extend([
            "Review organization-wide defaults and sharing rules",
            "Audit active sites and communities for data exposure",
            "Implement field-level security for all custom fields",
        ])
    
    recommendations.extend([
        "Establish regular security audits and monitoring",
        "Document all intentional public data exposures",
        "Implement data classification policies",
        "Consider using separate objects for community-exposed data",
        "Monitor guest user and community user activity"
    ])
    
    for i, rec in enumerate(recommendations, 1):
        print(f"{i}. {rec}")
    
    print("\n" + "="*80)
    print("END OF SECURITY ANALYSIS REPORT")
    print("="*80)

def main():
    """Main execution function"""
    print("🔒 FOCUSED SALESFORCE SECURITY ANALYSIS")
    print("Analyzing Account and Contact public accessibility")
    print(f"Target: {ORG_ALIAS}")
    print("="*80)
    
    # Change to correct directory
    os.chdir(INSTANCE_ROOT)
    
    # Execute analysis steps
    try:
        if not step1_test_connection():
            print("❌ Cannot proceed without org connection")
            return
        
        step2_check_profiles()
        step3_check_owd()
        step4_check_dvm_fields()
        step5_check_sites_communities()
        step6_generate_report()
        
        print("\n✅ Security analysis completed successfully!")
        
    except KeyboardInterrupt:
        print("\n⚠️  Analysis interrupted by user")
    except Exception as e:
        print(f"\n❌ Error during analysis: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()
