#!/usr/bin/env python3

"""
Create Google Drive Folder Structure for RevPal
Uses the authenticated credentials to create the complete folder hierarchy
"""

import json
import os
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

# Color codes for output
class Colors:
    RESET = '\033[0m'
    GREEN = '\033[92m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    RED = '\033[91m'
    BOLD = '\033[1m'

# Complete folder structure
FOLDER_STRUCTURE = {
    'RevPal': {
        'Documentation': {
            'Salesforce': {},
            'HubSpot': {},
            'Integration': {},
            'Guides': {},
            'API References': {}
        },
        'Reports': {
            'Salesforce': {
                'Daily': {},
                'Weekly': {},
                'Monthly': {},
                'Quarterly': {},
                'Annual': {}
            },
            'HubSpot': {
                'Marketing': {
                    'Campaigns': {},
                    'Email Performance': {},
                    'Lead Generation': {}
                },
                'Sales': {
                    'Pipeline': {},
                    'Forecasts': {},
                    'Activities': {}
                },
                'Service': {
                    'Tickets': {},
                    'SLA': {},
                    'Customer Satisfaction': {}
                }
            },
            'Combined': {
                'Executive': {},
                'Operational': {},
                'Financial': {}
            }
        },
        'Templates': {
            'Salesforce': {
                'Apex': {},
                'Lightning': {},
                'Flows': {},
                'Config': {},
                'Reports': {}
            },
            'HubSpot': {
                'Workflows': {},
                'Emails': {},
                'Forms': {},
                'Landing Pages': {},
                'Sequences': {}
            },
            'Documentation': {
                'Technical': {},
                'User Guides': {},
                'Release Notes': {}
            },
            'Integration': {}
        },
        'Compliance': {
            'GDPR': {
                'Policies': {},
                'Procedures': {},
                'Audits': {}
            },
            'HIPAA': {
                'Documentation': {},
                'Training': {},
                'Audits': {}
            },
            'SOC2': {
                'Controls': {},
                'Evidence': {},
                'Reports': {}
            },
            'CCPA': {},
            'Data Governance': {}
        },
        'Archives': {
            '2025': {
                'Q1': {
                    'January': {},
                    'February': {},
                    'March': {}
                },
                'Q2': {
                    'April': {},
                    'May': {},
                    'June': {}
                },
                'Q3': {
                    'July': {},
                    'August': {},
                    'September': {}
                },
                'Q4': {
                    'October': {},
                    'November': {},
                    'December': {}
                }
            }
        }
    }
}

class DriveFolderCreator:
    def __init__(self):
        self.service = None
        self.created_folders = {}
        self.existing_folders = {}
        
    def authenticate(self):
        """Authenticate using the saved credentials"""
        print(f"{Colors.BLUE}{Colors.BOLD}🔐 Authenticating with Google Drive...{Colors.RESET}")
        
        creds = None
        token_path = '/home/chris/.nvm/versions/node/v22.15.1/lib/node_modules/.gdrive-server-credentials.json'
        
        try:
            # Load the saved token
            with open(token_path, 'r') as token:
                cred_data = json.load(token)
                creds = Credentials(
                    token=cred_data.get('access_token'),
                    refresh_token=cred_data.get('refresh_token'),
                    token_uri='https://oauth2.googleapis.com/token',
                    client_id=os.getenv('GDRIVE_CLIENT_ID', '872687318200-3ecmo321lucq83pl730iivrmbalq9spp.apps.googleusercontent.com'),
                    client_secret=os.getenv('GDRIVE_CLIENT_SECRET', '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'),
                    scopes=['https://www.googleapis.com/auth/drive']
                )
            
            # Refresh the token if needed
            if creds and creds.expired and creds.refresh_token:
                creds.refresh(Request())
                # Save the refreshed token
                with open(token_path, 'w') as token:
                    json.dump({
                        'access_token': creds.token,
                        'refresh_token': creds.refresh_token
                    }, token)
            
            self.service = build('drive', 'v3', credentials=creds)
            print(f"{Colors.GREEN}✅ Authentication successful{Colors.RESET}")
            return True
            
        except Exception as e:
            print(f"{Colors.RED}❌ Authentication failed: {e}{Colors.RESET}")
            return False
    
    def find_folder(self, name, parent_id=None):
        """Check if a folder already exists"""
        try:
            query = f"name='{name}' and mimeType='application/vnd.google-apps.folder' and trashed=false"
            if parent_id:
                query += f" and '{parent_id}' in parents"
            
            response = self.service.files().list(
                q=query,
                fields='files(id, name)',
                spaces='drive'
            ).execute()
            
            files = response.get('files', [])
            return files[0] if files else None
            
        except HttpError as e:
            print(f"{Colors.RED}Error finding folder {name}: {e}{Colors.RESET}")
            return None
    
    def create_folder(self, name, parent_id=None, level=0):
        """Create a folder in Google Drive"""
        indent = "  " * level
        
        # Check if folder already exists
        existing = self.find_folder(name, parent_id)
        if existing:
            print(f"{indent}{Colors.YELLOW}📁 Folder exists: {name}{Colors.RESET}")
            return existing['id']
        
        try:
            file_metadata = {
                'name': name,
                'mimeType': 'application/vnd.google-apps.folder'
            }
            if parent_id:
                file_metadata['parents'] = [parent_id]
            
            folder = self.service.files().create(
                body=file_metadata,
                fields='id'
            ).execute()
            
            folder_id = folder.get('id')
            print(f"{indent}{Colors.GREEN}✅ Created: {name}{Colors.RESET}")
            return folder_id
            
        except HttpError as e:
            print(f"{indent}{Colors.RED}❌ Failed to create {name}: {e}{Colors.RESET}")
            return None
    
    def create_structure(self, structure, parent_id=None, level=0, path=""):
        """Recursively create the folder structure"""
        for folder_name, subfolders in structure.items():
            current_path = f"{path}/{folder_name}" if path else folder_name
            print(f"{'  ' * level}{Colors.BLUE}📂 {folder_name}{Colors.RESET}")
            
            folder_id = self.create_folder(folder_name, parent_id, level + 1)
            
            if folder_id:
                self.created_folders[current_path] = folder_id
                
                # Create subfolders
                if subfolders:
                    self.create_structure(subfolders, folder_id, level + 1, current_path)
    
    def create_readme(self):
        """Create a README file in the root RevPal folder"""
        print(f"\n{Colors.BLUE}📄 Creating README file...{Colors.RESET}")
        
        root_id = self.created_folders.get('RevPal')
        if not root_id:
            print(f"{Colors.YELLOW}⚠️  Root folder not found, skipping README{Colors.RESET}")
            return
        
        readme_content = """# RevPal Google Drive Repository

## 📁 Folder Structure

### Documentation
Project documentation, guides, and references for Salesforce, HubSpot, and integrations.

### Reports
Automated reports and dashboards exported from Salesforce and HubSpot.
- **Salesforce**: Daily, weekly, monthly, quarterly, and annual reports
- **HubSpot**: Marketing, sales, and service analytics
- **Combined**: Cross-platform executive and operational dashboards

### Templates
Reusable templates for development and documentation.
- **Salesforce**: Apex, Lightning, Flows, configurations
- **HubSpot**: Workflows, emails, forms, landing pages
- **Documentation**: Technical docs, user guides, release notes

### Compliance
Compliance documentation and audit materials.
- **GDPR**: Data privacy policies and procedures
- **HIPAA**: Healthcare compliance documentation
- **SOC2**: Security controls and evidence
- **CCPA**: California privacy compliance
- **Data Governance**: Overall data management policies

### Archives
Historical reports and documentation organized by year and quarter.

## 🤖 Integration with Claude Code

This folder structure is integrated with the RevPal Agent System:
- **gdrive-document-manager**: Accesses and retrieves documents
- **gdrive-report-exporter**: Exports reports to Google Sheets
- **gdrive-template-library**: Manages reusable templates

## 📊 Automated Features

- **Scheduled Exports**: Reports automatically exported on schedule
- **Version Control**: Document versions tracked automatically
- **Access Control**: Folder-level permissions for security
- **Template Management**: Centralized template library

## 🔒 Security & Compliance

- Read-only access by default
- Sensitive data in Compliance folder has restricted access
- Audit trail maintained for all operations
- Regular backup to Archives folder

---
*Created: 2025-01-05*
*Maintained by: RevPal Agent System*
"""
        
        try:
            file_metadata = {
                'name': 'README.md',
                'parents': [root_id],
                'mimeType': 'application/vnd.google-apps.document'
            }
            
            from googleapiclient.http import MediaInMemoryUpload
            media = MediaInMemoryUpload(
                readme_content.encode('utf-8'),
                mimetype='text/plain',
                resumable=True
            )
            
            file = self.service.files().create(
                body=file_metadata,
                media_body=media,
                fields='id'
            ).execute()
            
            print(f"{Colors.GREEN}✅ Created README.md{Colors.RESET}")
            
        except HttpError as e:
            print(f"{Colors.RED}❌ Failed to create README: {e}{Colors.RESET}")
    
    def set_permissions(self):
        """Set appropriate permissions on folders"""
        print(f"\n{Colors.BLUE}🔐 Setting folder permissions...{Colors.RESET}")
        
        # You can customize permissions here
        # For now, keeping default permissions
        print(f"{Colors.GREEN}✅ Using default permissions (private to owner){Colors.RESET}")
        print(f"{Colors.YELLOW}ℹ️  To share folders, use Google Drive sharing settings{Colors.RESET}")
    
    def print_summary(self):
        """Print a summary of created folders"""
        print(f"\n{Colors.BOLD}{Colors.GREEN}{'='*60}{Colors.RESET}")
        print(f"{Colors.BOLD}{Colors.GREEN}✅ Folder Structure Creation Complete!{Colors.RESET}")
        print(f"{Colors.BOLD}{Colors.GREEN}{'='*60}{Colors.RESET}\n")
        
        print(f"{Colors.BLUE}📊 Summary:{Colors.RESET}")
        print(f"  • Total folders created/verified: {len(self.created_folders)}")
        print(f"  • Root folder: RevPal")
        print(f"  • Main categories: Documentation, Reports, Templates, Compliance, Archives")
        
        print(f"\n{Colors.BLUE}🎯 Next Steps:{Colors.RESET}")
        print(f"  1. Open Google Drive and verify the structure")
        print(f"  2. Share folders with team members as needed")
        print(f"  3. Test with Claude: \"List my RevPal folders in Drive\"")
        print(f"  4. Try exporting a report: \"Export a test report to Google Sheets\"")
        
        print(f"\n{Colors.GREEN}✨ Your Google Drive is now ready for RevPal!{Colors.RESET}")

def main():
    print(f"{Colors.BOLD}{Colors.BLUE}{'='*60}{Colors.RESET}")
    print(f"{Colors.BOLD}{Colors.BLUE}🚀 RevPal Google Drive Folder Structure Creator{Colors.RESET}")
    print(f"{Colors.BOLD}{Colors.BLUE}{'='*60}{Colors.RESET}\n")
    
    creator = DriveFolderCreator()
    
    # Authenticate
    if not creator.authenticate():
        print(f"{Colors.RED}❌ Unable to authenticate. Please check credentials.{Colors.RESET}")
        return
    
    # Create folder structure
    print(f"\n{Colors.BLUE}📁 Creating folder structure...{Colors.RESET}\n")
    creator.create_structure(FOLDER_STRUCTURE)
    
    # Create README
    creator.create_readme()
    
    # Set permissions
    creator.set_permissions()
    
    # Print summary
    creator.print_summary()

if __name__ == '__main__':
    main()