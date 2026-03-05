#!/bin/bash

# Test script for JQ null handling

echo "Testing JQ null handling patterns..."
echo "=================================="

# Test 1: Null result
echo -e "\n1. Testing with null result:"
echo '{"result": null}' | jq '(.result.records // [])' 2>&1 && echo "✅ PASS: Handled null result" || echo "❌ FAIL"

# Test 2: Null records array
echo -e "\n2. Testing with null records:"
echo '{"result": {"records": null}}' | jq '(.result.records // [])' 2>&1 && echo "✅ PASS: Handled null records" || echo "❌ FAIL"

# Test 3: Empty records array
echo -e "\n3. Testing with empty records:"
echo '{"result": {"records": []}}' | jq '(.result.records // [])' 2>&1 && echo "✅ PASS: Handled empty records" || echo "❌ FAIL"

# Test 4: Valid records
echo -e "\n4. Testing with valid records:"
echo '{"result": {"records": [{"Id": "001", "Name": "Test"}]}}' | jq '(.result.records // [])' 2>&1 && echo "✅ PASS: Handled valid records" || echo "❌ FAIL"

# Test 5: Optional iteration on null
echo -e "\n5. Testing optional iteration ([]?):"
echo '{"result": {"records": null}}' | jq '.result.records[]?' 2>&1 && echo "✅ PASS: Optional iteration worked" || echo "❌ FAIL"

# Test 6: Length with null safety
echo -e "\n6. Testing length with null safety:"
COUNT=$(echo '{"result": {"records": null}}' | jq '(.result.records // []) | length' 2>&1)
if [ "$COUNT" = "0" ]; then
    echo "✅ PASS: Length returned 0 for null"
else
    echo "❌ FAIL: Length failed on null"
fi

# Test 7: First element with safety
echo -e "\n7. Testing first element access:"
echo '{"result": {"records": null}}' | jq '.result.records[0]?' 2>&1 && echo "✅ PASS: Safe first element access" || echo "❌ FAIL"

# Test 8: totalSize with default
echo -e "\n8. Testing totalSize with default:"
SIZE=$(echo '{"result": {"totalSize": null}}' | jq '(.result.totalSize // 0)' 2>&1)
if [ "$SIZE" = "0" ]; then
    echo "✅ PASS: totalSize defaulted to 0"
else
    echo "❌ FAIL: totalSize default failed"
fi

# Test 9: Complex flow query pattern
echo -e "\n9. Testing complex flow query pattern:"
echo '{"result": null}' | jq '
    if .result != null and .result.records != null then
        .result.records[] | select(.IsActive == true)
    else
        empty
    end' 2>&1 && echo "✅ PASS: Complex pattern handled null" || echo "❌ FAIL"

# Test 10: Definition.DeveloperName pattern (common in Flow queries)
echo -e "\n10. Testing Definition.DeveloperName pattern:"
echo '{"result": {"records": [{"Definition": null}]}}' | jq '.result.records[]?.Definition.DeveloperName?' 2>&1 && echo "✅ PASS: Handled null Definition" || echo "❌ FAIL"

echo -e "\n=================================="
echo "Test complete!"