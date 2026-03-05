#!/bin/bash

# Quick GEO Validator Test

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

echo "Testing GEO Validator..."
echo

# Test 1: Help output
if ./scripts/lib/seo-geo-validator.js --help > /dev/null 2>&1; then
  echo -e "${GREEN}✓${NC} GEO validator --help works"
else
  echo -e "${RED}✗${NC} GEO validator --help failed"
  exit 1
fi

# Test 2: JSON input
if ./scripts/lib/seo-geo-validator.js .test-results/phase3/mock-crawl.json --format json --output .test-results/geo-test.json > /dev/null 2>&1; then
  echo -e "${GREEN}✓${NC} GEO validator processes JSON input"
else
  echo -e "${RED}✗${NC} GEO validator JSON input failed"
  exit 1
fi

# Test 3: Output file created
if [ -f .test-results/geo-test.json ]; then
  echo -e "${GREEN}✓${NC} GEO validator creates output file"
else
  echo -e "${RED}✗${NC} GEO validator output file missing"
  exit 1
fi

# Test 4: Valid JSON output
if jq empty .test-results/geo-test.json 2>/dev/null; then
  echo -e "${GREEN}✓${NC} GEO validator output is valid JSON"
else
  echo -e "${RED}✗${NC} GEO validator output is invalid JSON"
  exit 1
fi

# Test 5: Has geoScore field
if jq -e '.geoScore' .test-results/geo-test.json > /dev/null 2>&1; then
  echo -e "${GREEN}✓${NC} GEO validator output has geoScore field"
else
  echo -e "${RED}✗${NC} GEO validator output missing geoScore"
  exit 1
fi

echo
echo -e "${GREEN}All GEO validator tests passed!${NC}"
