#!/bin/bash

echo "Testing Node.js version and fetch availability..."
node --version

node -e "console.log('fetch available:', typeof fetch !== 'undefined')"
