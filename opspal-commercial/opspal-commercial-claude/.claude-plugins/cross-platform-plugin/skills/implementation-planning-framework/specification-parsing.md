# Specification Parsing

## Document Format Detection

```javascript
function detectDocumentFormat(filePath) {
  const extension = path.extname(filePath).toLowerCase();

  const formatMap = {
    '.md': 'markdown',
    '.txt': 'plaintext',
    '.pdf': 'pdf',
    '.docx': 'word',
    '.json': 'json',
    '.yaml': 'yaml',
    '.yml': 'yaml',
    '.csv': 'csv'
  };

  return formatMap[extension] || 'unknown';
}
```

## Markdown Parsing

### Header-to-Task Mapping
```javascript
function parseMarkdownSpec(content) {
  const lines = content.split('\n');
  const tasks = [];
  let currentSection = null;
  let currentSubsection = null;

  for (const line of lines) {
    // H1 - Epic/Initiative
    if (line.startsWith('# ')) {
      currentSection = {
        type: 'epic',
        title: line.slice(2).trim(),
        tasks: []
      };
      tasks.push(currentSection);
    }
    // H2 - Feature/Story
    else if (line.startsWith('## ')) {
      currentSubsection = {
        type: 'feature',
        title: line.slice(3).trim(),
        tasks: []
      };
      if (currentSection) {
        currentSection.tasks.push(currentSubsection);
      }
    }
    // H3 - Task
    else if (line.startsWith('### ')) {
      const task = {
        type: 'task',
        title: line.slice(4).trim()
      };
      if (currentSubsection) {
        currentSubsection.tasks.push(task);
      } else if (currentSection) {
        currentSection.tasks.push(task);
      }
    }
    // Bullet points - Subtasks
    else if (line.match(/^[-*]\s+/)) {
      const subtask = {
        type: 'subtask',
        title: line.replace(/^[-*]\s+/, '').trim()
      };
      // Add to nearest parent
    }
    // Checkbox items - Actionable items
    else if (line.match(/^[-*]\s+\[[ x]\]/)) {
      const completed = line.includes('[x]');
      const title = line.replace(/^[-*]\s+\[[ x]\]\s*/, '').trim();
      // Handle as actionable item
    }
  }

  return tasks;
}
```

### Metadata Extraction
```javascript
function extractMetadata(content) {
  const metadata = {
    title: null,
    author: null,
    date: null,
    version: null,
    tags: [],
    priority: null
  };

  // YAML frontmatter
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (frontmatterMatch) {
    const yaml = parseYAML(frontmatterMatch[1]);
    Object.assign(metadata, yaml);
  }

  // Inline metadata patterns
  const patterns = {
    title: /^#\s+(.+)$/m,
    author: /Author:\s*(.+)$/mi,
    date: /Date:\s*(\d{4}-\d{2}-\d{2})$/mi,
    version: /Version:\s*([\d.]+)$/mi,
    priority: /Priority:\s*(High|Medium|Low)/mi
  };

  for (const [key, pattern] of Object.entries(patterns)) {
    const match = content.match(pattern);
    if (match) metadata[key] = match[1].trim();
  }

  return metadata;
}
```

## Plain Text Parsing

### Sentence Segmentation
```javascript
function parseTextSpec(content) {
  // Split into sentences
  const sentences = content.split(/[.!?]+\s+/);

  // Identify action items
  const actionPatterns = [
    /should\s+(\w+)/i,
    /must\s+(\w+)/i,
    /need\s+to\s+(\w+)/i,
    /will\s+(\w+)/i,
    /create\s+(\w+)/i,
    /implement\s+(\w+)/i,
    /configure\s+(\w+)/i,
    /set\s+up\s+(\w+)/i
  ];

  return sentences
    .filter(sentence => {
      return actionPatterns.some(pattern => pattern.test(sentence));
    })
    .map(sentence => ({
      type: 'task',
      title: sentence.trim(),
      confidence: calculateConfidence(sentence)
    }));
}
```

### Keyword Extraction
```javascript
const taskKeywords = {
  salesforce: ['salesforce', 'sfdc', 'apex', 'flow', 'object', 'field', 'report', 'dashboard'],
  hubspot: ['hubspot', 'workflow', 'property', 'form', 'email', 'sequence'],
  integration: ['integrate', 'sync', 'api', 'webhook', 'connect'],
  data: ['migrate', 'import', 'export', 'transform', 'clean', 'dedupe'],
  automation: ['automate', 'trigger', 'schedule', 'notify', 'alert']
};

function extractKeywords(text) {
  const words = text.toLowerCase().split(/\s+/);
  const found = {};

  for (const [category, keywords] of Object.entries(taskKeywords)) {
    found[category] = keywords.filter(kw => words.includes(kw));
  }

  return found;
}
```

## Requirements Extraction

### User Story Pattern
```javascript
function parseUserStory(text) {
  // As a [role], I want [feature], so that [benefit]
  const pattern = /As a?\s+(.+?),\s+I want\s+(.+?),\s+so that\s+(.+)/i;
  const match = text.match(pattern);

  if (match) {
    return {
      type: 'user_story',
      role: match[1].trim(),
      feature: match[2].trim(),
      benefit: match[3].trim()
    };
  }
  return null;
}
```

### Acceptance Criteria Pattern
```javascript
function parseAcceptanceCriteria(text) {
  // Given [context], When [action], Then [outcome]
  const pattern = /Given\s+(.+?),\s*When\s+(.+?),\s*Then\s+(.+)/i;
  const matches = [];

  for (const match of text.matchAll(new RegExp(pattern, 'gi'))) {
    matches.push({
      context: match[1].trim(),
      action: match[2].trim(),
      outcome: match[3].trim()
    });
  }

  return matches;
}
```

## Dependency Detection

### Implicit Dependencies
```javascript
const dependencyIndicators = [
  'after',
  'before',
  'requires',
  'depends on',
  'blocked by',
  'following',
  'once',
  'when',
  'prerequisite'
];

function detectDependencies(tasks) {
  const dependencies = [];

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    const text = task.title.toLowerCase();

    for (const indicator of dependencyIndicators) {
      if (text.includes(indicator)) {
        // Find referenced task
        const referenced = findReferencedTask(tasks, text, indicator);
        if (referenced) {
          dependencies.push({
            task: task.title,
            dependsOn: referenced.title,
            indicator
          });
        }
      }
    }
  }

  return dependencies;
}
```

### Explicit References
```javascript
function parseExplicitReferences(text) {
  // Look for task IDs, numbers, or names
  const patterns = [
    /#(\d+)/g,                    // #123
    /\[(\w+-\d+)\]/g,             // [PROJ-123]
    /task\s+"([^"]+)"/gi,         // task "Name"
    /see\s+(\w+)/gi               // see TaskName
  ];

  const references = [];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      references.push(match[1]);
    }
  }

  return references;
}
```
