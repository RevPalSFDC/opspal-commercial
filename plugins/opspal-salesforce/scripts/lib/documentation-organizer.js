#!/usr/bin/env node

/**
 * Documentation Organization Enforcement Script
 * Ensures all documentation files are properly placed in designated docs folders
 * Enforces standards for ClaudeSFDC project structure
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class DocumentationOrganizer {
    constructor(projectRoot = process.cwd()) {
        this.projectRoot = projectRoot;
        this.violations = [];
        this.movedFiles = [];
        this.docPatterns = ['.md', '.txt', '.pdf', '.doc', '.docx'];
        
        // Allowed documentation locations
        this.allowedPaths = [
            'docs',
            'instances/*/docs',
            'error-logging/docs',
            'templates/docs',
            'agents/docs'
        ];
        
        // Files that should stay in root
        this.rootExceptions = [
            'README.md',
            'LICENSE.md',
            'LICENSE',
            'CONTRIBUTING.md',
            'CODE_OF_CONDUCT.md',
            'CHANGELOG.md',
            'CLAUDE.md',
            '.env.template',
            '.env.example',
            '.env.sample'
        ];
    }

    /**
     * Find all documentation files that are not in approved locations
     */
    findMisplacedDocs() {
        console.log('🔍 Scanning for misplaced documentation files...\n');
        
        const findDocs = (dir, relativePath = '') => {
            const files = fs.readdirSync(dir);
            
            files.forEach(file => {
                const fullPath = path.join(dir, file);
                const relPath = path.join(relativePath, file);
                
                // Skip node_modules and hidden directories
                if (file === 'node_modules' || file.startsWith('.')) {
                    return;
                }
                
                const stat = fs.statSync(fullPath);
                
                if (stat.isDirectory()) {
                    findDocs(fullPath, relPath);
                } else if (this.isDocumentationFile(file)) {
                    if (!this.isInApprovedLocation(relPath) && !this.isRootException(file)) {
                        this.violations.push({
                            file: relPath,
                            fullPath: fullPath,
                            suggestedLocation: this.getSuggestedLocation(relPath)
                        });
                    }
                }
            });
        };
        
        findDocs(this.projectRoot);
        return this.violations;
    }

    /**
     * Check if file is a documentation file
     */
    isDocumentationFile(filename) {
        return this.docPatterns.some(pattern => 
            filename.toLowerCase().endsWith(pattern)
        );
    }

    /**
     * Check if file is in an approved documentation location
     */
    isInApprovedLocation(relativePath) {
        return this.allowedPaths.some(pattern => {
            const regex = new RegExp(pattern.replace('*', '[^/]+'));
            return regex.test(relativePath);
        });
    }

    /**
     * Check if file is allowed in root
     */
    isRootException(filename) {
        return this.rootExceptions.includes(filename) || 
               this.rootExceptions.includes(filename.toUpperCase());
    }

    /**
     * Get suggested location for misplaced documentation
     */
    getSuggestedLocation(relativePath) {
        const parts = relativePath.split(path.sep);
        
        // If in instance directory, suggest instance docs folder
        if (parts[0] === 'instances' && parts.length > 2) {
            return path.join('instances', parts[1], 'docs', parts[parts.length - 1]);
        }
        
        // If in scripts directory, suggest main docs folder
        if (parts[0] === 'scripts') {
            return path.join('docs', 'scripts', parts[parts.length - 1]);
        }
        
        // If in agents directory, suggest agents docs folder
        if (parts[0] === 'agents') {
            return path.join('agents', 'docs', parts[parts.length - 1]);
        }
        
        // Default to main docs folder
        return path.join('docs', parts[parts.length - 1]);
    }

    /**
     * Move misplaced documentation to correct locations
     */
    async moveDocs(dryRun = true) {
        if (this.violations.length === 0) {
            console.log('✅ All documentation files are properly organized!\n');
            return;
        }

        console.log(`Found ${this.violations.length} misplaced documentation files.\n`);
        
        for (const violation of this.violations) {
            const targetPath = path.join(this.projectRoot, violation.suggestedLocation);
            const targetDir = path.dirname(targetPath);
            
            if (dryRun) {
                console.log(`📄 Would move: ${violation.file}`);
                console.log(`   → To: ${violation.suggestedLocation}\n`);
            } else {
                // Create target directory if it doesn't exist
                if (!fs.existsSync(targetDir)) {
                    fs.mkdirSync(targetDir, { recursive: true });
                }
                
                // Check if target file already exists
                if (fs.existsSync(targetPath)) {
                    console.log(`⚠️  Skipping ${violation.file} - target already exists`);
                    continue;
                }
                
                // Move the file
                try {
                    fs.renameSync(violation.fullPath, targetPath);
                    this.movedFiles.push({
                        from: violation.file,
                        to: violation.suggestedLocation
                    });
                    console.log(`✅ Moved: ${violation.file}`);
                    console.log(`   → To: ${violation.suggestedLocation}\n`);
                } catch (error) {
                    console.error(`❌ Failed to move ${violation.file}: ${error.message}\n`);
                }
            }
        }
        
        if (!dryRun && this.movedFiles.length > 0) {
            this.updateGitTracking();
        }
    }

    /**
     * Update git tracking for moved files
     */
    updateGitTracking() {
        console.log('\n📝 Updating git tracking...\n');
        
        for (const move of this.movedFiles) {
            try {
                // Check if file was tracked by git
                try {
                    execSync(`git ls-files --error-unmatch "${move.from}"`, { 
                        cwd: this.projectRoot,
                        stdio: 'pipe' 
                    });
                    
                    // If tracked, update git
                    execSync(`git add "${move.to}"`, { cwd: this.projectRoot });
                    execSync(`git rm --cached "${move.from}"`, { cwd: this.projectRoot });
                    console.log(`✅ Updated git tracking for ${move.from}`);
                } catch (e) {
                    // File wasn't tracked, just add the new location
                    console.log(`📄 ${move.from} wasn't tracked by git`);
                }
            } catch (error) {
                console.error(`⚠️  Git update failed for ${move.from}: ${error.message}`);
            }
        }
    }

    /**
     * Generate report of documentation organization
     */
    generateReport() {
        const reportPath = path.join(this.projectRoot, 'docs', 'DOCUMENTATION_ORGANIZATION_REPORT.md');
        const reportDir = path.dirname(reportPath);
        
        if (!fs.existsSync(reportDir)) {
            fs.mkdirSync(reportDir, { recursive: true });
        }
        
        let report = '# Documentation Organization Report\n\n';
        report += `Generated: ${new Date().toISOString()}\n\n`;
        
        if (this.violations.length === 0) {
            report += '## ✅ Status: Compliant\n\n';
            report += 'All documentation files are properly organized in designated folders.\n\n';
        } else {
            report += '## ⚠️ Status: Violations Found\n\n';
            report += `Found ${this.violations.length} misplaced documentation files.\n\n`;
            report += '### Violations\n\n';
            
            this.violations.forEach(v => {
                report += `- **${v.file}**\n`;
                report += `  - Suggested location: \`${v.suggestedLocation}\`\n`;
            });
        }
        
        if (this.movedFiles.length > 0) {
            report += '\n### Files Moved\n\n';
            this.movedFiles.forEach(m => {
                report += `- \`${m.from}\` → \`${m.to}\`\n`;
            });
        }
        
        report += '\n## Documentation Standards\n\n';
        report += '### Approved Locations\n\n';
        this.allowedPaths.forEach(path => {
            report += `- \`${path}\`\n`;
        });
        
        report += '\n### Root Exceptions\n\n';
        this.rootExceptions.forEach(file => {
            report += `- \`${file}\`\n`;
        });
        
        fs.writeFileSync(reportPath, report);
        console.log(`\n📊 Report generated: ${reportPath}\n`);
    }

    /**
     * Validate documentation organization without making changes
     */
    validate() {
        this.findMisplacedDocs();
        
        if (this.violations.length === 0) {
            console.log('✅ Documentation organization validation passed!\n');
            return true;
        } else {
            console.log(`❌ Documentation organization validation failed!\n`);
            console.log(`Found ${this.violations.length} violations:\n`);
            
            this.violations.forEach(v => {
                console.log(`  - ${v.file}`);
                console.log(`    Should be in: ${v.suggestedLocation}`);
            });
            
            console.log('\nRun with --fix to automatically organize documentation.\n');
            return false;
        }
    }
}

