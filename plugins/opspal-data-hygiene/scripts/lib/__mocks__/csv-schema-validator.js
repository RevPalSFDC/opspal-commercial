/**
 * Mock for salesforce-plugin's CSV schema validator
 * Used in tests to avoid cross-plugin dependency issues
 */

class RobustCSVParser {
    constructor() {
        this.records = [];
    }

    generate(records, options = {}) {
        if (!records || records.length === 0) {
            return '';
        }

        // Generate simple CSV from records
        const headers = Object.keys(records[0]);
        const headerRow = headers.join(',');
        const dataRows = records.map(record =>
            headers.map(h => {
                const val = record[h];
                if (val === null || val === undefined) return '';
                const strVal = String(val);
                // Escape if contains comma, quote, or newline
                if (strVal.includes(',') || strVal.includes('"') || strVal.includes('\n')) {
                    return '"' + strVal.replace(/"/g, '""') + '"';
                }
                return strVal;
            }).join(',')
        );

        return [headerRow, ...dataRows].join('\n');
    }
}

module.exports = { RobustCSVParser };
