#!/usr/bin/env python3
"""
audit-logger.py - Comprehensive audit trail for Salesforce operations
Tracks all operations with full context, results, and recovery information
"""

import json
import sqlite3
import logging
from typing import Dict, List, Any, Optional, Tuple
from dataclasses import dataclass, field, asdict
from datetime import datetime, timedelta
from pathlib import Path
import hashlib
import os
from enum import Enum

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class OperationType(Enum):
    """Types of Salesforce operations"""
    INSERT = "INSERT"
    UPDATE = "UPDATE"
    UPSERT = "UPSERT"
    DELETE = "DELETE"
    QUERY = "QUERY"
    BULK_INSERT = "BULK_INSERT"
    BULK_UPDATE = "BULK_UPDATE"
    BULK_UPSERT = "BULK_UPSERT"
    BULK_DELETE = "BULK_DELETE"
    METADATA_DEPLOY = "METADATA_DEPLOY"
    APEX_EXECUTE = "APEX_EXECUTE"
    FLOW_EXECUTE = "FLOW_EXECUTE"

class OperationStatus(Enum):
    """Status of operations"""
    PENDING = "PENDING"
    IN_PROGRESS = "IN_PROGRESS"
    SUCCESS = "SUCCESS"
    PARTIAL_SUCCESS = "PARTIAL_SUCCESS"
    FAILED = "FAILED"
    ROLLED_BACK = "ROLLED_BACK"
    TIMEOUT = "TIMEOUT"
    ABORTED = "ABORTED"

@dataclass
class AuditEntry:
    """Single audit log entry"""
    operation_id: str
    operation_type: OperationType
    object_name: str
    status: OperationStatus
    user: str
    timestamp: datetime
    duration_ms: Optional[int] = None
    record_count: Optional[int] = None
    success_count: Optional[int] = None
    failure_count: Optional[int] = None
    error_details: Optional[List[Dict]] = field(default_factory=list)
    input_data: Optional[Dict] = None
    output_data: Optional[Dict] = None
    rollback_data: Optional[Dict] = None
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    def to_dict(self) -> Dict[str, Any]:
        data = asdict(self)
        data['operation_type'] = self.operation_type.value
        data['status'] = self.status.value
        data['timestamp'] = self.timestamp.isoformat()
        return data

