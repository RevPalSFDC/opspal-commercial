#!/bin/bash

# Fix SF CLI command syntax across all files
# Normalizes sf command usage and flags

echo "🔧 Fixing Salesforce CLI command syntax..."

# Function to fix a file
fix_file() {
    local file="$1"
    local temp_file="${file}.tmp"
    local changed=false

    # Create backup
    cp "$file" "${file}.bak.$(date +%Y%m%d_%H%M%S)" 2>/dev/null

    # Fix various deprecated patterns
    sed -e 's/sf sobject describe --sobject/sf sobject describe --sobject/g' \
        -e 's/sf sobject describe --sobject/sf sobject describe --sobject/g' \
        -e 's/sf sobject describe/sf sobject describe/g' \
        -e 's/--sobject/--sobject/g' \
        -e 's/sf sobject list/sf sobject list/g' \
        -e 's/sf org display/sf org display/g' \
        -e 's/sf org list/sf org list/g' \
        -e 's/sf data query/sf data query/g' \
        -e 's/sf project deploy start/sf project deploy start/g' \
        -e 's/sf project retrieve start/sf project retrieve start/g' \
        -e 's/sf project deploy start/sf project deploy start/g' \
        -e 's/sf project retrieve start/sf project retrieve start/g' \
        -e 's/sf deploy metadata/sf deploy metadata/g' \
        -e 's/sf retrieve metadata/sf retrieve metadata/g' \
        -e 's/sf apex run/sf apex run/g' \
        -e 's/sf apex test run/sf apex test run/g' \
        -e 's/sf org assign permset/sf org assign permset/g' \
        -e 's/sf data create record/sf data create record/g' \
        -e 's/sf data update record/sf data update record/g' \
        -e 's/sf data delete record/sf data delete record/g' \
        -e 's/sf data upsert bulk/sf data upsert bulk/g' \
        -e 's/sf org login web/sf org login web/g' \
        -e 's/sf org logout/sf org logout/g' \
        "$file" > "$temp_file"

    # Check if file changed
    if ! cmp -s "$file" "$temp_file"; then
        mv "$temp_file" "$file"
        changed=true
        echo "✅ Fixed: $file"
    else
        rm "$temp_file"
    fi

    # Clean up old backup if no changes
    if [ "$changed" = false ]; then
        rm "${file}.bak."* 2>/dev/null
    fi
}

# Find and fix all files
echo "🔍 Searching for files to fix..."

# Fix shell scripts
find . -type f \( -name "*.sh" -o -name "*.bash" \) -not -path "./node_modules/*" -not -path "./.git/*" | while read -r file; do
    if grep -q -E "(sf schema describe)" "$file" 2>/dev/null; then
        fix_file "$file"
    fi
done

# Fix JavaScript files
find . -type f \( -name "*.js" -o -name "*.ts" \) -not -path "./node_modules/*" -not -path "./.git/*" | while read -r file; do
    if grep -q -E "(sf schema describe)" "$file" 2>/dev/null; then
        fix_file "$file"
    fi
done

# Fix Markdown files
find . -type f -name "*.md" -not -path "./node_modules/*" -not -path "./.git/*" | while read -r file; do
    if grep -q -E "(sf schema describe)" "$file" 2>/dev/null; then
        fix_file "$file"
    fi
done

# Fix YAML files
find . -type f \( -name "*.yaml" -o -name "*.yml" \) -not -path "./node_modules/*" -not -path "./.git/*" | while read -r file; do
    if grep -q -E "(sf schema describe)" "$file" 2>/dev/null; then
        fix_file "$file"
    fi
done

echo "✨ CLI syntax fix complete!"
echo ""
echo "📋 Summary of deprecated commands replaced:"
echo "  - sf schema describe → sf sobject describe"
echo ""
echo "💡 Tip: Run 'sf help' to see all available commands"
