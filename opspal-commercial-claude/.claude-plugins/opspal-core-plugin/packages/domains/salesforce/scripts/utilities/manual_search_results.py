#!/usr/bin/env python3

"""
Manual execution of Asana API search
This will directly call the Asana API and parse results
"""

import os
import json
import subprocess

def run_curl_command(url, token):
    """Execute curl command and return JSON response"""
    cmd = [
        'curl', '-s',
        '-H', f'Authorization: Bearer {token}',
        '-H', 'Content-Type: application/json',
        url
    ]
    
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        if result.returncode != 0:
            print(f"❌ Curl command failed: {result.stderr}")
            return None
        
        return json.loads(result.stdout)
    except subprocess.TimeoutExpired:
        print("❌ Request timed out")
        return None
    except json.JSONDecodeError as e:
        print(f"❌ JSON decode error: {e}")
        print(f"Raw response: {result.stdout[:500]}...")
        return None
    except Exception as e:
        print(f"❌ Error executing command: {e}")
        return None

def load_env_vars():
    """Load environment variables from .env file"""
    env_vars = {}
    try:
        with open('.env', 'r') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, value = line.split('=', 1)
                    env_vars[key.strip()] = value.strip()
        return env_vars
    except FileNotFoundError:
        print("❌ .env file not found")
        return None

def is_rentable_related(text):
    """Check if text contains Rentable-related terms"""
    if not text:
        return False
        
    text_lower = text.lower()
    search_terms = [
        'rentable', 'rental', 'rent', 'revpal', 'rev pal',
        'property management', 'tenant', 'landlord', 'lease',
        'property', 'housing', 'apartment', 'residential'
    ]
    
    return any(term in text_lower for term in search_terms)

def main():
    print("🔍 Starting manual Asana search for Rentable-related projects...\n")
    
    # Load environment
    env_vars = load_env_vars()
    if not env_vars:
        return
    
    token = env_vars.get('ASANA_ACCESS_TOKEN')
    if not token:
        print("❌ ASANA_ACCESS_TOKEN not found in .env file")
        return
    
    print(f"✅ Token loaded: {token[:10]}...{token[-10:]}")
    
    # Get workspaces
    print("\n📁 Fetching workspaces...")
    workspaces_url = "https://app.asana.com/api/1.0/workspaces"
    workspaces_data = run_curl_command(workspaces_url, token)
    
    if not workspaces_data or 'data' not in workspaces_data:
        print("❌ Failed to fetch workspaces")
        if workspaces_data:
            print("Response:", json.dumps(workspaces_data, indent=2)[:500])
        return
    
    print(f"✅ Found {len(workspaces_data['data'])} workspaces")
    
    all_results = []
    total_projects = 0
    
    for workspace in workspaces_data['data']:
        workspace_id = workspace['gid']
        workspace_name = workspace['name']
        
        print(f"\n📁 Searching workspace: {workspace_name} ({workspace_id})")
        
        # Get projects for this workspace
        projects_url = f"https://app.asana.com/api/1.0/projects?workspace={workspace_id}&limit=100&opt_fields=name,notes,created_at,modified_at,archived,color"
        projects_data = run_curl_command(projects_url, token)
        
        if not projects_data or 'data' not in projects_data:
            print(f"  ❌ Failed to fetch projects for workspace {workspace_name}")
            continue
        
        print(f"  📊 Checking {len(projects_data['data'])} projects...")
        
        workspace_results = []
        
        for project in projects_data['data']:
            project_name = project.get('name', '')
            project_notes = project.get('notes', '')
            project_id = project.get('gid', '')
            
            # Check if project is Rentable-related
            combined_text = f"{project_name} {project_notes}"
            if is_rentable_related(combined_text):
                print(f"  ✅ FOUND: {project_name}")
                
                status = "Archived" if project.get('archived', False) else "Active"
                
                project_info = {
                    'id': project_id,
                    'name': project_name,
                    'description': project_notes or 'No description',
                    'status': status,
                    'created_at': project.get('created_at', ''),
                    'modified_at': project.get('modified_at', ''),
                    'color': project.get('color', ''),
                    'url': f"https://app.asana.com/0/{project_id}",
                    'workspace': {
                        'id': workspace_id,
                        'name': workspace_name
                    }
                }
                
                workspace_results.append(project_info)
                total_projects += 1
        
        if workspace_results:
            all_results.append({
                'workspace': {
                    'id': workspace_id,
                    'name': workspace_name
                },
                'projects': workspace_results
            })
        else:
            print(f"  📝 No Rentable-related projects found in {workspace_name}")
    
    # Display results
    print('\n' + '='*80)
    print('🎯 RENTABLE-RELATED PROJECTS SEARCH RESULTS')
    print('='*80)
    
    if not all_results:
        print('\n❌ No Rentable-related projects found in any workspace.')
    else:
        for workspace_result in all_results:
            workspace = workspace_result['workspace']
            projects = workspace_result['projects']
            
            print(f"\n📁 WORKSPACE: {workspace['name']}")
            print(f"   ID: {workspace['id']}")
            print(f"   Projects Found: {len(projects)}")
            print('-'*60)
            
            for i, project in enumerate(projects, 1):
                print(f"\n{i}. {project['name']}")
                print(f"   🆔 ID: {project['id']}")
                print(f"   📝 Description: {project['description'][:100]}{'...' if len(project['description']) > 100 else ''}")
                print(f"   📊 Status: {project['status']}")
                print(f"   📅 Created: {project['created_at']}")
                print(f"   📅 Modified: {project['modified_at']}")
                if project['color']:
                    print(f"   🎨 Color: {project['color']}")
                print(f"   🔗 URL: {project['url']}")
    
    # Save results
    if all_results:
        output_data = {
            'search_date': '2025-01-20',
            'search_terms': ['rentable', 'rental', 'rent', 'revpal', 'property management'],
            'total_workspaces_searched': len([r for r in all_results]),
            'total_projects_found': total_projects,
            'results': all_results
        }
        
        with open('rentable-projects-search-results.json', 'w') as f:
            json.dump(output_data, f, indent=2)
        
        print(f'\n💾 Results saved to: rentable-projects-search-results.json')
    
    print(f'\n📊 SUMMARY: Found {total_projects} Rentable-related projects across {len(all_results)} workspaces')
    print('='*80)
    print('✅ Search completed successfully!')

if __name__ == '__main__':
    main()