// CLI interface
if (require.main === module) {
    const args = process.argv.slice(2);
    const command = args[0];
    const options = args.slice(1);
    
    const organizer = new DocumentationOrganizer();
    
    switch (command) {
        case 'check':
        case 'validate':
            const isValid = organizer.validate();
            process.exit(isValid ? 0 : 1);
            break;
            
        case 'fix':
        case 'organize':
            organizer.findMisplacedDocs();
            organizer.moveDocs(false);
            organizer.generateReport();
            break;
            
        case 'dry-run':
        case 'preview':
            organizer.findMisplacedDocs();
            organizer.moveDocs(true);
            break;
            
        case 'report':
            organizer.findMisplacedDocs();
            organizer.generateReport();
            break;
            
        default:
            console.log('Documentation Organizer - Enforce documentation standards\n');
            console.log('Usage: node documentation-organizer.js <command> [options]\n');
            console.log('Commands:');
            console.log('  check, validate    Check documentation organization');
            console.log('  fix, organize      Move misplaced documentation to correct locations');
            console.log('  dry-run, preview   Show what would be moved without making changes');
            console.log('  report             Generate organization report\n');
            console.log('Examples:');
            console.log('  node documentation-organizer.js check');
            console.log('  node documentation-organizer.js fix');
            console.log('  node documentation-organizer.js dry-run');
            process.exit(0);
    }
}

module.exports = DocumentationOrganizer;