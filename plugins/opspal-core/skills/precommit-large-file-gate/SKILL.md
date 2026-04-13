---
name: precommit-large-file-gate
description: Implement staged-file size gates in pre-commit hooks with allowlists and actionable block messages.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# precommit-large-file-gate

## When to Use This Skill

- A developer accidentally staged a compiled binary, database file, or generated PDF in a commit
- The repo is growing at an abnormal rate due to committed log files, `.enc` artifacts, or `node_modules` fragments
- A pre-commit hook is needed to block files above a configurable byte threshold with an actionable error message
- Encrypted asset files (`.enc`) are being committed without going through the license server's key-generation flow
- A CI pipeline is rejecting pushes due to large files and the root cause needs a preventive local gate

**Not for**: secret scanning or credential detection — use `precommit-quality-enforcement-framework` for that.

## Threshold and Allowlist Reference

| File Type | Default Block Threshold | Allowlisted Extensions | Action |
|-----------|------------------------|----------------------|--------|
| General binary | 1 MB | `.enc` (with owner approval) | block + message |
| Generated assets | 500 KB | `.pdf`, `.pptx` in `templates/` | warn |
| Source code | 200 KB | none | warn |
| Anything in `node_modules/` | 1 byte | none | block always |

## Workflow

1. **Enumerate staged files**: use `git diff --cached --name-only` to get the list of files staged for commit.
2. **Measure each file's size**: run `git cat-file -s :<filepath>` to get the blob size without reading the file to disk.
3. **Apply threshold rules**: compare each file's size against the threshold table; classify as allow, warn, or block.
4. **Check against the allowlist**: for any file that would be blocked, check its path against the allowlist in `./thresholds-and-allowlists.md`; downgrade to warn if it matches.
5. **Emit actionable block message**: if any file is blocked, print:
   ```
   ERROR: <filepath> is <size>KB, exceeding the <threshold>KB pre-commit limit.
   To remove from staging: git restore --staged <filepath>
   To add a permanent allowlist exception: update precommit-large-file-gate/thresholds-and-allowlists.md
   ```
6. **Exit with correct code**: exit 1 (block) if any file exceeds its threshold and is not allowlisted; exit 0 (allow) otherwise.
7. **Run the test matrix**: verify behavior against the cases in `./test-matrix.md` — at minimum: 1-byte file (allow), threshold-exact file (warn), threshold+1 file (block), allowlisted large file (allow).

## References

- [Thresholds and Allowlists](./thresholds-and-allowlists.md)
- [Enforcement Pattern](./enforcement-pattern.md)
- [Test Matrix](./test-matrix.md)
