#!/usr/bin/env python3

"""
update-verifier.py - Comprehensive update verification system
Ensures updates actually succeed by taking snapshots and validating changes
"""

import json
import subprocess
import sys
import time
import hashlib
from pathlib import Path
from typing import Dict, List, Any, Optional, Tuple
from datetime import datetime
import logging
import sqlite3
from dataclasses import dataclass, asdict
import difflib

# Setup logging
log_dir = Path(__file__).parent.parent / 'logs' / 'update-verifier'
log_dir.mkdir(parents=True, exist_ok=True)
log_file = log_dir / f'verifier-{datetime.now().strftime("%Y%m%d")}.log'

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(log_file),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# Import our safe JSON parser
sys.path.insert(0, str(Path(__file__).parent))
try:
    from safe_json_parser import SafeJSONParser
except ImportError:
    import importlib.util
    spec = importlib.util.spec_from_file_location(
        "safe_json_parser", 
        Path(__file__).parent / "safe-json-parser.py"
    )
    safe_json_parser = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(safe_json_parser)
    SafeJSONParser = safe_json_parser.SafeJSONParser

@dataclass
class UpdateSnapshot:
    """Represents a snapshot of records before/after update"""
    timestamp: str
    object_name: str
    record_ids: List[str]
    field_values: Dict[str, Dict[str, Any]]  # {record_id: {field: value}}
    checksum: str
    
    def calculate_checksum(self) -> str:
        """Calculate checksum of all field values"""
        data_str = json.dumps(self.field_values, sort_keys=True)
        return hashlib.sha256(data_str.encode()).hexdigest()

@dataclass
class VerificationResult:
    """Results of update verification"""
    success: bool
    records_verified: int
    records_changed: int
    records_unchanged: int
    records_failed: int
    changes: Dict[str, Dict[str, Tuple[Any, Any]]]  # {record_id: {field: (old, new)}}
    errors: List[str]
    warnings: List[str]
    verification_time: float

