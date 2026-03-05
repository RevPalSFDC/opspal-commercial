#!/usr/bin/env node

/**
 * Agent Quality Analyzer
 *
 * Analyzes agent quality including prompt engineering, tool usage, documentation,
 * and best practices compliance with detailed scoring and recommendations.
 *
 * Usage:
 *   node analyze-agent-quality.js <agent-file>
 *   node analyze-agent-quality.js <agent-file> --json
 *   node analyze-agent-quality.js --plugin <plugin-name>
 *   node analyze-agent-quality.js --all
 *
 * Examples:
 *   node analyze-agent-quality.js .claude-plugins/my-plugin/agents/my-agent.md
 *   node analyze-agent-quality.js --plugin salesforce-plugin --json
 *   node analyze-agent-quality.js --all --threshold 70
 */

const fs = require('fs');
const path = require('path');

class AgentQualityAnalyzer {
  constructor(options = {}) {
    this.options = options;
    this.marketplaceRoot = path.join(__dirname, '../../..');
    this.pluginsDir = path.join(this.marketplaceRoot, '.claude-plugins');

    // Scoring weights
    this.weights = {
      promptEngineering: 0.30,
      toolSelection: 0.25,
      documentation: 0.20,
      structure: 0.15,
      bestPractices: 0.10
    };

    // Valid tools reference
    this.validTools = [
      'Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash',
      'TodoWrite', 'Task', 'ExitPlanMode', 'WebFetch', 'WebSearch',
      'NotebookEdit', 'SlashCommand', 'BashOutput', 'KillShell'
    ];

    // Tool categories for analysis
    this.toolCategories = {
      fileRead: ['Read', 'Glob', 'Grep'],
      fileWrite: ['Write', 'Edit'],
      execution: ['Bash'],
      workflow: ['TodoWrite', 'Task', 'ExitPlanMode'],
      external: ['WebFetch', 'WebSearch'],
      specialized: ['NotebookEdit', 'SlashCommand']
    };

    this.results = {
      scores: {},
      issues: [],
      recommendations: [],
      antiPatterns: []
    };
  }

  /**
   * Analyze a single agent file
   */
  async analyzeAgent(agentPath) {
    try {
      // Read agent file
      const content = fs.readFileSync(agentPath, 'utf8');
      const agentName = path.basename(agentPath, '.md');
      const pluginName = this.getPluginName(agentPath);

      // Parse agent content
      const parsed = this.parseAgentFile(content);

      // Run all analyses
      const promptScore = this.analyzePromptEngineering(parsed);
      const toolScore = this.analyzeToolSelection(parsed);
      const docScore = this.analyzeDocumentation(parsed);
      const structureScore = this.analyzeStructure(parsed);
      const practicesScore = this.analyzeBestPractices(parsed, agentName);

      // Calculate overall score
      const overallScore = this.calculateOverallScore({
        promptEngineering: promptScore,
        toolSelection: toolScore,
        documentation: docScore,
        structure: structureScore,
        bestPractices: practicesScore
      });

      // Detect anti-patterns
      const antiPatterns = this.detectAntiPatterns(parsed, agentName);

      // Generate recommendations
      const recommendations = this.generateRecommendations(
        { promptScore, toolScore, docScore, structureScore, practicesScore },
        antiPatterns
      );

      return {
        agentName,
        pluginName,
        path: agentPath,
        overallScore: Math.round(overallScore),
        grade: this.getGrade(overallScore),
        categoryScores: {
          promptEngineering: Math.round(promptScore),
          toolSelection: Math.round(toolScore),
          documentation: Math.round(docScore),
          structure: Math.round(structureScore),
          bestPractices: Math.round(practicesScore)
        },
        issues: this.results.issues,
        recommendations,
        antiPatterns,
        parsed
      };
    } catch (error) {
      throw new Error(`Failed to analyze agent ${agentPath}: ${error.message}`);
    }
  }

