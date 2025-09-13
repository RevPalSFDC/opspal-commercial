#!/usr/bin/env python3
"""
Batch update Account Website fields to standardize domain format
"""

import subprocess
import json
import re
from typing import List, Dict, Tuple

# Test batch of 25 inactive accounts
ACCOUNTS = [
    ("001Rh00000VeNyYIAV", "Montecito Cove", "www.rpmcompany.net"),
    ("001Rh00000ST6enIAD", "Bonavista", "www.bonavistamgmt.com"),
    ("001Rh00000RnUdJIAV", "Rockstar Capital", "www.rockstar-capital.com"),
    ("001Rh00000VZyc9IAD", "Clarion Management", "www.clarionmgmt.com"),
    ("001Rh00000WQmoDIAT", "Harbor Group International", "www.harborgroupint.com"),
    ("001Rh00000SzPe5IAF", "S & S Property Management", "www.sandsprops.com"),
    ("001Rh00000NXDeLIAX", "CenterSquare Investment Management", "www.centersquare.com"),
    ("001Rh00000PXPneIAH", "Pensam Residential", "www.pensamcapital.com"),
    ("001Rh00000SviyqIAB", "Bridges at San Ramon", "www.bridgesatsanramonapts.com"),
    ("001Rh00000TeCWRIA3", "Seminole Trail Management", "www.seminoletrailmanagement.com"),
    ("001Rh00000WwIqEIAV", "PaulsCorp", "www.paulscorp.com"),
    ("001Rh00000XThtFIAT", "Universe Holdings", "www.universeholdings.com"),
    ("001Rh00000WCViQIAX", "Optimal Realty Capital LLC", "https://www.optimalrealtycapital.com/"),
    ("001Rh00000T8JhbIAF", "Livestrong", "www.livestrong.org"),
    ("001Rh00000L6JALIA3", "Fore Investment Group", "www.foreinvestmentgroup.com"),
    ("001Rh00000LX6KJIA1", "Monument Real Estate Services", "www.monumentmgt.com"),
    ("001Rh00000NbnEDIAZ", "Batson-Cook", "www.batson-cook.com"),
    ("001Rh00000OPwivIAD", "Kovitz Investment Group", "www.kovitz.com"),
    ("001Rh00000SIZvFIAX", "Rose Valley Management", "www.rosevalleymanagement.com"),
    ("001Rh00000aGwRYIA0", "Rockville", "www.rockvilleflorist.net"),
    ("001Rh00000a7q0LIAQ", "First Hospitality", "www.firsthospitality.com"),
    ("001Rh00000aXbXFIA0", "Bonavista Management", "www.bonavistamanagement.com"),
    ("001Rh00000ZApy0IAD", "Besyata Investment Group", "www.beitel.com"),
    ("001Rh00000agBLlIAM", "Ginsburg Development Companies", "www.gdcllc.com"),
    ("001Rh00000arJ4fIAE", "Cedar Park Apartments", "www.cedarparkapts.org"),
]

def clean_domain(website: str) -> str:
    """Clean a website URL to standard domain format"""
    if not website:
        return website
    
    # Remove protocols
    domain = re.sub(r'^https?://', '', website)
    # Remove www prefix
    domain = re.sub(r'^www\.', '', domain)
    # Remove trailing slash
    domain = domain.rstrip('/')
    # Convert to lowercase for consistency
    domain = domain.lower()
    
    return domain

def update_account(account_id: str, name: str, old_website: str, new_website: str) -> Dict:
    """Update a single account's website field"""
    result = {
        "id": account_id,
        "name": name,
        "old_website": old_website,
        "new_website": new_website,
        "status": "pending"
    }
    
    try:
        # Build the update command
        cmd = [
            "sf", "data", "update", "record",
            "--sobject", "Account",
            "--record-id", account_id,
            "--values", f"Website={new_website}",
            "--target-org", "rentable-production",
            "--json"
        ]
        
        # Execute the update
        process = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
        
        if process.returncode == 0:
            response = json.loads(process.stdout)
            if response.get("status") == 0:
                result["status"] = "success"
                print(f"✓ Updated {name}: {old_website} → {new_website}")
            else:
                result["status"] = "failed"
                result["error"] = response.get("message", "Unknown error")
                print(f"✗ Failed {name}: {result['error']}")
        else:
            result["status"] = "failed"
            result["error"] = process.stderr or "Command failed"
            print(f"✗ Failed {name}: {result['error']}")
            
    except subprocess.TimeoutExpired:
        result["status"] = "failed"
        result["error"] = "Timeout"
        print(f"✗ Failed {name}: Timeout")
    except Exception as e:
        result["status"] = "failed"
        result["error"] = str(e)
        print(f"✗ Failed {name}: {e}")
    
    return result

def main():
    print("=" * 80)
    print("DOMAIN STANDARDIZATION - BATCH UPDATE")
    print("=" * 80)
    print(f"Processing {len(ACCOUNTS)} accounts...")
    print()
    
    results = []
    success_count = 0
    failed_count = 0
    
    for account_id, name, old_website in ACCOUNTS:
        new_website = clean_domain(old_website)
        
        if old_website == new_website:
            print(f"⊘ Skipped {name}: Already clean")
            results.append({
                "id": account_id,
                "name": name,
                "old_website": old_website,
                "new_website": new_website,
                "status": "skipped"
            })
            continue
        
        result = update_account(account_id, name, old_website, new_website)
        results.append(result)
        
        if result["status"] == "success":
            success_count += 1
        else:
            failed_count += 1
    
    # Generate summary report
    print()
    print("=" * 80)
    print("UPDATE SUMMARY")
    print("=" * 80)
    print(f"Total Accounts: {len(ACCOUNTS)}")
    print(f"Successfully Updated: {success_count}")
    print(f"Failed: {failed_count}")
    print(f"Skipped: {len(ACCOUNTS) - success_count - failed_count}")
    
    # Save detailed results
    with open("/home/chris/Desktop/RevPal/Agents/domain_update_results.json", "w") as f:
        json.dump({
            "timestamp": subprocess.check_output(["date", "-Iseconds"]).decode().strip(),
            "total": len(ACCOUNTS),
            "success": success_count,
            "failed": failed_count,
            "results": results
        }, f, indent=2)
    
    print()
    print("Detailed results saved to: domain_update_results.json")
    
    # Show any failures
    if failed_count > 0:
        print()
        print("FAILED UPDATES:")
        for result in results:
            if result["status"] == "failed":
                print(f"  - {result['name']}: {result.get('error', 'Unknown error')}")
    
    return success_count, failed_count

if __name__ == "__main__":
    success, failed = main()
    exit(0 if failed == 0 else 1)