#!/bin/bash

# Quick inspection of phase1-data structure
FILE="plugins/opspal-core/output/reflection-processing/phase1-data-2026-01-27.json"

echo "=== Phase 1 Data Structure Inspection ==="
echo

echo "Top-level keys:"
jq 'keys' "$FILE"
echo

echo "Number of reflections:"
jq '.reflections | length' "$FILE"
echo

echo "Number of cohorts:"
jq '.cohorts | length' "$FILE"
echo

echo "First cohort structure (keys only):"
jq '.cohorts[0] | keys' "$FILE"
echo

echo "Sample cohort:"
jq '.cohorts[0] | {cohort_id, taxonomy, priority, reflection_count: (.reflection_ids | length), roi: .total_roi_annual_value}' "$FILE"
