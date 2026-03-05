#!/bin/bash
# Compact output script - shortens file paths in output

# Function to shorten paths
shorten_path() {
    echo "$1" | sed -E "s|/home/[^/]+/Desktop/RevPal/Agents/platforms/SFDC|~SFDC|g" \
                | sed -E "s|/home/[^/]+/Desktop/RevPal/Agents|~Agents|g" \
                | sed -E "s|/home/[^/]+|~|g"
}

# If running a command, execute it and filter output
if [ $# -gt 0 ]; then
    "$@" 2>&1 | while IFS= read -r line; do
        shorten_path "$line"
    done
else
    # Read from stdin and filter
    while IFS= read -r line; do
        shorten_path "$line"
    done
fi