#!/usr/bin/env node

/**
 * Create Project Folder
 *
 * Creates a structured project folder for assessments, data operations, or other work
 *
 * Usage:
 *   node scripts/lib/create-project.js --portal <name> --name <project> --type <type>
 */

const fs = require('fs');
const path = require('path');

class ProjectCreator {
    constructor() {
        this.portalsDir = path.join(__dirname, '../../portals');
        this.projectTypes = {
            'assessment': {
                name: 'Assessment/Audit',
                folders: ['scripts', 'data', 'reports', 'findings', 'recommendations'],
                templates: ['assessment']
            },
            'data-operation': {
                name: 'Data Operation',
                folders: ['scripts', 'data', 'backups', 'reports', 'logs'],
                templates: ['data-operation']
            },
            'integration': {
                name: 'Integration Project',
                folders: ['scripts', 'config', 'tests', 'docs'],
                templates: ['integration']
            },
            'workflow': {
                name: 'Workflow Project',
                folders: ['scripts', 'workflows', 'tests', 'docs'],
                templates: ['workflow']
            },
            'general': {
                name: 'General Project',
                folders: ['scripts', 'data', 'reports', 'docs'],
                templates: ['general']
            }
        };
    }

    createProject(portalName, projectName, type = 'general') {
        if (!this.projectTypes[type]) {
            throw new Error(`Unknown project type: ${type}. Available: ${Object.keys(this.projectTypes).join(', ')}`);
        }

        const portalDir = path.join(this.portalsDir, portalName);
        if (!fs.existsSync(portalDir)) {
            throw new Error(`Portal directory not found: ${portalDir}. Create portal first with: ./scripts/switch-portal.sh add`);
        }

        const projectsDir = path.join(portalDir, 'projects');
        if (!fs.existsSync(projectsDir)) {
            fs.mkdirSync(projectsDir, { recursive: true });
        }

        // Add date suffix to project name
        const date = new Date().toISOString().split('T')[0];
        const projectDirName = `${projectName}-${date}`;
        const projectDir = path.join(projectsDir, projectDirName);

        if (fs.existsSync(projectDir)) {
            throw new Error(`Project already exists: ${projectDir}`);
        }

        console.log(`\n🚀 Creating ${this.projectTypes[type].name} project...`);
        console.log(`   Portal: ${portalName}`);
        console.log(`   Project: ${projectDirName}`);
        console.log(`   Type: ${type}\n`);

        // Create project directory
        fs.mkdirSync(projectDir, { recursive: true });

        // Create subdirectories
        this.projectTypes[type].folders.forEach(folder => {
            fs.mkdirSync(path.join(projectDir, folder), { recursive: true });
            console.log(`   ✓ Created ${folder}/`);
        });

        // Create README
        this.createReadme(projectDir, portalName, projectName, type);

        // Create .gitkeep files
        this.projectTypes[type].folders.forEach(folder => {
            fs.writeFileSync(path.join(projectDir, folder, '.gitkeep'), '');
        });

        console.log(`\n✅ Project created: ${projectDir}`);
        console.log(`\nNext steps:`);
        console.log(`  1. cd ${path.relative(process.cwd(), projectDir)}`);
        console.log(`  2. Review README.md for project structure`);
        console.log(`  3. Start working on your ${this.projectTypes[type].name.toLowerCase()}`);

        return projectDir;
    }

