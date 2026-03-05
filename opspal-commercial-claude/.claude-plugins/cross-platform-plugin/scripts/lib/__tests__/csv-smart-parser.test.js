/**
 * CSV Smart Parser Tests
 */

const { CSVSmartParser, SalesforceAliases } = require('../csv-smart-parser.js');

describe('CSVSmartParser', () => {
    let parser;

    beforeEach(() => {
        parser = new CSVSmartParser({ verbose: false });
    });

    describe('Basic Parsing', () => {
        test('should parse simple CSV', () => {
            const csv = 'Name,Email,Age\nJohn,john@test.com,30\nJane,jane@test.com,25';
            const result = parser.parse(csv);

            expect(result.success).toBe(true);
            expect(result.data.length).toBe(2);
            expect(result.headers).toEqual(['Name', 'Email', 'Age']);
        });

        test('should handle empty CSV', () => {
            const result = parser.parse('');

            expect(result.success).toBe(true);
            expect(result.data.length).toBe(0);
        });

        test('should handle header-only CSV', () => {
            const csv = 'Name,Email,Age';
            const result = parser.parse(csv);

            expect(result.success).toBe(true);
            expect(result.data.length).toBe(0);
            expect(result.headers).toEqual(['Name', 'Email', 'Age']);
        });

        test('should skip empty lines', () => {
            const csv = 'Name,Age\nJohn,30\n\nJane,25\n';
            const result = parser.parse(csv);

            expect(result.data.length).toBe(2);
            expect(result.stats.skippedRows).toBe(1);
        });

        test('should not skip empty lines when configured', () => {
            parser = new CSVSmartParser({ skipEmptyLines: false });
            const csv = 'Name,Age\nJohn,30\n\nJane,25';
            const result = parser.parse(csv);

            expect(result.data.length).toBe(3);
        });
    });

    describe('Quoted Fields', () => {
        test('should parse quoted fields', () => {
            const csv = 'Name,Description\nJohn,"A description with, comma"';
            const result = parser.parse(csv);

            expect(result.data[0].Description).toBe('A description with, comma');
        });

        test('should handle escaped quotes', () => {
            const csv = 'Name,Quote\nJohn,"He said ""Hello"""';
            const result = parser.parse(csv);

            expect(result.data[0].Quote).toBe('He said "Hello"');
        });

        test('should handle multiline quoted fields', () => {
            const csv = 'Name,Description\nJohn,"Line 1\nLine 2"';
            const result = parser.parse(csv);

            expect(result.data[0].Description).toBe('Line 1\nLine 2');
        });

        test('should detect unterminated quotes in strict mode', () => {
            parser = new CSVSmartParser({ strictMode: true });
            const csv = 'Name,Description\nJohn,"Unterminated';

            expect(() => parser.parse(csv)).toThrow('Unterminated quoted field');
        });
    });

    describe('Line Endings', () => {
        test('should handle Windows line endings (CRLF)', () => {
            const csv = 'Name,Age\r\nJohn,30\r\nJane,25';
            const result = parser.parse(csv);

            expect(result.data.length).toBe(2);
        });

        test('should handle old Mac line endings (CR)', () => {
            const csv = 'Name,Age\rJohn,30\rJane,25';
            const result = parser.parse(csv);

            expect(result.data.length).toBe(2);
        });

        test('should handle mixed line endings', () => {
            const csv = 'Name,Age\nJohn,30\r\nJane,25\rBob,35';
            const result = parser.parse(csv);

            expect(result.data.length).toBe(3);
        });
    });

    describe('Header-Based Access', () => {
        test('should access values by column name', () => {
            const csv = 'Name,Email,Age\nJohn,john@test.com,30';
            const result = parser.parse(csv);

            expect(result.data[0].Name).toBe('John');
            expect(result.data[0].Email).toBe('john@test.com');
            expect(result.data[0].Age).toBe('30');
        });

        test('should access values case-insensitively', () => {
            const csv = 'First Name,Last Name\nJohn,Doe';
            const result = parser.parse(csv);

            // Original case
            expect(result.data[0]['First Name']).toBe('John');
            // Normalized case
            expect(result.data[0]['first_name']).toBe('John');
        });

        test('should get column index by name', () => {
            const csv = 'Name,Email,Age\nJohn,john@test.com,30';
            parser.parse(csv);

            expect(parser.getColumnIndex('Name')).toBe(0);
            expect(parser.getColumnIndex('Email')).toBe(1);
            expect(parser.getColumnIndex('age')).toBe(2); // Case insensitive
        });

        test('should check if column exists', () => {
            const csv = 'Name,Email\nJohn,john@test.com';
            parser.parse(csv);

            expect(parser.hasColumn('Name')).toBe(true);
            expect(parser.hasColumn('name')).toBe(true);
            expect(parser.hasColumn('Phone')).toBe(false);
        });
    });

    describe('Column Aliases', () => {
        test('should support column aliases', () => {
            parser = new CSVSmartParser({
                columnAliases: {
                    'account': 'AccountName',
                    'acct_id': 'AccountId'
                }
            });

            const csv = 'AccountName,AccountId\nAcme,001xxx';
            const result = parser.parse(csv);

            expect(parser.getValue(result.data[0], 'account')).toBe('Acme');
            expect(parser.getValue(result.data[0], 'acct_id')).toBe('001xxx');
        });

        test('should use Salesforce aliases', () => {
            parser = new CSVSmartParser({
                columnAliases: SalesforceAliases
            });

            const csv = 'Account Name,Amount,CloseDate\nAcme,10000,2025-01-01';
            const result = parser.parse(csv);

            expect(parser.getValue(result.data[0], 'account')).toBe('Acme');
            expect(parser.getValue(result.data[0], 'close_date')).toBe('2025-01-01');
        });
    });

    describe('Required Columns', () => {
        test('should validate required columns exist', () => {
            parser = new CSVSmartParser({
                requiredColumns: ['Name', 'Email']
            });

            const csv = 'Name,Email,Age\nJohn,john@test.com,30';
            const result = parser.parse(csv);

            expect(result.success).toBe(true);
        });

        test('should fail in strict mode when required columns missing', () => {
            parser = new CSVSmartParser({
                requiredColumns: ['Name', 'Phone'],
                strictMode: true
            });

            const csv = 'Name,Email\nJohn,john@test.com';

            expect(() => parser.parse(csv)).toThrow('Missing required columns: Phone');
        });

        test('should record error but continue when not strict', () => {
            parser = new CSVSmartParser({
                requiredColumns: ['Name', 'Phone']
            });

            const csv = 'Name,Email\nJohn,john@test.com';
            const result = parser.parse(csv);

            expect(result.success).toBe(true);
            expect(result.stats.errors.length).toBe(1);
            expect(result.stats.errors[0].type).toBe('missing_columns');
        });
    });

    describe('getValue Helper', () => {
        test('should get value with default', () => {
            const csv = 'Name,Age\nJohn,30';
            const result = parser.parse(csv);

            expect(parser.getValue(result.data[0], 'Name')).toBe('John');
            expect(parser.getValue(result.data[0], 'Phone', 'N/A')).toBe('N/A');
        });

        test('should handle case variations', () => {
            const csv = 'First Name,Last Name\nJohn,Doe';
            const result = parser.parse(csv);

            expect(parser.getValue(result.data[0], 'First Name')).toBe('John');
            expect(parser.getValue(result.data[0], 'first_name')).toBe('John');
            expect(parser.getValue(result.data[0], 'FIRST_NAME')).toBe('John');
        });
    });

    describe('Data Transformation', () => {
        test('should transform data with mapping', () => {
            const csv = 'First,Last,Years\nJohn,Doe,30';
            const result = parser.parse(csv);

            const transformed = parser.transform(result.data, {
                fullName: (row) => `${row.First} ${row.Last}`,
                age: 'Years'
            });

            expect(transformed[0].fullName).toBe('John Doe');
            expect(transformed[0].age).toBe('30');
        });

        test('should filter data', () => {
            const csv = 'Name,Age\nJohn,30\nJane,25\nBob,35';
            const result = parser.parse(csv);

            const filtered = parser.filter(result.data, row => parseInt(row.Age) >= 30);

            expect(filtered.length).toBe(2);
            expect(filtered[0].Name).toBe('John');
            expect(filtered[1].Name).toBe('Bob');
        });
    });

    describe('Data Validation', () => {
        test('should validate required fields', () => {
            const csv = 'Name,Email\nJohn,john@test.com\n,jane@test.com';
            const result = parser.parse(csv);

            const validation = parser.validate(result.data, {
                Name: { required: true }
            });

            expect(validation.valid).toBe(false);
            expect(validation.validRows).toBe(1);
            expect(validation.invalidRows).toBe(1);
        });

        test('should validate types', () => {
            const csv = 'Name,Age,Email\nJohn,thirty,john@test.com\nJane,25,jane@test.com';
            const result = parser.parse(csv);

            const validation = parser.validate(result.data, {
                Age: { type: 'number' }
            });

            expect(validation.valid).toBe(false);
            expect(validation.errors[0].errors[0].rule).toBe('type');
        });

        test('should validate patterns', () => {
            const csv = 'Id,Name\n001xxx,John\nabc,Jane';
            const result = parser.parse(csv);

            const validation = parser.validate(result.data, {
                Id: { pattern: '^[0-9]{3}' }
            });

            expect(validation.valid).toBe(false);
            expect(validation.validRows).toBe(1);
        });

        test('should validate Salesforce IDs', () => {
            const csv = 'AccountId,Name\n001000000000001AAA,Acme\ninvalid,Test';
            const result = parser.parse(csv);

            const validation = parser.validate(result.data, {
                AccountId: { type: 'salesforce_id' }
            });

            expect(validation.valid).toBe(false);
            expect(validation.validRows).toBe(1);
        });

        test('should validate email format', () => {
            const csv = 'Name,Email\nJohn,john@test.com\nJane,invalid-email';
            const result = parser.parse(csv);

            const validation = parser.validate(result.data, {
                Email: { type: 'email' }
            });

            expect(validation.valid).toBe(false);
            expect(validation.validRows).toBe(1);
        });

        test('should support custom validators', () => {
            const csv = 'Name,Amount\nJohn,100\nJane,-50';
            const result = parser.parse(csv);

            const validation = parser.validate(result.data, {
                Amount: {
                    validate: (value) => parseFloat(value) > 0 || 'Amount must be positive'
                }
            });

            expect(validation.valid).toBe(false);
            expect(validation.errors[0].errors[0].message).toBe('Amount must be positive');
        });
    });

    describe('CSV Export', () => {
        test('should convert data back to CSV', () => {
            const csv = 'Name,Age\nJohn,30\nJane,25';
            const result = parser.parse(csv);

            const exported = parser.toCSV(result.data);
            const lines = exported.split('\n');

            expect(lines.length).toBe(3);
            expect(lines[0]).toBe('Name,Age');
        });

        test('should escape fields in output', () => {
            const csv = 'Name,Description\nJohn,"Has, comma"';
            const result = parser.parse(csv);

            const exported = parser.toCSV(result.data);

            expect(exported).toContain('"Has, comma"');
        });

        test('should select specific columns', () => {
            const csv = 'Name,Email,Age\nJohn,john@test.com,30';
            const result = parser.parse(csv);

            const exported = parser.toCSV(result.data, ['Name', 'Age']);
            const lines = exported.split('\n');

            expect(lines[0]).toBe('Name,Age');
            expect(lines[1]).toBe('John,30');
        });
    });

    describe('Statistics', () => {
        test('should track parsing statistics', () => {
            const csv = 'Name,Age\nJohn,30\n\nJane,25\nBob,35';
            const result = parser.parse(csv);

            expect(result.stats.totalRows).toBe(4);
            expect(result.stats.parsedRows).toBe(3);
            expect(result.stats.skippedRows).toBe(1);
        });

        test('should include line numbers in rows', () => {
            const csv = 'Name,Age\nJohn,30\nJane,25';
            const result = parser.parse(csv);

            expect(result.data[0]._lineNumber).toBe(2);
            expect(result.data[1]._lineNumber).toBe(3);
        });
    });

    describe('Custom Delimiters', () => {
        test('should support tab delimiter', () => {
            parser = new CSVSmartParser({ delimiter: '\t' });
            const tsv = 'Name\tAge\nJohn\t30';
            const result = parser.parse(tsv);

            expect(result.data[0].Name).toBe('John');
            expect(result.data[0].Age).toBe('30');
        });

        test('should support semicolon delimiter', () => {
            parser = new CSVSmartParser({ delimiter: ';' });
            const csv = 'Name;Age\nJohn;30';
            const result = parser.parse(csv);

            expect(result.data[0].Name).toBe('John');
        });

        test('should support pipe delimiter', () => {
            parser = new CSVSmartParser({ delimiter: '|' });
            const csv = 'Name|Age\nJohn|30';
            const result = parser.parse(csv);

            expect(result.data[0].Name).toBe('John');
        });
    });

    describe('Field Trimming', () => {
        test('should trim fields by default', () => {
            const csv = 'Name,Age\n  John  ,  30  ';
            const result = parser.parse(csv);

            expect(result.data[0].Name).toBe('John');
            expect(result.data[0].Age).toBe('30');
        });

        test('should preserve whitespace when configured', () => {
            parser = new CSVSmartParser({ trimFields: false });
            const csv = 'Name,Age\n  John  ,30';
            const result = parser.parse(csv);

            expect(result.data[0].Name).toBe('  John  ');
        });
    });

    describe('Edge Cases', () => {
        test('should handle missing values', () => {
            const csv = 'A,B,C\n1,,3';
            const result = parser.parse(csv);

            expect(result.data[0].A).toBe('1');
            expect(result.data[0].B).toBe('');
            expect(result.data[0].C).toBe('3');
        });

        test('should handle fewer columns than headers', () => {
            const csv = 'A,B,C\n1,2';
            const result = parser.parse(csv);

            expect(result.data[0].C).toBe(null);
        });

        test('should handle more columns than headers', () => {
            const csv = 'A,B\n1,2,3';
            const result = parser.parse(csv);

            expect(result.data[0]._raw).toEqual(['1', '2', '3']);
        });

        test('should handle special characters in headers', () => {
            const csv = 'First Name,Email Address,Phone #\nJohn,john@test.com,555-1234';
            const result = parser.parse(csv);

            expect(result.data[0]['First Name']).toBe('John');
            expect(result.data[0]['Phone #']).toBe('555-1234');
        });

        test('should handle unicode content', () => {
            const csv = 'Name,City\n田中,東京\nSmith,München';
            const result = parser.parse(csv);

            expect(result.data[0].Name).toBe('田中');
            expect(result.data[0].City).toBe('東京');
            expect(result.data[1].City).toBe('München');
        });
    });

    describe('getColumns', () => {
        test('should return column list', () => {
            const csv = 'Name,Email,Age\nJohn,john@test.com,30';
            parser.parse(csv);

            const columns = parser.getColumns();

            expect(columns).toEqual(['Name', 'Email', 'Age']);
        });
    });
});
