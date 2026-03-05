#!/bin/bash

# Simple script to retrieve Contact layout
cd ${PROJECT_ROOT:-${PROJECT_ROOT:-/path/to/project}}

# Create a temporary directory for metadata
mkdir -p temp-metadata
cd temp-metadata

echo "Checking org connection..."
sf org display --target-org sample-org-sandbox

echo -e "\nRetrieving Contact layouts..."
sf project retrieve start -m "Layout:Contact*" --target-org sample-org-sandbox

echo -e "\nListing retrieved files..."
find . -name "*.layout*" -type f

echo -e "\nAll files:"
find . -type f -name "*Contact*"
