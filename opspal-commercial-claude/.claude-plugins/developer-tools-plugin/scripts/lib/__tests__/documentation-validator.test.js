/**
 * documentation-validator.test.js
 *
 * Tests for DocumentationValidator class
 * Target: Cover all public methods and edge cases
 */

const fs = require('fs');
const DocumentationValidator = require('../documentation-validator');

jest.mock('fs');

describe('DocumentationValidator', () => {
  let validator;

  beforeEach(() => {
    jest.clearAllMocks();
    validator = new DocumentationValidator();
  });

  describe('Constructor', () => {
    it('should create instance with default options', () => {
      const v = new DocumentationValidator();
      expect(v.options.strictMode).toBe(false);
      expect(v.options.requireExamples).toBe(true);
      expect(v.options.requireDecisionTrees).toBe(false);
      expect(v.options.requireExpectedOutputs).toBe(true);
      expect(v.options.minClarityScore).toBe(70);
    });

    it('should accept custom options', () => {
      const v = new DocumentationValidator({
        strictMode: true,
        minClarityScore: 90,
        requireDecisionTrees: true
      });
      expect(v.options.strictMode).toBe(true);
      expect(v.options.minClarityScore).toBe(90);
      expect(v.options.requireDecisionTrees).toBe(true);
    });
  });

  describe('validateCommandDoc', () => {
    it('should fail for non-existent file', () => {
      fs.existsSync.mockReturnValue(false);

      const result = validator.validateCommandDoc('/path/to/missing.md');

      expect(result.valid).toBe(false);
      expect(result.issues).toContain('File does not exist: /path/to/missing.md');
    });

    it('should validate complete command documentation', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(`---
name: my-command
description: A test command for validation
---

## Purpose

This command does something important.

## Usage

\`\`\`bash
/my-command --option value
\`\`\`

## Prerequisites

### Configuration (Optional)
- Set SOME_VAR

### Execution Required
- Install dependencies

## Examples

\`\`\`bash
/my-command --test
\`\`\`

## Expected Output

The command outputs:
\`\`\`
Success!
\`\`\`

## Troubleshooting

Common issues and solutions.
`);

      const result = validator.validateCommandDoc('/path/to/command.md');

      expect(result.filePath).toBe('/path/to/command.md');
      expect(result.type).toBe('command');
      expect(result.issues.length).toBe(0);
      expect(result.clarityScore).toBeGreaterThan(0);
    });

    it('should detect missing frontmatter', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('# No frontmatter\n\nJust content.');

      const result = validator.validateCommandDoc('/path/to/bad.md');

      expect(result.issues).toContain('Missing frontmatter block (---...---)');
    });

    it('should detect missing required frontmatter fields', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(`---
description: Missing name field
---

## Purpose

Test
`);

      const result = validator.validateCommandDoc('/path/to/test.md');

      expect(result.issues).toContain('Missing required frontmatter field: name');
    });

    it('should detect missing required sections', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(`---
name: test-cmd
description: Test command
---

Some content without proper sections.
`);

      const result = validator.validateCommandDoc('/path/to/test.md');

      expect(result.issues).toContain('Missing required section: ## Purpose');
      expect(result.issues).toContain('Missing required section: ## Usage');
      expect(result.issues).toContain('Missing required section: ## Prerequisites');
    });

    it('should warn about missing recommended sections', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(`---
name: test-cmd
description: Test command
---

## Purpose

Test purpose.

## Usage

How to use.

## Prerequisites

Requirements.
`);

      const result = validator.validateCommandDoc('/path/to/test.md');

      expect(result.warnings).toContain('Missing recommended section: ## Examples');
      expect(result.warnings).toContain('Missing recommended section: ## Expected Output');
      expect(result.warnings).toContain('Missing recommended section: ## Troubleshooting');
    });

    it('should warn about missing code examples when required', () => {
      validator = new DocumentationValidator({ requireExamples: true });

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(`---
name: test
description: Test
---

## Purpose

No code examples here.

## Usage

Still no code.

## Prerequisites

Nothing to show.
`);

      const result = validator.validateCommandDoc('/path/to/test.md');

      expect(result.issues).toContain('No code examples found - add at least one example');
    });
  });

  describe('validateAgentDoc', () => {
    it('should fail for non-existent file', () => {
      fs.existsSync.mockReturnValue(false);

      const result = validator.validateAgentDoc('/path/to/missing.md');

      expect(result.valid).toBe(false);
      expect(result.issues).toContain('File does not exist: /path/to/missing.md');
    });

    it('should validate complete agent documentation', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(`---
name: my-agent
description: A specialized agent for testing
tools: Read, Write, Bash
---

## Overview

This agent handles test operations.

## Tools Available

- Read: Read files
- Write: Write files

## When to Use This Agent

Use this when you need to test things.

## Example Workflow

\`\`\`
1. Start task
2. Process
3. Complete
\`\`\`
`);

      const result = validator.validateAgentDoc('/path/to/agent.md');

      expect(result.filePath).toBe('/path/to/agent.md');
      expect(result.type).toBe('agent');
      expect(result.issues.length).toBe(0);
    });

    it('should detect missing required agent sections', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(`---
name: test-agent
description: Test agent
tools: Read
---

Just some content without sections.
`);

      const result = validator.validateAgentDoc('/path/to/test.md');

      expect(result.issues).toContain('Missing required section: ## Overview');
      expect(result.issues).toContain('Missing required section: ## Tools Available');
    });

    it('should require tools field in agent frontmatter', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(`---
name: test-agent
description: Test agent
---

## Overview

Test

## Tools Available

None specified.
`);

      const result = validator.validateAgentDoc('/path/to/test.md');

      expect(result.issues).toContain('Missing required frontmatter field: tools');
    });
  });

  describe('validateBatch', () => {
    it('should validate multiple command files', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockImplementation((path) => {
        if (path.includes('cmd1')) {
          return `---
name: cmd1
description: Command 1
---

## Purpose

Test

## Usage

Use it

## Prerequisites

None
`;
        }
        if (path.includes('cmd2')) {
          return `---
name: cmd2
description: Command 2
---

## Purpose

Test 2

## Usage

Use it 2

## Prerequisites

None
`;
        }
        return '';
      });

      const result = validator.validateBatch(
        ['/path/to/cmd1.md', '/path/to/cmd2.md'],
        'command'
      );

      expect(result.results.length).toBe(2);
      expect(result.summary.total).toBe(2);
    });

    it('should validate multiple agent files', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(`---
name: test-agent
description: Test
tools: Read
---

## Overview

Test

## Tools Available

Read
`);

      const result = validator.validateBatch(
        ['/path/to/agent1.md', '/path/to/agent2.md'],
        'agent'
      );

      expect(result.results.length).toBe(2);
      expect(result.summary.total).toBe(2);
    });

    it('should throw error for invalid type', () => {
      expect(() => {
        validator.validateBatch(['/path/to/file.md'], 'invalid');
      }).toThrow('Invalid type: invalid');
    });

    it('should calculate summary statistics', () => {
      fs.existsSync.mockImplementation((path) => {
        return path.includes('good');
      });

      fs.readFileSync.mockReturnValue(`---
name: test
description: Test
---

## Purpose

Test

## Usage

Use it

## Prerequisites

None

\`\`\`bash
echo "example"
\`\`\`
`);

      const result = validator.validateBatch(
        ['/good/cmd.md', '/bad/missing.md'],
        'command'
      );

      expect(result.summary.total).toBe(2);
      expect(result.summary.failed).toBeGreaterThanOrEqual(1);
    });
  });

  describe('_parseFrontmatter', () => {
    it('should parse valid YAML frontmatter', () => {
      const content = `---
name: test
description: Test description
tools: Read, Write
---

Content here.`;

      const result = validator._parseFrontmatter(content);

      expect(result).toEqual({
        name: 'test',
        description: 'Test description',
        tools: 'Read, Write'
      });
    });

    it('should return null for missing frontmatter', () => {
      const content = 'No frontmatter here.';

      const result = validator._parseFrontmatter(content);

      expect(result).toBeNull();
    });

    it('should handle multi-line values', () => {
      const content = `---
name: test
description: A longer description with text
---`;

      const result = validator._parseFrontmatter(content);

      expect(result.description).toBe('A longer description with text');
    });
  });

  describe('_parseSections', () => {
    it('should parse markdown sections', () => {
      const content = `# Title

## Section One

Content for section one.

## Section Two

Content for section two.

## Third Section

More content.`;

      const result = validator._parseSections(content);

      expect(result.has('Section One')).toBe(true);
      expect(result.has('Section Two')).toBe(true);
      expect(result.has('Third Section')).toBe(true);
      expect(result.get('Section One')).toContain('Content for section one.');
    });

    it('should handle empty content', () => {
      const result = validator._parseSections('');

      expect(result.size).toBe(0);
    });

    it('should handle content without sections', () => {
      const content = 'Just plain text without any headers.';

      const result = validator._parseSections(content);

      expect(result.size).toBe(0);
    });
  });

  describe('_calculateMetrics', () => {
    it('should calculate completeness based on section count', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(`---
name: test
description: Test
---

## Purpose

Test

## Usage

Test

## Prerequisites

Test

## Examples

\`\`\`bash
test
\`\`\`

## Expected Output

Output here.

## Troubleshooting

Issues here.
`);

      const result = validator.validateCommandDoc('/test.md');

      expect(result.metrics.completeness).toBe(100);
    });

    it('should calculate clarity score with code examples', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(`---
name: test
description: Test
---

## Purpose

Test

## Usage

\`\`\`bash
example 1
\`\`\`

\`\`\`bash
example 2
\`\`\`

## Prerequisites

None

## Expected Output

Shows output.
`);

      const result = validator.validateCommandDoc('/test.md');

      expect(result.metrics.clarity).toBeGreaterThan(0);
    });
  });

  describe('_validateConsistency', () => {
    it('should warn about skipped heading levels', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(`---
name: test
description: Test
---

# Main

### Skipped Level Two

Content.

## Purpose

Test

## Usage

Test

## Prerequisites

Test
`);

      const result = validator.validateCommandDoc('/test.md');

      expect(result.warnings.some(w => w.includes('Heading level skip'))).toBe(true);
    });
  });

  describe('_validateCodeExamples', () => {
    it('should warn about code blocks without language', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(`---
name: test
description: Test
---

## Purpose

Test

## Usage

\`\`\`
code without language
\`\`\`

## Prerequisites

Test
`);

      const result = validator.validateCommandDoc('/test.md');

      expect(result.warnings.some(w => w.includes('no language specified'))).toBe(true);
    });

    it('should warn about placeholders without explanation', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(`---
name: test
description: Test
---

## Purpose

Test

## Usage

\`\`\`bash
command --option <value>
\`\`\`

## Prerequisites

Test
`);

      const result = validator.validateCommandDoc('/test.md');

      expect(result.warnings.some(w => w.includes('placeholders but no explanation'))).toBe(true);
    });
  });

  describe('generateReport', () => {
    it('should generate formatted report string', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(`---
name: test
description: Test
---

## Purpose

Test

## Usage

\`\`\`bash
test
\`\`\`

## Prerequisites

Test
`);

      const result = validator.validateCommandDoc('/test.md');
      const report = validator.generateReport(result);

      expect(report).toContain('Documentation Quality Report');
      expect(report).toContain('Overall Clarity Score');
      expect(report).toContain('Metrics:');
      expect(report).toContain('Completeness:');
    });

    it('should include issues in report', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('No frontmatter');

      const result = validator.validateCommandDoc('/test.md');
      const report = validator.generateReport(result);

      expect(report).toContain('Issues (Must Fix):');
      expect(report).toContain('Missing frontmatter');
    });

    it('should include warnings in report', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(`---
name: test
description: Test
---

## Purpose

Test

## Usage

Test

## Prerequisites

Test
`);

      const result = validator.validateCommandDoc('/test.md');
      const report = validator.generateReport(result);

      expect(report).toContain('Warnings (Recommended):');
    });
  });

  describe('Validation Edge Cases', () => {
    it('should handle very short descriptions with warning', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(`---
name: test
description: Hi
---

## Purpose

Test

## Usage

Test

## Prerequisites

Test
`);

      const result = validator.validateCommandDoc('/test.md');

      expect(result.warnings.some(w => w.includes('very short'))).toBe(true);
    });

    it('should handle very long descriptions with warning', () => {
      const longDesc = 'A'.repeat(250);
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(`---
name: test
description: ${longDesc}
---

## Purpose

Test

## Usage

Test

## Prerequisites

Test
`);

      const result = validator.validateCommandDoc('/test.md');

      expect(result.warnings.some(w => w.includes('very long'))).toBe(true);
    });

    it('should validate decision trees when required', () => {
      validator = new DocumentationValidator({
        requireDecisionTrees: true
      });

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(`---
name: test
description: Test command
---

## Purpose

Test

## Usage

\`\`\`bash
test
\`\`\`

## Prerequisites

Test
`);

      const result = validator.validateCommandDoc('/test.md');

      expect(result.warnings.some(w => w.includes('decision guidance'))).toBe(true);
    });
  });
});
