#!/bin/bash

# Create temp directory for metadata retrieval
mkdir -p ${PROJECT_ROOT:-${PROJECT_ROOT:-/path/to/project}}

# Retrieve Contact page layout
cd ${PROJECT_ROOT:-${PROJECT_ROOT:-/path/to/project}}
sf project retrieve start -m "Layout:Contact-Contact Layout" --target-org sample-org-sandbox

# List what was retrieved
echo "Retrieved files:"
find . -name "*.layout*" -type f
