#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const os = require("os");

const repoRoot = process.cwd();
const shouldFailOnHighRisk = process.argv.includes("--check");

const sourceDefinitions = [
  { label: "project", file: path.join(repoRoot, ".claude/settings.json") },
  { label: "project-local", file: path.join(repoRoot, ".claude/settings.local.json") },
  { label: "project-legacy-hooks", file: path.join(repoRoot, ".claude/hooks/hooks.json") },
  { label: "environment", file: path.join(os.homedir(), ".claude/settings.json") },
];

const matcherIgnoredEvents = new Set(["UserPromptSubmit", "Stop", "SessionStart"]);
const matcherSupportedEvents = new Set(["PreToolUse", "PostToolUse", "Notification"]);

function safeReadJson(file) {
  if (!fs.existsSync(file)) {
    return { exists: false };
  }
  try {
    const raw = fs.readFileSync(file, "utf8");
    return { exists: true, value: JSON.parse(raw) };
  } catch (error) {
    return { exists: true, error: String(error.message || error) };
  }
}

function normalizePathCandidate(candidate, baseDir) {
  if (path.isAbsolute(candidate)) {
    return candidate;
  }

  const fromBase = path.resolve(baseDir, candidate);
  if (fs.existsSync(fromBase)) {
    return fromBase;
  }

  const fromRepo = path.resolve(repoRoot, candidate);
  if (fs.existsSync(fromRepo)) {
    return fromRepo;
  }

  if (candidate.startsWith(".claude-plugins/")) {
    const mapped = candidate.replace(/^\.claude-plugins\//, "plugins/");
    const mappedPath = path.resolve(repoRoot, mapped);
    if (fs.existsSync(mappedPath)) {
      return mappedPath;
    }
  }

  return fromBase;
}

function extractScriptCandidates(command) {
  if (typeof command !== "string" || command.trim() === "") {
    return [];
  }

  const candidates = new Set();
  const regex = /(?:^|[\s'"])(\/[A-Za-z0-9._/\-]+?\.(?:sh|js|py)|\.[A-Za-z0-9._/\-]+?\.(?:sh|js|py)|[A-Za-z0-9._/\-]+?\.(?:sh|js|py))(?=$|[\s'"])/g;
  let match;

  while ((match = regex.exec(command)) !== null) {
    const raw = match[1];
    if (!raw || raw.includes("://")) {
      continue;
    }
    candidates.add(raw);
  }

  return [...candidates];
}

function commandLooksInlineOnly(command) {
  if (typeof command !== "string") {
    return false;
  }
  const firstToken = command.trim().split(/\s+/)[0];
  return ["bash", "sh", "node", "python", "python3", "cat", "echo", "jq", "printf", "env"].includes(firstToken);
}

function deriveHookName(hook, scriptCandidates) {
  if (hook.description && typeof hook.description === "string") {
    return hook.description.slice(0, 120);
  }
  if (scriptCandidates.length > 0) {
    return path.basename(scriptCandidates[0]);
  }
  if (typeof hook.command === "string" && hook.command.trim() !== "") {
    return hook.command.trim().slice(0, 120);
  }
  return "unnamed-hook";
}

function detectRiskLevel(issues) {
  if (issues.some((issue) => issue.startsWith("HIGH:"))) {
    return "high";
  }
  if (issues.some((issue) => issue.startsWith("MEDIUM:"))) {
    return "medium";
  }
  return "low";
}

function inspectPreToolScriptExitCodes(resolvedScriptPaths, issues) {
  for (const scriptPath of resolvedScriptPaths) {
    if (!fs.existsSync(scriptPath) || !fs.statSync(scriptPath).isFile()) {
      continue;
    }

    let content = "";
    try {
      content = fs.readFileSync(scriptPath, "utf8");
    } catch (_error) {
      continue;
    }

    const codeOnlyContent = content
      .split("\n")
      .filter((line) => !line.trim().startsWith("#"))
      .join("\n");

    const hasExit2 = /\bexit\s+2\b/.test(codeOnlyContent);
    const hasExit1 = /\bexit\s+1\b/.test(codeOnlyContent);
    if (hasExit1 && !hasExit2) {
      issues.push(`MEDIUM: PreToolUse script may block with exit 1 instead of exit 2 (${scriptPath})`);
    }
  }
}

function scriptHasLoggingHints(resolvedScriptPaths) {
  for (const scriptPath of resolvedScriptPaths) {
    if (!fs.existsSync(scriptPath) || !fs.statSync(scriptPath).isFile()) {
      continue;
    }

    try {
      const content = fs.readFileSync(scriptPath, "utf8");
      if (/(jsonl|logger|log_|logs\/|debug|trace|>>\s*["']?[^"']+)/i.test(content)) {
        return true;
      }
    } catch (_error) {
      // Ignore read errors and keep scanning.
    }
  }
  return false;
}

function analyzeMatcher(event, matcher, issues) {
  if (matcher === undefined) {
    return;
  }

  if (typeof matcher !== "string" || matcher.trim() === "") {
    issues.push(`HIGH: Empty or non-string matcher on ${event}`);
    return;
  }

  if (matcher === "*") {
    if (matcherIgnoredEvents.has(event)) {
      issues.push(`MEDIUM: Matcher is ignored for ${event} and should be removed`);
    } else if (matcherSupportedEvents.has(event)) {
      issues.push(`MEDIUM: Broad matcher '*' on ${event} applies to every matching lifecycle call`);
    }
    return;
  }

  if (matcherIgnoredEvents.has(event)) {
    issues.push(`MEDIUM: Matcher is ignored for ${event} and should be removed`);
    return;
  }

  if (matcherSupportedEvents.has(event)) {
    try {
      // Matcher uses regex semantics in Claude Code.
      // eslint-disable-next-line no-new
      new RegExp(matcher);
    } catch (error) {
      issues.push(`HIGH: Invalid matcher regex '${matcher}': ${String(error.message || error)}`);
      return;
    }
  }

  if (/^[A-Za-z]+\(.+\)$/.test(matcher)) {
    issues.push(`HIGH: Matcher '${matcher}' uses argument-style syntax and will not match tool input`);
  }

  if (/\w\*/.test(matcher) && !/\.\*/.test(matcher) && !/^.*\|.*$/.test(matcher)) {
    issues.push(`MEDIUM: Matcher '${matcher}' appears glob-like; prefer explicit regex (for example 'prefix.*')`);
  }
}

function analyzeHook(sourceLabel, sourceFile, event, matcher, hook, groupSchemaIssue) {
  const issues = [];
  const baseDir = path.dirname(sourceFile);

  if (groupSchemaIssue) {
    issues.push(`HIGH: ${groupSchemaIssue}`);
  }

  analyzeMatcher(event, matcher, issues);

  if (!hook || typeof hook !== "object") {
    issues.push("HIGH: Hook entry is not an object");
    return {
      hookName: "invalid-hook",
      event,
      matcher: matcher ?? null,
      scriptsValidated: false,
      riskLevel: "high",
      issues,
      source: sourceLabel,
    };
  }

  const hookType = hook.type;
  if (!["command", "prompt", "agent"].includes(hookType)) {
    issues.push(`HIGH: Unsupported hook type '${String(hookType)}'`);
  }

  const scriptCandidates = extractScriptCandidates(hook.command);
  const resolvedPaths = scriptCandidates.map((candidate) => normalizePathCandidate(candidate, baseDir));
  const missingPaths = resolvedPaths.filter((resolvedPath) => !fs.existsSync(resolvedPath));

  if (hookType === "command") {
    if (typeof hook.command !== "string" || hook.command.trim() === "") {
      issues.push("HIGH: Command hook has empty command");
    } else if (scriptCandidates.length === 0 && !commandLooksInlineOnly(hook.command)) {
      issues.push("MEDIUM: Command hook has no detectable script path; ensure command is intentional");
    }
  }

  if (missingPaths.length > 0) {
    issues.push(`HIGH: Missing script path(s): ${missingPaths.join(", ")}`);
  }

  if (hook.async === true) {
    const commandHasLogHints = typeof hook.command === "string" && /log|logger|jsonl|trace|debug/i.test(hook.command);
    const scriptHasLogHints = scriptHasLoggingHints(resolvedPaths);
    if (!commandHasLogHints && !scriptHasLogHints) {
      issues.push("MEDIUM: Async hook has no obvious logging/trace output");
    }
  }

  if (typeof hook.command === "string" && /\|\|\s*true/.test(hook.command) && event === "PreToolUse") {
    issues.push("MEDIUM: PreToolUse command uses '|| true' which can suppress enforcement failures");
  }

  if (typeof hook.command === "string" && /2>\/dev\/null/.test(hook.command) && event === "PreToolUse") {
    issues.push("MEDIUM: PreToolUse command suppresses stderr with 2>/dev/null");
  }

  if (event === "PreToolUse" && resolvedPaths.length > 0) {
    inspectPreToolScriptExitCodes(resolvedPaths, issues);
  }

  if (event === "PreToolUse" && typeof hook.command === "string" && /post-/i.test(hook.command)) {
    issues.push("MEDIUM: PreToolUse calls a post-* script name; verify lifecycle alignment");
  }
  if (event === "PostToolUse" && typeof hook.command === "string" && /pre-/i.test(hook.command)) {
    issues.push("MEDIUM: PostToolUse calls a pre-* script name; verify lifecycle alignment");
  }

  const scriptsValidated = missingPaths.length === 0;
  return {
    hookName: deriveHookName(hook, scriptCandidates),
    event,
    matcher: matcher ?? null,
    scriptsValidated,
    riskLevel: detectRiskLevel(issues),
    issues,
    source: sourceLabel,
  };
}

function collectHooksFromConfig(sourceLabel, sourceFile, configJson, outputHooks, sourceMeta) {
  const hooksObject = configJson && typeof configJson === "object" ? configJson.hooks : undefined;
  if (!hooksObject || typeof hooksObject !== "object") {
    sourceMeta.push({
      source: sourceLabel,
      file: sourceFile,
      exists: true,
      parsed: true,
      notes: "No top-level hooks object found",
    });
    return;
  }

  sourceMeta.push({
    source: sourceLabel,
    file: sourceFile,
    exists: true,
    parsed: true,
    events: Object.keys(hooksObject).length,
  });

  for (const [event, groups] of Object.entries(hooksObject)) {
    if (!Array.isArray(groups)) {
      outputHooks.push({
        hookName: "invalid-group",
        event,
        matcher: null,
        scriptsValidated: false,
        riskLevel: "high",
        issues: [`HIGH: Event '${event}' is not an array`],
        source: sourceLabel,
      });
      continue;
    }

    for (const group of groups) {
      const matcher = group && typeof group === "object" ? group.matcher : undefined;
      let groupSchemaIssue = "";
      let hooks = [];

      if (group && typeof group === "object" && Array.isArray(group.hooks)) {
        hooks = group.hooks;
      } else if (group && typeof group === "object" && (group.type || group.command)) {
        hooks = [group];
        groupSchemaIssue = `Event '${event}' group should use { matcher?, hooks: [...] } shape`;
      } else {
        outputHooks.push({
          hookName: "invalid-group",
          event,
          matcher: matcher ?? null,
          scriptsValidated: false,
          riskLevel: "high",
          issues: [`HIGH: Event '${event}' contains invalid group structure`],
          source: sourceLabel,
        });
        continue;
      }

      for (const hook of hooks) {
        outputHooks.push(analyzeHook(sourceLabel, sourceFile, event, matcher, hook, groupSchemaIssue));
      }
    }
  }
}

function main() {
  const hooks = [];
  const sources = [];

  for (const source of sourceDefinitions) {
    const loaded = safeReadJson(source.file);
    if (!loaded.exists) {
      sources.push({
        source: source.label,
        file: source.file,
        exists: false,
      });
      continue;
    }

    if (loaded.error) {
      sources.push({
        source: source.label,
        file: source.file,
        exists: true,
        parsed: false,
        error: loaded.error,
      });
      hooks.push({
        hookName: "invalid-json",
        event: "N/A",
        matcher: null,
        scriptsValidated: false,
        riskLevel: "high",
        issues: [`HIGH: Failed to parse JSON: ${loaded.error}`],
        source: source.label,
      });
      continue;
    }

    collectHooksFromConfig(source.label, source.file, loaded.value, hooks, sources);
  }

  const summary = hooks.reduce(
    (acc, hook) => {
      acc.total += 1;
      acc[hook.riskLevel] += 1;
      return acc;
    },
    { total: 0, high: 0, medium: 0, low: 0 }
  );

  const report = {
    generatedAt: new Date().toISOString(),
    sources,
    hooks,
    summary,
  };

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

  if (shouldFailOnHighRisk) {
    const highRiskOwnedSources = hooks.filter(
      (hook) => hook.riskLevel === "high" && hook.source !== "environment"
    );
    if (highRiskOwnedSources.length > 0) {
      process.exit(1);
    }
  }

}

main();
