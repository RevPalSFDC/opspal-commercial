#!/usr/bin/env python3
import shutil
import subprocess
import sys

def check_sf_cli_installation():
    """Check if Salesforce CLI is installed and available"""
    ok = True

    # Check for 'sf' command (new CLI)
    sf_path = shutil.which('sf')
    print(f"sf command path: {sf_path}")
    if not sf_path:
        ok = False
    
    # Try to run sf version
    try:
        result = subprocess.run(
            ['sf', '--version'],
            capture_output=True,
            text=True,
            timeout=10
        )
        print(f"sf version output: {result.stdout}")
        print(f"sf version return code: {result.returncode}")
        if result.stderr:
            print(f"sf version stderr: {result.stderr}")
        if result.returncode != 0:
            ok = False
    except Exception as e:
        print(f"Error running 'sf --version': {e}")
        ok = False
    
    # Check for node and npm
    node_path = shutil.which('node')
    npm_path = shutil.which('npm')
    print(f"node path: {node_path}")
    print(f"npm path: {npm_path}")
    
    if npm_path:
        try:
            result = subprocess.run(
                ['npm', 'list', '-g', '@salesforce/cli'],
                capture_output=True,
                text=True,
                timeout=10
            )
            print(f"npm list @salesforce/cli output: {result.stdout}")
            if result.stderr:
                print(f"npm list stderr: {result.stderr}")
        except Exception as e:
            print(f"Error checking npm packages: {e}")
            ok = False

    return ok

if __name__ == "__main__":
    success = check_sf_cli_installation()
    sys.exit(0 if success else 1)
