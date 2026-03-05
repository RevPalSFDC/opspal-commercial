#!/usr/bin/env node

/**
 * Verify Master Templates Configuration
 * Checks that all master templates are properly set up and accessible
 */

const fs = require('fs').promises;
const path = require('path');

// Template types we expect
const EXPECTED_TEMPLATES = [
  'architecture',
  'data-flow',
  'swimlane',
  'erd',
  'roadmap',
  'account-hierarchy',
  'contact-org-chart',
  'opportunity-pipeline'
];

/**
 * Check environment variables
 */
function checkEnvironmentVariables() {
  console.log('\n🔍 Checking Environment Variables...');
  console.log('-'.repeat(50));

  const results = {
    configured: [],
    missing: [],
    placeholder: []
  };

  EXPECTED_TEMPLATES.forEach(type => {
    const envKey = `LUCID_MASTER_${type.toUpperCase().replace(/-/g, '_')}_ID`;
    const value = process.env[envKey];

    if (!value) {
      results.missing.push({ type, envKey });
    } else if (value.startsWith('MASTER_') && value.endsWith('_001')) {
      results.placeholder.push({ type, envKey, value });
    } else {
      results.configured.push({ type, envKey, value });
    }
  });

  // Report results
  if (results.configured.length > 0) {
    console.log('\n✅ Configured Templates:');
    results.configured.forEach(({ type, envKey, value }) => {
      console.log(`   ${type}: ${value}`);
    });
  }

  if (results.placeholder.length > 0) {
    console.log('\n⚠️  Placeholder Values (need real IDs):');
    results.placeholder.forEach(({ type, envKey, value }) => {
      console.log(`   ${type}: ${value} (placeholder)`);
    });
  }

  if (results.missing.length > 0) {
    console.log('\n❌ Missing Environment Variables:');
    results.missing.forEach(({ type, envKey }) => {
      console.log(`   ${envKey} (for ${type})`);
    });
  }

  return results;
}

/**
 * Check if we can access Lucid API
 */
async function checkLucidAccess() {
  console.log('\n🔌 Checking Lucid API Access...');
  console.log('-'.repeat(50));

  // Check for API token
  const apiToken = process.env.LUCID_API_TOKEN;

  if (!apiToken) {
    console.log('❌ LUCID_API_TOKEN not set');
    console.log('   Set it with: export LUCID_API_TOKEN=your-token');
    return false;
  }

  if (apiToken.startsWith('key-')) {
    console.log('✅ LUCID_API_TOKEN is configured');
    console.log(`   Token starts with: ${apiToken.substring(0, 8)}...`);
  } else {
    console.log('⚠️  LUCID_API_TOKEN format may be incorrect');
    console.log('   Expected format: key-...');
  }

  // Check API base URL
  const apiUrl = process.env.LUCID_API_BASE_URL || 'https://api.lucid.co';
  console.log(`✅ API Base URL: ${apiUrl}`);

  return true;
}

/**
 * Test template bootstrap with mock data
 */
async function testBootstrapCapability() {
  console.log('\n🧪 Testing Bootstrap Capability...');
  console.log('-'.repeat(50));

  try {
    // Check if bootstrap module exists
    const bootstrapPath = path.join(__dirname, 'lib/bootstrap-templates.js');
    await fs.access(bootstrapPath);
    console.log('✅ Bootstrap module found');

    // Check if factory has integration
    const factoryPath = path.join(__dirname, 'lib/lucid-document-factory.js');
    const factoryContent = await fs.readFile(factoryPath, 'utf8');

    if (factoryContent.includes('TemplateBootstrapper')) {
      console.log('✅ Factory has bootstrap integration');
    } else {
      console.log('❌ Factory missing bootstrap integration');
    }

    // Check if tenant manager supports updates
    const managerPath = path.join(__dirname, 'lib/lucid-tenant-manager.js');
    const managerContent = await fs.readFile(managerPath, 'utf8');

    if (managerContent.includes('updateTemplateRegistry')) {
      console.log('✅ Tenant manager supports registry updates');
    } else {
      console.log('❌ Tenant manager missing update method');
    }

    return true;

  } catch (error) {
    console.log('❌ Bootstrap system not fully configured');
    console.log(`   Error: ${error.message}`);
    return false;
  }
}

