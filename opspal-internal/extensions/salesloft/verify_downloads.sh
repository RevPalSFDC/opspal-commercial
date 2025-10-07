#!/bin/bash

# Verify Salesloft Recording Downloads
# This script checks that the downloaded files are valid MP3s, not HTML login pages

DOWNLOAD_DIR="$HOME/Downloads/salesloft_recordings"

echo "==============================================="
echo "Salesloft Recording Download Verification"
echo "==============================================="
echo ""

# Check if directory exists
if [ ! -d "$DOWNLOAD_DIR" ]; then
    echo "❌ Download directory not found: $DOWNLOAD_DIR"
    echo "   No recordings have been downloaded yet."
    exit 1
fi

# Count files
TOTAL_FILES=$(ls -1 "$DOWNLOAD_DIR"/*.mp3 2>/dev/null | wc -l)

if [ "$TOTAL_FILES" -eq 0 ]; then
    echo "❌ No MP3 files found in $DOWNLOAD_DIR"
    exit 1
fi

echo "📊 Statistics:"
echo "   Total MP3 files: $TOTAL_FILES"
echo ""

# Check file types
echo "🔍 Checking file types..."
HTML_COUNT=0
MP3_COUNT=0
UNKNOWN_COUNT=0

for file in "$DOWNLOAD_DIR"/*.mp3; do
    if [ -f "$file" ]; then
        FILE_TYPE=$(file -b "$file" | cut -d',' -f1)
        
        if [[ "$FILE_TYPE" == *"HTML"* ]]; then
            ((HTML_COUNT++))
            if [ "$HTML_COUNT" -eq 1 ]; then
                echo "   ❌ Found HTML files (login pages):"
            fi
            if [ "$HTML_COUNT" -le 5 ]; then
                echo "      - $(basename "$file"): $FILE_TYPE"
            fi
        elif [[ "$FILE_TYPE" == *"Audio"* ]] || [[ "$FILE_TYPE" == *"MPEG"* ]] || [[ "$FILE_TYPE" == *"MP3"* ]]; then
            ((MP3_COUNT++))
        else
            ((UNKNOWN_COUNT++))
            if [ "$UNKNOWN_COUNT" -le 5 ]; then
                echo "   ⚠️  Unknown type: $(basename "$file"): $FILE_TYPE"
            fi
        fi
    fi
done

echo ""
echo "📈 File Type Summary:"
echo "   ✅ Valid MP3 files: $MP3_COUNT"
echo "   ❌ HTML files: $HTML_COUNT"
echo "   ⚠️  Unknown types: $UNKNOWN_COUNT"
echo ""

# Check file sizes
echo "📏 File Size Analysis:"
SMALL_FILES=$(find "$DOWNLOAD_DIR" -name "*.mp3" -size -10k | wc -l)
MEDIUM_FILES=$(find "$DOWNLOAD_DIR" -name "*.mp3" -size +10k -size -1M | wc -l)
LARGE_FILES=$(find "$DOWNLOAD_DIR" -name "*.mp3" -size +1M | wc -l)

echo "   < 10KB (likely errors): $SMALL_FILES"
echo "   10KB - 1MB: $MEDIUM_FILES"
echo "   > 1MB: $LARGE_FILES"
echo ""

# Sample some files
echo "📝 Sample of downloaded files:"
ls -lh "$DOWNLOAD_DIR"/*.mp3 2>/dev/null | head -5 | while read line; do
    echo "   $line"
done
echo ""

# Check for the 3.7KB issue
SAME_SIZE_FILES=$(ls -l "$DOWNLOAD_DIR"/*.mp3 2>/dev/null | awk '{print $5}' | sort | uniq -c | sort -rn | head -1)
SIZE_COUNT=$(echo "$SAME_SIZE_FILES" | awk '{print $1}')
SIZE_VALUE=$(echo "$SAME_SIZE_FILES" | awk '{print $2}')

if [ "$SIZE_COUNT" -gt 10 ] && [ "$SIZE_VALUE" -lt 10000 ]; then
    echo "⚠️  WARNING: Found $SIZE_COUNT files with same size ($SIZE_VALUE bytes)"
    echo "   This likely indicates authentication failure!"
    echo ""
fi

# Final verdict
echo "==============================================="
if [ "$MP3_COUNT" -gt 0 ] && [ "$HTML_COUNT" -eq 0 ]; then
    echo "✅ VERIFICATION PASSED"
    echo "   All files appear to be valid audio recordings"
elif [ "$HTML_COUNT" -gt 0 ]; then
    echo "❌ VERIFICATION FAILED"  
    echo "   Found $HTML_COUNT HTML files instead of recordings"
    echo "   This indicates an authentication problem"
    echo "   Please ensure you're logged into Salesloft and try again"
else
    echo "⚠️  VERIFICATION INCONCLUSIVE"
    echo "   Please manually check the files"
fi
echo "==============================================="

# Cleanup suggestion
if [ "$HTML_COUNT" -gt 0 ]; then
    echo ""
    echo "To remove invalid HTML files, run:"
    echo "  find $DOWNLOAD_DIR -name '*.mp3' -exec file {} \\; | grep HTML | cut -d: -f1 | xargs rm"
    echo ""
fi