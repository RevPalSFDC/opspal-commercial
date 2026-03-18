#!/bin/bash

# Run sample-org Tasks Creator
# This script creates 5 Asana tasks documenting work completed on 2025-09-30

cd "$(dirname "$0")/.." || exit 1

# Load environment
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

# Run the script
node scripts/create-sample-org-tasks.js
