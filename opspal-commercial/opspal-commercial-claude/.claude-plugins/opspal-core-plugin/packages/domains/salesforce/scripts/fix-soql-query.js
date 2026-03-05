#!/usr/bin/env node

/**
 * Quick SOQL Query Fixer
 * Fixes common SOQL syntax errors before execution
 */

function fixSOQLQuery(query) {
    let fixed = query;
    
    // 1. Fix quoted dates (ISO format dates should not be quoted)
    // Matches patterns like: CloseDate = '2025-10-28'
    fixed = fixed.replace(/(\w*Date\w*)\s*([=!<>]+)\s*'(\d{4}-\d{2}-\d{2})'/g, '$1 $2 $3');
    
    // 2. Fix datetime values (should not be quoted)
    // Matches patterns like: CreatedDate = '2025-01-01T00:00:00.000Z'
    fixed = fixed.replace(/(\w*Date\w*)\s*([=!<>]+)\s*'(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z?)'/g, '$1 $2 $3');
    
    // 3. Fix escaped operators (bash escape issues)
    fixed = fixed.replace(/\\\!/g, '!');
    fixed = fixed.replace(/\\=/g, '=');
    fixed = fixed.replace(/\\</g, '<');
    fixed = fixed.replace(/\\>/g, '>');
    
    // 4. Fix null comparisons (should use IS NULL or IS NOT NULL in SOQL)
    fixed = fixed.replace(/(\w+)\s*!=\s*null/gi, '$1 != null');
    fixed = fixed.replace(/(\w+)\s*=\s*null/gi, '$1 = null');
    
    // 5. Fix reserved keyword aliases
    const reservedKeywords = ['count', 'sum', 'avg', 'max', 'min', 'group', 'order', 'limit', 'offset'];
    reservedKeywords.forEach(keyword => {
        const regex = new RegExp(`\\bCOUNT\\(([^)]+)\\)\\s+${keyword}\\b`, 'gi');
        fixed = fixed.replace(regex, `COUNT($1) ${keyword}Count`);
        
        const sumRegex = new RegExp(`\\bSUM\\(([^)]+)\\)\\s+${keyword}\\b`, 'gi');
        fixed = fixed.replace(sumRegex, `SUM($1) ${keyword}Sum`);
    });
    
    return fixed;
}

// If called directly from command line
if (require.main === module) {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        console.log('Usage: fix-soql-query.js "YOUR SOQL QUERY"');
        console.log('   or: echo "YOUR QUERY" | fix-soql-query.js');
        process.exit(1);
    }
    
    const query = args.join(' ');
    const fixed = fixSOQLQuery(query);
    
    if (query !== fixed) {
        console.error('Original:', query);
        console.error('Fixed:   ', fixed);
    }
    
    // Output the fixed query for piping
    console.log(fixed);
}

module.exports = { fixSOQLQuery };