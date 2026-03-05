#!/usr/bin/env node

/**
 * generate-test-suite.js
 *
 * Automatically generates comprehensive test suites for OpsPal plugins
 * Scans JavaScript files, detects testable functions, and creates Jest test scaffolding
 *
 * Usage:
 *   node generate-test-suite.js <plugin-name> [options]
 *
 * Options:
 *   --script=<path>     Generate tests for specific script only
 *   --update            Update existing test files with missing test cases
 *   --dry-run           Show what would be generated without writing files
 *   --verbose           Detailed output
 *
 * Examples:
 *   node generate-test-suite.js salesforce-plugin
 *   node generate-test-suite.js developer-tools-plugin --script=scripts/validate-plugin.js
 *   node generate-test-suite.js hubspot-plugin --update --verbose
 */

const fs = require('fs/promises');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

// Configuration
const CONFIG = {
  excludePatterns: [
    'node_modules/',
    '__tests__/',
    '.test.js',
    '.spec.js',
    'coverage/',
    'templates/',
    'examples/'
  ],
  testFileExtension: '.test.js',
  testDirectoryName: '__tests__',
  coverageThreshold: {
    statements: 60,
    branches: 55,
    functions: 60,
    lines: 60
  }
};

class TestGenerator {
  constructor(pluginName, options = {}) {
    this.pluginName = pluginName;
    this.options = options;
    this.pluginDir = path.join(process.cwd(), '.claude-plugins', pluginName);
    this.stats = {
      filesScanned: 0,
      functionsFound: 0,
      testFilesCreated: 0,
      testCasesGenerated: 0,
      errors: []
    };
  }

  async generate() {
    console.log(`\n🔍 Scanning ${this.pluginName}...\n`);

    try {
      // 1. Verify plugin exists
      await this.verifyPlugin();

      // 2. Find JavaScript files
      const scriptFiles = await this.findScriptFiles();
      this.stats.filesScanned = scriptFiles.length;
      console.log(`   Found ${scriptFiles.length} JavaScript files\n`);

      // 3. Analyze files and extract functions
      const functionsData = await this.analyzeFiles(scriptFiles);
      this.stats.functionsFound = functionsData.length;
      console.log(`   Detected ${functionsData.length} testable functions\n`);

      // 4. Generate test files
      console.log(`📝 Generating test files...\n`);
      await this.generateTestFiles(functionsData);

      // 5. Create test infrastructure if needed
      await this.setupTestInfrastructure();

      // 6. Validate generated tests
      if (!this.options.dryRun) {
        await this.validateTests();
      }

      // 7. Print summary
      this.printSummary();

      return this.stats;
    } catch (error) {
      console.error(`\n❌ Error: ${error.message}\n`);
      if (this.options.verbose) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  }

  async verifyPlugin() {
    try {
      await fs.access(this.pluginDir);
      const manifestPath = path.join(this.pluginDir, '.claude-plugin', 'plugin.json');
      await fs.access(manifestPath);
    } catch (error) {
      throw new Error(`Plugin '${this.pluginName}' not found in .claude-plugins/`);
    }
  }

  async findScriptFiles() {
    if (this.options.script) {
      // Single script mode
      const scriptPath = path.join(this.pluginDir, this.options.script);
      return [scriptPath];
    }

    // Scan all scripts in plugin
    const scriptsDir = path.join(this.pluginDir, 'scripts');
    return await this.recursiveFindJS(scriptsDir);
  }

  async recursiveFindJS(dir) {
    const files = [];

    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        // Skip excluded patterns
        if (this.shouldExclude(fullPath)) {
          continue;
        }

        if (entry.isDirectory()) {
          const subFiles = await this.recursiveFindJS(fullPath);
          files.push(...subFiles);
        } else if (entry.isFile() && (entry.name.endsWith('.js') || entry.name.endsWith('.mjs'))) {
          files.push(fullPath);
        }
      }
    } catch (error) {
      // Directory doesn't exist, that's okay
      if (this.options.verbose) {
        console.log(`   Skipping ${dir} (not found)`);
      }
    }