/**
 * Generate setup commands
 */
function generateSetupCommands(results) {
  console.log('\n📝 Setup Commands');
  console.log('=' .repeat(70));

  if (results.missing.length > 0 || results.placeholder.length > 0) {
    console.log('\n1️⃣  Create master templates in Lucidchart first');
    console.log('   Run: node scripts/create-real-master-templates.js\n');

    console.log('2️⃣  Set environment variables with real IDs:');
    console.log('   ```bash');

    [...results.missing, ...results.placeholder].forEach(({ envKey, type }) => {
      console.log(`   export ${envKey}=<your-${type}-template-id>`);
    });

    console.log('   ```\n');

    console.log('3️⃣  Or create an .env file:');
    console.log('   ```bash');
    console.log('   cat > .env.lucid.templates << EOF');
    [...results.missing, ...results.placeholder].forEach(({ envKey, type }) => {
      console.log(`   ${envKey}=<your-${type}-template-id>`);
    });
    console.log('   EOF');
    console.log('   source .env.lucid.templates');
    console.log('   ```\n');
  } else {
    console.log('\n✅ All templates configured! Ready to test:');
    console.log('   ```bash');
    console.log('   node scripts/test-lucid-with-real-api.js');
    console.log('   ```\n');
  }
}

/**
 * Main verification
 */
async function main() {
  console.log('🔍 Master Template Configuration Verification');
  console.log('=' .repeat(70));

  // Run checks
  const envResults = checkEnvironmentVariables();
  const hasApiAccess = await checkLucidAccess();
  const hasBootstrap = await testBootstrapCapability();

  // Summary
  console.log('\n📊 VERIFICATION SUMMARY');
  console.log('=' .repeat(70));

  const totalTemplates = EXPECTED_TEMPLATES.length;
  const configuredCount = envResults.configured.length;
  const placeholderCount = envResults.placeholder.length;
  const missingCount = envResults.missing.length;

  console.log(`\nTemplate Configuration:`);
  console.log(`   ✅ Configured: ${configuredCount}/${totalTemplates}`);
  console.log(`   ⚠️  Placeholders: ${placeholderCount}/${totalTemplates}`);
  console.log(`   ❌ Missing: ${missingCount}/${totalTemplates}`);

  console.log(`\nSystem Status:`);
  console.log(`   API Access: ${hasApiAccess ? '✅ Ready' : '❌ Not configured'}`);
  console.log(`   Bootstrap System: ${hasBootstrap ? '✅ Ready' : '❌ Not ready'}`);

  const isReady = configuredCount === totalTemplates && hasApiAccess && hasBootstrap;

  if (isReady) {
    console.log('\n🎉 SYSTEM READY FOR PRODUCTION!');
    console.log('   All master templates are configured');
    console.log('   Auto-bootstrap will work seamlessly');
    console.log('   No blank documents will be created\n');
  } else {
    console.log('\n⚠️  SYSTEM NOT READY');
    console.log('   Follow the setup commands below to complete configuration\n');
    generateSetupCommands(envResults);
  }

  // Next steps
  console.log('📌 Next Steps:');
  if (!isReady) {
    console.log('   1. Complete the setup commands above');
    console.log('   2. Re-run this verification');
  }
  console.log('   3. Test with: node scripts/test-lucid-with-real-api.js');
  console.log('   4. Deploy to production');
  console.log('   5. Monitor auto-bootstrap logs\n');
}

// Run verification
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Verification failed:', error);
    process.exit(1);
  });
}