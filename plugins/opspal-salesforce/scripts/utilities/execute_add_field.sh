#!/bin/bash

cd ${PROJECT_ROOT:-${PROJECT_ROOT:-/path/to/project}}

echo "Starting Contact Layout Modification Process..."
echo "=============================================="

python3 add_field_to_layout.py

echo ""
echo "Process completed."