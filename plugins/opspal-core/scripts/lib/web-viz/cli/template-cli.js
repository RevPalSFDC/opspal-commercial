#!/usr/bin/env node

/**
 * CLI wrapper for TemplateRegistry
 * Provides command-line access to template listing and info
 */

const path = require('path');
const { TemplateRegistry } = require('../templates/TemplateRegistry');

const COMMANDS = {
  list: listTemplates,
  info: showTemplateInfo
};

async function listTemplates(args) {
  const registry = new TemplateRegistry();
  await registry.load();
  const templates = registry.list();

  // Filter by category if specified
  const categoryFilter = args.find(arg => arg.startsWith('--category='));
  const category = categoryFilter ? categoryFilter.split('=')[1] : null;

  // Group by category
  const grouped = {};
  templates.forEach(template => {
    const cat = template.category || 'other';
    if (!category || cat === category) {
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(template);
    }
  });

  // Display
  console.log('');
  Object.keys(grouped).sort().forEach(cat => {
    console.log(`\n${categoryLabel(cat)}:`);
    console.log('─'.repeat(60));
    grouped[cat].forEach(template => {
      const platforms = template.platforms ? template.platforms.join(', ') : 'Any';
      console.log(`  ${template.id.padEnd(25)} ${template.name}`);
      console.log(`  ${' '.repeat(25)} Platforms: ${platforms}`);
      console.log('');
    });
  });

  console.log(`Total templates: ${templates.length}`);
  console.log('');
  console.log('💡 Use "/viz template info <name>" for details');
  console.log('');
}

async function showTemplateInfo(args) {
  const templateId = args[0];

  if (!templateId) {
    console.error('❌ Error: Template ID required');
    console.error('Usage: /viz template info <template-id>');
    process.exit(1);
  }

  const registry = new TemplateRegistry();
  await registry.load();
  const templateMeta = registry.get(templateId);

  if (!templateMeta) {
    console.error(`❌ Template not found: ${templateId}`);
    console.error('');
    console.error('Run "/viz template list" to see available templates');
    process.exit(1);
  }

  // Load full template definition
  const template = await registry.loadTemplate(templateId);

  if (!template) {
    console.error(`❌ Template not found: ${templateId}`);
    console.error('');
    console.error('Run "/viz template list" to see available templates');
    process.exit(1);
  }

  console.log('');
  console.log(`📊 ${template.name}`);
  console.log('═'.repeat(60));
  console.log('');
  console.log(`ID:          ${template.id}`);
  console.log(`Category:    ${template.category || 'other'}`);
  console.log(`Platforms:   ${template.platforms ? template.platforms.join(', ') : 'Any'}`);
  console.log('');
  console.log('Description:');
  console.log(`  ${template.description || 'No description available'}`);
  console.log('');

  if (template.components && template.components.length > 0) {
    console.log('Components:');
    template.components.forEach(comp => {
      console.log(`  • ${comp.type} - ${comp.title || comp.id}`);
    });
    console.log('');
  }

  if (template.dataBindings && template.dataBindings.length > 0) {
    console.log('Data Sources:');
    template.dataBindings.forEach(binding => {
      console.log(`  • ${binding.source}: ${binding.query || binding.path || 'custom'}`);
    });
    console.log('');
  }

  console.log('Usage:');
  console.log(`  /viz template create ${template.id} --demo`);
  console.log(`  /viz template create ${template.id} --org <alias>`);
  console.log('');
}

function categoryLabel(category) {
  const labels = {
    sales: '💼 Sales & Pipeline',
    operations: '⚙️  Operations & Admin',
    executive: '📈 Executive',
    documentation: '📝 Documentation',
    compensation: '💰 Compensation',
    other: '📁 Other'
  };
  return labels[category] || `📁 ${category}`;
}

// CLI Execution
if (require.main === module) {
  const command = process.argv[2];
  const args = process.argv.slice(3);

  if (!command || command === '--help' || command === '-h') {
    console.log('');
    console.log('Usage:');
    console.log('  node template-cli.js list [--category=<name>]');
    console.log('  node template-cli.js info <template-id>');
    console.log('');
    process.exit(0);
  }

  const handler = COMMANDS[command];
  if (!handler) {
    console.error(`❌ Unknown command: ${command}`);
    console.error('Valid commands: list, info');
    process.exit(1);
  }

  handler(args).catch(err => {
    console.error('❌ Error:', err.message);
    process.exit(1);
  });
}

module.exports = { listTemplates, showTemplateInfo };
