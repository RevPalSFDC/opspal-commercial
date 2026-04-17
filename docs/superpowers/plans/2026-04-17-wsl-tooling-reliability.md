# WSL Tooling Reliability: Puppeteer, sf-query Pipe Truncation, Excel File Locks

> **Status:** follow-up spec — run `superpowers:brainstorm` before writing implementation tasks.
> **Filed:** 2026-04-17
> **Origin:** reflection-remediation-2026-04-17 branch, Task 5

## Problem

Three classes of WSL-specific tooling failures surface repeatedly in the reflection corpus but
have no systematic fix. First, Puppeteer scripts break silently when `page.waitForTimeout` is
called — it was removed in newer Puppeteer versions, causing scripts to crash or hang without a
useful error. Second, piping large `sf data query` or `sf sobject describe` JSON output directly
to `python3` via a shell pipe silently truncates when output exceeds the pipe buffer, producing
empty or malformed JSON with no error emitted. Third, WSL2 mounted Windows filesystems surface
Windows file locks as EACCES errors — when Excel holds a file open, Python and bash cannot
write to it even though `ls` shows `rwxrwxrwx` permissions. Additionally, the sf CLI Bulk API
v2 wrapper has an observed WSL2-specific bug where the initial job-creation POST never
completes, leaving the server-side job in an unknown state. All four failures are silent or
produce misleading errors, making them disproportionately expensive to debug.

## Source reflections

- `4194b290`: "page.waitForTimeout was removed in newer Puppeteer versions; scripts using it fail silently or crash" (org: Client-A, 2026-03-14)
- `e84c385a`: "Large JSON output from sf data query exceeds pipe buffer when piped directly to python3. Pipe silently truncates or returns empty, causing json parse errors downstream." (org: Client-A, 2026-03-15)
- `ed5fbdbc`: "sf sobject describe for [COMPANY] returns very large JSON that exceeds bash pipe buffer when piped directly to python3 stdin. The sf data query silently returns empty." (org: Client-A, 2026-03-13)
- `011c05a4`: "WSL2 mounted Windows filesystems reflect Windows file locks — Python/bash cannot write to files held open by Excel even though ls shows rwxrwxrwx permissions" (org: Client-A, 2026-03-14)
- `2b8e552f`: "Excel holds an exclusive lock on open files. WSL sed/Edit operations fail with EACCES when the file is locked by another process." (org: aspire, 2026-02-07)
- `a99ceb96`: "The sf CLI Bulk API v2 wrapper has a bug or network issue in WSL2 environment where the initial job creation POST never completes. The server-side job is never created." (org: Client-A, 2026-04-14)

## Target plugins

- `opspal-salesforce` (primary: sf CLI scripts, Puppeteer-based browser automation, bulk API wrapper)
- `opspal-hubspot` (secondary: browser-based scrape scripts share the Puppeteer dependency)

## Open questions for brainstorm

1. Should we abstract WSL-aware shell invocations behind a shared helper (`wsl-safe-exec` or similar) that handles pipe-buffer routing, or fix each call site individually? What's the maintenance tradeoff?
2. What's the canonical fix for `sf data query | python3` truncation? Leading candidates: (a) write sf output to a tmp file first then read, (b) use `--result-format json > file && node-read`, (c) use the JS SDK instead of shell pipe. Which is safest?
3. How do we detect WSL2 vs native Linux at runtime so guidance, error messages, and fallback paths can be platform-specific?
4. For the Excel file-lock class: should we add a pre-write guard that detects the lock and surfaces a user-readable error, or redirect to a tmp file and swap on success?

## Out of scope

- WSL2 Python environment management (PEP 668 `--break-system-packages` issues — separate ops concern)
- WSL2 Unicode encoding mismatches (em-dash rendering) — related but separate fix scope
- Stop-hook WSL reliability (sync command hangs, `/tmp` cross-filesystem scans) — already documented in `dev-tools/` boundary policy

## Pre-requisites

- Inventory all scripts in `plugins/opspal-salesforce/scripts/` that invoke `sf data query` or `sf sobject describe` with a pipe to python — brainstorm should scope the fix surface before writing tasks

---
**Next step:** Run `superpowers:brainstorm` with this stub as input.