class UpdateVerifier:
    """Verifies that Salesforce updates actually succeed"""
    
    def __init__(self, org_alias: Optional[str] = None, db_path: Optional[Path] = None):
        """
        Initialize the verifier
        
        Args:
            org_alias: Salesforce org alias
            db_path: Path to verification database
        """
        self.org_alias = org_alias
        self.json_parser = SafeJSONParser()
        
        # Setup database
        if db_path is None:
            db_path = Path(__file__).parent.parent / 'data' / 'verification.db'
        db_path.parent.mkdir(parents=True, exist_ok=True)
        self.db_path = db_path
        self.init_database()
        
        # Configuration
        self.max_retry_attempts = 3
        self.retry_delay = 2
        self.verification_delay = 5  # Wait after update before verifying
        self.success_threshold = 0.95  # 95% success required
    
    def init_database(self):
        """Initialize verification database"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.executescript('''
            CREATE TABLE IF NOT EXISTS snapshots (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                snapshot_id TEXT UNIQUE,
                timestamp TEXT,
                object_name TEXT,
                record_count INTEGER,
                checksum TEXT,
                snapshot_data TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            
            CREATE TABLE IF NOT EXISTS verifications (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                verification_id TEXT UNIQUE,
                before_snapshot_id TEXT,
                after_snapshot_id TEXT,
                success BOOLEAN,
                records_verified INTEGER,
                records_changed INTEGER,
                records_unchanged INTEGER,
                records_failed INTEGER,
                changes TEXT,
                errors TEXT,
                warnings TEXT,
                verification_time REAL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (before_snapshot_id) REFERENCES snapshots(snapshot_id),
                FOREIGN KEY (after_snapshot_id) REFERENCES snapshots(snapshot_id)
            );
            
            CREATE INDEX IF NOT EXISTS idx_snapshots_object ON snapshots(object_name);
            CREATE INDEX IF NOT EXISTS idx_verifications_success ON verifications(success);
        ''')
        
        conn.commit()
        conn.close()
    
    def take_snapshot(self, 
                     object_name: str,
                     record_ids: List[str],
                     fields: Optional[List[str]] = None) -> UpdateSnapshot:
        """
        Take a snapshot of records before update
        
        Args:
            object_name: Salesforce object name
            record_ids: List of record IDs to snapshot
            fields: Specific fields to snapshot (None for all)
            
        Returns:
            UpdateSnapshot object
        """
        logger.info(f"Taking snapshot of {len(record_ids)} {object_name} records")
        
        # Build SOQL query
        if fields is None:
            # Get all updateable fields
            fields = self._get_updateable_fields(object_name)
        
        # Chunk record IDs if needed (SOQL IN clause limit)
        all_records = []
        chunk_size = 200
        
        for i in range(0, len(record_ids), chunk_size):
            chunk_ids = record_ids[i:i+chunk_size]
            id_list = "'" + "','".join(chunk_ids) + "'"
            
            query = f"SELECT {','.join(fields)} FROM {object_name} WHERE Id IN ({id_list})"
            
            # Execute query
            result = self._execute_soql(query)
            
            if result.get('error'):
                logger.error(f"Failed to snapshot records: {result.get('error_message')}")
                continue
            
            records = result.get('result', {}).get('records', [])
            all_records.extend(records)
        
        # Convert to field_values format
        field_values = {}
        for record in all_records:
            record_id = record.get('Id')
            if record_id:
                # Remove Salesforce metadata fields
                clean_record = {k: v for k, v in record.items() 
                              if not k.startswith('attributes')}
                field_values[record_id] = clean_record
        
        # Create snapshot
        snapshot = UpdateSnapshot(
            timestamp=datetime.now().isoformat(),
            object_name=object_name,
            record_ids=record_ids,
            field_values=field_values,
            checksum=""
        )
        snapshot.checksum = snapshot.calculate_checksum()
        
        # Save to database
        self._save_snapshot(snapshot)
        
        logger.info(f"Snapshot created with checksum: {snapshot.checksum}")
        return snapshot
    
    def verify_update(self,
                     before_snapshot: UpdateSnapshot,
                     expected_changes: Dict[str, Dict[str, Any]],
                     wait_time: Optional[int] = None) -> VerificationResult:
        """
        Verify that an update was successful
        
        Args:
            before_snapshot: Snapshot taken before update
            expected_changes: Expected field changes {record_id: {field: new_value}}
            wait_time: Seconds to wait before verification
            
        Returns:
            VerificationResult with detailed information
        """
        start_time = time.time()
        
        # Wait for update to propagate
        if wait_time is None:
            wait_time = self.verification_delay
        
        logger.info(f"Waiting {wait_time}s for update to propagate...")
        time.sleep(wait_time)
        
        # Take after snapshot
        after_snapshot = self.take_snapshot(
            before_snapshot.object_name,
            before_snapshot.record_ids,
            list(before_snapshot.field_values.get(
                before_snapshot.record_ids[0], {}).keys()
            ) if before_snapshot.record_ids else None
        )
        
        # Compare snapshots
        result = self._compare_snapshots(
            before_snapshot,
            after_snapshot,
            expected_changes
        )
        
        # Calculate verification time
        result.verification_time = time.time() - start_time
        
        # Save verification result
        self._save_verification(before_snapshot, after_snapshot, result)
        
        # Log results
        if result.success:
            logger.info(f"Verification SUCCESSFUL: {result.records_changed}/{result.records_verified} records updated")
        else:
            logger.error(f"Verification FAILED: {result.records_failed} records failed")
            for error in result.errors:
                logger.error(f"  - {error}")
        
        return result
    
    def _compare_snapshots(self,
                          before: UpdateSnapshot,
                          after: UpdateSnapshot,
                          expected_changes: Dict[str, Dict[str, Any]]) -> VerificationResult:
        """Compare before and after snapshots"""
        changes = {}
        errors = []
        warnings = []
        records_changed = 0
        records_unchanged = 0
        records_failed = 0
        
        # Check each record
        for record_id in before.record_ids:
            before_values = before.field_values.get(record_id, {})
            after_values = after.field_values.get(record_id, {})
            
            if not after_values:
                errors.append(f"Record {record_id} not found after update")
                records_failed += 1
                continue
            
            # Check expected changes
            expected = expected_changes.get(record_id, {})
            record_changes = {}
            has_changes = False
            
            for field, expected_value in expected.items():
                before_value = before_values.get(field)
                after_value = after_values.get(field)
                
                # Normalize values for comparison
                before_norm = self._normalize_value(before_value)
                after_norm = self._normalize_value(after_value)
                expected_norm = self._normalize_value(expected_value)
                
                if after_norm != expected_norm:
                    errors.append(
                        f"Record {record_id}, field {field}: "
                        f"expected '{expected_norm}', got '{after_norm}'"
                    )
                    records_failed += 1
                    record_changes[field] = (before_value, after_value)
                elif before_norm != after_norm:
                    record_changes[field] = (before_value, after_value)
                    has_changes = True
            
            # Check for unexpected changes
            for field in before_values:
                if field not in expected and field != 'LastModifiedDate':
                    before_value = before_values.get(field)
                    after_value = after_values.get(field)
                    
                    if self._normalize_value(before_value) != self._normalize_value(after_value):
                        warnings.append(
                            f"Record {record_id}, field {field}: "
                            f"unexpected change from '{before_value}' to '{after_value}'"
                        )
                        record_changes[field] = (before_value, after_value)
            
            if record_changes:
                changes[record_id] = record_changes
                if has_changes and record_id not in [e.split(',')[0].split()[-1] for e in errors]:
                    records_changed += 1
            else:
                records_unchanged += 1
        
        # Calculate success
        total_records = len(before.record_ids)
        success_rate = (records_changed / total_records) if total_records > 0 else 0
        success = success_rate >= self.success_threshold and len(errors) == 0
        
        return VerificationResult(
            success=success,
            records_verified=total_records,
            records_changed=records_changed,
            records_unchanged=records_unchanged,
            records_failed=records_failed,
            changes=changes,
            errors=errors,
            warnings=warnings,
            verification_time=0
        )
    
    def _normalize_value(self, value: Any) -> Any:
        """Normalize value for comparison"""
        if value is None:
            return None
        elif isinstance(value, bool):
            return value
        elif isinstance(value, (int, float)):
            return float(value)
        elif isinstance(value, str):
            return value.strip().lower()
        else:
            return str(value).lower()
    
    def _get_updateable_fields(self, object_name: str) -> List[str]:
        """Get list of updateable fields for an object"""
        cmd = f"sf sobject describe --sobject {object_name}"
        
        if self.org_alias:
            cmd += f" --target-org {self.org_alias}"
        
        cmd += " --json"
        
        try:
            result = subprocess.run(
                cmd,
                shell=True,
                capture_output=True,
                text=True,
                timeout=30
            )
            
            parsed = self.json_parser.parse_safely(result.stdout)
            
            if parsed.get('error'):
                logger.warning(f"Could not get field list: {parsed.get('error_message')}")
                return ['Id', 'Name']  # Default fields
            
            # Extract updateable fields
            fields = ['Id']  # Always include Id
            for field in parsed.get('result', {}).get('fields', []):
                if field.get('updateable') and not field.get('calculated'):
                    fields.append(field.get('name'))
            
            return fields[:50]  # Limit to prevent query size issues
            
        except Exception as e:
            logger.warning(f"Could not get field list: {e}")
            return ['Id', 'Name']  # Default fields
    
    def _execute_soql(self, query: str) -> Dict[str, Any]:
        """Execute a SOQL query"""
        cmd = f'sf data query --query "{query}"'
        
        if self.org_alias:
            cmd += f" --target-org {self.org_alias}"
        
        cmd += " --json"
        
        try:
            result = subprocess.run(
                cmd,
                shell=True,
                capture_output=True,
                text=True,
                timeout=60
            )
            
            return self.json_parser.parse_safely(result.stdout)
            
        except subprocess.TimeoutExpired:
            return {'error': True, 'error_message': 'Query timeout'}
        except Exception as e:
            return {'error': True, 'error_message': str(e)}
    
    def _save_snapshot(self, snapshot: UpdateSnapshot):
        """Save snapshot to database"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        snapshot_id = f"{snapshot.object_name}_{snapshot.timestamp}_{snapshot.checksum[:8]}"
        
        cursor.execute('''
            INSERT OR REPLACE INTO snapshots 
            (snapshot_id, timestamp, object_name, record_count, checksum, snapshot_data)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (
            snapshot_id,
            snapshot.timestamp,
            snapshot.object_name,
            len(snapshot.record_ids),
            snapshot.checksum,
            json.dumps(asdict(snapshot))
        ))
        
        conn.commit()
        conn.close()
    
    def _save_verification(self, before: UpdateSnapshot, after: UpdateSnapshot, result: VerificationResult):
        """Save verification result to database"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        verification_id = f"verify_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{before.checksum[:8]}"
        before_id = f"{before.object_name}_{before.timestamp}_{before.checksum[:8]}"
        after_id = f"{after.object_name}_{after.timestamp}_{after.checksum[:8]}"
        
        cursor.execute('''
            INSERT INTO verifications 
            (verification_id, before_snapshot_id, after_snapshot_id, success,
             records_verified, records_changed, records_unchanged, records_failed,
             changes, errors, warnings, verification_time)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            verification_id,
            before_id,
            after_id,
            result.success,
            result.records_verified,
            result.records_changed,
            result.records_unchanged,
            result.records_failed,
            json.dumps(result.changes),
            json.dumps(result.errors),
            json.dumps(result.warnings),
            result.verification_time
        ))
        
        conn.commit()
        conn.close()
    
    def get_verification_history(self, limit: int = 10) -> List[Dict[str, Any]]:
        """Get recent verification history"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT 
                v.*,
                b.object_name,
                b.record_count as before_count,
                a.record_count as after_count
            FROM verifications v
            JOIN snapshots b ON v.before_snapshot_id = b.snapshot_id
            JOIN snapshots a ON v.after_snapshot_id = a.snapshot_id
            ORDER BY v.created_at DESC
            LIMIT ?
        ''', (limit,))
        
        columns = [col[0] for col in cursor.description]
        results = [dict(zip(columns, row)) for row in cursor.fetchall()]
        
        conn.close()
        return results


def main():
    """Main entry point for CLI usage"""
    import argparse
    
    parser = argparse.ArgumentParser(
        description='Verify Salesforce updates succeeded'
    )
    parser.add_argument(
        'object',
        help='Salesforce object name'
    )
    parser.add_argument(
        '--ids', '-i',
        required=True,
        help='Comma-separated record IDs or file path'
    )
    parser.add_argument(
        '--changes', '-c',
        help='JSON file with expected changes'
    )
    parser.add_argument(
        '--org', '-o',
        help='Salesforce org alias'
    )
    parser.add_argument(
        '--fields', '-f',
        help='Comma-separated fields to verify'
    )
    parser.add_argument(
        '--wait', '-w',
        type=int,
        default=5,
        help='Seconds to wait before verification'
    )
    parser.add_argument(
        '--history', '-H',
        action='store_true',
        help='Show verification history'
    )
    
    args = parser.parse_args()
    
    # Initialize verifier
    verifier = UpdateVerifier(org_alias=args.org)
    
    # Show history if requested
    if args.history:
        history = verifier.get_verification_history()
        print(json.dumps(history, indent=2))
        sys.exit(0)
    
    # Get record IDs
    if Path(args.ids).exists():
        with open(args.ids) as f:
            record_ids = [line.strip() for line in f if line.strip()]
    else:
        record_ids = [id.strip() for id in args.ids.split(',')]
    
    # Get expected changes
    expected_changes = {}
    if args.changes:
        with open(args.changes) as f:
            expected_changes = json.load(f)
    
    # Get fields
    fields = None
    if args.fields:
        fields = [f.strip() for f in args.fields.split(',')]
    
    # Take snapshot
    print(f"Taking snapshot of {len(record_ids)} records...")
    before = verifier.take_snapshot(args.object, record_ids, fields)
    
    print(f"Snapshot checksum: {before.checksum}")
    print(f"\nNow perform your update operation...")
    print(f"Press Enter when update is complete...")
    input()
    
    # Verify update
    print(f"\nVerifying update...")
    result = verifier.verify_update(before, expected_changes, args.wait)
    
    # Display results
    if result.success:
        print(f"✅ Verification SUCCESSFUL")
    else:
        print(f"❌ Verification FAILED")
    
    print(f"Records verified: {result.records_verified}")
    print(f"Records changed: {result.records_changed}")
    print(f"Records unchanged: {result.records_unchanged}")
    print(f"Records failed: {result.records_failed}")
    
    if result.errors:
        print("\nErrors:")
        for error in result.errors:
            print(f"  - {error}")
    
    if result.warnings:
        print("\nWarnings:")
        for warning in result.warnings:
            print(f"  - {warning}")
    
    # Exit with appropriate code
    sys.exit(0 if result.success else 1)


if __name__ == '__main__':
    main()