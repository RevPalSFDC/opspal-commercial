#!/bin/bash
cd ${PROJECT_ROOT:-${PROJECT_ROOT:-/path/to/project}}
echo "Starting comprehensive RevOps assessment for neonone..."
echo "This will execute real SOQL queries to gather evidence-based data."
echo ""
python3 revops_assessment_comprehensive.py 2>&1 | tee revops_output.log
echo ""
echo "Assessment complete. Check revops_output.log for full details."