    createReadme(projectDir, portalName, projectName, type) {
        const typeInfo = this.projectTypes[type];
        const lines = [];

        lines.push(`# ${projectName}`);
        lines.push('');
        lines.push(`**Portal:** ${portalName}`);
        lines.push(`**Type:** ${typeInfo.name}`);
        lines.push(`**Created:** ${new Date().toISOString()}`);
        lines.push('');

        lines.push('## Project Structure');
        lines.push('');
        typeInfo.folders.forEach(folder => {
            const descriptions = {
                'scripts': 'Executable scripts and automation',
                'data': 'CSV files, imports, exports, raw data',
                'reports': 'Assessment reports, summaries, findings',
                'findings': 'Detailed findings and analysis',
                'recommendations': 'Recommendations and action items',
                'backups': 'Data backups before operations',
                'logs': 'Execution logs and error tracking',
                'config': 'Configuration files',
                'tests': 'Test scripts and validation',
                'docs': 'Documentation and notes',
                'workflows': 'Workflow definitions and exports'
            };
            lines.push(`- \`${folder}/\` - ${descriptions[folder] || 'Project files'}`);
        });
        lines.push('');

        if (type === 'assessment') {
            lines.push('## Assessment Workflow');
            lines.push('');
            lines.push('1. **Discovery** - Gather portal data and metadata');
            lines.push('2. **Analysis** - Analyze findings against benchmarks');
            lines.push('3. **Reporting** - Document findings and recommendations');
            lines.push('4. **Presentation** - Prepare executive summary');
            lines.push('');
            lines.push('## Useful Commands');
            lines.push('');
            lines.push('```bash');
            lines.push('# Load portal context');
            lines.push(`node ../../scripts/lib/portal-context-manager.js load ${portalName}`);
            lines.push('');
            lines.push('# Get framework recommendation');
            lines.push(`node ../../scripts/lib/framework-selector.js recommend ${portalName} --type assessment`);
            lines.push('');
            lines.push('# View portal quirks');
            lines.push(`cat ../../PORTAL_QUIRKS.json`);
            lines.push('```');
        }

        if (type === 'data-operation') {
            lines.push('## Data Operation Best Practices');
            lines.push('');
            lines.push('1. **Always backup** - Create backups before modifications');
            lines.push('2. **Test first** - Use sandbox portal for testing');
            lines.push('3. **Validate** - Check data quality before and after');
            lines.push('4. **Log everything** - Maintain detailed operation logs');
            lines.push('');
            lines.push('## Recommended Scripts');
            lines.push('');
            lines.push('```bash');
            lines.push('# Use data operations agent for bulk work');
            lines.push('# Task tool with: hubspot-data-operations-manager');
            lines.push('');
            lines.push('# Or use data hygiene specialist for cleanup');
            lines.push('# Task tool with: hubspot-data-hygiene-specialist');
            lines.push('```');
        }

        lines.push('');
        lines.push('## Notes');
        lines.push('');
        lines.push('<!-- Add your notes and observations here -->');
        lines.push('');

        fs.writeFileSync(path.join(projectDir, 'README.md'), lines.join('\n'));
        console.log('   ✓ Created README.md');
    }

    listProjectTypes() {
        console.log('\n📋 Available Project Types:\n');
        Object.entries(this.projectTypes).forEach(([key, info]) => {
            console.log(`  ${key}`);
            console.log(`    Name: ${info.name}`);
            console.log(`    Folders: ${info.folders.join(', ')}`);
            console.log('');
        });
    }
}

// CLI Interface
function main() {
    const args = process.argv.slice(2);
    const creator = new ProjectCreator();

    // Parse arguments
    const flags = {};
    for (let i = 0; i < args.length; i += 2) {
        const key = args[i].replace(/^--/, '');
        flags[key] = args[i + 1];
    }

    try {
        if (args.includes('--list-types')) {
            creator.listProjectTypes();
        } else if (flags.portal && flags.name) {
            const type = flags.type || 'general';
            creator.createProject(flags.portal, flags.name, type);
        } else {
            console.log('Usage:');
            console.log('  node create-project.js --portal <portal-name> --name <project-name> --type <type>');
            console.log('  node create-project.js --list-types');
            console.log('\nProject Types:');
            console.log('  assessment       - Assessment/audit project');
            console.log('  data-operation   - Data import/export/migration');
            console.log('  integration      - API/webhook/sync project');
            console.log('  workflow         - Workflow creation/optimization');
            console.log('  general          - General project (default)');
            console.log('\nExamples:');
            console.log('  node create-project.js --portal production --name q4-marketing-audit --type assessment');
            console.log('  node create-project.js --portal sandbox --name contact-import --type data-operation');
            process.exit(1);
        }
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = { ProjectCreator };
