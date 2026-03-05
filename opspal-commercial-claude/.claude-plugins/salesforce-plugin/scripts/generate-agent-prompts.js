#!/usr/bin/env node
'use strict';

// Provider‑neutral agent spec renderer.
// Reads YAML specs from agents/specs/*.yaml and emits provider prompts into
// agents/generated/{claude|gpt}/<id>.md

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const ROOT = path.join(__dirname, '..');
const SPEC_DIR = path.join(ROOT, 'agents', 'specs');
const OUT_DIR = path.join(ROOT, 'agents', 'generated');

function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }

function loadSpecs() {
    if (!fs.existsSync(SPEC_DIR)) return [];
    const files = fs.readdirSync(SPEC_DIR).filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));
    return files.map(file => {
        const raw = fs.readFileSync(path.join(SPEC_DIR, file), 'utf8');
        const spec = yaml.load(raw);
        spec.__file = file;
        return spec;
    });
}

function renderMarkdownHeader(spec) {
    return `# ${spec.title}\n\n` +
           `Role: ${spec.role}\n\n` +
           `Capabilities: ${spec.capabilities.join(', ')}\n\n` +
           `Guardrails:\n` + spec.guardrails.map(g => `- ${g}`).join('\n') + '\n\n';
}

function renderWorkflows(spec) {
    const sections = [];
    for (const [name, wf] of Object.entries(spec.workflows || {})) {
        const tools = (wf.tools || []).join(', ') || 'none';
        sections.push(`## Workflow: ${name}\n\n${wf.description}\n\nTools: ${tools}\n`);
    }
    return sections.join('\n');
}

function renderClaude(spec) {
    const head = renderMarkdownHeader(spec);
    const sys = (spec.prompts && spec.prompts.system && spec.prompts.system.principles) || [];
    const sysBlock = sys.length ? (`### System Principles\n` + sys.map(s => `- ${s}`).join('\n') + '\n\n') : '';
    const wf = renderWorkflows(spec);
    return head + sysBlock + wf + '\n';
}

function renderGPT(spec) {
    const head = renderMarkdownHeader(spec);
    const sys = (spec.prompts && spec.prompts.system && spec.prompts.system.principles) || [];
    const systemText = sys.map(s => `- ${s}`).join('\n');
    const systemSection = systemText ? (`### System\n${systemText}\n\n`) : '';
    const wf = renderWorkflows(spec);
    const safety = `\n> This agent must honor READONLY mode and refuse non‑allowlisted write tools.`;
    return head + systemSection + wf + safety + '\n';
}

function main() {
    const specs = loadSpecs();
    if (!specs.length) {
        console.error('No specs found in agents/specs');
        process.exit(1);
    }
    ensureDir(path.join(OUT_DIR, 'claude'));
    ensureDir(path.join(OUT_DIR, 'gpt'));
    for (const spec of specs) {
        const base = spec.id || path.basename(spec.__file, path.extname(spec.__file));
        fs.writeFileSync(path.join(OUT_DIR, 'claude', `${base}.md`), renderClaude(spec));
        fs.writeFileSync(path.join(OUT_DIR, 'gpt', `${base}.md`), renderGPT(spec));
        console.log(`Generated prompts for ${base}`);
    }
}

if (require.main === module) {
    main();
}

