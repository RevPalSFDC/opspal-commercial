#!/bin/bash

echo "Listing authenticated Salesforce orgs..."
echo ""

echo "Using sf:"
sf org list --all 2>/dev/null || echo "sf not available or no orgs authenticated"

echo ""
echo "Checking default org:"
echo "SF_TARGET_ORG: $SF_TARGET_ORG"

echo ""
echo "Looking for gamma-corp specifically:"
sf org display --target-org gamma-corp 2>&1 | head -5