  /**
   * Parse agent file into frontmatter and content
   */
  parseAgentFile(content) {
    const lines = content.split('\n');
    let frontmatter = {};
    let body = '';
    let inFrontmatter = false;
    let frontmatterEnd = 0;

    // Parse YAML frontmatter
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.trim() === '---') {
        if (!inFrontmatter) {
          inFrontmatter = true;
        } else {
          frontmatterEnd = i;
          break;
        }
      } else if (inFrontmatter) {
        const match = line.match(/^(\w+):\s*(.+)$/);
        if (match) {
          const key = match[1];
          let value = match[2].trim();

          // Parse arrays (tools)
          if (value.startsWith('[')) {
            value = value.slice(1, -1).split(',').map(v => v.trim());
          }

          frontmatter[key] = value;
        }
      }
    }

    // Get body content
    body = lines.slice(frontmatterEnd + 1).join('\n');

    // Extract sections
    const sections = this.extractSections(body);

    return {
      frontmatter,
      body,
      sections,
      lineCount: lines.length
    };
  }

  /**
   * Extract sections from body content
   */
  extractSections(body) {
    const sections = {};
    const lines = body.split('\n');
    let currentSection = null;
    let currentContent = [];

    for (const line of lines) {
      if (line.startsWith('## ')) {
        // Save previous section
        if (currentSection) {
          sections[currentSection] = currentContent.join('\n').trim();
        }
        // Start new section
        currentSection = line.replace('## ', '').trim();
        currentContent = [];
      } else {
        currentContent.push(line);
      }
    }

    // Save last section
    if (currentSection) {
      sections[currentSection] = currentContent.join('\n').trim();
    }

    return sections;
  }

  /**
   * Analyze prompt engineering quality
   */
  analyzePromptEngineering(parsed) {
    let score = 100;
    const { body, sections } = parsed;

    // Clarity (0-25 points)
    const clarityScore = this.assessClarity(body);
    score -= (25 - clarityScore);

    // Completeness (0-25 points)
    const completenessScore = this.assessCompleteness(sections);
    score -= (25 - completenessScore);

    // Actionability (0-25 points)
    const actionabilityScore = this.assessActionability(body);
    score -= (25 - actionabilityScore);

    // Examples (0-25 points)
    const examplesScore = this.assessExamples(body);
    score -= (25 - examplesScore);

    if (clarityScore < 20) {
      this.addIssue('high', 'promptEngineering', 'Prompt lacks clarity and specificity');
    }
    if (completenessScore < 20) {
      this.addIssue('high', 'promptEngineering', 'Prompt has significant gaps in coverage');
    }
    if (examplesScore < 15) {
      this.addIssue('medium', 'promptEngineering', 'Insufficient examples provided');
    }

    return Math.max(0, score);
  }

  /**
   * Assess clarity of prompt
   */
  assessClarity(body) {
    let score = 25;

    // Check for vague language
    const vagueTerms = ['various', 'multiple', 'some', 'different', 'etc'];
    const vaguenessCount = vagueTerms.reduce((count, term) => {
      const regex = new RegExp(`\\b${term}\\b`, 'gi');
      return count + (body.match(regex) || []).length;
    }, 0);

    if (vaguenessCount > 10) score -= 10;
    else if (vaguenessCount > 5) score -= 5;

    // Check for clear action verbs
    const actionVerbs = ['create', 'validate', 'analyze', 'deploy', 'configure', 'generate'];
    const actionCount = actionVerbs.reduce((count, verb) => {
      const regex = new RegExp(`\\b${verb}`, 'gi');
      return count + (body.match(regex) || []).length;
    }, 0);

    if (actionCount < 3) score -= 5;

    return Math.max(0, score);
  }

  /**
   * Assess completeness of coverage
   */
  assessCompleteness(sections) {
    let score = 25;

    const requiredSections = [
      'Core Responsibilities',
      'Best Practices',
      'Common Tasks',
      'Troubleshooting'
    ];

    const missingSections = requiredSections.filter(
      section => !Object.keys(sections).some(s => s.includes(section))
    );

    score -= missingSections.length * 5;

    // Check for substantive content
    Object.values(sections).forEach(content => {
      if (content.length < 100) score -= 2; // Very short sections
    });

    return Math.max(0, score);
  }

  /**
   * Assess actionability
   */
  assessActionability(body) {
    let score = 25;

    // Check for numbered steps
    const numberedSteps = (body.match(/^\d+\./gm) || []).length;
    if (numberedSteps < 5) score -= 5;
    else if (numberedSteps < 10) score -= 2;

    // Check for code examples
    const codeBlocks = (body.match(/```/g) || []).length / 2;
    if (codeBlocks < 2) score -= 5;
    else if (codeBlocks < 5) score -= 2;

    // Check for bullet points
    const bullets = (body.match(/^[-*]/gm) || []).length;
    if (bullets < 10) score -= 3;

    return Math.max(0, score);
  }

  /**
   * Assess quality of examples
   */
  assessExamples(body) {
    let score = 25;

    // Count code blocks
    const codeBlocks = (body.match(/```/g) || []).length / 2;
    if (codeBlocks === 0) score -= 15;
    else if (codeBlocks < 3) score -= 10;
    else if (codeBlocks < 5) score -= 5;

    // Check for command examples
    const bashExamples = (body.match(/```bash/g) || []).length;
    if (bashExamples > 0) score += 3;

    // Check for before/after examples
    if (body.includes('Before') && body.includes('After')) score += 2;

    return Math.max(0, Math.min(25, score));
  }

  /**
   * Analyze tool selection
   */
  analyzeToolSelection(parsed) {
    let score = 100;
    const tools = Array.isArray(parsed.frontmatter.tools)
      ? parsed.frontmatter.tools
      : (parsed.frontmatter.tools || '').split(',').map(t => t.trim()).filter(Boolean);

    // Check for excessive tools
    if (tools.length > 8) {
      score -= 20;
      this.addIssue('high', 'toolSelection', `Excessive tools (${tools.length}). Consider reducing to essential tools only.`);
    } else if (tools.length > 6) {
      score -= 10;
      this.addIssue('medium', 'toolSelection', `Many tools (${tools.length}). Verify each is necessary.`);
    }

    // Check for tool bloat red flags
    if (tools.includes('Bash') && tools.includes('Read') && tools.includes('Write') && tools.includes('Edit')) {
      score -= 15;
      this.addIssue('high', 'toolSelection', 'Potential tool bloat: Bash + all file tools. Consider if all are needed.');
    }

    // Check for invalid tools
    const invalidTools = tools.filter(t => !this.validTools.includes(t));
    if (invalidTools.length > 0) {
      score -= invalidTools.length * 5;
      this.addIssue('critical', 'toolSelection', `Invalid tools: ${invalidTools.join(', ')}`);
    }

    // Check if tools are justified in content
    const mentionedTools = tools.filter(tool => {
      const toolMentioned = parsed.body.toLowerCase().includes(tool.toLowerCase());
      if (!toolMentioned && tool !== 'TodoWrite' && tool !== 'Task') {
        this.addIssue('low', 'toolSelection', `Tool '${tool}' not mentioned in agent description. Verify it's needed.`);
        return false;
      }
      return true;
    });

    if (mentionedTools.length < tools.length * 0.5) {
      score -= 10;
    }

    // Check for missing common tools based on content
    if (parsed.body.includes('file') && !tools.some(t => ['Read', 'Write', 'Edit'].includes(t))) {
      this.addIssue('medium', 'toolSelection', 'Content mentions files but no file tools included');
      score -= 5;
    }

    if (parsed.body.includes('search') && !tools.includes('Grep') && !tools.includes('Glob')) {
      this.addIssue('low', 'toolSelection', 'Content mentions searching but no search tools included');
      score -= 3;
    }

    return Math.max(0, score);
  }

  /**
   * Analyze documentation quality
   */
  analyzeDocumentation(parsed) {
    let score = 100;
    const { frontmatter } = parsed;

    // Check description length and quality
    const description = frontmatter.description || '';
    if (!description) {
      score -= 30;
      this.addIssue('critical', 'documentation', 'Missing agent description');
    } else if (description.length < 20) {
      score -= 25;
      this.addIssue('high', 'documentation', `Description too short (${description.length} chars). Minimum 20, ideal 50+.`);
    } else if (description.length < 30) {
      score -= 15;
      this.addIssue('medium', 'documentation', `Description could be more detailed (${description.length} chars). Ideal 50+.`);
    } else if (description.length < 50) {
      score -= 5;
      this.addIssue('low', 'documentation', `Good description length (${description.length} chars), but 50+ is ideal.`);
    }

    // Check for vague descriptions
    const vagueDescriptions = [
      'general purpose',
      'helps with',
      'assists',
      'various tasks',
      'multiple operations'
    ];
    if (vagueDescriptions.some(phrase => description.toLowerCase().includes(phrase))) {
      score -= 15;
      this.addIssue('high', 'documentation', 'Description is vague. Use specific, action-oriented language.');
    }

    // Check required frontmatter fields
    if (!frontmatter.name) {
      score -= 20;
      this.addIssue('critical', 'documentation', 'Missing agent name in frontmatter');
    }
    if (!frontmatter.model) {
      score -= 15;
      this.addIssue('critical', 'documentation', 'Missing model specification in frontmatter');
    }
    if (!frontmatter.tools) {
      score -= 15;
      this.addIssue('critical', 'documentation', 'Missing tools list in frontmatter');
    }

    return Math.max(0, score);
  }

  /**
   * Analyze structure quality
   */
  analyzeStructure(parsed) {
    let score = 100;
    const { sections, body } = parsed;

    // Required sections
    const requiredSections = {
      'Core Responsibilities': 'critical',
      'Best Practices': 'high',
      'Common Tasks': 'high',
      'Troubleshooting': 'medium'
    };

    for (const [section, severity] of Object.entries(requiredSections)) {
      const hasSection = Object.keys(sections).some(s => s.includes(section));
      if (!hasSection) {
        const penalty = severity === 'critical' ? 25 : severity === 'high' ? 15 : 10;
        score -= penalty;
        this.addIssue(severity, 'structure', `Missing required section: ${section}`);
      }
    }

    // Check for opening statement
    const firstLines = body.split('\n').slice(0, 5).join('\n');
    if (!firstLines.includes('You are responsible for') && !firstLines.includes('You are a')) {
      score -= 10;
      this.addIssue('medium', 'structure', 'Missing clear opening statement defining agent responsibility');
    }

    // Check for closing reminder
    if (!body.toLowerCase().includes('remember:')) {
      score -= 5;
      this.addIssue('low', 'structure', 'Missing closing reminder/key directive');
    }

    // Check section organization
    const sectionCount = Object.keys(sections).length;
    if (sectionCount < 3) {
      score -= 15;
      this.addIssue('high', 'structure', `Only ${sectionCount} sections found. More structure needed.`);
    } else if (sectionCount < 4) {
      score -= 5;
      this.addIssue('low', 'structure', 'Consider adding more sections for better organization');
    }

    return Math.max(0, score);
  }

  /**
   * Analyze best practices compliance
   */
  analyzeBestPractices(parsed, agentName) {
    let score = 100;

    // Check naming convention (lowercase-hyphen)
    if (!/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(agentName)) {
      score -= 25;
      this.addIssue('high', 'bestPractices', `Agent name '${agentName}' doesn't follow lowercase-hyphen convention`);
    }

    // Check for hard-coded paths
    const hardCodedPatterns = [
      /\/Users\/\w+/,
      /\/home\/\w+/,
      /C:\\Users/,
      /\/var\/www/
    ];
    hardCodedPatterns.forEach(pattern => {
      if (pattern.test(parsed.body)) {
        score -= 15;
        this.addIssue('high', 'bestPractices', 'Hard-coded paths found. Use environment-agnostic paths.');
      }
    });

    // Check for security anti-patterns
    if (parsed.body.includes('API_KEY') && !parsed.body.includes('environment variable')) {
      score -= 20;
      this.addIssue('critical', 'bestPractices', 'Potential security issue: API keys mentioned without environment variable guidance');
    }

    return Math.max(0, score);
  }

  /**
   * Detect anti-patterns
   */
  detectAntiPatterns(parsed, agentName) {
    const antiPatterns = [];

    // Vague description
    const description = parsed.frontmatter.description || '';
    const vagueTerms = ['general purpose', 'helps with', 'assists', 'various'];
    if (vagueTerms.some(term => description.toLowerCase().includes(term))) {
      antiPatterns.push({
        name: 'Vague Description',
        severity: 'high',
        location: 'YAML frontmatter description',
        impact: 'Poor agent discoverability and unclear invocation criteria',
        fix: 'Rewrite description to be specific and action-oriented. Example: "Deploys Salesforce metadata with validation and rollback support"'
      });
    }

    // Tool bloat
    const tools = Array.isArray(parsed.frontmatter.tools)
      ? parsed.frontmatter.tools
      : (parsed.frontmatter.tools || '').split(',').map(t => t.trim());

    if (tools.length > 8) {
      antiPatterns.push({
        name: 'Tool Bloat',
        severity: 'high',
        location: 'YAML frontmatter tools',
        impact: 'Security risk, increased complexity, unclear agent scope',
        fix: 'Reduce to essential tools only. Consider splitting into multiple focused agents.'
      });
    }

    // Monolithic agent
    const responsibilityCount = (parsed.body.match(/^###\s/gm) || []).length;
    if (responsibilityCount > 15) {
      antiPatterns.push({
        name: 'Monolithic Agent',
        severity: 'medium',
        location: 'Core Responsibilities section',
        impact: 'Difficult to maintain, tool bloat, unclear focus',
        fix: 'Split into multiple focused agents, each with clear single responsibility'
      });
    }

    // Missing error handling
    if (!parsed.sections['Troubleshooting'] && !parsed.body.toLowerCase().includes('error')) {
      antiPatterns.push({
        name: 'Missing Error Handling',
        severity: 'medium',
        location: 'Overall structure',
        impact: 'Poor user experience when things go wrong',
        fix: 'Add Troubleshooting section with common issues and solutions'
      });
    }

    // Hard-coded assumptions
    if (/\/Users\/|\/home\/|C:\\/.test(parsed.body)) {
      antiPatterns.push({
        name: 'Hard-Coded Assumptions',
        severity: 'high',
        location: 'Throughout agent content',
        impact: 'Agent breaks in different environments or contexts',
        fix: 'Remove hard-coded paths. Use relative paths or environment variables.'
      });
    }

    // Poor structure
    const sectionCount = Object.keys(parsed.sections).length;
    if (sectionCount < 3) {
      antiPatterns.push({
        name: 'Poor Structure',
        severity: 'medium',
        location: 'Overall organization',
        impact: 'Difficult to read, maintain, and understand',
        fix: 'Add clear section headers (##) for Responsibilities, Best Practices, Tasks, Troubleshooting'
      });
    }

    return antiPatterns;
  }

  /**
   * Generate recommendations based on analysis
   */
  generateRecommendations(scores, antiPatterns) {
    const recommendations = [];

    // Priority 1: Critical issues
    this.results.issues
      .filter(i => i.severity === 'critical')
      .forEach(issue => {
        recommendations.push({
          priority: 1,
          category: issue.category,
          issue: issue.message,
          action: this.getRecommendedAction(issue)
        });
      });

    // Priority 2: High severity issues
    this.results.issues
      .filter(i => i.severity === 'high')
      .forEach(issue => {
        recommendations.push({
          priority: 2,
          category: issue.category,
          issue: issue.message,
          action: this.getRecommendedAction(issue)
        });
      });

    // Priority 3: Low scores
    if (scores.promptScore < 70) {
      recommendations.push({
        priority: 3,
        category: 'promptEngineering',
        issue: 'Overall prompt engineering score below 70',
        action: 'Review Agent Writing Guide and improve clarity, examples, and actionability'
      });
    }

    if (scores.toolScore < 70) {
      recommendations.push({
        priority: 3,
        category: 'toolSelection',
        issue: 'Tool selection score below 70',
        action: 'Review tools against Least Privilege principle. Remove unnecessary tools.'
      });
    }

    // Priority 4: Medium and low issues
    this.results.issues
      .filter(i => i.severity === 'medium' || i.severity === 'low')
      .forEach(issue => {
        recommendations.push({
          priority: 4,
          category: issue.category,
          issue: issue.message,
          action: this.getRecommendedAction(issue)
        });
      });

    return recommendations;
  }

  /**
   * Get recommended action for an issue
   */
  getRecommendedAction(issue) {
    const actionMap = {
      'Missing agent description': 'Add clear, specific description (50+ chars) to YAML frontmatter',
      'Description too short': 'Expand description to be more specific and actionable',
      'Description is vague': 'Rewrite with specific action verbs and clear scope',
      'Excessive tools': 'Review each tool against agent responsibilities. Remove unnecessary tools.',
      'Potential tool bloat': 'Verify each tool is needed. Consider splitting agent if doing too much.',
      'Missing required section': 'Add section following Agent Writing Guide template',
      'Hard-coded paths found': 'Replace with relative paths or environment variables'
    };

    // Find matching action
    for (const [key, action] of Object.entries(actionMap)) {
      if (issue.message.includes(key)) {
        return action;
      }
    }

    return 'Review issue and apply best practices from Agent Writing Guide';
  }

  /**
   * Calculate overall score from category scores
   */
  calculateOverallScore(scores) {
    return (
      scores.promptEngineering * this.weights.promptEngineering +
      scores.toolSelection * this.weights.toolSelection +
      scores.documentation * this.weights.documentation +
      scores.structure * this.weights.structure +
      scores.bestPractices * this.weights.bestPractices
    );
  }

  /**
   * Get letter grade from score
   */
  getGrade(score) {
    if (score >= 90) return 'A+';
    if (score >= 80) return 'A';
    if (score >= 70) return 'B';
    if (score >= 60) return 'C';
    if (score >= 50) return 'D';
    return 'F';
  }

  /**
   * Add issue to results
   */
  addIssue(severity, category, message) {
    this.results.issues.push({ severity, category, message });
  }

  /**
   * Get plugin name from agent path
   */
  getPluginName(agentPath) {
    const match = agentPath.match(/\.claude-plugins\/([^/]+)/);
    return match ? match[1] : 'unknown';
  }

  /**
   * Format analysis as markdown report
   */
  formatMarkdownReport(analysis) {
    const { agentName, pluginName, overallScore, grade, categoryScores, issues, recommendations, antiPatterns } = analysis;
    const timestamp = new Date().toISOString();

    let report = `# Agent Quality Analysis: ${agentName}\n\n`;
    report += `**Plugin**: ${pluginName}\n`;
    report += `**Analysis Date**: ${timestamp}\n`;
    report += `**Overall Score**: ${overallScore}/100 (${grade})\n\n`;

    report += `## Summary\n\n`;
    report += this.generateSummary(analysis) + '\n\n';

    report += `## Category Scores\n\n`;
    for (const [category, score] of Object.entries(categoryScores)) {
      const rating = this.getRating(score);
      report += `### ${this.formatCategoryName(category)}: ${score}/100 (${rating})\n\n`;

      const categoryIssues = issues.filter(i => i.category === category);
      if (categoryIssues.length > 0) {
        report += `**Issues**:\n`;
        categoryIssues.forEach(issue => {
          report += `- [${issue.severity.toUpperCase()}] ${issue.message}\n`;
        });
        report += '\n';
      }
    }

    if (antiPatterns.length > 0) {
      report += `## Anti-Patterns Detected\n\n`;
      antiPatterns.forEach(pattern => {
        report += `### ${pattern.name}\n`;
        report += `**Severity**: ${pattern.severity}\n`;
        report += `**Location**: ${pattern.location}\n`;
        report += `**Impact**: ${pattern.impact}\n`;
        report += `**Fix**: ${pattern.fix}\n\n`;
      });
    }

    if (recommendations.length > 0) {
      report += `## Improvement Roadmap\n\n`;
      const byPriority = {
        1: recommendations.filter(r => r.priority === 1),
        2: recommendations.filter(r => r.priority === 2),
        3: recommendations.filter(r => r.priority === 3),
        4: recommendations.filter(r => r.priority === 4)
      };

      if (byPriority[1].length > 0) {
        report += `### Priority 1 (Critical - Fix Immediately)\n`;
        byPriority[1].forEach((r, i) => {
          report += `${i + 1}. **${r.issue}**: ${r.action}\n`;
        });
        report += '\n';
      }

      if (byPriority[2].length > 0) {
        report += `### Priority 2 (High - Fix Soon)\n`;
        byPriority[2].forEach((r, i) => {
          report += `${i + 1}. **${r.issue}**: ${r.action}\n`;
        });
        report += '\n';
      }

      if (byPriority[3].length > 0) {
        report += `### Priority 3 (Medium - Improve Quality)\n`;
        byPriority[3].forEach((r, i) => {
          report += `${i + 1}. **${r.issue}**: ${r.action}\n`;
        });
        report += '\n';
      }

      if (byPriority[4].length > 0) {
        report += `### Priority 4 (Low - Polish)\n`;
        byPriority[4].forEach((r, i) => {
          report += `${i + 1}. **${r.issue}**: ${r.action}\n`;
        });
        report += '\n';
      }
    }

    report += `## References\n`;
    report += `- [Agent Writing Guide](../../../docs/AGENT_WRITING_GUIDE.md)\n`;
    report += `- [Plugin Quality Standards](../../../docs/PLUGIN_QUALITY_STANDARDS.md)\n\n`;

    report += `---\n`;
    report += `**Analysis completed by agent-quality-analyzer v2.0.0**\n`;

    return report;
  }

  /**
   * Generate summary based on score and issues
   */
  generateSummary(analysis) {
    const { overallScore, grade, antiPatterns, issues } = analysis;

    if (grade === 'A+') {
      return 'Excellent agent quality with comprehensive documentation, appropriate tool selection, and well-structured prompts. Minor improvements possible but overall outstanding work.';
    } else if (grade === 'A') {
      return 'Very good agent quality with strong documentation and structure. A few areas could be refined for excellence.';
    } else if (grade === 'B') {
      return 'Good agent quality with solid foundation. Some improvements needed in prompt engineering, tool selection, or documentation to reach higher quality tier.';
    } else if (grade === 'C') {
      return 'Acceptable agent quality but significant improvements needed. Address critical and high-priority issues to improve user experience.';
    } else {
      return 'Agent quality needs substantial improvement. Multiple critical issues detected. Follow improvement roadmap to bring agent to acceptable quality level.';
    }
  }

  /**
   * Get rating from score
   */
  getRating(score) {
    if (score >= 90) return 'Excellent';
    if (score >= 80) return 'Very Good';
    if (score >= 70) return 'Good';
    if (score >= 60) return 'Acceptable';
    if (score >= 50) return 'Needs Improvement';
    return 'Poor';
  }

  /**
   * Format category name for display
   */
  formatCategoryName(category) {
    return category
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase())
      .trim();
  }

  /**
   * Analyze all agents in a plugin
   */
  async analyzePlugin(pluginName) {
    const pluginDir = path.join(this.pluginsDir, pluginName);
    const agentsDir = path.join(pluginDir, 'agents');

    if (!fs.existsSync(agentsDir)) {
      throw new Error(`No agents directory found for plugin: ${pluginName}`);
    }

    const agentFiles = fs.readdirSync(agentsDir)
      .filter(f => f.endsWith('.md'))
      .map(f => path.join(agentsDir, f));

    const results = [];
    for (const agentFile of agentFiles) {
      const analysis = await this.analyzeAgent(agentFile);
      results.push(analysis);

      // Reset results for next agent
      this.results = { scores: {}, issues: [], recommendations: [], antiPatterns: [] };
    }

    return results;
  }

  /**
   * Analyze all agents in marketplace
   */
  async analyzeAll() {
    const plugins = fs.readdirSync(this.pluginsDir)
      .filter(p => {
        const stat = fs.statSync(path.join(this.pluginsDir, p));
        return stat.isDirectory();
      });

    const allResults = [];
    for (const plugin of plugins) {
      try {
        const results = await this.analyzePlugin(plugin);
        allResults.push(...results);
      } catch (error) {
        console.error(`Failed to analyze plugin ${plugin}: ${error.message}`);
      }
    }

    return allResults;
  }
}

