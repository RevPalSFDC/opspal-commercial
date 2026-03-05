#!/usr/bin/env python3
"""
generate-script-inventory.py - Generate comprehensive inventory of all scripts
Creates detailed catalog for code review and optimization
"""

import os
import csv
import json
import subprocess
import re
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Any, Optional
import hashlib




import sys

LIB_DIR = Path(__file__).resolve().parent / "lib"
if not LIB_DIR.exists():
    LIB_DIR = Path(__file__).resolve().parent.parent / "lib"
sys.path.insert(0, str(LIB_DIR))

from instance_resolver import resolve_project_root

PROJECT_ROOT = resolve_project_root()

class ScriptInventory:
    """Generate comprehensive inventory of scripts"""
    
    def __init__(self, scripts_dir: str):
        self.scripts_dir = Path(scripts_dir)
        self.inventory = []
        self.statistics = {
            'total_scripts': 0,
            'shell_scripts': 0,
            'python_scripts': 0,
            'total_lines': 0,
            'total_functions': 0,
            'scripts_with_issues': 0
        }
        
    def analyze_script(self, file_path: Path) -> Dict[str, Any]:
        """Analyze a single script file"""
        info = {
            'file_name': file_path.name,
            'relative_path': str(file_path.relative_to(self.scripts_dir)),
            'type': self._get_script_type(file_path),
            'size_bytes': file_path.stat().st_size,
            'lines': 0,
            'functions': 0,
            'has_shebang': False,
            'has_set_e': False,
            'has_eval': False,
            'has_bare_except': False,
            'has_subprocess': False,
            'has_credentials': False,
            'has_todo': False,
            'is_executable': os.access(file_path, os.X_OK),
            'last_modified': datetime.fromtimestamp(file_path.stat().st_mtime).isoformat(),
            'category': self._categorize_script(file_path),
            'purpose': self._extract_purpose(file_path),
            'dependencies': [],
            'issues': [],
            'optimization_potential': 'low',
            'priority': 'normal'
        }
        
        try:
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()
                lines = content.splitlines()
                info['lines'] = len(lines)
                
                # Check first line for shebang
                if lines and lines[0].startswith('#!'):
                    info['has_shebang'] = True
                
                # Script-specific analysis
                if info['type'] == 'shell':
                    info = self._analyze_shell_script(info, content, lines)
                elif info['type'] == 'python':
                    info = self._analyze_python_script(info, content, lines)
                
                # Common checks
                if re.search(r'\b(password|token|key|secret|credential)\b', content, re.IGNORECASE):
                    info['has_credentials'] = True
                    info['issues'].append('potential_credentials')
                    
                if re.search(r'\b(TODO|FIXME|XXX|HACK)\b', content):
                    info['has_todo'] = True
                    info['issues'].append('has_todo_items')
                    
        except Exception as e:
            info['issues'].append(f'analysis_error: {str(e)}')
            
        # Calculate optimization potential
        info['optimization_potential'] = self._calculate_optimization_potential(info)
        
        # Set priority based on issues and size
        info['priority'] = self._calculate_priority(info)
        
        return info
    
    def _get_script_type(self, file_path: Path) -> str:
        """Determine script type"""
        if file_path.suffix == '.sh':
            return 'shell'
        elif file_path.suffix == '.py':
            return 'python'
        else:
            # Check shebang
            try:
                with open(file_path, 'r') as f:
                    first_line = f.readline().strip()
                    if 'bash' in first_line or 'sh' in first_line:
                        return 'shell'
                    elif 'python' in first_line:
                        return 'python'
            except:
                pass
        return 'unknown'
    
    def _categorize_script(self, file_path: Path) -> str:
        """Categorize script by function"""
        name = file_path.name.lower()
        parent = file_path.parent.name.lower()
        
        if 'test' in name:
            return 'testing'
        elif 'deploy' in name or parent == 'deployment':
            return 'deployment'
        elif 'valid' in name or parent == 'validation':
            return 'validation'
        elif 'import' in name or 'export' in name or 'data' in name:
            return 'data_operations'
        elif 'error' in name or 'retry' in name or 'fix' in name:
            return 'error_handling'
        elif 'monitor' in name or 'health' in name:
            return 'monitoring'
        elif 'claude' in name or 'mcp' in name:
            return 'integration'
        elif parent == 'utilities' or 'util' in name:
            return 'utilities'
        elif 'setup' in name or 'init' in name or 'install' in name:
            return 'setup'
        else:
            return 'general'
    
    def _extract_purpose(self, file_path: Path) -> str:
        """Extract script purpose from comments"""
        try:
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                lines = f.readlines()[:20]  # Check first 20 lines
                for line in lines:
                    # Look for purpose/description comments
                    if re.match(r'^#\s*(Purpose|Description|Summary):', line, re.IGNORECASE):
                        return line.split(':', 1)[1].strip()
                    elif re.match(r'^#\s*\w+.*-\s+', line):
                        # Generic description pattern
                        desc = re.sub(r'^#\s*\w+.*-\s+', '', line).strip()
                        if len(desc) > 10:
                            return desc
        except:
            pass
        return 'No description found'
    
    def _analyze_shell_script(self, info: Dict, content: str, lines: List[str]) -> Dict:
        """Analyze shell script specific patterns"""
        # Check for set -e
        if re.search(r'^set\s+-e', content, re.MULTILINE):
            info['has_set_e'] = True
        else:
            info['issues'].append('missing_set_e')
            
        # Check for eval usage
        if re.search(r'\beval\s+', content):
            info['has_eval'] = True
            info['issues'].append('uses_eval')
            
        # Count functions
        functions = re.findall(r'^[a-zA-Z_][a-zA-Z0-9_]*\(\)', content, re.MULTILINE)
        info['functions'] = len(functions)
        
        # Check for shellcheck disable
        if 'shellcheck disable' in content:
            info['issues'].append('shellcheck_disabled')
            
        # Extract dependencies (sourced files)
        sources = re.findall(r'^\s*(?:source|\.)\s+["\'](.*?)["\']', content, re.MULTILINE)
        info['dependencies'].extend(sources)
        
        return info
    
    def _analyze_python_script(self, info: Dict, content: str, lines: List[str]) -> Dict:
        """Analyze Python script specific patterns"""
        # Check for bare except
        if re.search(r'^\s*except\s*:', content, re.MULTILINE):
            info['has_bare_except'] = True
            info['issues'].append('bare_except')
            
        # Check for subprocess usage
        if 'import subprocess' in content or 'from subprocess' in content:
            info['has_subprocess'] = True
            
        # Count functions and classes
        functions = re.findall(r'^def\s+\w+\(', content, re.MULTILINE)
        classes = re.findall(r'^class\s+\w+', content, re.MULTILINE)
        info['functions'] = len(functions) + len(classes)
        
        # Check for type hints
        if not re.search(r'->\s*\w+:', content):
            info['issues'].append('missing_type_hints')
            
        # Extract imports
        imports = re.findall(r'^(?:import|from)\s+([\w.]+)', content, re.MULTILINE)
        info['dependencies'].extend(imports[:10])  # Limit to first 10
        
        return info
    
    def _calculate_optimization_potential(self, info: Dict) -> str:
        """Calculate optimization potential based on issues and metrics"""
        score = 0
        
        # Size factors
        if info['lines'] > 500:
            score += 3
        elif info['lines'] > 300:
            score += 2
        elif info['lines'] > 200:
            score += 1
            
        # Issue factors
        if info['has_eval']:
            score += 3
        if info['has_credentials']:
            score += 3
        if info['has_bare_except']:
            score += 2
        if not info['has_set_e'] and info['type'] == 'shell':
            score += 2
        if info['has_todo']:
            score += 1
            
        # Complexity factors
        if info['functions'] > 20:
            score += 2
        elif info['functions'] > 10:
            score += 1
            
        if score >= 5:
            return 'high'
        elif score >= 3:
            return 'medium'
        else:
            return 'low'
    
    def _calculate_priority(self, info: Dict) -> str:
        """Calculate priority for optimization"""
        if info['has_credentials'] or info['has_eval']:
            return 'critical'
        elif info['optimization_potential'] == 'high':
            return 'high'
        elif len(info['issues']) > 3:
            return 'high'
        elif info['optimization_potential'] == 'medium':
            return 'medium'
        else:
            return 'normal'
    
    def generate_inventory(self) -> List[Dict]:
        """Generate complete inventory"""
        print("Scanning scripts directory...")
        
        for file_path in self.scripts_dir.rglob('*'):
            if file_path.is_file() and file_path.suffix in ['.sh', '.py', '']:
                # Check if it might be a script without extension
                if file_path.suffix == '':
                    try:
                        with open(file_path, 'r') as f:
                            first_line = f.readline()
                            if not first_line.startswith('#!'):
                                continue
                    except:
                        continue
                        
                print(f"Analyzing: {file_path.relative_to(self.scripts_dir)}")
                script_info = self.analyze_script(file_path)
                self.inventory.append(script_info)
                
                # Update statistics
                self.statistics['total_scripts'] += 1
                if script_info['type'] == 'shell':
                    self.statistics['shell_scripts'] += 1
                elif script_info['type'] == 'python':
                    self.statistics['python_scripts'] += 1
                self.statistics['total_lines'] += script_info['lines']
                self.statistics['total_functions'] += script_info['functions']
                if script_info['issues']:
                    self.statistics['scripts_with_issues'] += 1
                    
        return self.inventory
    
    def save_inventory(self, output_dir: str = '.'):
        """Save inventory to multiple formats"""
        output_dir = Path(output_dir)
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        
        # Save as CSV
        csv_file = output_dir / f'script_inventory_{timestamp}.csv'
        with open(csv_file, 'w', newline='') as f:
            if self.inventory:
                fieldnames = self.inventory[0].keys()
                writer = csv.DictWriter(f, fieldnames=fieldnames)
                writer.writeheader()
                for script in self.inventory:
                    # Convert lists to strings for CSV
                    row = script.copy()
                    row['dependencies'] = '|'.join(row['dependencies'])
                    row['issues'] = '|'.join(row['issues'])
                    writer.writerow(row)
        print(f"CSV inventory saved to: {csv_file}")
        
        # Save as JSON
        json_file = output_dir / f'script_inventory_{timestamp}.json'
        with open(json_file, 'w') as f:
            json.dump({
                'metadata': {
                    'generated': datetime.now().isoformat(),
                    'scripts_dir': str(self.scripts_dir),
                    'statistics': self.statistics
                },
                'inventory': self.inventory
            }, f, indent=2)
        print(f"JSON inventory saved to: {json_file}")
        
        # Generate summary report
        self.generate_summary_report(output_dir / f'inventory_summary_{timestamp}.md')
    
    def generate_summary_report(self, output_file: Path):
        """Generate markdown summary report"""
        with open(output_file, 'w') as f:
            f.write("# Script Inventory Summary Report\n\n")
            f.write(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n")
            
            # Statistics
            f.write("## Statistics\n\n")
            f.write(f"- **Total Scripts**: {self.statistics['total_scripts']}\n")
            f.write(f"- **Shell Scripts**: {self.statistics['shell_scripts']}\n")
            f.write(f"- **Python Scripts**: {self.statistics['python_scripts']}\n")
            f.write(f"- **Total Lines**: {self.statistics['total_lines']:,}\n")
            f.write(f"- **Total Functions**: {self.statistics['total_functions']:,}\n")
            f.write(f"- **Scripts with Issues**: {self.statistics['scripts_with_issues']}\n\n")
            
            # Category breakdown
            f.write("## Scripts by Category\n\n")
            categories = {}
            for script in self.inventory:
                cat = script['category']
                if cat not in categories:
                    categories[cat] = []
                categories[cat].append(script)
                
            for cat, scripts in sorted(categories.items()):
                f.write(f"### {cat.replace('_', ' ').title()} ({len(scripts)} scripts)\n")
                for s in sorted(scripts, key=lambda x: x['priority'], reverse=True)[:5]:
                    f.write(f"- `{s['file_name']}` - {s['priority']} priority")
                    if s['issues']:
                        f.write(f" - Issues: {', '.join(s['issues'][:3])}")
                    f.write("\n")
                if len(scripts) > 5:
                    f.write(f"- ... and {len(scripts) - 5} more\n")
                f.write("\n")
            
            # Critical issues
            f.write("## Critical Issues\n\n")
            critical_scripts = [s for s in self.inventory if s['priority'] == 'critical']
            if critical_scripts:
                for script in critical_scripts:
                    f.write(f"- **{script['file_name']}**: {', '.join(script['issues'])}\n")
            else:
                f.write("No critical issues found.\n")
            f.write("\n")
            
            # Large scripts needing refactoring
            f.write("## Large Scripts (>500 lines)\n\n")
            large_scripts = [s for s in self.inventory if s['lines'] > 500]
            for script in sorted(large_scripts, key=lambda x: x['lines'], reverse=True):
                f.write(f"- `{script['file_name']}`: {script['lines']} lines\n")
            f.write("\n")
            
            # Optimization candidates
            f.write("## High Optimization Potential\n\n")
            high_opt = [s for s in self.inventory if s['optimization_potential'] == 'high']
            for script in sorted(high_opt, key=lambda x: x['lines'], reverse=True)[:10]:
                f.write(f"- `{script['file_name']}`: {script['lines']} lines, "
                       f"{len(script['issues'])} issues\n")
            f.write("\n")
            
        print(f"Summary report saved to: {output_file}")


def main():
    """Main execution"""
    import argparse
    
    parser = argparse.ArgumentParser(description='Generate script inventory for code review')
    parser.add_argument('--scripts-dir', default=PROJECT_ROOT,
                       help='Scripts directory to analyze')
    parser.add_argument('--output-dir', default=PROJECT_ROOT,
                       help='Output directory for inventory files')
    
    args = parser.parse_args()
    
    inventory = ScriptInventory(args.scripts_dir)
    inventory.generate_inventory()
    inventory.save_inventory(args.output_dir)
    
    print(f"\nInventory generation complete!")
    print(f"Total scripts analyzed: {inventory.statistics['total_scripts']}")
    print(f"Scripts with issues: {inventory.statistics['scripts_with_issues']}")


if __name__ == '__main__':
    main()