class AuditLogger:
    """Manages audit trail for all Salesforce operations"""
    
    def __init__(self, db_path: str = None):
        """
        Initialize audit logger
        
        Args:
            db_path: Path to SQLite database (default: ~/.salesforce_audit.db)
        """
        if db_path is None:
            db_path = os.path.expanduser("~/.salesforce_audit.db")
        
        self.db_path = db_path
        self.conn = None
        self._init_database()
    
    def _init_database(self):
        """Initialize the audit database"""
        self.conn = sqlite3.connect(self.db_path)
        self.conn.row_factory = sqlite3.Row
        
        # Create tables
        self.conn.executescript("""
            CREATE TABLE IF NOT EXISTS audit_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                operation_id TEXT UNIQUE NOT NULL,
                operation_type TEXT NOT NULL,
                object_name TEXT NOT NULL,
                status TEXT NOT NULL,
                user TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                duration_ms INTEGER,
                record_count INTEGER,
                success_count INTEGER,
                failure_count INTEGER,
                error_details TEXT,
                input_data TEXT,
                output_data TEXT,
                rollback_data TEXT,
                metadata TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
            
            CREATE INDEX IF NOT EXISTS idx_operation_id ON audit_log(operation_id);
            CREATE INDEX IF NOT EXISTS idx_timestamp ON audit_log(timestamp);
            CREATE INDEX IF NOT EXISTS idx_status ON audit_log(status);
            CREATE INDEX IF NOT EXISTS idx_object ON audit_log(object_name);
            
            CREATE TABLE IF NOT EXISTS audit_metrics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                date TEXT NOT NULL,
                operation_type TEXT NOT NULL,
                object_name TEXT,
                total_operations INTEGER DEFAULT 0,
                successful_operations INTEGER DEFAULT 0,
                failed_operations INTEGER DEFAULT 0,
                total_records INTEGER DEFAULT 0,
                avg_duration_ms INTEGER,
                UNIQUE(date, operation_type, object_name)
            );
            
            CREATE TABLE IF NOT EXISTS audit_alerts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                alert_time TEXT NOT NULL,
                alert_type TEXT NOT NULL,
                severity TEXT NOT NULL,
                message TEXT NOT NULL,
                operation_ids TEXT,
                resolved BOOLEAN DEFAULT 0,
                resolved_time TEXT,
                resolution_notes TEXT
            );
        """)
        
        self.conn.commit()
        logger.info(f"Audit database initialized at {self.db_path}")
    
    def log_operation(self, entry: AuditEntry) -> str:
        """
        Log a single operation
        
        Args:
            entry: AuditEntry to log
            
        Returns:
            Operation ID
        """
        try:
            # Generate operation ID if not provided
            if not entry.operation_id:
                entry.operation_id = self._generate_operation_id(entry)
            
            # Convert to storable format
            data = (
                entry.operation_id,
                entry.operation_type.value,
                entry.object_name,
                entry.status.value,
                entry.user,
                entry.timestamp.isoformat(),
                entry.duration_ms,
                entry.record_count,
                entry.success_count,
                entry.failure_count,
                json.dumps(entry.error_details) if entry.error_details else None,
                json.dumps(entry.input_data) if entry.input_data else None,
                json.dumps(entry.output_data) if entry.output_data else None,
                json.dumps(entry.rollback_data) if entry.rollback_data else None,
                json.dumps(entry.metadata) if entry.metadata else None
            )
            
            # Insert or update
            self.conn.execute("""
                INSERT OR REPLACE INTO audit_log (
                    operation_id, operation_type, object_name, status, user,
                    timestamp, duration_ms, record_count, success_count, failure_count,
                    error_details, input_data, output_data, rollback_data, metadata
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, data)
            
            self.conn.commit()
            
            # Update metrics
            self._update_metrics(entry)
            
            # Check for alerts
            self._check_alerts(entry)
            
            logger.info(f"Logged operation {entry.operation_id}: {entry.status.value}")
            return entry.operation_id
            
        except Exception as e:
            logger.error(f"Failed to log operation: {e}")
            raise
    
    def start_operation(self, operation_type: OperationType, object_name: str,
                       record_count: Optional[int] = None, 
                       input_data: Optional[Dict] = None) -> str:
        """
        Start tracking an operation
        
        Returns:
            Operation ID for tracking
        """
        entry = AuditEntry(
            operation_id="",
            operation_type=operation_type,
            object_name=object_name,
            status=OperationStatus.IN_PROGRESS,
            user=os.environ.get('USER', 'unknown'),
            timestamp=datetime.now(),
            record_count=record_count,
            input_data=input_data
        )
        
        return self.log_operation(entry)
    
    def complete_operation(self, operation_id: str, status: OperationStatus,
                          success_count: Optional[int] = None,
                          failure_count: Optional[int] = None,
                          output_data: Optional[Dict] = None,
                          error_details: Optional[List[Dict]] = None):
        """Complete an operation with final status"""
        # Get existing entry
        existing = self.get_operation(operation_id)
        if not existing:
            raise ValueError(f"Operation {operation_id} not found")
        
        # Calculate duration
        start_time = datetime.fromisoformat(existing['timestamp'])
        duration_ms = int((datetime.now() - start_time).total_seconds() * 1000)
        
        # Update entry
        self.conn.execute("""
            UPDATE audit_log SET
                status = ?,
                duration_ms = ?,
                success_count = ?,
                failure_count = ?,
                output_data = ?,
                error_details = ?
            WHERE operation_id = ?
        """, (
            status.value,
            duration_ms,
            success_count,
            failure_count,
            json.dumps(output_data) if output_data else None,
            json.dumps(error_details) if error_details else None,
            operation_id
        ))
        
        self.conn.commit()
        logger.info(f"Completed operation {operation_id}: {status.value}")
    
    def get_operation(self, operation_id: str) -> Optional[Dict]:
        """Get a specific operation by ID"""
        cursor = self.conn.execute(
            "SELECT * FROM audit_log WHERE operation_id = ?",
            (operation_id,)
        )
        row = cursor.fetchone()
        return dict(row) if row else None
    
    def get_recent_operations(self, limit: int = 100, 
                             object_name: Optional[str] = None,
                             status: Optional[OperationStatus] = None) -> List[Dict]:
        """Get recent operations with optional filters"""
        query = "SELECT * FROM audit_log WHERE 1=1"
        params = []
        
        if object_name:
            query += " AND object_name = ?"
            params.append(object_name)
        
        if status:
            query += " AND status = ?"
            params.append(status.value)
        
        query += " ORDER BY timestamp DESC LIMIT ?"
        params.append(limit)
        
        cursor = self.conn.execute(query, params)
        return [dict(row) for row in cursor.fetchall()]
    
    def get_failed_operations(self, since: Optional[datetime] = None) -> List[Dict]:
        """Get all failed operations since a given time"""
        if since is None:
            since = datetime.now() - timedelta(hours=24)
        
        cursor = self.conn.execute("""
            SELECT * FROM audit_log 
            WHERE status IN (?, ?, ?) 
            AND timestamp >= ?
            ORDER BY timestamp DESC
        """, (
            OperationStatus.FAILED.value,
            OperationStatus.TIMEOUT.value,
            OperationStatus.ABORTED.value,
            since.isoformat()
        ))
        
        return [dict(row) for row in cursor.fetchall()]
    
    def get_statistics(self, start_date: Optional[datetime] = None,
                       end_date: Optional[datetime] = None) -> Dict[str, Any]:
        """Get audit statistics for a date range"""
        if start_date is None:
            start_date = datetime.now() - timedelta(days=30)
        if end_date is None:
            end_date = datetime.now()
        
        # Overall stats
        cursor = self.conn.execute("""
            SELECT 
                COUNT(*) as total_operations,
                SUM(CASE WHEN status = ? THEN 1 ELSE 0 END) as successful,
                SUM(CASE WHEN status IN (?, ?, ?) THEN 1 ELSE 0 END) as failed,
                AVG(duration_ms) as avg_duration,
                SUM(success_count) as total_success_records,
                SUM(failure_count) as total_failure_records
            FROM audit_log
            WHERE timestamp BETWEEN ? AND ?
        """, (
            OperationStatus.SUCCESS.value,
            OperationStatus.FAILED.value,
            OperationStatus.TIMEOUT.value,
            OperationStatus.ABORTED.value,
            start_date.isoformat(),
            end_date.isoformat()
        ))
        
        overall = dict(cursor.fetchone())
        
        # By operation type
        cursor = self.conn.execute("""
            SELECT 
                operation_type,
                COUNT(*) as count,
                AVG(duration_ms) as avg_duration,
                SUM(CASE WHEN status = ? THEN 1 ELSE 0 END) as successful
            FROM audit_log
            WHERE timestamp BETWEEN ? AND ?
            GROUP BY operation_type
        """, (
            OperationStatus.SUCCESS.value,
            start_date.isoformat(),
            end_date.isoformat()
        ))
        
        by_type = [dict(row) for row in cursor.fetchall()]
        
        # By object
        cursor = self.conn.execute("""
            SELECT 
                object_name,
                COUNT(*) as count,
                AVG(duration_ms) as avg_duration,
                SUM(CASE WHEN status = ? THEN 1 ELSE 0 END) as successful
            FROM audit_log
            WHERE timestamp BETWEEN ? AND ?
            GROUP BY object_name
            ORDER BY count DESC
            LIMIT 10
        """, (
            OperationStatus.SUCCESS.value,
            start_date.isoformat(),
            end_date.isoformat()
        ))
        
        by_object = [dict(row) for row in cursor.fetchall()]
        
        return {
            'date_range': {
                'start': start_date.isoformat(),
                'end': end_date.isoformat()
            },
            'overall': overall,
            'by_operation_type': by_type,
            'by_object': by_object
        }
    
    def find_related_operations(self, operation_id: str) -> List[Dict]:
        """Find operations related to a given operation"""
        operation = self.get_operation(operation_id)
        if not operation:
            return []
        
        # Find operations on same object around same time
        timestamp = datetime.fromisoformat(operation['timestamp'])
        start = timestamp - timedelta(minutes=5)
        end = timestamp + timedelta(minutes=5)
        
        cursor = self.conn.execute("""
            SELECT * FROM audit_log
            WHERE object_name = ?
            AND timestamp BETWEEN ? AND ?
            AND operation_id != ?
            ORDER BY timestamp
        """, (
            operation['object_name'],
            start.isoformat(),
            end.isoformat(),
            operation_id
        ))
        
        return [dict(row) for row in cursor.fetchall()]
    
    def can_rollback(self, operation_id: str) -> bool:
        """Check if an operation can be rolled back"""
        operation = self.get_operation(operation_id)
        if not operation:
            return False
        
        # Check if rollback data exists
        if not operation.get('rollback_data'):
            return False
        
        # Check if operation type supports rollback
        rollback_types = [
            OperationType.INSERT.value,
            OperationType.UPDATE.value,
            OperationType.UPSERT.value,
            OperationType.DELETE.value
        ]
        
        return operation['operation_type'] in rollback_types
    
    def mark_rollback(self, operation_id: str, rollback_result: Dict):
        """Mark an operation as rolled back"""
        self.conn.execute("""
            UPDATE audit_log SET
                status = ?,
                rollback_data = ?
            WHERE operation_id = ?
        """, (
            OperationStatus.ROLLED_BACK.value,
            json.dumps(rollback_result),
            operation_id
        ))
        
        self.conn.commit()
        logger.info(f"Marked operation {operation_id} as rolled back")
    
    def _generate_operation_id(self, entry: AuditEntry) -> str:
        """Generate unique operation ID"""
        data = f"{entry.operation_type.value}_{entry.object_name}_{entry.timestamp.isoformat()}"
        return hashlib.sha256(data.encode()).hexdigest()[:16]
    
    def _update_metrics(self, entry: AuditEntry):
        """Update metrics table with operation data"""
        date = entry.timestamp.date().isoformat()
        
        try:
            # Try to update existing metric
            self.conn.execute("""
                INSERT INTO audit_metrics (
                    date, operation_type, object_name, 
                    total_operations, successful_operations, failed_operations,
                    total_records, avg_duration_ms
                ) VALUES (?, ?, ?, 1, ?, ?, ?, ?)
                ON CONFLICT(date, operation_type, object_name) DO UPDATE SET
                    total_operations = total_operations + 1,
                    successful_operations = successful_operations + ?,
                    failed_operations = failed_operations + ?,
                    total_records = total_records + ?,
                    avg_duration_ms = (avg_duration_ms * total_operations + ?) / (total_operations + 1)
            """, (
                date,
                entry.operation_type.value,
                entry.object_name,
                1 if entry.status == OperationStatus.SUCCESS else 0,
                1 if entry.status in [OperationStatus.FAILED, OperationStatus.TIMEOUT] else 0,
                entry.record_count or 0,
                entry.duration_ms or 0,
                1 if entry.status == OperationStatus.SUCCESS else 0,
                1 if entry.status in [OperationStatus.FAILED, OperationStatus.TIMEOUT] else 0,
                entry.record_count or 0,
                entry.duration_ms or 0
            ))
            
            self.conn.commit()
        except Exception as e:
            logger.warning(f"Failed to update metrics: {e}")
    
    def _check_alerts(self, entry: AuditEntry):
        """Check if entry should trigger alerts"""
        alerts = []
        
        # Check for repeated failures
        if entry.status in [OperationStatus.FAILED, OperationStatus.TIMEOUT]:
            recent_failures = self.conn.execute("""
                SELECT COUNT(*) as count FROM audit_log
                WHERE object_name = ?
                AND status IN (?, ?)
                AND timestamp >= ?
            """, (
                entry.object_name,
                OperationStatus.FAILED.value,
                OperationStatus.TIMEOUT.value,
                (entry.timestamp - timedelta(hours=1)).isoformat()
            )).fetchone()
            
            if recent_failures['count'] >= 5:
                alerts.append({
                    'type': 'REPEATED_FAILURES',
                    'severity': 'HIGH',
                    'message': f"5+ failures on {entry.object_name} in last hour"
                })
        
        # Check for high failure rate
        if entry.failure_count and entry.success_count:
            failure_rate = entry.failure_count / (entry.success_count + entry.failure_count)
            if failure_rate > 0.1:  # More than 10% failure
                alerts.append({
                    'type': 'HIGH_FAILURE_RATE',
                    'severity': 'MEDIUM',
                    'message': f"High failure rate ({failure_rate:.1%}) for {entry.operation_id}"
                })
        
        # Log alerts
        for alert in alerts:
            self.conn.execute("""
                INSERT INTO audit_alerts (alert_time, alert_type, severity, message, operation_ids)
                VALUES (?, ?, ?, ?, ?)
            """, (
                datetime.now().isoformat(),
                alert['type'],
                alert['severity'],
                alert['message'],
                entry.operation_id
            ))
        
        if alerts:
            self.conn.commit()
            logger.warning(f"Generated {len(alerts)} alerts for operation {entry.operation_id}")
    
    def get_active_alerts(self) -> List[Dict]:
        """Get unresolved alerts"""
        cursor = self.conn.execute("""
            SELECT * FROM audit_alerts
            WHERE resolved = 0
            ORDER BY alert_time DESC
        """)
        
        return [dict(row) for row in cursor.fetchall()]
    
    def resolve_alert(self, alert_id: int, resolution_notes: str):
        """Mark an alert as resolved"""
        self.conn.execute("""
            UPDATE audit_alerts SET
                resolved = 1,
                resolved_time = ?,
                resolution_notes = ?
            WHERE id = ?
        """, (
            datetime.now().isoformat(),
            resolution_notes,
            alert_id
        ))
        
        self.conn.commit()
    
    def export_audit_log(self, output_file: str, 
                        start_date: Optional[datetime] = None,
                        end_date: Optional[datetime] = None):
        """Export audit log to JSON file"""
        if start_date is None:
            start_date = datetime.now() - timedelta(days=30)
        if end_date is None:
            end_date = datetime.now()
        
        cursor = self.conn.execute("""
            SELECT * FROM audit_log
            WHERE timestamp BETWEEN ? AND ?
            ORDER BY timestamp
        """, (start_date.isoformat(), end_date.isoformat()))
        
        data = [dict(row) for row in cursor.fetchall()]
        
        with open(output_file, 'w') as f:
            json.dump(data, f, indent=2)
        
        logger.info(f"Exported {len(data)} audit entries to {output_file}")
    
    def cleanup_old_logs(self, days_to_keep: int = 90):
        """Clean up old audit logs"""
        cutoff = (datetime.now() - timedelta(days=days_to_keep)).isoformat()
        
        # Export before deletion
        export_file = f"audit_archive_{datetime.now().strftime('%Y%m%d')}.json"
        self.export_audit_log(export_file, end_date=datetime.fromisoformat(cutoff))
        
        # Delete old records
        self.conn.execute(
            "DELETE FROM audit_log WHERE timestamp < ?",
            (cutoff,)
        )
        
        self.conn.execute(
            "DELETE FROM audit_metrics WHERE date < ?",
            (cutoff,)
        )
        
        self.conn.commit()
        logger.info(f"Cleaned up logs older than {days_to_keep} days")
    
    def close(self):
        """Close database connection"""
        if self.conn:
            self.conn.close()
            logger.info("Audit database connection closed")


def main():
    """Main function for command-line usage"""
    import argparse
    
    parser = argparse.ArgumentParser(description='Salesforce Audit Logger')
    subparsers = parser.add_subparsers(dest='command', help='Commands')
    
    # Log command
    log_parser = subparsers.add_parser('log', help='Log an operation')
    log_parser.add_argument('type', choices=[t.value for t in OperationType])
    log_parser.add_argument('object', help='Salesforce object name')
    log_parser.add_argument('--status', choices=[s.value for s in OperationStatus],
                          default=OperationStatus.SUCCESS.value)
    log_parser.add_argument('--records', type=int, help='Number of records')
    log_parser.add_argument('--success', type=int, help='Success count')
    log_parser.add_argument('--failure', type=int, help='Failure count')
    
    # Query command
    query_parser = subparsers.add_parser('query', help='Query audit log')
    query_parser.add_argument('--limit', type=int, default=100)
    query_parser.add_argument('--object', help='Filter by object')
    query_parser.add_argument('--status', choices=[s.value for s in OperationStatus])
    query_parser.add_argument('--failed', action='store_true', help='Show only failed')
    
    # Stats command
    stats_parser = subparsers.add_parser('stats', help='Get statistics')
    stats_parser.add_argument('--days', type=int, default=30, help='Days to analyze')
    
    # Export command
    export_parser = subparsers.add_parser('export', help='Export audit log')
    export_parser.add_argument('output', help='Output file')
    export_parser.add_argument('--days', type=int, default=30)
    
    # Alerts command
    alerts_parser = subparsers.add_parser('alerts', help='View active alerts')
    
    # Cleanup command
    cleanup_parser = subparsers.add_parser('cleanup', help='Clean old logs')
    cleanup_parser.add_argument('--days', type=int, default=90)
    
    args = parser.parse_args()
    
    # Initialize logger
    audit = AuditLogger()
    
    try:
        if args.command == 'log':
            entry = AuditEntry(
                operation_id="",
                operation_type=OperationType(args.type),
                object_name=args.object,
                status=OperationStatus(args.status),
                user=os.environ.get('USER', 'unknown'),
                timestamp=datetime.now(),
                record_count=args.records,
                success_count=args.success,
                failure_count=args.failure
            )
            op_id = audit.log_operation(entry)
            print(f"Logged operation: {op_id}")
        
        elif args.command == 'query':
            if args.failed:
                results = audit.get_failed_operations()
            else:
                status = OperationStatus(args.status) if args.status else None
                results = audit.get_recent_operations(
                    limit=args.limit,
                    object_name=args.object,
                    status=status
                )
            
            print(json.dumps(results, indent=2))
        
        elif args.command == 'stats':
            start = datetime.now() - timedelta(days=args.days)
            stats = audit.get_statistics(start_date=start)
            print(json.dumps(stats, indent=2))
        
        elif args.command == 'export':
            start = datetime.now() - timedelta(days=args.days)
            audit.export_audit_log(args.output, start_date=start)
            print(f"Exported to {args.output}")
        
        elif args.command == 'alerts':
            alerts = audit.get_active_alerts()
            print(json.dumps(alerts, indent=2))
        
        elif args.command == 'cleanup':
            audit.cleanup_old_logs(args.days)
            print(f"Cleaned up logs older than {args.days} days")
        
        else:
            parser.print_help()
    
    finally:
        audit.close()


if __name__ == '__main__':
    main()