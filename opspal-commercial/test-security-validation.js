/**
 * Test the security validation patterns added to fix command injection
 */

// Test patterns from various files
const testCases = [
    // API Name pattern tests
    { pattern: /^[a-zA-Z][a-zA-Z0-9_]{0,39}$/, input: 'Account', expected: true, name: 'Valid API name' },
    { pattern: /^[a-zA-Z][a-zA-Z0-9_]{0,39}$/, input: 'My_Custom_Object__c', expected: true, name: 'Custom object name' },
    { pattern: /^[a-zA-Z][a-zA-Z0-9_]{0,39}$/, input: '123Invalid', expected: false, name: 'Starts with number' },
    { pattern: /^[a-zA-Z][a-zA-Z0-9_]{0,39}$/, input: 'Has Space', expected: false, name: 'Contains space' },
    { pattern: /^[a-zA-Z][a-zA-Z0-9_]{0,39}$/, input: 'Has;Semicolon', expected: false, name: 'Contains semicolon' },
    { pattern: /^[a-zA-Z][a-zA-Z0-9_]{0,39}$/, input: "Quotes'Injection", expected: false, name: 'SQL injection attempt' },
    { pattern: /^[a-zA-Z][a-zA-Z0-9_]{0,39}$/, input: 'rm -rf /', expected: false, name: 'Command injection attempt' },

    // Org Alias pattern tests
    { pattern: /^[a-zA-Z0-9_-]{1,64}$/, input: 'my-org', expected: true, name: 'Valid org alias with hyphen' },
    { pattern: /^[a-zA-Z0-9_-]{1,64}$/, input: 'prod_org_2024', expected: true, name: 'Valid org alias with underscore' },
    { pattern: /^[a-zA-Z0-9_-]{1,64}$/, input: '', expected: false, name: 'Empty org alias' },
    { pattern: /^[a-zA-Z0-9_-]{1,64}$/, input: 'org; rm -rf /', expected: false, name: 'Org alias with command injection' },
    { pattern: /^[a-zA-Z0-9_-]{1,64}$/, input: 'org$(whoami)', expected: false, name: 'Org alias with command substitution' },
    { pattern: /^[a-zA-Z0-9_-]{1,64}$/, input: 'org`id`', expected: false, name: 'Org alias with backticks' },

    // Event list pattern tests
    { pattern: /^[a-zA-Z_,]+$/, input: 'before_insert,after_insert', expected: true, name: 'Valid event list' },
    { pattern: /^[a-zA-Z_,]+$/, input: 'before_insert;rm -rf /', expected: false, name: 'Event list with injection' },

    // Salesforce ID pattern tests
    { pattern: /^[a-zA-Z0-9]{15}([a-zA-Z0-9]{3})?$/, input: '001000000000001', expected: true, name: 'Valid 15-char SF ID' },
    { pattern: /^[a-zA-Z0-9]{15}([a-zA-Z0-9]{3})?$/, input: '001000000000001AAA', expected: true, name: 'Valid 18-char SF ID' },
    { pattern: /^[a-zA-Z0-9]{15}([a-zA-Z0-9]{3})?$/, input: 'not-an-id', expected: false, name: 'Invalid SF ID' },
];

let passed = 0;
let failed = 0;

console.log('Security Validation Pattern Tests');
console.log('==================================\n');

for (const test of testCases) {
    const result = test.pattern.test(test.input);
    const status = result === test.expected;

    if (status) {
        passed++;
        console.log(`✅ ${test.name}: "${test.input}" → ${result}`);
    } else {
        failed++;
        console.log(`❌ ${test.name}: "${test.input}" → expected ${test.expected}, got ${result}`);
    }
}

console.log('\n========================================');
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log('========================================');

process.exit(failed > 0 ? 1 : 0);
