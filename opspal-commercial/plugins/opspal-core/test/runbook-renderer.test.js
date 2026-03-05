#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');

const coreRenderer = require('../scripts/lib/runbook-renderer');
const salesforceRenderer = require('../../opspal-salesforce/scripts/lib/runbook-renderer');

describe.each([
  ['opspal-core', coreRenderer],
  ['opspal-salesforce', salesforceRenderer]
])('%s runbook renderer', (_label, renderer) => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  test('aggregateObservations tolerates missing observation context', () => {
    const observations = [
      {
        timestamp: '2026-02-12T00:00:00Z',
        operation: 'workflow-create',
        context: {
          objects: ['Account'],
          workflows: ['Sync Workflow']
        }
      },
      {
        timestamp: '2026-02-12T01:00:00Z'
      },
      {
        timestamp: '2026-02-12T02:00:00Z',
        context: null
      },
      {
        timestamp: '2026-02-12T03:00:00Z',
        context: {
          objects: 'Account',
          workflows: { name: 'invalid' }
        }
      }
    ];

    const result = renderer.aggregateObservations(observations);
    expect(result.operations_count).toBe(4);
    expect(result.objects).toEqual([
      expect.objectContaining({
        name: 'Account',
        observations: 1
      })
    ]);
    expect(result.workflows).toEqual([
      expect.objectContaining({
        name: 'Sync Workflow',
        observations: 1
      })
    ]);
  });

  test('renders nested Handlebars-style loops and conditionals', () => {
    const template = [
      '{{#each objects}}',
      '{{#if this.description}}DESC: {{this.description}}{{else}}DESC: N/A{{/if}}',
      '{{#if this.relationships}}',
      '{{#each this.relationships}}REL: {{this.type}}->{{this.target}} ({{@index}}){{/each}}',
      '{{/if}}',
      '{{/each}}'
    ].join('\n');

    const engine = new renderer.SimpleTemplateEngine(template);
    const output = engine.render({
      objects: [
        {
          description: 'Account object',
          relationships: [
            { type: 'lookup', target: 'User' }
          ]
        }
      ]
    });

    expect(output).toContain('DESC: Account object');
    expect(output).toContain('REL: lookup->User (1)');
    expect(output).not.toContain('{{#if');
    expect(output).not.toContain('{{#each');
  });

  test('loadObservationData resolves org-centric observation paths', () => {
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'runbook-renderer-'));
    const observationsDir = path.join(
      workspaceRoot,
      'orgs',
      'acme',
      'platforms',
      'salesforce',
      'acme-prod',
      'observations'
    );
    fs.mkdirSync(observationsDir, { recursive: true });
    fs.writeFileSync(
      path.join(observationsDir, 'obs-1.json'),
      JSON.stringify({ operation: 'data-audit', timestamp: '2026-02-12T00:00:00Z' })
    );

    process.env.ORG_SLUG = 'acme';
    const observations = renderer.loadObservationData(workspaceRoot, 'acme-prod');

    expect(observations).toHaveLength(1);
    expect(observations[0].operation).toBe('data-audit');
  });

  test('detectWorkspaceRoot prefers project workspace over plugin cache root', () => {
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'runbook-workspace-'));
    fs.mkdirSync(path.join(workspaceRoot, 'instances'), { recursive: true });

    process.env.CLAUDE_PLUGIN_ROOT = '/tmp/plugin-cache/opspal-core';
    process.env.CLAUDE_PROJECT_DIR = workspaceRoot;
    delete process.env.WORKSPACE_DIR;

    expect(renderer.detectWorkspaceRoot()).toBe(path.resolve(workspaceRoot));
  });
});
