#!/usr/bin/env python3

"""
error-pattern-learner.py - Automated Error Pattern Learning System
Analyzes import failures to identify patterns and suggest solutions
"""

import json
import re
import sqlite3
import sys
from datetime import datetime, timedelta
from collections import defaultdict, Counter
from pathlib import Path
import hashlib

class ErrorPatternLearner:
    def __init__(self, db_path=None):
        """Initialize the error pattern learning system"""
        if db_path is None:
            script_dir = Path(__file__).parent
            db_path = script_dir / '..' / '.validation-cache' / 'error_patterns.db'
        
        self.db_path = db_path
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self.init_database()
        
        # Common error patterns and their solutions
        self.known_patterns = {
            r'LineEnding is invalid': {
                'category': 'line_ending',
                'solution': 'Convert file to CRLF format using unix2dos or safe-bulk-import.sh -l CRLF',
                'confidence': 0.95
            },
            r'Required fields? are missing': {
                'category': 'missing_field',
                'solution': 'Add required fields to CSV or use pre-import-validator.sh to auto-add defaults',
                'confidence': 0.90
            },
            r'INVALID_FIELD_FOR_INSERT_UPDATE': {
                'category': 'invalid_field',
                'solution': 'Check field API names match exactly (case-sensitive) with Salesforce',
                'confidence': 0.85
            },
            r'DUPLICATE_VALUE': {
                'category': 'duplicate',
                'solution': 'Check for unique field constraints and existing records',
                'confidence': 0.88
            },
            r'FIELD_CUSTOM_VALIDATION_EXCEPTION': {
                'category': 'validation_rule',
                'solution': 'Review validation rules using validation-rule-manager.sh analyze',
                'confidence': 0.92
            },
            r'INSUFFICIENT_ACCESS': {
                'category': 'permission',
                'solution': 'Check field-level security and object permissions for integration user',
                'confidence': 0.87
            },
            r'STRING_TOO_LONG': {
                'category': 'data_format',
                'solution': 'Truncate field values to match Salesforce field length limits',
                'confidence': 0.93
            },
            r'INVALID_EMAIL_ADDRESS': {
                'category': 'data_format',
                'solution': 'Validate email format: user@domain.com',
                'confidence': 0.96
            },
            r'UNABLE_TO_LOCK_ROW': {
                'category': 'concurrency',
                'solution': 'Reduce batch size or retry with exponential backoff',
                'confidence': 0.82
            },
            r'STORAGE_LIMIT_EXCEEDED': {
                'category': 'org_limit',
                'solution': 'Check org data storage limits and clean up unnecessary records',
                'confidence': 0.91
            }
        }
    
    def init_database(self):
        """Initialize SQLite database for pattern storage"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # Create tables
        cursor.executescript('''
            CREATE TABLE IF NOT EXISTS error_occurrences (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                error_hash TEXT NOT NULL,
                error_message TEXT NOT NULL,
                error_category TEXT,
                object_name TEXT,
                operation TEXT,
                record_count INTEGER,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                file_path TEXT,
                org_alias TEXT
            );
            
            CREATE TABLE IF NOT EXISTS learned_patterns (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                pattern TEXT UNIQUE NOT NULL,
                category TEXT NOT NULL,
                solution TEXT NOT NULL,
                confidence REAL DEFAULT 0.5,
                success_count INTEGER DEFAULT 0,
                failure_count INTEGER DEFAULT 0,
                last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            
            CREATE TABLE IF NOT EXISTS solution_feedback (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                error_hash TEXT NOT NULL,
                solution_applied TEXT NOT NULL,
                was_successful BOOLEAN NOT NULL,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                notes TEXT
            );
            
            CREATE INDEX IF NOT EXISTS idx_error_hash ON error_occurrences(error_hash);
            CREATE INDEX IF NOT EXISTS idx_error_category ON error_occurrences(error_category);
            CREATE INDEX IF NOT EXISTS idx_pattern_confidence ON learned_patterns(confidence DESC);
        ''')
        
        # Insert known patterns
        for pattern, details in self.known_patterns.items():
            cursor.execute('''
                INSERT OR IGNORE INTO learned_patterns (pattern, category, solution, confidence)
                VALUES (?, ?, ?, ?)
            ''', (pattern, details['category'], details['solution'], details['confidence']))
        
        conn.commit()
        conn.close()
    
    def analyze_error(self, error_message, context=None):
        """Analyze an error message and return suggested solutions"""
        error_hash = hashlib.md5(error_message.encode()).hexdigest()[:8]
        
        # Store error occurrence
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('''
            INSERT INTO error_occurrences 
            (error_hash, error_message, object_name, operation, record_count, file_path, org_alias)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', (
            error_hash,
            error_message,
            context.get('object') if context else None,
            context.get('operation') if context else None,
            context.get('record_count') if context else None,
            context.get('file_path') if context else None,
            context.get('org_alias') if context else None
        ))
        
        # Find matching patterns
        cursor.execute('''
            SELECT pattern, category, solution, confidence
            FROM learned_patterns
            ORDER BY confidence DESC
        ''')
        
        matches = []
        for pattern, category, solution, confidence in cursor.fetchall():
            if re.search(pattern, error_message, re.IGNORECASE):
                matches.append({
                    'pattern': pattern,
                    'category': category,
                    'solution': solution,
                    'confidence': confidence,
                    'error_hash': error_hash
                })
                
                # Update error category
                cursor.execute('''
                    UPDATE error_occurrences 
                    SET error_category = ?
                    WHERE error_hash = ?
                ''', (category, error_hash))
                break
        
        conn.commit()
        conn.close()
        
        return matches
    
    def learn_from_feedback(self, error_hash, solution_applied, was_successful, notes=None):
        """Update pattern confidence based on solution feedback"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # Store feedback
        cursor.execute('''
            INSERT INTO solution_feedback (error_hash, solution_applied, was_successful, notes)
            VALUES (?, ?, ?, ?)
        ''', (error_hash, solution_applied, was_successful, notes))
        
        # Update pattern confidence
        if was_successful:
            cursor.execute('''
                UPDATE learned_patterns
                SET success_count = success_count + 1,
                    confidence = MIN(0.99, confidence + 0.02),
                    last_updated = CURRENT_TIMESTAMP
                WHERE solution = ?
            ''', (solution_applied,))
        else:
            cursor.execute('''
                UPDATE learned_patterns
                SET failure_count = failure_count + 1,
                    confidence = MAX(0.1, confidence - 0.05),
                    last_updated = CURRENT_TIMESTAMP
                WHERE solution = ?
            ''', (solution_applied,))
        
        conn.commit()
        conn.close()
    
    def get_error_statistics(self, days=30):
        """Get error statistics for the last N days"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cutoff_date = datetime.now() - timedelta(days=days)
        
        # Most common errors
        cursor.execute('''
            SELECT error_category, COUNT(*) as count
            FROM error_occurrences
            WHERE timestamp > ?
            GROUP BY error_category
            ORDER BY count DESC
            LIMIT 10
        ''', (cutoff_date,))
        
        categories = cursor.fetchall()
        
        # Most affected objects
        cursor.execute('''
            SELECT object_name, COUNT(*) as count
            FROM error_occurrences
            WHERE timestamp > ? AND object_name IS NOT NULL
            GROUP BY object_name
            ORDER BY count DESC
            LIMIT 10
        ''', (cutoff_date,))
        
        objects = cursor.fetchall()
        
        # Success rate of solutions
        cursor.execute('''
            SELECT solution_applied, 
                   SUM(CASE WHEN was_successful THEN 1 ELSE 0 END) as successes,
                   COUNT(*) as total
            FROM solution_feedback
            WHERE timestamp > ?
            GROUP BY solution_applied
        ''', (cutoff_date,))
        
        solutions = cursor.fetchall()
        
        conn.close()
        
        return {
            'error_categories': categories,
            'affected_objects': objects,
            'solution_effectiveness': solutions
        }
    
    def suggest_preventive_measures(self):
        """Suggest preventive measures based on error patterns"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # Get most common error categories in last 7 days
        cursor.execute('''
            SELECT error_category, COUNT(*) as count
            FROM error_occurrences
            WHERE timestamp > datetime('now', '-7 days')
            GROUP BY error_category
            ORDER BY count DESC
            LIMIT 5
        ''')
        
        suggestions = []
        for category, count in cursor.fetchall():
            if category == 'line_ending':
                suggestions.append({
                    'priority': 'HIGH',
                    'measure': 'Always use safe-bulk-import.sh with -l CRLF flag',
                    'reason': f'{count} line ending errors in last 7 days'
                })
            elif category == 'validation_rule':
                suggestions.append({
                    'priority': 'HIGH',
                    'measure': 'Run pre-import-validator.sh before all imports',
                    'reason': f'{count} validation rule failures in last 7 days'
                })
            elif category == 'missing_field':
                suggestions.append({
                    'priority': 'MEDIUM',
                    'measure': 'Update CSV templates with all required fields',
                    'reason': f'{count} missing field errors in last 7 days'
                })
            elif category == 'permission':
                suggestions.append({
                    'priority': 'MEDIUM',
                    'measure': 'Review integration user permissions',
                    'reason': f'{count} permission errors in last 7 days'
                })
        
        conn.close()
        return suggestions
    
    def export_report(self, output_file='error_analysis_report.json'):
        """Export comprehensive error analysis report"""
        stats = self.get_error_statistics()
        suggestions = self.suggest_preventive_measures()
        
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # Get top solutions by confidence
        cursor.execute('''
            SELECT pattern, category, solution, confidence, success_count, failure_count
            FROM learned_patterns
            ORDER BY confidence DESC
            LIMIT 20
        ''')
        
        patterns = []
        for row in cursor.fetchall():
            patterns.append({
                'pattern': row[0],
                'category': row[1],
                'solution': row[2],
                'confidence': row[3],
                'success_count': row[4],
                'failure_count': row[5]
            })
        
        conn.close()
        
        report = {
            'generated_at': datetime.now().isoformat(),
            'statistics': stats,
            'preventive_measures': suggestions,
            'learned_patterns': patterns
        }
        
        with open(output_file, 'w') as f:
            json.dump(report, f, indent=2)
        
        return report


