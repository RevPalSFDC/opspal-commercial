#!/bin/bash

echo "🔒 Starting Comprehensive Security Analysis for sample-org-sandbox"
echo "================================================================"

cd ${PROJECT_ROOT:-${PROJECT_ROOT:-/path/to/project}}

# Make sure the Python script is executable
chmod +x security_analysis.py

# Run the security analysis
python3 security_analysis.py

echo "================================================================"
echo "🔒 Security Analysis Complete"