    return files;
  }

  shouldExclude(filePath) {
    return CONFIG.excludePatterns.some(pattern => filePath.includes(pattern));
  }

  async analyzeFiles(files) {
    const allFunctions = [];

    for (const file of files) {
      try {
        const functions = await this.extractFunctions(file);
        if (functions.length > 0) {
          allFunctions.push({
            filePath: file,
            functions
          });
        }
      } catch (error) {
        this.stats.errors.push({
          file,
          error: error.message
        });
        if (this.options.verbose) {
          console.log(`   ⚠️  Error analyzing ${path.basename(file)}: ${error.message}`);
        }
        // Continue with remaining files - graceful degradation in analysis
      }
    }

    return allFunctions;
  }

  async extractFunctions(filePath) {
    const content = await fs.readFile(filePath, 'utf-8');
    const functions = [];

    // Track which functions are actually exported for filtering config objects
    const exportedFunctions = new Set();

    // First pass: Extract named function declarations
    const functionMatches = content.matchAll(/(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)/g);
    for (const match of functionMatches) {
      const [, name, params] = match;
      if (!name.startsWith('_')) { // Skip private functions
        exportedFunctions.add(name);
        functions.push({
          name,
          params: params.split(',').map(p => p.trim()).filter(Boolean),
          type: 'function',
          isAsync: match[0].startsWith('async')
        });
      }
    }

    // Second pass: Extract arrow function assignments
    const arrowMatches = content.matchAll(/(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\(([^)]*)\)\s*=>/g);
    for (const match of arrowMatches) {
      const [, name, params] = match;
      if (!name.startsWith('_')) {
        exportedFunctions.add(name);
        functions.push({
          name,
          params: params.split(',').map(p => p.trim()).filter(Boolean),
          type: 'arrow',
          isAsync: match[0].includes('async')
        });
      }
    }

    // Third pass: Extract class methods
    const classMatches = content.matchAll(/class\s+(\w+)[\s\S]*?{([\s\S]*?)}/g);
    for (const classMatch of classMatches) {
      const [, className, classBody] = classMatch;
      const methodMatches = classBody.matchAll(/(?:async\s+)?(\w+)\s*\(([^)]*)\)\s*{/g);
      for (const methodMatch of methodMatches) {
        const [, methodName, params] = methodMatch;
        if (methodName !== 'constructor' && !methodName.startsWith('_')) {
          exportedFunctions.add(methodName);
          functions.push({
            name: methodName,
            className,
            params: params.split(',').map(p => p.trim()).filter(Boolean),
            type: 'method',
            isAsync: methodMatch[0].includes('async')
          });
        }
      }
    }

    // Fourth pass: Extract module.exports - only add if it's actually a function we found
    // This prevents configuration objects from being treated as functions
    const exportsMatches = content.matchAll(/module\.exports\s*=\s*{([^}]+)}/g);
    for (const match of exportsMatches) {
      const exports = match[1].split(',').map(e => {
        // Extract just the identifier name (handle "name: value" and "name" patterns)
        const trimmed = e.trim();
        const colonIndex = trimmed.indexOf(':');
        return colonIndex > 0 ? trimmed.substring(0, colonIndex).trim() : trimmed;
      });

      for (const exp of exports) {
        // Only add if:
        // 1. It's not empty
        // 2. It starts with a letter (not a string literal)
        // 3. We found this as an actual function earlier
        if (exp && /^[a-zA-Z_]/.test(exp) && exportedFunctions.has(exp)) {
          // Already added in first pass, skip to avoid duplicates
          continue;
        }
      }
    }

    // Deduplicate by function name (in case same function appears multiple times)
    const uniqueFunctions = Array.from(
      new Map(functions.map(fn => [fn.name, fn])).values()
    );

    return uniqueFunctions;
  }

  async generateTestFiles(functionsData) {
    for (const fileData of functionsData) {
      const testFilePath = this.getTestFilePath(fileData.filePath);

      // Check if test file exists and we're in update mode
      let existingTestContent = null;
      if (this.options.update) {
        try {
          existingTestContent = await fs.readFile(testFilePath, 'utf-8');
        } catch (error) {
          // File doesn't exist, will create new
        }
      }

      const testContent = this.generateTestContent(fileData, existingTestContent);

      if (this.options.dryRun) {
        console.log(`   [DRY RUN] Would create: ${testFilePath}`);
        this.stats.testFilesCreated++;
        this.stats.testCasesGenerated += fileData.functions.length;
      } else {
        // Create __tests__ directory if it doesn't exist
        const testDir = path.dirname(testFilePath);
        await fs.mkdir(testDir, { recursive: true });

        // Write test file
        await fs.writeFile(testFilePath, testContent, 'utf-8');
        console.log(`   ✅ Generated ${path.basename(testFilePath)} (${fileData.functions.length} tests)`);
        this.stats.testFilesCreated++;
        this.stats.testCasesGenerated += fileData.functions.length;
      }
    }
  }

  getTestFilePath(scriptPath) {
    const dir = path.dirname(scriptPath);
    const filename = path.basename(scriptPath, '.js');
    return path.join(dir, CONFIG.testDirectoryName, `${filename}${CONFIG.testFileExtension}`);
  }

  generateTestContent(fileData, existingContent = null) {
    const relativePath = path.relative(
      path.join(path.dirname(fileData.filePath), CONFIG.testDirectoryName),
      fileData.filePath
    );
    const scriptName = path.basename(fileData.filePath, '.js');

    // Detect dependencies that need mocking
    const mockStatements = this.generateMockStatements(fileData);

    // Generate test cases
    const testCases = fileData.functions.map(func => this.generateTestCase(func)).join('\n\n');

    return `/**
 * ${scriptName}${CONFIG.testFileExtension}
 *
 * Auto-generated test suite for ${scriptName}.js
 * Generated on: ${new Date().toISOString()}
 *
 * To run: npm test -- ${scriptName}
 */

const {
  ${fileData.functions.map(f => f.name).join(',\n  ')}
} = require('${relativePath.replace(/\\/g, '/')}');

${mockStatements}

describe('${scriptName}', () => {

${testCases}

});
`;
  }

  generateMockStatements(fileData) {
    const mocks = [];

    // Common mocks based on file analysis
    const needsFsMock = fileData.filePath.includes('file') || fileData.filePath.includes('read') || fileData.filePath.includes('write');
    const needsChildProcessMock = fileData.filePath.includes('exec') || fileData.filePath.includes('cli');
    const needsSupabaseMock = fileData.filePath.includes('supabase');

    if (needsFsMock) {
      mocks.push("jest.mock('fs/promises');");
    }
    if (needsChildProcessMock) {
      mocks.push("jest.mock('child_process');");
    }
    if (needsSupabaseMock) {
      mocks.push("jest.mock('@supabase/supabase-js');");
    }

    if (mocks.length === 0) {
      return '// No mocks required\n';
    }

    return mocks.join('\n') + '\n';
  }

  generateTestCase(func) {
    const testName = this.generateTestName(func);
    const setupCode = this.generateSetupCode(func);
    const testBody = this.generateTestBody(func);

    return `  describe('${func.name}', () => {
${setupCode}

    it('${testName}', ${func.isAsync ? 'async ' : ''}() => {
${testBody}
    });

    it('should handle error cases', ${func.isAsync ? 'async ' : ''}() => {
      // TODO: Add error scenario tests
      ${func.isAsync ? 'await ' : ''}expect(() => ${func.name}(/* invalid args */)).toThrow();
    });
  })`;
  }

  generateTestName(func) {
    // Generate descriptive test name from function name
    const words = func.name.split(/(?=[A-Z])/).join(' ').toLowerCase();
    return `should ${words} correctly`;
  }

  generateSetupCode(func) {
    if (func.isAsync || func.type === 'method') {
      return `    beforeEach(() => {
      // Setup test data
      jest.clearAllMocks();
    });

    afterEach(() => {
      // Cleanup
    });`;
    }
    return '';
  }

  generateTestBody(func) {
    const params = func.params && func.params.length > 0
      ? func.params.map((p, i) => `param${i + 1}`).join(', ')
      : '';

    // Generate smarter assertions based on function name patterns
    const assertions = this.generateSmartAssertions(func);

    if (func.isAsync) {
      return `      // Arrange
      // TODO: Define test data
      ${params ? `const [${params}] = [/* test values */];` : ''}

      // Act
      const result = await ${func.name}(${params});

      // Assert
      ${assertions}`;
    }

    return `      // Arrange
      // TODO: Define test data
      ${params ? `const [${params}] = [/* test values */];` : ''}

      // Act
      const result = ${func.name}(${params});

      // Assert
      ${assertions}`;
  }

  generateSmartAssertions(func) {
    const name = func.name.toLowerCase();
    const assertions = [];

    // Pattern-based assertion generation
    if (name.includes('validate') || name.includes('check')) {
      assertions.push('expect(result).toBeDefined();');
      assertions.push('// For validation functions, check for boolean or error throwing');
      assertions.push('// expect(result).toBe(true); or expect(() => {...}).toThrow();');
    } else if (name.includes('parse') || name.includes('extract')) {
      assertions.push('expect(result).toBeDefined();');
      assertions.push('// For parsing functions, check for expected structure');
      assertions.push('// expect(result).toHaveProperty(\'key\');');
    } else if (name.includes('format') || name.includes('generate')) {
      assertions.push('expect(result).toBeDefined();');
      assertions.push('expect(typeof result).toBe(\'string\'); // Or expected type');
    } else if (name.includes('query') || name.includes('fetch') || name.includes('get')) {
      assertions.push('expect(result).toBeDefined();');
      assertions.push('// For data retrieval, check for expected data structure');
      assertions.push('// expect(Array.isArray(result)).toBe(true);');
    } else if (name.includes('create') || name.includes('insert') || name.includes('add')) {
      assertions.push('expect(result).toBeDefined();');
      assertions.push('// For creation functions, check for success indicator or created object');
      assertions.push('// expect(result).toHaveProperty(\'id\');');
    } else if (name.includes('update') || name.includes('modify')) {
      assertions.push('expect(result).toBeDefined();');
      assertions.push('// For update functions, check for updated values or success flag');
    } else if (name.includes('delete') || name.includes('remove')) {
      assertions.push('expect(result).toBeDefined();');
      assertions.push('// For deletion, check for success boolean or void return');
    } else {
      // Generic assertions
      assertions.push('expect(result).toBeDefined();');
      assertions.push('// TODO: Add specific assertions based on expected return value');
    }

    return assertions.join('\n      ');
  }

  async setupTestInfrastructure() {
    console.log(`\n🔧 Setting up test infrastructure...\n`);

    // Create Jest config
    await this.createJestConfig();

    // Update package.json
    await this.updatePackageJson();

    console.log(`   ✅ Test infrastructure ready\n`);
  }

  async createJestConfig() {
    const jestConfigPath = path.join(this.pluginDir, 'jest.config.js');

    try {
      await fs.access(jestConfigPath);
      if (this.options.verbose) {
        console.log(`   ⚠️  jest.config.js already exists, skipping`);
      }
      return;
    } catch (error) {
      // File doesn't exist, create it
    }

    const jestConfig = `module.exports = {
  testEnvironment: 'node',
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'scripts/**/*.js',
    '!scripts/**/__tests__/**',
    '!scripts/**/*.test.js',
    '!scripts/**/*.spec.js',
    '!**/node_modules/**',
    '!**/templates/**',
    '!**/examples/**'
  ],
  coverageThreshold: {
    global: {
      statements: ${CONFIG.coverageThreshold.statements},
      branches: ${CONFIG.coverageThreshold.branches},
      functions: ${CONFIG.coverageThreshold.functions},
      lines: ${CONFIG.coverageThreshold.lines}
    }
  },
  testMatch: [
    '**/__tests__/**/*.js',
    '**/*.test.js',
    '**/*.spec.js'
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/coverage/'
  ],
  verbose: true
};
`;

    if (!this.options.dryRun) {
      await fs.writeFile(jestConfigPath, jestConfig, 'utf-8');
      console.log(`   ✅ Created jest.config.js`);
    }
  }

  async updatePackageJson() {
    const packageJsonPath = path.join(this.pluginDir, 'package.json');

    let packageJson;
    try {
      const content = await fs.readFile(packageJsonPath, 'utf-8');
      packageJson = JSON.parse(content);
    } catch (error) {
      // Create new package.json if it doesn't exist
      packageJson = {
        name: this.pluginName,
        version: '1.0.0',
        description: `${this.pluginName} test suite`,
        scripts: {},
        devDependencies: {}
      };
    }

    // Add test scripts
    packageJson.scripts = packageJson.scripts || {};
    if (!packageJson.scripts.test) {
      packageJson.scripts.test = 'jest';
    }
    if (!packageJson.scripts['test:coverage']) {
      packageJson.scripts['test:coverage'] = 'jest --coverage';
    }
    if (!packageJson.scripts['test:watch']) {
      packageJson.scripts['test:watch'] = 'jest --watch';
    }

    // Add Jest dev dependency
    packageJson.devDependencies = packageJson.devDependencies || {};
    if (!packageJson.devDependencies.jest) {
      packageJson.devDependencies.jest = '^29.7.0';
    }

    if (!this.options.dryRun) {
      await fs.writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2), 'utf-8');
      console.log(`   ✅ Updated package.json with test scripts`);
    }
  }

  async validateTests() {
    console.log(`\n🧪 Validating generated tests...\n`);

    // Step 1: Syntax validation (check all test files can be parsed)
    console.log(`   Checking syntax...`);
    const syntaxErrors = await this.checkSyntax();

    if (syntaxErrors.length > 0) {
      console.log(`   ❌ Syntax errors found in ${syntaxErrors.length} test file(s):\n`);
      syntaxErrors.forEach(err => {
        console.log(`      ${path.basename(err.file)}: ${err.error}`);
      });
      console.log(`\n   ⚠️  Fix syntax errors before running tests\n`);
      return;
    }

    console.log(`   ✅ All test files have valid syntax`);

    // Step 2: Check if Jest is installed
    try {
      await execAsync('npm list jest', { cwd: this.pluginDir });
    } catch (error) {
      console.log(`   📦 Installing Jest...`);
      try {
        await execAsync('npm install', { cwd: this.pluginDir });
      } catch (installError) {
        console.log(`   ⚠️  Could not install dependencies. Run 'npm install' manually.`);
        return;
      }
    }

    // Step 3: Run tests
    try {
      const { stdout, stderr } = await execAsync('npm test -- --passWithNoTests', {
        cwd: this.pluginDir,
        timeout: 60000
      });

      if (this.options.verbose) {
        console.log(stdout);
      }

      console.log(`   ✅ All generated tests validated successfully\n`);
    } catch (error) {
      console.log(`   ⚠️  Some tests need manual review:`);
      if (this.options.verbose) {
        console.log(error.stdout || error.message);
      }
    }
  }

  async checkSyntax() {
    const errors = [];
    const testDir = path.join(this.pluginDir, 'scripts');
    const testFiles = await this.findTestFiles(testDir);

    for (const testFile of testFiles) {
      try {
        // Use Node.js --check flag to validate syntax without executing
        await execAsync(`node --check "${testFile}"`);
      } catch (error) {
        errors.push({
          file: testFile,
          error: error.message
        });
      }
    }

    return errors;
  }

  async findTestFiles(dir) {
    const testFiles = [];

    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory() && (entry.name === '__tests__' || entry.name.includes('test'))) {
          const subFiles = await this.findTestFiles(fullPath);
          testFiles.push(...subFiles);
        } else if (entry.isDirectory()) {
          const subFiles = await this.findTestFiles(fullPath);
          testFiles.push(...subFiles);
        } else if (entry.isFile() && (entry.name.endsWith('.test.js') || entry.name.endsWith('.spec.js'))) {
          testFiles.push(fullPath);
        }
      }
    } catch (error) {
      // Directory doesn't exist
    }

    return testFiles;
  }

  printSummary() {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`✅ Test Generation Complete!\n`);
    console.log(`   Files scanned:       ${this.stats.filesScanned}`);
    console.log(`   Functions found:     ${this.stats.functionsFound}`);
    console.log(`   Test files created:  ${this.stats.testFilesCreated}`);
    console.log(`   Test cases generated: ${this.stats.testCasesGenerated}`);

    if (this.stats.errors.length > 0) {
      console.log(`\n   ⚠️  Errors encountered: ${this.stats.errors.length}`);
      if (this.options.verbose) {
        this.stats.errors.forEach(err => {
          console.log(`      - ${err.file}: ${err.error}`);
        });
      }
    }

    console.log(`\n${'='.repeat(60)}\n`);
    console.log(`📋 Next steps:\n`);
    console.log(`   1. Review generated tests: ${this.pluginDir}/scripts/__tests__/`);
    console.log(`   2. Run tests:   cd ${this.pluginDir} && npm test`);
    console.log(`   3. View coverage: cd ${this.pluginDir} && npm run test:coverage`);
    console.log(`   4. Open coverage report: open ${this.pluginDir}/coverage/lcov-report/index.html`);
    console.log('');
  }
}

// CLI Entry Point
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: node generate-test-suite.js <plugin-name> [options]

Options:
  --script=<path>     Generate tests for specific script only
  --update            Update existing test files with missing test cases
  --dry-run           Show what would be generated without writing files
  --verbose           Detailed output
  --help, -h          Show this help message

Examples:
  node generate-test-suite.js salesforce-plugin
  node generate-test-suite.js developer-tools-plugin --script=scripts/validate-plugin.js
  node generate-test-suite.js hubspot-plugin --update --verbose
    `);
    process.exit(0);
  }

  const pluginName = args[0];
  const options = {
    script: args.find(a => a.startsWith('--script='))?.split('=')[1],
    update: args.includes('--update'),
    dryRun: args.includes('--dry-run'),
    verbose: args.includes('--verbose')
  };

  const generator = new TestGenerator(pluginName, options);
  await generator.generate();
}

if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { TestGenerator };
