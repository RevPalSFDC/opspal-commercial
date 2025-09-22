#!/usr/bin/env python3
"""
Agent Discovery Script using agents.roster.json
Discovers and lists all available agents across platforms
"""

import json
import os
import sys
from pathlib import Path
from typing import Dict, List, Optional
from dataclasses import dataclass
from datetime import datetime

@dataclass
class Agent:
    """Represents a discovered agent"""
    name: str
    path: str
    category: str
    description: Optional[str] = None
    tools: Optional[List[str]] = None

class AgentDiscovery:
    """Discovers agents using the registry file"""

    def __init__(self, registry_path: str = ".claude/agents.roster.json"):
        self.registry_path = registry_path
        self.base_dir = Path(os.path.dirname(os.path.abspath(__file__))).parent
        self.agents: List[Agent] = []
        self.registry: Dict = {}

    def load_registry(self) -> bool:
        """Load the agent registry file"""
        registry_file = self.base_dir / self.registry_path

        if not registry_file.exists():
            print(f"❌ Registry file not found: {registry_file}")
            return False

        try:
            with open(registry_file, 'r') as f:
                self.registry = json.load(f)
            print(f"✅ Loaded registry version {self.registry.get('version', 'unknown')}")
            return True
        except Exception as e:
            print(f"❌ Error loading registry: {e}")
            return False

    def discover_agents(self, category: Optional[str] = None) -> List[Agent]:
        """Discover agents based on registry"""
        discovered = []

        for cat_name, cat_info in self.registry.get('registry', {}).items():
            if category and cat_name != category:
                continue

            path = self.base_dir / cat_info['path']
            pattern = cat_info.get('pattern', '*.md')

            if not path.exists():
                print(f"⚠️  Path not found: {path}")
                continue

            # Find agent files
            if pattern == '*.md':
                agent_files = list(path.glob('*.md'))
            else:
                agent_files = list(path.glob(pattern))

            for agent_file in agent_files:
                # Skip non-agent files
                if agent_file.name in ['README.md', 'DATA_SOURCE_REQUIREMENTS.md']:
                    continue

                agent_name = agent_file.stem
                agent = Agent(
                    name=agent_name,
                    path=str(agent_file.relative_to(self.base_dir)),
                    category=cat_name,
                    description=self._extract_description(agent_file)
                )
                discovered.append(agent)

        return discovered

    def _extract_description(self, agent_file: Path) -> Optional[str]:
        """Extract description from agent file frontmatter"""
        try:
            with open(agent_file, 'r') as f:
                lines = f.readlines()
                in_frontmatter = False
                for line in lines[:20]:  # Check first 20 lines
                    if line.strip() == '---':
                        in_frontmatter = not in_frontmatter
                        continue
                    if in_frontmatter and line.startswith('description:'):
                        return line.replace('description:', '').strip()
        except:
            pass
        return None

    def list_agents(self, category: Optional[str] = None, verbose: bool = False):
        """List discovered agents"""
        agents = self.discover_agents(category)

        if not agents:
            print("No agents discovered")
            return

        # Group by category
        by_category = {}
        for agent in agents:
            if agent.category not in by_category:
                by_category[agent.category] = []
            by_category[agent.category].append(agent)

        # Display results
        print(f"\n🤖 Discovered {len(agents)} agents across {len(by_category)} categories\n")

        for cat_name, cat_agents in sorted(by_category.items()):
            cat_info = self.registry.get('registry', {}).get(cat_name, {})
            print(f"📁 {cat_name.upper()} ({len(cat_agents)} agents)")
            if cat_info.get('description'):
                print(f"   {cat_info['description']}")
            print()

            if verbose:
                for agent in sorted(cat_agents, key=lambda x: x.name):
                    print(f"   • {agent.name}")
                    if agent.description:
                        print(f"     {agent.description[:80]}...")
            else:
                # Show key agents first
                key_agents = cat_info.get('key_agents', [])
                shown = []

                for key_agent in key_agents[:5]:
                    matching = [a for a in cat_agents if a.name == key_agent]
                    if matching:
                        print(f"   ⭐ {matching[0].name}")
                        shown.append(matching[0].name)

                # Show remaining count
                remaining = len(cat_agents) - len(shown)
                if remaining > 0:
                    other_names = [a.name for a in cat_agents if a.name not in shown][:3]
                    print(f"   • {', '.join(other_names)}...")
                    if remaining > 3:
                        print(f"   • ... and {remaining - 3} more")
            print()

    def find_agent(self, name: str) -> Optional[Agent]:
        """Find a specific agent by name"""
        agents = self.discover_agents()
        for agent in agents:
            if agent.name.lower() == name.lower():
                return agent
        return None

    def validate_registry(self):
        """Validate the registry against actual files"""
        print("🔍 Validating agent registry...\n")

        total_expected = 0
        total_found = 0
        issues = []

        for cat_name, cat_info in self.registry.get('registry', {}).items():
            expected_count = cat_info.get('count', 0)
            agents = self.discover_agents(cat_name)
            found_count = len(agents)

            total_expected += expected_count
            total_found += found_count

            status = "✅" if found_count == expected_count else "⚠️"
            print(f"{status} {cat_name}: Expected {expected_count}, Found {found_count}")

            if found_count != expected_count:
                issues.append(f"{cat_name}: count mismatch")

            # Check key agents exist
            key_agents = cat_info.get('key_agents', [])
            agent_names = [a.name for a in agents]
            missing_key = [ka for ka in key_agents if ka not in agent_names]

            if missing_key:
                print(f"   ❌ Missing key agents: {', '.join(missing_key)}")
                issues.append(f"{cat_name}: missing key agents")

        print(f"\n📊 Summary: {total_found}/{total_expected} agents found")

        if issues:
            print(f"⚠️  Issues found:")
            for issue in issues:
                print(f"   • {issue}")
            print("\nRun scripts/update-agent-registry.sh to refresh the registry")
        else:
            print("✅ Registry is valid and up to date!")

def main():
    """Main entry point"""
    import argparse

    parser = argparse.ArgumentParser(description='Discover agents using registry')
    parser.add_argument('action', choices=['list', 'find', 'validate'],
                       help='Action to perform')
    parser.add_argument('--category', '-c', help='Filter by category')
    parser.add_argument('--verbose', '-v', action='store_true',
                       help='Show detailed output')
    parser.add_argument('--name', '-n', help='Agent name to find')

    args = parser.parse_args()

    discovery = AgentDiscovery()

    if not discovery.load_registry():
        sys.exit(1)

    if args.action == 'list':
        discovery.list_agents(args.category, args.verbose)
    elif args.action == 'find':
        if not args.name:
            print("❌ --name required for find action")
            sys.exit(1)
        agent = discovery.find_agent(args.name)
        if agent:
            print(f"✅ Found: {agent.name}")
            print(f"   Path: {agent.path}")
            print(f"   Category: {agent.category}")
            if agent.description:
                print(f"   Description: {agent.description}")
        else:
            print(f"❌ Agent not found: {args.name}")
    elif args.action == 'validate':
        discovery.validate_registry()

if __name__ == '__main__':
    main()