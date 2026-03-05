#!/usr/bin/env node

/**
 * Salesforce Project Initializer
 * Creates standardized project structure for all Salesforce operations
 * Prevents organizational sloppiness by enforcing consistent structure from the start
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class ProjectInitializer {
    constructor(projectName, orgAlias, options = {}) {
        this.projectName = this.sanitizeProjectName(projectName);
        this.orgAlias = orgAlias;
        this.timestamp = new Date().toISOString().split('T')[0];

        // Default to instances/{org-alias}/ directory structure
        const instancesDir = path.join(__dirname, '../../instances', this.orgAlias);
        this.projectDir = options.baseDir ||
            path.join(instancesDir, `${this.projectName}-${this.timestamp}`);
        this.options = options;
    }

    sanitizeProjectName(name) {
        // Convert to lowercase, replace spaces with hyphens, remove special chars
        return name.toLowerCase()
            .replace(/\s+/g, '-')
            .replace(/[^a-z0-9-]/g, '')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '');
    }

    async initialize() {
        console.log(`\n🚀 Initializing project: ${this.projectName}`);
        console.log(`📁 Location: ${this.projectDir}`);
        console.log(`🌐 Salesforce Org: ${this.orgAlias}\n`);

        try {
            // Create directory structure
            await this.createDirectoryStructure();

            // Create symlinks to shared libraries
            await this.createLibrarySymlinks();

            // Set org context for automatic detection
            await this.setOrgContext();

            // Generate README
            await this.generateReadme();

            // Create initial scripts
            await this.createInitialScripts();

            // Generate TodoWrite template
            await this.generateTodoTemplate();

            // Create .gitignore
            await this.createGitignore();

            // Initialize git if requested
            if (this.options.initGit) {
                await this.initializeGit();
            }

            // Create project config
            await this.createProjectConfig();

            console.log(`\n✅ Project initialized successfully!`);
            console.log(`\n📋 Next steps:`);
            console.log(`  1. cd ${this.projectDir}`);
            console.log(`  2. Review README.md for project details`);
            console.log(`  3. Check scripts/00-todo-template.js for task planning`);
            console.log(`  4. Begin with scripts/01-query-current-state.js\n`);

            return this.projectDir;
        } catch (error) {
            console.error(`❌ Error initializing project: ${error.message}`);
            throw error;
        }
    }

    async createDirectoryStructure() {
        const directories = [
            '',
            'scripts',
            'scripts/lib',
            'data',
            'data/input',
            'data/output',
            'data/temp',
            'queries',           // Ad-hoc query results
            'bulk-operations',   // Bulk API job results
            'reports',
            'reports/analysis',
            'reports/summary',
            'backups',
            'backups/pre-operation',
            'backups/post-operation',
            'docs',
            'docs/planning',
            'docs/decisions',
            'logs',
            'config'
        ];

        for (const dir of directories) {
            const fullPath = path.join(this.projectDir, dir);
            if (!fs.existsSync(fullPath)) {
                fs.mkdirSync(fullPath, { recursive: true });
            }
        }

        console.log('✓ Created directory structure');
    }

    async createLibrarySymlinks() {
        // Define shared libraries to symlink
        const sharedLibraries = [
            'fuzzy-matcher.js',
            'csv-parser.js',
            'user-provisioner.js',
            'path-helper.js',
            'org-context-injector.js',
            'org-metadata-cache.js',
            'smart-query-validator.js',
            'bulk-api-handler.js',
            'preflight-validator.js',
            'safe-query-builder.js'
        ];

        const sharedLibDir = path.join(__dirname); // SFDC/scripts/lib/
        const projectLibDir = path.join(this.projectDir, 'scripts', 'lib');

        let symlinkCount = 0;
        let skippedCount = 0;

        for (const library of sharedLibraries) {
            const sourcePath = path.join(sharedLibDir, library);
            const targetPath = path.join(projectLibDir, library);

            // Check if source library exists
            if (!fs.existsSync(sourcePath)) {
                console.log(`  ⚠️  Skipping ${library} (not found in shared lib)`);
                skippedCount++;
                continue;
            }

            // Check if symlink or file already exists
            if (fs.existsSync(targetPath)) {
                try {
                    // Remove existing if it's a symlink
                    const stats = fs.lstatSync(targetPath);
                    if (stats.isSymbolicLink()) {
                        fs.unlinkSync(targetPath);
                    } else {
                        console.log(`  ⚠️  Skipping ${library} (file already exists)`);
                        skippedCount++;
                        continue;
                    }
                } catch (err) {
                    console.log(`  ⚠️  Skipping ${library} (${err.message})`);
                    skippedCount++;
                    continue;
                }
            }

            // Create symlink
            try {
                fs.symlinkSync(sourcePath, targetPath);
                symlinkCount++;
            } catch (err) {
                console.log(`  ⚠️  Failed to symlink ${library}: ${err.message}`);
                skippedCount++;
            }
        }

        console.log(`✓ Created ${symlinkCount} library symlinks${skippedCount > 0 ? ` (${skippedCount} skipped)` : ''}`);
    }

    async generateReadme() {
        const readmeContent = `# ${this.projectName.split('-').map(w =>
            w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}

## Project Information
- **Date Created**: ${this.timestamp}
- **Salesforce Org**: ${this.orgAlias}
- **Project Type**: ${this.options.projectType || 'General'}
- **Created By**: ${process.env.USER || 'Unknown'}

## Project Structure
\`\`\`
${this.projectName}-${this.timestamp}/
├── scripts/          # All executable scripts
│   └── lib/         # Symlinked shared libraries (fuzzy-matcher, csv-parser, etc.)
├── data/            # Data files
│   ├── input/       # Source data files
│   ├── output/      # Generated data files
│   └── temp/        # Temporary working files
├── reports/         # Generated reports
│   ├── analysis/    # Detailed analysis reports
│   └── summary/     # Executive summaries
├── backups/         # Data backups
│   ├── pre-operation/  # Before changes
│   └── post-operation/ # After changes
├── docs/            # Documentation
│   ├── planning/    # Planning documents
│   └── decisions/   # Decision records
├── logs/            # Execution logs
├── config/          # Configuration files
└── README.md        # This file
\`\`\`

## Quick Start

1. **Review Current State**
   \`\`\`bash
   node scripts/01-query-current-state.js
   \`\`\`

2. **Backup Data**
   \`\`\`bash
   node scripts/02-backup-data.js
   \`\`\`

3. **Execute Operations**
   \`\`\`bash
   node scripts/03-execute-operations.js
   \`\`\`

4. **Generate Reports**
   \`\`\`bash
   node scripts/04-generate-reports.js
   \`\`\`

## File Naming Conventions

- **Scripts**: \`{number}-{action}-{target}.js\`
  - Example: \`01-query-accounts.js\`, \`02-analyze-duplicates.js\`

- **Data Files**: \`{content}-{date}-{status}.{ext}\`
  - Example: \`accounts-2025-09-23-raw.csv\`

- **Reports**: \`{TYPE}_{SUBJECT}_{DATE}.md\`
  - Example: \`ANALYSIS_DUPLICATES_2025-09-23.md\`

## Important Notes

- Always run scripts in numbered order
- Check logs/ directory for execution details
- Review reports/ before proceeding to next steps
- Keep backups until project is fully validated

## Project Status

- [ ] Project initialized
- [ ] Current state queried
- [ ] Backups created
- [ ] Operations executed
- [ ] Reports generated
- [ ] Results validated
- [ ] Project archived

## Contact

For questions about this project, contact the project owner or refer to the documentation in the docs/ directory.
`;

        fs.writeFileSync(path.join(this.projectDir, 'README.md'), readmeContent);
        console.log('✓ Generated README.md');
    }

    async createInitialScripts() {
        // Create todo template script
        const todoScript = `#!/usr/bin/env node

/**
 * TodoWrite Template for ${this.projectName}
 * Use this template with TodoWrite tool to track project progress
 */

