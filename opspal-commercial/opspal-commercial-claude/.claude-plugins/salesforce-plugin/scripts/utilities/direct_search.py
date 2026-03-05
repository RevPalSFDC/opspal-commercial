import subprocess
import json

# Read token from .env file
token = None
try:
    with open('.env', 'r') as f:
        for line in f:
            if line.startswith('ASANA_ACCESS_TOKEN='):
                token = line.split('=', 1)[1].strip()
                break
except:
    pass

if not token:
    print("❌ Could not read ASANA_ACCESS_TOKEN from .env")
    exit(1)

print("🔍 Searching Asana for Rentable-related projects...")
print(f"Token: {token[:10]}...{token[-10:]}")

# Test basic API call
cmd = ['curl', '-s', '-H', f'Authorization: Bearer {token}', 'https://app.asana.com/api/1.0/workspaces']

try:
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode == 0:
        data = json.loads(result.stdout)
        print(f"\n✅ API Connection successful!")
        print(f"Found {len(data.get('data', []))} workspaces:")
        
        for ws in data.get('data', []):
            print(f"  - {ws.get('name')} ({ws.get('gid')})")
    else:
        print(f"❌ API call failed: {result.stderr}")
        
except Exception as e:
    print(f"❌ Error: {e}")