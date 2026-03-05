# Salesforce Project Initialization Errors - Complete Solution

## Problems Solved

### 1. **InvalidProjectWorkspaceError**
```
Error: Error (InvalidProjectWorkspaceError): /tmp/renewal-tasks does not contain a valid Salesforce CLI project.
```

**Root Cause**: Directory lacks required Salesforce project structure (project config file)

### 2. **MissingPackageDirectoryError**
```
Error: Error (MissingPackageDirectoryError): The path "force-app", specified in the project config, does not exist.
```

**Root Cause**: Package directories referenced in configuration don't physically exist

### 3. **Project Structure Issues**
- Missing Salesforce project config file (sfdx-project.json)
- Missing .forceignore
- Incorrect directory structure
- API version mismatches

## Solution Components

### 1. `sf-project-initializer.js`
Comprehensive project initialization and validation utility

**Features:**
- Automatic project structure creation
- Validation of existing projects
- Fix common project issues
- Temporary project management
- Parent directory scanning

**Usage:**
```bash
# Initialize new project
node sf-project-initializer.js init /path/to/project

# Validate existing project
node sf-project-initializer.js validate /path/to/project

# Fix project issues
node sf-project-initializer.js fix /path/to/project

# Create temporary project
node sf-project-initializer.js temp dashboard-migration

# Clean up old temp projects
node sf-project-initializer.js cleanup
```

### 2. `metadata-retrieval-wrapper.js`
Robust metadata retrieval with automatic project setup

**Features:**
- Automatic project initialization
- Retry logic with error recovery
- Dashboard dependency analysis
- Bulk retrieval support
- Special handling for folders

**Usage:**
```bash
# Retrieve dashboard
node metadata-retrieval-wrapper.js myorg Dashboard "FolderName/DashboardName"

# Retrieve with custom output
node metadata-retrieval-wrapper.js myorg Report "MyReport" --output-dir ./reports

# Retrieve with retries
node metadata-retrieval-wrapper.js myorg Flow "MyFlow" --max-retries 5
```

## Integration Examples

### Example 1: Safe Dashboard Retrieval
```javascript
const MetadataRetrievalWrapper = require('./lib/metadata-retrieval-wrapper');

async function retrieveDashboard() {
    const wrapper = new MetadataRetrievalWrapper('ACME_SANDBOX');

    try {
        const result = await wrapper.retrieveDashboard('CA/vIVoiiDIlxadRDUgnHSRFyvPrFrdyH', {
            outputDir: '/tmp/dashboard-migration'
        });

        console.log('Dashboard retrieved:', result.metadataPath);
        console.log('Dependencies:', result.dependencies);

    } catch (error) {
        console.error('Retrieval failed:', error);
    }
}
```

### Example 2: Ensuring Project Context
```javascript
const SfProjectInitializer = require('./lib/sf-project-initializer');

function ensureProject() {
    const initializer = new SfProjectInitializer();

    // This will find or create a valid project
    const projectPath = initializer.ensureProjectContext('/tmp/my-work');

    // Now safe to run SF CLI commands
    execSync(`sf project retrieve start --metadata "CustomObject:MyObject__c"`, {
        cwd: projectPath
    });
}
```

### Example 3: Bulk Metadata Retrieval
```javascript
const wrapper = new MetadataRetrievalWrapper('myorg');

const components = [
    { type: 'Dashboard', name: 'Sales_Dashboard' },
    { type: 'Report', name: 'Revenue_Report' },
    { type: 'Flow', name: 'Lead_Assignment' }
];

const results = await wrapper.bulkRetrieve(components, {
    outputDir: '/tmp/metadata-backup'
});

console.log(`Success: ${results.successful.length}`);
console.log(`Failed: ${results.failed.length}`);
```

## Error Prevention Strategies

### 1. Always Initialize Project First
```bash
# Before any SF CLI operation in a new directory
node sf-project-initializer.js init .
```

### 2. Use Wrapper for Retrievals
```bash
# Instead of direct sf project retrieve
node metadata-retrieval-wrapper.js [org] [type] [name]
```

