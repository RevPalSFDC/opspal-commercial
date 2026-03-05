#!/usr/bin/env node

const { LucidRealCreation } = require('./lib/lucid-real-creation');

function parseArgs(argv) {
  const args = { type: 'erd' };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--title') args.title = argv[++i];
    else if (a === '--type') args.type = argv[++i];
  }
  return args;
}

(async () => {
  try {
    const args = parseArgs(process.argv);
    if (!args.title) {
      console.error('Usage: node scripts/lucid-create.js --title "My Diagram" [--type erd|flowchart|architecture]');
      process.exit(1);
    }
    const creator = new LucidRealCreation();
    const result = await creator.createRealDiagram({ title: args.title, diagramType: args.type, verifyCreation: true });
    console.log(JSON.stringify({
      success: true,
      id: result.documentId,
      editUrl: result.editUrl,
      viewUrl: result.viewUrl,
      contentAdded: result.contentAdded,
      instructions: result.instructions
    }, null, 2));
  } catch (e) {
    console.error('ERROR:', e.message);
    process.exit(1);
  }
})();