// CLI execution
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage: node analyze-agent-quality.js <agent-file>');
    console.log('       node analyze-agent-quality.js --plugin <plugin-name>');
    console.log('       node analyze-agent-quality.js --all');
    console.log('\nOptions:');
    console.log('  --json              Output JSON instead of markdown');
    console.log('  --score-only        Output only the score');
    console.log('  --threshold <num>   Exit with error if score below threshold');
    process.exit(1);
  }

  const analyzer = new AgentQualityAnalyzer();
  const options = {
    json: args.includes('--json'),
    scoreOnly: args.includes('--score-only'),
    threshold: args.includes('--threshold') ? parseInt(args[args.indexOf('--threshold') + 1]) : 0
  };

  (async () => {
    try {
      let results;

      if (args.includes('--all')) {
        results = await analyzer.analyzeAll();
      } else if (args.includes('--plugin')) {
        const pluginIndex = args.indexOf('--plugin');
        const pluginName = args[pluginIndex + 1];
        results = await analyzer.analyzePlugin(pluginName);
      } else {
        const agentFile = args[0];
        const analysis = await analyzer.analyzeAgent(agentFile);
        results = [analysis];
      }

      // Output results
      if (options.scoreOnly) {
        results.forEach(r => console.log(r.overallScore));
      } else if (options.json) {
        console.log(JSON.stringify(results, null, 2));
      } else {
        results.forEach(r => {
          console.log(analyzer.formatMarkdownReport(r));
          console.log('\n' + '='.repeat(80) + '\n');
        });
      }

      // Check threshold
      if (options.threshold > 0) {
        const belowThreshold = results.filter(r => r.overallScore < options.threshold);
        if (belowThreshold.length > 0) {
          console.error(`\n❌ ${belowThreshold.length} agent(s) below threshold of ${options.threshold}`);
          process.exit(1);
        }
      }

      // Quality Gate: Validate analysis produced results
      if (!Array.isArray(results) || results.length === 0) {
        throw new Error('Analysis failed: No valid results returned');
      }

      console.log(`\n✅ Analysis complete. Analyzed ${results.length} agent(s).`);
    } catch (error) {
      console.error('❌ Error:', error.message);
      process.exit(1);
    }
  })();
}

module.exports = AgentQualityAnalyzer;
