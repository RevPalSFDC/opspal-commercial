/**
 * Script Deduplication Analyzer Tests
 */

const { ScriptDedupAnalyzer } = require('../script-dedup-analyzer.js');
const fs = require('fs');
const path = require('path');

// Mock fs module
jest.mock('fs');

describe('ScriptDedupAnalyzer', () => {
    let analyzer;

    beforeEach(() => {
        analyzer = new ScriptDedupAnalyzer({ verbose: false });
        jest.clearAllMocks();
    });

    describe('Constructor', () => {
        test('should initialize with default options', () => {
            const a = new ScriptDedupAnalyzer();
            expect(a.verbose).toBe(true);
            expect(a.similarityThreshold).toBe(0.7);
            expect(a.minLineCount).toBe(10);
            expect(a.extensions).toContain('.js');
            expect(a.ignorePatterns).toContain('node_modules');
        });

        test('should accept custom options', () => {
            const a = new ScriptDedupAnalyzer({
                verbose: false,
                similarityThreshold: 0.8,
                minLineCount: 5,
                extensions: ['.ts'],
                ignorePatterns: ['dist']
            });

            expect(a.verbose).toBe(false);
            expect(a.similarityThreshold).toBe(0.8);
            expect(a.minLineCount).toBe(5);
            expect(a.extensions).toEqual(['.ts']);
            expect(a.ignorePatterns).toEqual(['dist']);
        });
    });

    describe('analyze', () => {
        test('should throw error for non-existent directory', async () => {
            fs.existsSync.mockReturnValue(false);

            await expect(analyzer.analyze('/nonexistent'))
                .rejects.toThrow('Directory not found');
        });

        test('should return empty results for directory with no scripts', async () => {
            fs.existsSync.mockReturnValue(true);
            fs.readdirSync.mockReturnValue([]);

            const result = await analyzer.analyze('/empty');

            expect(result.summary.scriptsAnalyzed).toBe(0);
            expect(result.duplicates).toEqual([]);
            expect(result.patterns).toEqual([]);
        });

        test('should analyze scripts in directory', async () => {
            fs.existsSync.mockReturnValue(true);
            fs.readdirSync.mockImplementation((dir) => {
                if (dir === '/project') {
                    return [
                        { name: 'script1.js', isDirectory: () => false, isFile: () => true },
                        { name: 'script2.js', isDirectory: () => false, isFile: () => true }
                    ];
                }
                return [];
            });
            fs.readFileSync.mockImplementation((filePath) => {
                if (filePath.includes('script1')) {
                    return `function test() {
    const a = 1;
    const b = 2;
    const c = 3;
    const d = 4;
    const e = 5;
    const f = 6;
    const g = 7;
    const h = 8;
    const i = 9;
    return a + b;
}`;
                }
                return `function other() {
    const x = 1;
    const y = 2;
    const z = 3;
    const w = 4;
    const v = 5;
    const u = 6;
    const t = 7;
    const s = 8;
    const r = 9;
    return x + y;
}`;
            });

            const result = await analyzer.analyze('/project');

            expect(result.summary.scriptsAnalyzed).toBe(2);
            expect(result.scripts.length).toBe(2);
        });

        test('should skip files in ignored directories', async () => {
            fs.existsSync.mockReturnValue(true);
            fs.readdirSync.mockImplementation((dir) => {
                if (dir === '/project') {
                    return [
                        { name: 'node_modules', isDirectory: () => true, isFile: () => false },
                        { name: 'script.js', isDirectory: () => false, isFile: () => true }
                    ];
                }
                return [];
            });
            fs.readFileSync.mockReturnValue('// 10+ line content\n'.repeat(15));

            const result = await analyzer.analyze('/project');

            // Should only analyze script.js, not node_modules
            expect(result.summary.scriptsAnalyzed).toBe(1);
        });

        test('should skip files below minLineCount', async () => {
            fs.existsSync.mockReturnValue(true);
            fs.readdirSync.mockReturnValue([
                { name: 'short.js', isDirectory: () => false, isFile: () => true }
            ]);
            fs.readFileSync.mockReturnValue('const x = 1;');

            const result = await analyzer.analyze('/project');

            expect(result.summary.scriptsAnalyzed).toBe(0);
        });
    });

    describe('findDuplicates', () => {
        test('should detect exact duplicates', async () => {
            const content = `function test() {
    const a = 1;
    const b = 2;
    const c = 3;
    const d = 4;
    const e = 5;
    const f = 6;
    const g = 7;
    const h = 8;
    const i = 9;
    return a + b;
}`;

            fs.existsSync.mockReturnValue(true);
            fs.readdirSync.mockReturnValue([
                { name: 'script1.js', isDirectory: () => false, isFile: () => true },
                { name: 'script2.js', isDirectory: () => false, isFile: () => true }
            ]);
            fs.readFileSync.mockReturnValue(content);

            const result = await analyzer.analyze('/project');

            expect(result.duplicates.length).toBeGreaterThan(0);
            expect(result.duplicates[0].type).toBe('exact');
            expect(result.duplicates[0].similarity).toBe(1.0);
        });

        test('should detect similar scripts above threshold', async () => {
            fs.existsSync.mockReturnValue(true);
            fs.readdirSync.mockReturnValue([
                { name: 'script1.js', isDirectory: () => false, isFile: () => true },
                { name: 'script2.js', isDirectory: () => false, isFile: () => true }
            ]);
            fs.readFileSync.mockImplementation((filePath) => {
                if (filePath.includes('script1')) {
                    return `function process() {
    const data = fetch();
    const result = transform(data);
    save(result);
    log("Done");
    return true;
    // padding
    // padding
    // padding
    // padding
}`;
                }
                return `function process() {
    const data = fetch();
    const result = transform(data);
    save(result);
    notify("Done");
    return false;
    // padding
    // padding
    // padding
    // padding
}`;
            });

            analyzer.similarityThreshold = 0.5;
            const result = await analyzer.analyze('/project');

            // Should find similar but not exact
            const similar = result.duplicates.filter(d => d.type === 'similar');
            expect(similar.length).toBeGreaterThan(0);
        });

        test('should not flag scripts below threshold', async () => {
            fs.existsSync.mockReturnValue(true);
            fs.readdirSync.mockReturnValue([
                { name: 'script1.js', isDirectory: () => false, isFile: () => true },
                { name: 'script2.js', isDirectory: () => false, isFile: () => true }
            ]);
            fs.readFileSync.mockImplementation((filePath) => {
                if (filePath.includes('script1')) {
                    return `function alpha() {
    const a = 1;
    const b = 2;
    const c = 3;
    processAlpha();
    runAlpha();
    executeAlpha();
    const d = 4;
    const e = 5;
    const f = 6;
}`;
                }
                return `function omega() {
    const x = 100;
    const y = 200;
    const z = 300;
    processOmega();
    runOmega();
    executeOmega();
    const w = 400;
    const v = 500;
    const u = 600;
}`;
            });

            analyzer.similarityThreshold = 0.9;
            const result = await analyzer.analyze('/project');

            // Very different scripts should not be flagged
            expect(result.duplicates.length).toBe(0);
        });
    });

    describe('detectPatterns', () => {
        test('should detect duplicated functions', async () => {
            const func = `function helper() {
    return 42;
}`;

            fs.existsSync.mockReturnValue(true);
            fs.readdirSync.mockReturnValue([
                { name: 'script1.js', isDirectory: () => false, isFile: () => true },
                { name: 'script2.js', isDirectory: () => false, isFile: () => true }
            ]);
            fs.readFileSync.mockImplementation((filePath) => {
                const base = filePath.includes('script1') ? 'first' : 'second';
                return `// ${base} file
${func}
function ${base}Main() {
    return helper();
}
// padding
// padding
// padding
// padding
// padding
`;
            });

            const result = await analyzer.analyze('/project');

            expect(result.patterns.length).toBeGreaterThan(0);
            expect(result.patterns[0].type).toBe('duplicated_function');
            expect(result.patterns[0].name).toBe('helper');
            expect(result.patterns[0].occurrences).toBe(2);
        });
    });

    describe('generateRecommendations', () => {
        test('should recommend consolidating exact duplicates', async () => {
            const content = `function test() {
    const a = 1;
    const b = 2;
    const c = 3;
    const d = 4;
    const e = 5;
    const f = 6;
    const g = 7;
    const h = 8;
    const i = 9;
    return a + b;
}`;

            fs.existsSync.mockReturnValue(true);
            fs.readdirSync.mockReturnValue([
                { name: 'script1.js', isDirectory: () => false, isFile: () => true },
                { name: 'script2.js', isDirectory: () => false, isFile: () => true }
            ]);
            fs.readFileSync.mockReturnValue(content);

            const result = await analyzer.analyze('/project');

            const consolidateRec = result.recommendations.find(r => r.type === 'consolidate_duplicates');
            expect(consolidateRec).toBeDefined();
            expect(consolidateRec.priority).toBe('HIGH');
        });

        test('should recommend extracting common functions', async () => {
            // Need a function with enough lines that savings >= 20
            // With 3 occurrences and 15 lines, savings = 15 * (3-1) = 30
            const commonFunc = `function sharedHelper() {
    const result = [];
    for (let i = 0; i < 10; i++) {
        result.push(i * 2);
    }
    for (let j = 0; j < 5; j++) {
        result.push(j * 3);
    }
    const final = result.filter(x => x > 0);
    console.log(final);
    return final;
}`;

            fs.existsSync.mockReturnValue(true);
            fs.readdirSync.mockReturnValue([
                { name: 'script1.js', isDirectory: () => false, isFile: () => true },
                { name: 'script2.js', isDirectory: () => false, isFile: () => true },
                { name: 'script3.js', isDirectory: () => false, isFile: () => true }
            ]);
            fs.readFileSync.mockImplementation((filePath) => {
                const idx = filePath.match(/script(\d)/)[1];
                return `// Script ${idx}
${commonFunc}
function main${idx}() {
    return sharedHelper();
}
// Extra lines to meet minimum
// line count requirement
// padding line 1
// padding line 2
`;
            });

            const result = await analyzer.analyze('/project');

            const extractRec = result.recommendations.find(r => r.type === 'extract_utilities');
            expect(extractRec).toBeDefined();
            expect(extractRec.priority).toBe('MEDIUM');
        });
    });

    describe('_checkNamingConventions', () => {
        test('should flag copy/backup indicators', async () => {
            fs.existsSync.mockReturnValue(true);
            fs.readdirSync.mockReturnValue([
                { name: 'script_copy.js', isDirectory: () => false, isFile: () => true },
                { name: 'script_backup.js', isDirectory: () => false, isFile: () => true },
                { name: 'script_v2.js', isDirectory: () => false, isFile: () => true }
            ]);
            fs.readFileSync.mockReturnValue('// 10+ lines\n'.repeat(15));

            const result = await analyzer.analyze('/project');

            const namingRec = result.recommendations.find(r => r.type === 'naming_conventions');
            expect(namingRec).toBeDefined();
            expect(namingRec.issues.length).toBeGreaterThan(0);
        });

        test('should flag duplicate filenames in different directories', async () => {
            fs.existsSync.mockReturnValue(true);
            fs.readdirSync.mockImplementation((dir) => {
                if (dir === '/project') {
                    return [
                        { name: 'src', isDirectory: () => true, isFile: () => false },
                        { name: 'lib', isDirectory: () => true, isFile: () => false }
                    ];
                }
                if (dir === '/project/src') {
                    return [{ name: 'utils.js', isDirectory: () => false, isFile: () => true }];
                }
                if (dir === '/project/lib') {
                    return [{ name: 'utils.js', isDirectory: () => false, isFile: () => true }];
                }
                return [];
            });
            fs.readFileSync.mockReturnValue('// 10+ lines\n'.repeat(15));

            const result = await analyzer.analyze('/project');

            const namingRec = result.recommendations.find(r => r.type === 'naming_conventions');
            expect(namingRec).toBeDefined();
            expect(namingRec.issues.some(i => i.issue.includes('Same filename'))).toBe(true);
        });
    });

    describe('_calculateSimilarity', () => {
        test('should return 1.0 for identical scripts', () => {
            const script1 = { tokens: ['function', 'test', 'return', 'true'] };
            const script2 = { tokens: ['function', 'test', 'return', 'true'] };

            const similarity = analyzer._calculateSimilarity(script1, script2);

            expect(similarity).toBe(1.0);
        });

        test('should return 0.0 for completely different scripts', () => {
            const script1 = { tokens: ['alpha', 'beta', 'gamma'] };
            const script2 = { tokens: ['delta', 'epsilon', 'zeta'] };

            const similarity = analyzer._calculateSimilarity(script1, script2);

            expect(similarity).toBe(0.0);
        });

        test('should calculate partial similarity', () => {
            const script1 = { tokens: ['function', 'test', 'return', 'value'] };
            const script2 = { tokens: ['function', 'test', 'throw', 'error'] };

            const similarity = analyzer._calculateSimilarity(script1, script2);

            // 2 common tokens out of 6 unique = 0.33
            expect(similarity).toBeCloseTo(0.33, 1);
        });
    });

    describe('_normalizeContent', () => {
        test('should remove single-line comments', () => {
            const content = `const a = 1; // comment
const b = 2;`;
            const normalized = analyzer._normalizeContent(content);

            expect(normalized).not.toContain('comment');
        });

        test('should remove multi-line comments', () => {
            const content = `const a = 1;
/* multi
   line
   comment */
const b = 2;`;
            const normalized = analyzer._normalizeContent(content);

            expect(normalized).not.toContain('multi');
            expect(normalized).not.toContain('line');
        });

        test('should remove shell/python comments', () => {
            const content = `# This is a comment
echo "hello"`;
            const normalized = analyzer._normalizeContent(content);

            expect(normalized).not.toContain('This is a comment');
        });

        test('should normalize whitespace', () => {
            const content = `const   a   =   1;
    const    b = 2;`;
            const normalized = analyzer._normalizeContent(content);

            expect(normalized).not.toContain('   ');
        });
    });

    describe('_tokenize', () => {
        test('should extract identifiers', () => {
            const content = 'function testFunction() { return value; }';
            const tokens = analyzer._tokenize(content);

            expect(tokens).toContain('function');
            expect(tokens).toContain('testFunction');
            expect(tokens).toContain('return');
            expect(tokens).toContain('value');
        });

        test('should extract operators', () => {
            const content = 'const result = a + b * c;';
            const tokens = analyzer._tokenize(content);

            expect(tokens).toContain('+');
            expect(tokens).toContain('*');
            expect(tokens).toContain('=');
        });

        test('should handle empty content', () => {
            const tokens = analyzer._tokenize('');

            expect(tokens).toEqual([]);
        });
    });

    describe('_extractFunctions', () => {
        test('should extract JavaScript function declarations', () => {
            const content = `function myFunc(a, b) {
    return a + b;
}`;
            const functions = analyzer._extractFunctions(content, '.js');

            expect(functions.length).toBe(1);
            expect(functions[0].name).toBe('myFunc');
            expect(functions[0].signature).toBe('myFunc(a, b)');
        });

        test('should extract JavaScript arrow functions', () => {
            const content = `const myArrow = (x) => {
    return x * 2;
}`;
            const functions = analyzer._extractFunctions(content, '.js');

            expect(functions.length).toBe(1);
            expect(functions[0].name).toBe('myArrow');
        });

        test('should extract Python functions', () => {
            const content = `def my_func(a, b):
    result = a + b
    return result
`;
            const functions = analyzer._extractFunctions(content, '.py');

            expect(functions.length).toBe(1);
            expect(functions[0].name).toBe('my_func');
        });

        test('should extract shell functions', () => {
            const content = `my_func() {
    echo "hello"
}`;
            const functions = analyzer._extractFunctions(content, '.sh');

            expect(functions.length).toBe(1);
            expect(functions[0].name).toBe('my_func');
        });

        test('should handle content with no functions', () => {
            const content = 'const x = 1; const y = 2;';
            const functions = analyzer._extractFunctions(content, '.js');

            expect(functions.length).toBe(0);
        });
    });

    describe('_buildResult', () => {
        test('should calculate summary statistics', () => {
            analyzer.scripts = [
                { lines: 100, functions: [] },
                { lines: 200, functions: [] }
            ];
            analyzer.duplicates = [{ type: 'exact' }];
            analyzer.patterns = [{ type: 'duplicated_function' }];
            analyzer.recommendations = [{ estimatedSavings: 50 }];

            const result = analyzer._buildResult();

            expect(result.summary.scriptsAnalyzed).toBe(2);
            expect(result.summary.totalLines).toBe(300);
            expect(result.summary.duplicatesFound).toBe(1);
            expect(result.summary.patternsDetected).toBe(1);
            expect(result.summary.estimatedSavings).toBe(50);
        });

        test('should calculate savings percentage', () => {
            analyzer.scripts = [{ lines: 100, functions: [] }];
            analyzer.duplicates = [];
            analyzer.patterns = [];
            analyzer.recommendations = [{ estimatedSavings: 25 }];

            const result = analyzer._buildResult();

            expect(result.summary.savingsPercentage).toBe(25);
        });

        test('should handle zero total lines', () => {
            analyzer.scripts = [];
            analyzer.duplicates = [];
            analyzer.patterns = [];
            analyzer.recommendations = [];

            const result = analyzer._buildResult();

            expect(result.summary.savingsPercentage).toBe(0);
        });
    });

    describe('generateReport', () => {
        test('should generate JSON report', () => {
            const result = {
                summary: { scriptsAnalyzed: 5 },
                scripts: [],
                duplicates: [],
                patterns: [],
                recommendations: []
            };

            const report = analyzer.generateReport(result, 'json');
            const parsed = JSON.parse(report);

            expect(parsed.summary.scriptsAnalyzed).toBe(5);
        });

        test('should generate text report', () => {
            const result = {
                summary: {
                    scriptsAnalyzed: 5,
                    totalLines: 500,
                    duplicatesFound: 2,
                    patternsDetected: 3,
                    estimatedSavings: 100,
                    savingsPercentage: 20
                },
                scripts: [],
                duplicates: [],
                patterns: [],
                recommendations: []
            };

            const report = analyzer.generateReport(result, 'text');

            expect(report).toContain('SCRIPT DEDUPLICATION');
            expect(report).toContain('Scripts Analyzed');
            expect(report).toContain('5');
        });

        test('should generate markdown report', () => {
            const result = {
                summary: {
                    scriptsAnalyzed: 5,
                    totalLines: 500,
                    duplicatesFound: 2,
                    patternsDetected: 3,
                    estimatedSavings: 100,
                    savingsPercentage: 20
                },
                scripts: [],
                duplicates: [],
                patterns: [],
                recommendations: []
            };

            const report = analyzer.generateReport(result, 'markdown');

            expect(report).toContain('# Script Deduplication');
            expect(report).toContain('| Metric | Value |');
        });

        test('should include duplicates in text report', () => {
            const result = {
                summary: {
                    scriptsAnalyzed: 2,
                    totalLines: 200,
                    duplicatesFound: 1,
                    patternsDetected: 0,
                    estimatedSavings: 50,
                    savingsPercentage: 25
                },
                scripts: [],
                duplicates: [{
                    type: 'exact',
                    similarity: 1.0,
                    scripts: ['script1.js', 'script2.js'],
                    savings: 50
                }],
                patterns: [],
                recommendations: []
            };

            const report = analyzer.generateReport(result, 'text');

            expect(report).toContain('DUPLICATES');
            expect(report).toContain('script1.js');
            expect(report).toContain('100%');
        });

        test('should include patterns in text report', () => {
            const result = {
                summary: {
                    scriptsAnalyzed: 3,
                    totalLines: 300,
                    duplicatesFound: 0,
                    patternsDetected: 1,
                    estimatedSavings: 30,
                    savingsPercentage: 10
                },
                scripts: [],
                duplicates: [],
                patterns: [{
                    name: 'helper',
                    occurrences: 3,
                    savings: 30
                }],
                recommendations: []
            };

            const report = analyzer.generateReport(result, 'text');

            expect(report).toContain('COMMON PATTERNS');
            expect(report).toContain('helper');
            expect(report).toContain('Occurrences: 3');
        });

        test('should include recommendations in text report', () => {
            const result = {
                summary: {
                    scriptsAnalyzed: 2,
                    totalLines: 200,
                    duplicatesFound: 1,
                    patternsDetected: 0,
                    estimatedSavings: 50,
                    savingsPercentage: 25
                },
                scripts: [],
                duplicates: [],
                patterns: [],
                recommendations: [{
                    priority: 'HIGH',
                    type: 'consolidate_duplicates',
                    message: '1 exact duplicate found',
                    action: 'Remove duplicate',
                    estimatedSavings: 50
                }]
            };

            const report = analyzer.generateReport(result, 'text');

            expect(report).toContain('RECOMMENDATIONS');
            expect(report).toContain('[HIGH]');
            expect(report).toContain('Remove duplicate');
        });
    });

    describe('Edge Cases', () => {
        test('should handle file read errors gracefully', async () => {
            fs.existsSync.mockReturnValue(true);
            fs.readdirSync.mockReturnValue([
                { name: 'script.js', isDirectory: () => false, isFile: () => true }
            ]);
            fs.readFileSync.mockImplementation(() => {
                throw new Error('Permission denied');
            });

            const result = await analyzer.analyze('/project');

            expect(result.summary.scriptsAnalyzed).toBe(0);
        });

        test('should handle mixed file types', async () => {
            fs.existsSync.mockReturnValue(true);
            fs.readdirSync.mockReturnValue([
                { name: 'script.js', isDirectory: () => false, isFile: () => true },
                { name: 'script.py', isDirectory: () => false, isFile: () => true },
                { name: 'script.sh', isDirectory: () => false, isFile: () => true },
                { name: 'data.json', isDirectory: () => false, isFile: () => true }
            ]);
            fs.readFileSync.mockReturnValue('// 10+ lines\n'.repeat(15));

            const result = await analyzer.analyze('/project');

            // Should analyze .js, .py, .sh but not .json
            expect(result.summary.scriptsAnalyzed).toBe(3);
        });

        test('should handle deeply nested directories', async () => {
            fs.existsSync.mockReturnValue(true);
            fs.readdirSync.mockImplementation((dir) => {
                if (dir === '/project') {
                    return [{ name: 'a', isDirectory: () => true, isFile: () => false }];
                }
                if (dir === '/project/a') {
                    return [{ name: 'b', isDirectory: () => true, isFile: () => false }];
                }
                if (dir === '/project/a/b') {
                    return [{ name: 'script.js', isDirectory: () => false, isFile: () => true }];
                }
                return [];
            });
            fs.readFileSync.mockReturnValue('// 10+ lines\n'.repeat(15));

            const result = await analyzer.analyze('/project');

            expect(result.summary.scriptsAnalyzed).toBe(1);
            expect(result.scripts[0].path).toContain('a');
        });

        test('should handle empty functions gracefully', () => {
            const content = `function empty() {}`;
            const functions = analyzer._extractFunctions(content, '.js');

            // Empty function body may not be extracted depending on regex
            expect(functions).toBeDefined();
        });

        test('should handle very long files', async () => {
            fs.existsSync.mockReturnValue(true);
            fs.readdirSync.mockReturnValue([
                { name: 'huge.js', isDirectory: () => false, isFile: () => true }
            ]);
            // 10000 lines with newlines - split produces 10001 elements (last is empty)
            fs.readFileSync.mockReturnValue('const x = 1;\n'.repeat(10000));

            const result = await analyzer.analyze('/project');

            expect(result.summary.scriptsAnalyzed).toBe(1);
            // 10000 newlines + trailing empty = 10001 elements from split
            expect(result.scripts[0].lines).toBe(10001);
        });
    });
});