### 3. Fix Projects Automatically
```javascript
// In your scripts
const initializer = new SfProjectInitializer();
initializer.fixProjectIssues(projectPath);
```

## Project Structure Created

```
project-root/
├── sfdx-project.json         # Project configuration (required by sf CLI)
├── .forceignore              # Ignore patterns
├── config/
│   └── project-scratch-def.json
└── force-app/
    └── main/
        └── default/
            ├── applications/
            ├── aura/
            ├── classes/
            ├── dashboards/    # Dashboard metadata
            ├── flows/
            ├── layouts/
            ├── lwc/
            ├── objects/
            ├── permissionsets/
            ├── profiles/
            ├── reports/       # Report metadata
            ├── triggers/
            └── ...
```

## Configuration Options

### Project Initializer Options
```javascript
{
    apiVersion: '62.0',        // Salesforce API version
    namespace: '',             // Package namespace
    enableLogging: true        // Show progress messages
}
```

### Metadata Retrieval Options
```javascript
{
    outputDir: '/custom/path',    // Output directory
    wait: 30,                      // Wait timeout in seconds
    maxRetries: 3,                 // Retry attempts
    tempProjectRoot: '/tmp'        // Temp project location
}
```

## Common Patterns

### Pattern 1: Temporary Operations
```javascript
// For one-time operations
const initializer = new SfProjectInitializer();
const tempProject = initializer.createTempProject('my-operation');

// Do your work...

// Clean up later
initializer.cleanupTempProjects(0); // 0 hours = immediate
```

### Pattern 2: CI/CD Integration
```bash
#!/bin/bash
# In CI/CD pipeline

# Ensure project exists
node lib/sf-project-initializer.js init $WORKSPACE

# Retrieve metadata
node lib/metadata-retrieval-wrapper.js $ORG Dashboard "$DASHBOARD_ID"

# Continue with deployment...
```

### Pattern 3: Error Recovery
```javascript
try {
    // Attempt operation
} catch (error) {
    if (error.message.includes('InvalidProjectWorkspace')) {
        initializer.initializeProject(path);
        // Retry operation
    } else if (error.message.includes('MissingPackageDirectory')) {
        initializer.fixProjectIssues(path);
        // Retry operation
    }
}
```

## Troubleshooting

### Issue: Still getting project errors
**Solution**: Use the fix command
```bash
node sf-project-initializer.js fix /path/to/project
```

### Issue: Metadata not found
**Solution**: Check folder structure
```bash
# Dashboards with folders need full path
node metadata-retrieval-wrapper.js org Dashboard "FolderName/DashboardName"
```

### Issue: Retrieval timeouts
**Solution**: Increase wait time
```bash
node metadata-retrieval-wrapper.js org Type Name --wait 60
```

## Best Practices

1. **Always use wrappers** for metadata operations
2. **Initialize projects** before sf commands
3. **Use temp projects** for one-time operations
4. **Clean up** temporary projects regularly
5. **Handle errors** with retry logic
6. **Validate projects** before critical operations

## Performance Tips

- Cache project validations for repeated operations
- Use bulk retrieval for multiple components
- Clean up temp projects to save disk space
- Reuse project directories when possible

## Migration Guide

### From Direct Commands
```bash
# Old (error-prone)
cd /tmp/some-dir
sf project retrieve start --metadata Dashboard:MyDash

# New (robust)
node metadata-retrieval-wrapper.js myorg Dashboard MyDash --output-dir /tmp/some-dir
```

### From Manual Setup
```bash
# Old (manual)
mkdir -p project/force-app
echo '{"packageDirectories":[...]}' > sfdx-project.json
sf project retrieve...

# New (automated)
node sf-project-initializer.js init project
```

## Summary

This solution provides:
- ✅ Automatic project initialization
- ✅ Error recovery and retry logic
- ✅ Dashboard migration support
- ✅ Bulk operations capability
- ✅ Temporary project management
- ✅ Comprehensive error handling

Use these utilities to eliminate Salesforce project initialization errors and ensure reliable metadata operations.
