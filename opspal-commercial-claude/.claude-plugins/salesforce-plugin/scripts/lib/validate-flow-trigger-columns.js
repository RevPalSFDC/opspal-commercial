#!/usr/bin/env node

/**
 * Flow Trigger Column Validator
 *
 * Validates that all Flow rows in Master_Automation_Inventory.csv have:
 * - Object(s) column populated (not "N/A")
 * - Trigger Events column populated (not "N/A")
 *
 * Usage:
 *   node validate-flow-trigger-columns.js <path-to-csv>
 *   node validate-flow-trigger-columns.js output/Master_Automation_Inventory.csv
 *
 * Exit Codes:
 *   0 - All Flow rows have complete trigger metadata
 *   1 - One or more Flow rows missing trigger metadata
 *
 * @version 1.0.0
 * @date 2025-10-22
 */

const fs = require('fs');
const path = require('path');

/**
 * Minimal CSV parser that handles quoted fields and commas
 * @param {string} text - CSV text
 * @returns {Array<Array<string>>} Parsed rows
 */
function parseCSV(text) {
  const rows = [];
  let row = [], cell = '', inQuote = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];

    if (c === '"') {
      if (inQuote && next === '"') {
        // Escaped quote
        cell += '"';
        i++;
      } else {
        // Toggle quote mode
        inQuote = !inQuote;
      }
    } else if (c === ',' && !inQuote) {
      // End of cell
      row.push(cell);
      cell = '';
    } else if ((c === '\n' || c === '\r') && !inQuote) {
      // End of row
      if (cell || row.length) {
        row.push(cell);
        rows.push(row);
        row = [];
        cell = '';
      }
    } else {
      cell += c;
    }
  }

  // Handle last cell/row
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

/**
 * Main validation function
 */
function validateFlowTriggerColumns(csvPath) {
  // Read CSV file
  if (!fs.existsSync(csvPath)) {
    console.error(`❌ ERROR: File not found: ${csvPath}`);
    process.exit(1);
  }

  const csvContent = fs.readFileSync(csvPath, 'utf8');
  const rows = parseCSV(csvContent);

  if (rows.length === 0) {
    console.error('❌ ERROR: CSV file is empty');
    process.exit(1);
  }

  // Parse header
  const header = rows[0];
  const typeIdx = header.indexOf('Type');
  const objectIdx = header.indexOf('Object(s)');
  const eventsIdx = header.indexOf('Trigger Events');
  const nameIdx = header.indexOf('Name');

  if (typeIdx === -1 || objectIdx === -1 || eventsIdx === -1) {
    console.error('❌ ERROR: Required columns not found in CSV');
    console.error(`   Found columns: ${header.join(', ')}`);
    process.exit(1);
  }

  // Validate Flow rows
  let totalFlows = 0;
  let badFlows = 0;
  const badRows = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row.length) continue;

    const type = (row[typeIdx] || '').trim();
    if (type !== 'Flow') continue;

    totalFlows++;

    const objectValue = (row[objectIdx] || '').trim();
    const eventsValue = (row[eventsIdx] || '').trim();
    const name = row[nameIdx] || `Row ${i + 1}`;

    const isMissing = !objectValue || objectValue === 'N/A' || !eventsValue || eventsValue === 'N/A';

    if (isMissing) {
      badFlows++;
      badRows.push({
        row: i + 1,
        name: name,
        object: objectValue,
        events: eventsValue
      });
    }
  }

  // Report results
  console.log('');
  console.log('═══════════════════════════════════════════════');
  console.log('  Flow Trigger Column Validation Results');
  console.log('═══════════════════════════════════════════════');
  console.log('');
  console.log(`CSV File: ${csvPath}`);
  console.log(`Total Flow Rows: ${totalFlows}`);
  console.log('');

  if (badFlows === 0) {
    console.log('✅ PASS: All Flow rows have complete trigger metadata');
    console.log('');
    console.log('Validation Details:');
    console.log(`  - ${totalFlows} Flow rows checked`);
    console.log(`  - ${totalFlows} rows with Object(s) populated`);
    console.log(`  - ${totalFlows} rows with Trigger Events populated`);
    console.log('');
    process.exit(0);
  } else {
    console.log(`❌ FAIL: ${badFlows}/${totalFlows} Flow rows missing trigger metadata`);
    console.log('');
    console.log('Failed Rows (showing first 20):');
    console.log('');

    badRows.slice(0, 20).forEach(bad => {
      console.log(`Row ${bad.row}:`);
      console.log(`  Name:           ${bad.name}`);
      console.log(`  Object(s):      "${bad.object}" ${!bad.object || bad.object === 'N/A' ? '❌' : '✅'}`);
      console.log(`  Trigger Events: "${bad.events}" ${!bad.events || bad.events === 'N/A' ? '❌' : '✅'}`);
      console.log('');
    });

    if (badRows.length > 20) {
      console.log(`... and ${badRows.length - 20} more failed rows`);
      console.log('');
    }

    console.log('Recommendation:');
    console.log('  Check that Flow metadata extraction is working correctly.');
    console.log('  Verify _metadata.triggerInfo fallback is implemented in CSV generation.');
    console.log('');

    process.exit(1);
  }
}

// CLI execution
if (require.main === module) {
  const csvPath = process.argv[2];

  if (!csvPath) {
    console.log('Usage: node validate-flow-trigger-columns.js <path-to-csv>');
    console.log('');
    console.log('Example:');
    console.log('  node validate-flow-trigger-columns.js output/Master_Automation_Inventory.csv');
    console.log('');
    process.exit(1);
  }

  validateFlowTriggerColumns(csvPath);
}

module.exports = { validateFlowTriggerColumns, parseCSV };
