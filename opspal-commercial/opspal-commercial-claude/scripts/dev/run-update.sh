#!/bin/bash

# Load environment variables
set -a
source /home/chris/Desktop/RevPal/Agents/opspal-internal-plugins/.env
set +a

# Execute the update
node /home/chris/Desktop/RevPal/Agents/opspal-internal-plugins/update-reflection-status.js \
  068c7cf7-7087-4a29-940e-ba25163505c6 \
  under_review
