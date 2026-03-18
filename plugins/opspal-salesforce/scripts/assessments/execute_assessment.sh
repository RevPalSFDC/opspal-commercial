#!/bin/bash
cd ${PROJECT_ROOT:-${PROJECT_ROOT:-/path/to/project}}
python3 run_revops_assessment.py 2>&1 | tee assessment_output.log