const todos = [
    {
        content: "Query current org state for affected objects",
        status: "pending",
        activeForm: "Querying current org state"
    },
    {
        content: "Analyze data and identify issues",
        status: "pending",
        activeForm: "Analyzing data"
    },
    {
        content: "Create comprehensive backups",
        status: "pending",
        activeForm: "Creating backups"
    },
    {
        content: "Execute primary operations",
        status: "pending",
        activeForm: "Executing operations"
    },
    {
        content: "Validate results",
        status: "pending",
        activeForm: "Validating results"
    },
    {
        content: "Generate summary reports",
        status: "pending",
        activeForm: "Generating reports"
    },
    {
        content: "Archive project files",
        status: "pending",
        activeForm: "Archiving project"
    }
];

console.log('TodoWrite Template - Copy and use with TodoWrite tool:');
console.log(JSON.stringify(todos, null, 2));
`;

        fs.writeFileSync(
            path.join(this.projectDir, 'scripts', '00-todo-template.js'),
            todoScript
        );
        fs.chmodSync(path.join(this.projectDir, 'scripts', '00-todo-template.js'), '755');

        // Create query state script
        const queryScript = `#!/usr/bin/env node

/**
 * Query Current State
 * Queries the Salesforce org to understand current state before operations
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Auto-detect org context from project directory
const { requireOrgContext, getOrgParam } = require('../../../../scripts/lib/org-context-injector');

async function queryCurrentState() {
    // Get org context automatically
    const orgContext = await requireOrgContext({ verbose: true });
    const orgParam = getOrgParam(orgContext);
    const OUTPUT_DIR = path.join(__dirname, '..', 'data', 'input');

    console.log('Querying current org state...');
    console.log('Org:', orgContext.alias);
    console.log('Username:', orgContext.username);
    console.log('Output directory:', OUTPUT_DIR);

    // Add your query logic here
    // Example:
    // const result = execSync(\`sf data query --query "SELECT Id, Name FROM Account" \${orgParam} --json\`);
    // fs.writeFileSync(path.join(OUTPUT_DIR, 'accounts-current.json'), result.toString());

    console.log('✓ Query complete. Check data/input/ for results.');
}

queryCurrentState().catch(error => {
    console.error('Error:', error.message);
    process.exit(1);
});
`;

        fs.writeFileSync(
            path.join(this.projectDir, 'scripts', '01-query-current-state.js'),
            queryScript
        );
        fs.chmodSync(path.join(this.projectDir, 'scripts', '01-query-current-state.js'), '755');

        console.log('✓ Created initial scripts');
    }

    async generateTodoTemplate() {
        const todoTemplate = {
            project: this.projectName,
            created: this.timestamp,
            org: this.orgAlias,
            tasks: [
                "Initialize project structure",
                "Query current org state",
                "Analyze data requirements",
                "Create backup strategy",
                "Implement primary operations",
                "Validate results",
                "Generate reports",
                "Document lessons learned"
            ]
        };

        fs.writeFileSync(
            path.join(this.projectDir, 'config', 'todo-template.json'),
            JSON.stringify(todoTemplate, null, 2)
        );

        console.log('✓ Generated TodoWrite template');
    }

    async createGitignore() {
        const gitignoreContent = `# Sensitive data
*.env
.env.*
credentials/

# Temporary files
data/temp/
*.tmp
*.bak

# Logs
logs/*.log
*.log

# OS files
.DS_Store
Thumbs.db

# Node modules (if any)
node_modules/

# Editor files
.vscode/
.idea/
*.swp
*.swo

# Local config overrides
config/local/
`;

        fs.writeFileSync(
            path.join(this.projectDir, '.gitignore'),
            gitignoreContent
        );

        console.log('✓ Created .gitignore');
    }

    async initializeGit() {
        try {
            execSync('git init', { cwd: this.projectDir });
            execSync('git add .', { cwd: this.projectDir });
            execSync(`git commit -m "Initial project structure for ${this.projectName}"`,
                { cwd: this.projectDir });
            console.log('✓ Initialized git repository');
        } catch (error) {
            console.log('⚠️  Git initialization skipped (not critical)');
        }
    }

    async setOrgContext() {
        // Create .sf-org-context file for automatic org detection
        const contextFile = path.join(this.projectDir, '.sf-org-context');
        fs.writeFileSync(contextFile, this.orgAlias);
        console.log('✓ Set org context for automatic detection');
    }

    async createProjectConfig() {
        const config = {
            projectName: this.projectName,
            orgAlias: this.orgAlias,
            created: this.timestamp,
            createdBy: process.env.USER || 'Unknown',
            projectType: this.options.projectType || 'General',
            version: '1.0.0',
            structure: {
                scripts: 'scripts/',
                data: 'data/',
                reports: 'reports/',
                backups: 'backups/',
                docs: 'docs/',
                logs: 'logs/'
            },
            namingConventions: {
                scripts: '{number}-{action}-{target}.js',
                data: '{content}-{date}-{status}.{ext}',
                reports: '{TYPE}_{SUBJECT}_{DATE}.md'
            }
        };

        fs.writeFileSync(
            path.join(this.projectDir, 'config', 'project.json'),
            JSON.stringify(config, null, 2)
        );

        console.log('✓ Created project configuration');
    }
}

// CLI interface
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length < 2) {
        console.log('Usage: project-initializer.js <project-name> <org-alias> [options]');
        console.log('\nOptions:');
        console.log('  --type <type>       Project type (data-cleanup, deployment, analysis)');
        console.log('  --git              Initialize git repository');
        console.log('  --dir <path>       Base directory for project');
        console.log('\nExample:');
        console.log('  node project-initializer.js "contact-cleanup" "delta-production" --type data-cleanup --git');
        process.exit(1);
    }

    const projectName = args[0];
    const orgAlias = args[1];

    const options = {};
    for (let i = 2; i < args.length; i += 2) {
        if (args[i] === '--type') {
            options.projectType = args[i + 1];
        } else if (args[i] === '--git') {
            options.initGit = true;
            i--; // --git has no value
        } else if (args[i] === '--dir') {
            options.baseDir = args[i + 1];
        }
    }

    const initializer = new ProjectInitializer(projectName, orgAlias, options);
    initializer.initialize().catch(error => {
        console.error('Failed to initialize project:', error);
        process.exit(1);
    });
}

module.exports = ProjectInitializer;