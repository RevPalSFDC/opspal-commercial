#!/bin/bash

# Make scripts executable
chmod +x query-flow-status.sh
chmod +x remove-compounding-flow.sh

echo "=== Step 1: Query Flow Status ==="
./query-flow-status.sh

echo ""
echo "=== Step 2: Execute Flow Removal ==="
echo "Please review the query results above."
read -p "Do you want to proceed with Flow removal? (y/n): " -n 1 -r
echo

if [[ $REPLY =~ ^[Yy]$ ]]; then
    ./remove-compounding-flow.sh
else
    echo "Flow removal cancelled."
fi