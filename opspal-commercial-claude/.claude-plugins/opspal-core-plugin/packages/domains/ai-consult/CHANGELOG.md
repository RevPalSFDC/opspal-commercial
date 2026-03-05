# Changelog

All notable changes to the AI Consult Plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.3.0] - 2025-12-06

### Added
- **ACE Framework Integration**: Consultation outcomes now logged to ACE skill registry
  - `ace-integration.js` - Connects consultation to ACE skill tracking
  - Automatic skill registration (`gemini-consultation-core`)
  - Execution tracking with alignment scores, topics, success rates
  - History-based recommendation engine (`shouldConsult`)
  - Agent-specific consultation statistics
- **Learning-Based Triggers**: Auto-consultation now uses historical success rates
  - `checkAllTriggersWithACE()` - Async trigger check with ACE history
  - Topic-specific success rate analysis
  - Confidence-weighted recommendations based on past outcomes
- **Post-Tool Logging**: Hook automatically logs gemini-consult completions to ACE
  - Extracts alignment scores from consultation output
  - Tracks success/failure per agent
  - Runs in background to not block workflow

### Changed
- `consultation-trigger.js` updated to v1.1.0 with ACE integration
- `post-tool-use-consultation-check.sh` updated to v1.1.0 with ACE logging
- New environment variable: `ENABLE_ACE_LOGGING=1` (default enabled)

## [1.2.1] - 2025-12-06

### Improved
- **Alignment Scoring Algorithm**: Multi-strategy similarity calculation
  - Text normalization with stop word removal and basic stemming
  - N-gram (bigram) overlap detection
  - Key concept extraction for technical terms (Redis, JWT, TTL, etc.)
  - Character trigram similarity for short text comparison
  - Adaptive thresholds based on concept overlap (0.30-0.50 depending on technical term matches)
- **Point Matching**: Now correctly matches paraphrased statements
  - "Add indexes" matches "Create indexes"
  - "Use query caching with Redis" matches "Implement caching layer (Redis recommended)"
- Test suite validation: 5/5 scenarios produce accurate alignment scores

### Fixed
- Gemini CLI invoker now uses positional arguments (deprecated `-p` flag removed)
- Response parser handles `{ response: "..." }` format from Gemini CLI v0.19+

## [1.2.0] - 2025-12-06

### Added
- `/gemini-link` slash command - Set up and verify Gemini CLI connection
- `/gemini-consult` slash command - Quick access to cross-model consultation
- Commands support `--check`, `--setup`, and `--test` flags

## [1.1.0] - 2025-12-06

### Added
- **Auto-Consultation Triggers**: Automatically suggests Gemini consultation when agents struggle
- `consultation-trigger.js` - Detects when consultation should be suggested
- `post-tool-use-consultation-check.sh` - PostToolUse hook for monitoring agent output
- Complexity-based triggers (>= 85% complexity suggests consultation)
- Confidence-based triggers (< 40% confidence suggests consultation)
- Uncertainty detection (3+ uncertainty phrases triggers consultation)
- Error pattern detection (2+ errors/retries suggests consultation)
- Architecture decision detection for cross-model perspective
- Configurable thresholds via environment variables

### Changed
- Updated plugin.json with PostToolUse hook registration
- Enhanced agent definition with auto-consultation patterns
- Improved CLAUDE.md documentation with auto-consultation section

## [1.0.0] - 2025-12-05

### Added
- Initial release of AI Consult Plugin
- `gemini-consult` agent for cross-model consultation
- `gemini-cli-invoker.js` - Gemini CLI wrapper with retry logic
- `response-synthesizer.js` - Claude + Gemini response merger
- `prereq-check.sh` - Dependency validation script
- Support for multiple Gemini models (pro, flash)
- Alignment scoring (0-100%) for response comparison
- Agreement and difference detection
- Synthesized recommendations based on alignment level
- Security warnings for sensitive content
- Comprehensive documentation (CLAUDE.md, README.md)

### Features
- Non-interactive Gemini CLI invocation via `-p` flag
- JSON output parsing for structured responses
- File context inclusion with `--file` flag
- Configurable timeout and model selection
- Rate limit awareness and error handling
- CLI interface for direct script usage

### Supported Use Cases
- Code review second opinions
- Architecture decision consultation
- Debugging assistance
- Best practices validation

---

## Future Roadmap

### [1.4.0] - Planned
- Batch consultation mode for multiple questions
- Custom synthesis templates per topic
- Caching for repeated consultations

### [2.0.0] - Planned
- MCP server integration for direct Gemini API
- Additional AI model support (OpenAI, etc.)
- Real-time streaming responses
- Multi-model simultaneous consultation
