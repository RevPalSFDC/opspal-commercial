#!/usr/bin/env python3
"""
Update sfdc-metadata-manager base agent by replacing extracted sections with summaries.

This script:
1. Reads the current base agent
2. Replaces 9 extracted sections with their summaries from the summaries document
3. Writes the updated base agent
4. Creates a backup of the original
"""

import re
from pathlib import Path
from datetime import datetime

# Define the sections to replace (start line, end line, context name)
SECTIONS_TO_REPLACE = [
    (101, 323, "flow-management-framework", "Context 1"),
    (423, 639, "runbook-context-loading", "Context 2"),
    (640, 839, "fls-field-deployment", "Context 3"),
    (985, 1150, "picklist-modification-protocol", "Context 4"),
    (1151, 1582, "picklist-dependency-deployment", "Context 5"),
    (1583, 1785, "master-detail-relationship", "Context 6"),
    (1984, 2207, "field-verification-protocol", "Context 7"),
    (2247, 2391, "common-tasks-reference", "Context 8"),
    (2552, 2691, "bulk-operations", "Context 9"),
]

def extract_summary_from_doc(summaries_path: Path, context_num: int) -> str:
    """Extract a specific context summary from the summaries document."""
    content = summaries_path.read_text()

    # Find the context section
    pattern = rf"## Context {context_num}:.*?(?=\n## Context |\n## Summary Statistics|\Z)"
    match = re.search(pattern, content, re.DOTALL)

    if not match:
        raise ValueError(f"Could not find Context {context_num} in summaries document")

    return match.group(0).strip()

def create_backup(file_path: Path) -> Path:
    """Create a timestamped backup of the file."""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = file_path.parent / f"{file_path.stem}_backup_{timestamp}{file_path.suffix}"
    backup_path.write_text(file_path.read_text())
    print(f"✓ Created backup: {backup_path.name}")
    return backup_path

def replace_sections(base_agent_path: Path, summaries_path: Path) -> None:
    """Replace extracted sections with summaries in the base agent."""

    # Create backup first
    create_backup(base_agent_path)

    # Read the base agent
    lines = base_agent_path.read_text().splitlines()
    total_lines = len(lines)
    print(f"✓ Read base agent: {total_lines} lines")

    # Read all summaries
    summaries = {}
    for idx, (start, end, context_name, context_label) in enumerate(SECTIONS_TO_REPLACE, 1):
        summary = extract_summary_from_doc(summaries_path, idx)
        summaries[idx] = summary
        print(f"✓ Loaded {context_label}: {context_name}")

    # Replace sections from end to start (to avoid line number shifts)
    new_lines = lines[:]
    removed_lines = 0
    added_lines = 0

    for idx in range(len(SECTIONS_TO_REPLACE), 0, -1):
        start, end, context_name, context_label = SECTIONS_TO_REPLACE[idx - 1]
        summary = summaries[idx]

        # Adjust for 0-indexed (file lines are 1-indexed)
        start_idx = start - 1
        end_idx = end

        # Get summary lines
        summary_lines = summary.split('\n')

        # Replace the section
        before = new_lines[:start_idx]
        after = new_lines[end_idx:]
        new_lines = before + summary_lines + after

        original_count = end_idx - start_idx
        new_count = len(summary_lines)
        removed_lines += original_count
        added_lines += new_count

        print(f"✓ Replaced {context_label} ({context_name}): {original_count} lines → {new_count} lines")

    # Write the updated base agent
    base_agent_path.write_text('\n'.join(new_lines) + '\n')

    new_total = len(new_lines)
    reduction = total_lines - new_total
    percentage = (reduction / total_lines) * 100

    print(f"\n✅ Base agent updated successfully!")
    print(f"   Original lines: {total_lines}")
    print(f"   New lines: {new_total}")
    print(f"   Removed: {removed_lines} lines")
    print(f"   Added: {added_lines} lines")
    print(f"   Net reduction: {reduction} lines ({percentage:.1f}%)")

def main():
    # Paths
    plugin_dir = Path(__file__).parent.parent / ".claude-plugins" / "salesforce-plugin"
    base_agent_path = plugin_dir / "agents" / "sfdc-metadata-manager.md"
    summaries_path = Path(__file__).parent.parent / "docs" / "phase2-context-summaries-for-base-agent.md"

    # Validate paths
    if not base_agent_path.exists():
        raise FileNotFoundError(f"Base agent not found: {base_agent_path}")
    if not summaries_path.exists():
        raise FileNotFoundError(f"Summaries document not found: {summaries_path}")

    print("🚀 Starting base agent update with context summaries\n")

    # Perform replacement
    replace_sections(base_agent_path, summaries_path)

    print(f"\n✓ Updated file: {base_agent_path}")

if __name__ == "__main__":
    main()
