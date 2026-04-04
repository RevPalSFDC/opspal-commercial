#!/usr/bin/env node
'use strict';

class TaskKeywordExtractor {
  constructor(taskDescription = '', agentName = '') {
    this.text = `${taskDescription || ''} ${agentName || ''}`.toLowerCase();
    this.keywords = {
      platforms: [],
      operations: [],
      domains: [],
      signals: [],
      taskWords: []
    };
  }

  extract() {
    this.extractPlatforms();
    this.extractOperations();
    this.extractDomains();
    this.extractSignals();
    this.extractTaskWords();
    return this.keywords;
  }

  extractPlatforms() {
    const platformMap = {
      salesforce: [
        'salesforce', 'sfdc', 'apex', 'soql', 'flow', 'validation rule', 'quick action',
        'lightning', 'lwc', 'territory', 'cpq', 'quote', 'opportunity', 'record type'
      ],
      hubspot: [
        'hubspot', 'portal', 'cms', 'workflow extension', 'deal', 'company merge',
        'sales hub', 'marketing hub', 'service hub'
      ],
      marketo: [
        'marketo', 'smart campaign', 'mql', 'lead score', 'program', 'munchkin'
      ],
      monday: [
        'monday', 'board', 'pulse', 'kanban', 'work management'
      ],
      okrs: [
        'okr', 'okrs', 'objective', 'key result', 'initiative score'
      ],
      gtm: [
        'gtm', 'go-to-market', 'quota', 'capacity', 'territory plan', 'arr', 'mrr',
        'revenue model', 'market size'
      ],
      'ai-consult': [
        'ai consult', 'ai strategy', 'consulting memo', 'strategy assessment'
      ],
      'mcp-client': [
        'benchmark', 'scorecard', 'compute', 'benchmarking'
      ]
    };

    Object.entries(platformMap).forEach(([platform, keywords]) => {
      if (keywords.some((keyword) => this.text.includes(keyword))) {
        this.keywords.platforms.push(platform);
      }
    });

    if (/\b(sync|synchronize|integrate|between|across systems|cross-platform)\b/.test(this.text)) {
      this.keywords.platforms.push('cross-platform');
    }

    this.keywords.platforms = [...new Set(this.keywords.platforms)];
  }

  extractOperations() {
    const operationMap = {
      audit: ['audit', 'assess', 'review', 'analyze', 'diagnose'],
      deploy: ['deploy', 'release', 'publish', 'promote', 'activate'],
      build: ['build', 'create', 'generate', 'design', 'author'],
      validate: ['validate', 'verify', 'check', 'preflight', 'lint', 'test'],
      fix: ['fix', 'repair', 'remediate', 'resolve', 'debug'],
      report: ['report', 'dashboard', 'summary', 'briefing'],
      migrate: ['migrate', 'migration', 'move', 'transfer'],
      govern: ['govern', 'compliance', 'policy', 'runbook'],
      discover: ['discover', 'inventory', 'catalog', 'list', 'inspect']
    };

    Object.entries(operationMap).forEach(([operation, keywords]) => {
      if (keywords.some((keyword) => this.text.includes(keyword))) {
        this.keywords.operations.push(operation);
      }
    });
  }

  extractDomains() {
    const domainMap = {
      automation: ['flow', 'workflow', 'automation', 'trigger', 'smart campaign'],
      reporting: ['report', 'dashboard', 'joined report', 'analytics'],
      deployment: ['deploy', 'release', 'source-dir', 'metadata', 'package.xml'],
      routing: ['routing', 'assignment', 'lead routing', 'territory'],
      permissions: ['permission', 'profile', 'fLS', 'security', 'access'],
      revenue: ['cpq', 'q2c', 'quote', 'pipeline', 'forecast', 'quota'],
      integration: ['integration', 'sync', 'connector', 'api', 'webhook'],
      hygiene: ['dedup', 'duplicate', 'merge', 'cleanup', 'data quality'],
      hooks: ['hook', 'hook output', 'hook contract', 'pretooluse', 'subagentstart'],
      prompting: ['prompt', 'context', 'attachment', 'skills via attachment']
    };

    Object.entries(domainMap).forEach(([domain, keywords]) => {
      if (keywords.some((keyword) => this.text.includes(keyword))) {
        this.keywords.domains.push(domain);
      }
    });
  }

  extractSignals() {
    if (/\b(explicitly|only|just)\b/.test(this.text)) {
      this.keywords.signals.push('strict-scope');
    }
    if (/\b(cross-platform|between|across systems|sync|integration)\b/.test(this.text)) {
      this.keywords.signals.push('multi-platform');
    }
    if (/\b(salesforce-only|hubspot-only|marketo-only)\b/.test(this.text)) {
      this.keywords.signals.push('single-platform');
    }
    if (/\b(continue|resume|pick up)\b/.test(this.text)) {
      this.keywords.signals.push('continuation');
    }
  }

  extractTaskWords() {
    const stopWords = new Set([
      'about', 'after', 'agent', 'around', 'because', 'before', 'build', 'carry',
      'check', 'client', 'continue', 'current', 'debug', 'deploy', 'doing', 'from',
      'have', 'into', 'just', 'need', 'only', 'please', 'prompt', 'scope', 'task',
      'that', 'their', 'there', 'these', 'they', 'this', 'those', 'with', 'work'
    ]);

    this.keywords.taskWords = [...new Set(
      this.text
        .split(/[^a-z0-9-]+/)
        .map((word) => word.trim())
        .filter((word) => word.length >= 4 && !stopWords.has(word))
    )];
  }
}

module.exports = { TaskKeywordExtractor };