def main():
    """Command-line interface for the error pattern learner"""
    learner = ErrorPatternLearner()
    
    if len(sys.argv) < 2:
        print("Usage: python error-pattern-learner.py <command> [options]")
        print("\nCommands:")
        print("  analyze <error_message>  - Analyze an error and get solutions")
        print("  feedback <hash> <solution> <success> - Provide feedback on a solution")
        print("  stats [days]            - Show error statistics")
        print("  suggest                 - Get preventive measure suggestions")
        print("  report [output_file]    - Generate analysis report")
        sys.exit(1)
    
    command = sys.argv[1]
    
    if command == 'analyze':
        if len(sys.argv) < 3:
            print("Error: Please provide an error message")
            sys.exit(1)
        
        error_message = ' '.join(sys.argv[2:])
        matches = learner.analyze_error(error_message)
        
        if matches:
            print(f"\n🔍 Error Analysis Results:")
            for match in matches:
                print(f"\n  Category: {match['category']}")
                print(f"  Solution: {match['solution']}")
                print(f"  Confidence: {match['confidence']:.0%}")
                print(f"  Error Hash: {match['error_hash']}")
        else:
            print("❌ No matching patterns found. This error has been logged for analysis.")
    
    elif command == 'feedback':
        if len(sys.argv) < 5:
            print("Error: Usage: feedback <error_hash> <solution> <success:true/false>")
            sys.exit(1)
        
        error_hash = sys.argv[2]
        solution = sys.argv[3]
        was_successful = sys.argv[4].lower() == 'true'
        
        learner.learn_from_feedback(error_hash, solution, was_successful)
        print(f"✅ Feedback recorded. Pattern confidence updated.")
    
    elif command == 'stats':
        days = int(sys.argv[2]) if len(sys.argv) > 2 else 30
        stats = learner.get_error_statistics(days)
        
        print(f"\n📊 Error Statistics (Last {days} days):")
        
        print("\n  Most Common Error Categories:")
        for category, count in stats['error_categories']:
            print(f"    • {category or 'Unknown'}: {count} occurrences")
        
        print("\n  Most Affected Objects:")
        for obj, count in stats['affected_objects']:
            print(f"    • {obj}: {count} errors")
        
        print("\n  Solution Effectiveness:")
        for solution, successes, total in stats['solution_effectiveness']:
            rate = (successes / total * 100) if total > 0 else 0
            print(f"    • {solution[:50]}...")
            print(f"      Success rate: {rate:.1f}% ({successes}/{total})")
    
    elif command == 'suggest':
        suggestions = learner.suggest_preventive_measures()
        
        print("\n💡 Preventive Measure Suggestions:")
        for suggestion in suggestions:
            print(f"\n  [{suggestion['priority']}] {suggestion['measure']}")
            print(f"  Reason: {suggestion['reason']}")
    
    elif command == 'report':
        output_file = sys.argv[2] if len(sys.argv) > 2 else 'error_analysis_report.json'
        report = learner.export_report(output_file)
        print(f"✅ Report generated: {output_file}")
        print(f"   • {len(report['statistics']['error_categories'])} error categories analyzed")
        print(f"   • {len(report['preventive_measures'])} preventive measures suggested")
        print(f"   • {len(report['learned_patterns'])} patterns in knowledge base")
    
    else:
        print(f"Unknown command: {command}")
        sys.exit(1)


if __name__ == '__main__':
    main()