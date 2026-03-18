#!/usr/bin/env python3
import os
import re
import json
from pathlib import Path
from collections import defaultdict

def analyze_agent_tools():
    agents_dir = Path(".claude/agents")
    results = {
        "total_agents": 0,
        "mcp_agents": 0,
        "api_agents": 0,
        "hybrid_agents": 0,
        "mcp_tools": defaultdict(int),
        "api_indicators": defaultdict(int),
        "agent_details": []
    }
    
    # MCP tool patterns
    mcp_patterns = [
        r"mcp_salesforce",
        r"mcp_asana",
        r"mcp_.*"
    ]
    
    # API indicators (Bash with sf commands)
    api_patterns = [
        r"sf\s+",
        r"SF_.*",
    ]
    
    for agent_file in agents_dir.glob("*.md"):
        results["total_agents"] += 1
        agent_name = agent_file.stem
        
        content = agent_file.read_text()
        
        # Extract tools section
        tools_match = re.search(r"^tools:\s*(.+?)(?:\n---|\n#|\Z)", content, re.MULTILINE | re.DOTALL)
        tools_list = []
        uses_mcp = False
        uses_api = False
        
        if tools_match:
            tools_text = tools_match.group(1)
            # Handle both YAML list and comma-separated formats
            if "\n  -" in tools_text:
                tools_list = re.findall(r"^\s*-\s*(.+)$", tools_text, re.MULTILINE)
            else:
                tools_list = [t.strip() for t in tools_text.split(",")]
            
            # Check for MCP tools
            for tool in tools_list:
                for pattern in mcp_patterns:
                    if re.search(pattern, tool):
                        uses_mcp = True
                        results["mcp_tools"][tool] += 1
                        break
        
        # Check for API usage in content
        for pattern in api_patterns:
            if re.search(pattern, content, re.IGNORECASE):
                uses_api = True
                # Count specific API commands
                api_matches = re.findall(r"(sf\s+\w+)", content, re.IGNORECASE)
                for match in api_matches[:5]:  # Limit to first 5 to avoid noise
                    results["api_indicators"][match.lower()] += 1
        
        # Classify agent
        if uses_mcp and uses_api:
            results["hybrid_agents"] += 1
            category = "Hybrid (MCP + API)"
        elif uses_mcp:
            results["mcp_agents"] += 1
            category = "MCP Only"
        elif uses_api:
            results["api_agents"] += 1
            category = "API Only (via Bash)"
        else:
            category = "Neither"
        
        results["agent_details"].append({
            "name": agent_name,
            "category": category,
            "tools": tools_list[:10],  # First 10 tools
            "uses_mcp": uses_mcp,
            "uses_api": uses_api
        })
    
    return results

def print_report(results):
    print("=" * 80)
    print("SALESFORCE SUB-AGENT TOOL USAGE ANALYSIS")
    print("=" * 80)
    print()
    
    # Summary statistics
    print("SUMMARY STATISTICS")
    print("-" * 40)
    print(f"Total Agents: {results['total_agents']}")
    print(f"MCP-Only Agents: {results['mcp_agents']} ({results['mcp_agents']/results['total_agents']*100:.1f}%)")
    print(f"API-Only Agents: {results['api_agents']} ({results['api_agents']/results['total_agents']*100:.1f}%)")
    print(f"Hybrid Agents: {results['hybrid_agents']} ({results['hybrid_agents']/results['total_agents']*100:.1f}%)")
    print()
    
    # Most used MCP tools
    print("TOP MCP TOOLS")
    print("-" * 40)
    for tool, count in sorted(results['mcp_tools'].items(), key=lambda x: x[1], reverse=True)[:10]:
        print(f"{tool}: {count} agents")
    print()
    
    # Most common API commands
    print("TOP API COMMANDS (via Bash)")
    print("-" * 40)
    for cmd, count in sorted(results['api_indicators'].items(), key=lambda x: x[1], reverse=True)[:10]:
        print(f"{cmd}: {count} occurrences")
    print()
    
    # Agent breakdown by category
    print("AGENT BREAKDOWN BY CATEGORY")
    print("-" * 40)
    
    categories = defaultdict(list)
    for agent in results['agent_details']:
        categories[agent['category']].append(agent['name'])
    
    for category, agents in sorted(categories.items()):
        print(f"\n{category} ({len(agents)} agents):")
        for agent in sorted(agents)[:10]:  # Show first 10
            print(f"  - {agent}")
        if len(agents) > 10:
            print(f"  ... and {len(agents) - 10} more")
    
    print()
    print("=" * 80)
    print("KEY FINDINGS")
    print("-" * 40)
    
    # Calculate percentages
    mcp_percentage = (results['mcp_agents'] + results['hybrid_agents']) / results['total_agents'] * 100
    api_percentage = (results['api_agents'] + results['hybrid_agents']) / results['total_agents'] * 100
    
    print(f"• {mcp_percentage:.1f}% of agents use MCP tools (including hybrid)")
    print(f"• {api_percentage:.1f}% of agents use API via Bash (including hybrid)")
    print(f"• {results['hybrid_agents']} agents use BOTH MCP and API approaches")
    
    # Determine primary approach
    if mcp_percentage > api_percentage:
        print(f"• MCP is the PRIMARY approach ({mcp_percentage:.1f}% vs {api_percentage:.1f}%)")
    else:
        print(f"• API via Bash is the PRIMARY approach ({api_percentage:.1f}% vs {mcp_percentage:.1f}%)")
    
    print()
    
    # Save detailed results
    with open("agent-tool-analysis.json", "w") as f:
        json.dump(results, f, indent=2, default=str)
    print("Detailed results saved to: agent-tool-analysis.json")

if __name__ == "__main__":
    results = analyze_agent_tools()
    print_report(results)
