#!/bin/bash

# Aggressive batch processor - runs continuously until done
SCRIPT_PATH="${PROJECT_ROOT:-/home/chris/Desktop/RevPal/Agents}"
ORG_ALIAS="rentable-production"
DELAY=1  # Only 1 second delay for speed

echo "🚀 AGGRESSIVE BATCH PROCESSOR - Processing ALL remaining contacts"
echo "================================================="

# Get initial count
REMAINING=$(sf data query --query "SELECT COUNT(Id) FROM Contact WHERE Email != null AND Clean_Status__c = null" --target-org "$ORG_ALIAS" --json | jq -r '.result.records[0].expr0')
echo "📊 Starting with $REMAINING unmarked contacts"
echo ""

BATCH_NUM=0
TOTAL_PROCESSED=0
START_TIME=$(date +%s)

# Run until no more contacts
while [ "$REMAINING" -gt 0 ]; do
    BATCH_NUM=$((BATCH_NUM + 1))

    # Show progress every 10 batches
    if [ $((BATCH_NUM % 10)) -eq 1 ]; then
        echo -e "\n📦 Processing batches $BATCH_NUM-$((BATCH_NUM + 9))..."
    fi

    # Run the apex script (suppress output for speed)
    sf apex run --file "$SCRIPT_PATH" --target-org "$ORG_ALIAS" > /dev/null 2>&1

    # Update processed count
    TOTAL_PROCESSED=$((TOTAL_PROCESSED + 100))

    # Check remaining every 20 batches
    if [ $((BATCH_NUM % 20)) -eq 0 ]; then
        REMAINING=$(sf data query --query "SELECT COUNT(Id) FROM Contact WHERE Email != null AND Clean_Status__c = null" --target-org "$ORG_ALIAS" --json 2>/dev/null | jq -r '.result.records[0].expr0')

        # Calculate rate
        CURRENT_TIME=$(date +%s)
        ELAPSED=$((CURRENT_TIME - START_TIME))
        RATE=$((TOTAL_PROCESSED * 60 / ELAPSED))

        echo "   ✅ Processed: ~$TOTAL_PROCESSED | Remaining: $REMAINING | Rate: $RATE/min"

        # Estimate completion
        if [ "$RATE" -gt 0 ]; then
            MINUTES_LEFT=$((REMAINING / RATE))
            echo "   ⏱️  Estimated time remaining: $MINUTES_LEFT minutes"
        fi
    fi

    # Brief pause
    sleep $DELAY

    # Safety check - stop if remaining is 0
    if [ $((BATCH_NUM % 50)) -eq 0 ]; then
        REMAINING=$(sf data query --query "SELECT COUNT(Id) FROM Contact WHERE Email != null AND Clean_Status__c = null" --target-org "$ORG_ALIAS" --json 2>/dev/null | jq -r '.result.records[0].expr0')
        if [ "$REMAINING" -eq 0 ]; then
            break
        fi
    fi

    # Stop after 500 batches (50,000 contacts) to prevent timeout
    if [ "$BATCH_NUM" -ge 500 ]; then
        echo -e "\n⚠️  Reached 500 batch limit. Run script again to continue."
        break
    fi
done

# Final stats
END_TIME=$(date +%s)
TOTAL_TIME=$((END_TIME - START_TIME))

echo -e "\n================================================="
echo "✨ BATCH PROCESSING COMPLETE!"
echo "Total batches: $BATCH_NUM"
echo "Estimated contacts processed: $((BATCH_NUM * 100))"
echo "Total time: $((TOTAL_TIME / 60)) minutes $((TOTAL_TIME % 60)) seconds"
echo "================================================="

# Show final distribution
echo -e "\n📊 Final Status Distribution:"
sf data query --query "SELECT Clean_Status__c, COUNT(Id) FROM Contact WHERE Clean_Status__c != null GROUP BY Clean_Status__c" --target-org "$ORG_ALIAS"

echo -e "\n📊 Remaining unmarked:"
sf data query --query "SELECT COUNT(Id) FROM Contact WHERE Email != null AND Clean_Status__c = null" --target-org "$ORG_ALIAS"