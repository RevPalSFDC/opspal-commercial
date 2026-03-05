#!/usr/bin/env python3

"""
chunked-operations.py - Intelligent chunking for large Salesforce operations
Automatically splits large datasets into manageable chunks with progress tracking
"""

import json
import csv
import sys
import subprocess
import time
from pathlib import Path
from typing import List, Dict, Any, Optional, Iterator, Tuple
from datetime import datetime
import logging
import hashlib
import pickle

# Setup logging
log_dir = Path(__file__).parent.parent / 'logs' / 'chunked-operations'
log_dir.mkdir(parents=True, exist_ok=True)
log_file = log_dir / f'chunked-{datetime.now().strftime("%Y%m%d")}.log'

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
    # Fallback if module import fails
    import importlib.util
    spec = importlib.util.spec_from_file_location(
        "safe_json_parser", 
        Path(__file__).parent / "safe-json-parser.py"
    )
    safe_json_parser = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(safe_json_parser)
    SafeJSONParser = safe_json_parser.SafeJSONParser

class ChunkedOperationManager:
    """Manages chunked operations for large Salesforce datasets"""
    
    def __init__(self, chunk_size: int = 200, cache_dir: Optional[Path] = None):
        """
        Initialize the chunked operation manager
        
        Args:
            chunk_size: Default number of records per chunk
            cache_dir: Directory for caching operation state
        """
        self.default_chunk_size = chunk_size
        self.json_parser = SafeJSONParser()
        
        # Setup cache directory
        if cache_dir is None:
            cache_dir = Path(__file__).parent.parent / '.cache' / 'chunked-ops'
        self.cache_dir = cache_dir
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        
        # Operation-specific chunk sizes (based on experience)
        self.operation_chunk_sizes = {
            'insert': 200,
            'update': 200,
            'upsert': 200,
            'delete': 200,
            'query': 2000,
            'export': 5000,
            'hard_delete': 100  # Smaller chunks for permanent deletion
        }
        
        # Track operation state
        self.operation_state = {}
        self.results = []
    
    def process_file(self, 
                     file_path: Path,
                     operation: str,
                     object_name: str,
                     chunk_size: Optional[int] = None,
                     resume: bool = True,
                     **kwargs) -> Dict[str, Any]:
        """
        Process a file in chunks
        
        Args:
            file_path: Path to CSV file
            operation: Operation type (insert, update, upsert, delete)
            object_name: Salesforce object name
            chunk_size: Override chunk size
            resume: Resume from last successful chunk if interrupted
            **kwargs: Additional arguments for the operation
            
        Returns:
            Aggregated results from all chunks
        """
        file_path = Path(file_path)
        if not file_path.exists():
            raise FileNotFoundError(f"File not found: {file_path}")
        
        # Determine chunk size
        if chunk_size is None:
            chunk_size = self.operation_chunk_sizes.get(operation, self.default_chunk_size)
        
        # Generate operation ID for tracking
        op_id = self._generate_operation_id(file_path, operation, object_name)
        
        # Check for resumable state
        start_chunk = 0
        if resume:
            state = self._load_operation_state(op_id)
            if state:
                start_chunk = state.get('last_successful_chunk', 0) + 1
                self.results = state.get('results', [])
                logger.info(f"Resuming from chunk {start_chunk}")
        
        # Count total records
        total_records = self._count_csv_records(file_path)
        total_chunks = (total_records + chunk_size - 1) // chunk_size
        
        logger.info(f"Processing {total_records} records in {total_chunks} chunks of {chunk_size}")
        
        # Process chunks
        success_count = 0
        error_count = 0
        chunk_results = []
        
        for chunk_num, chunk_data in enumerate(self._read_csv_chunks(file_path, chunk_size)):
            if chunk_num < start_chunk:
                continue
            
            logger.info(f"Processing chunk {chunk_num + 1}/{total_chunks}")
            
            # Create temporary file for chunk
            chunk_file = self._create_chunk_file(chunk_data, chunk_num, op_id)
            
            try:
                # Process chunk
                result = self._process_chunk(
                    chunk_file,
                    operation,
                    object_name,
                    chunk_num,
                    total_chunks,
                    **kwargs
                )
                
                chunk_results.append(result)
                
                # Update counts
                if result.get('success'):
                    success_count += result.get('processed', 0)
                else:
                    error_count += result.get('failed', 0)
                
                # Save state after each successful chunk
                self._save_operation_state(op_id, {
                    'last_successful_chunk': chunk_num,
                    'results': chunk_results,
                    'total_chunks': total_chunks,
                    'success_count': success_count,
                    'error_count': error_count
                })
                
            except Exception as e:
                logger.error(f"Error processing chunk {chunk_num + 1}: {e}")
                error_count += len(chunk_data)
                
                # Decide whether to continue or abort
                if self._should_abort(error_count, total_records):
                    logger.error("Too many errors, aborting operation")
                    break
            
            finally:
                # Clean up chunk file
                if chunk_file.exists():
                    chunk_file.unlink()
            
            # Progress update
            progress = ((chunk_num + 1) / total_chunks) * 100
            self._show_progress(progress, success_count, error_count)
        
        # Aggregate results
        final_result = self._aggregate_results(chunk_results)
        final_result['total_records'] = total_records
        final_result['total_chunks'] = total_chunks
        final_result['chunk_size'] = chunk_size
        
        # Clean up state if completed successfully
        if final_result.get('success'):
            self._clear_operation_state(op_id)
        
        return final_result
    
    def process_query(self,
                     query: str,
                     org_alias: Optional[str] = None,
                     chunk_size: int = 2000) -> Dict[str, Any]:
        """
        Process a large query in chunks using LIMIT and OFFSET
        
        Args:
            query: SOQL query
            org_alias: Salesforce org alias
            chunk_size: Records per chunk
            
        Returns:
            Aggregated query results
        """
        all_records = []
        offset = 0
        total_size = None
        
        # Remove existing LIMIT/OFFSET from query
        base_query = re.sub(r'\s+LIMIT\s+\d+', '', query, flags=re.IGNORECASE)
        base_query = re.sub(r'\s+OFFSET\s+\d+', '', base_query, flags=re.IGNORECASE)
        
        while True:
            # Build chunked query
            chunked_query = f"{base_query} LIMIT {chunk_size} OFFSET {offset}"
            
            logger.info(f"Executing query chunk: OFFSET {offset}")
            
            # Execute query
            result = self._execute_query(chunked_query, org_alias)
            
            if result.get('error'):
                logger.error(f"Query failed: {result.get('error_message')}")
                break
            
            # Extract records
            records = result.get('result', {}).get('records', [])
            all_records.extend(records)
            
            # Get total size (first chunk only)
            if total_size is None:
                total_size = result.get('result', {}).get('totalSize', 0)
                logger.info(f"Total records to fetch: {total_size}")
            
            # Check if we have all records
            if not records or len(records) < chunk_size:
                break
            
            # Check offset limit (Salesforce limit is 2000)
            offset += chunk_size
            if offset >= 2000:
                logger.warning("Reached OFFSET limit, switching to alternative method")
                # Could implement ID-based pagination here
                break
            
            # Progress update
            progress = (len(all_records) / total_size) * 100 if total_size else 0
            self._show_progress(progress, len(all_records), 0)
        
        return {
            'success': True,
            'records': all_records,
            'totalSize': len(all_records),
            'chunksProcessed': (offset // chunk_size) + 1
        }
    
    def _read_csv_chunks(self, file_path: Path, chunk_size: int) -> Iterator[List[Dict]]:
        """Read CSV file in chunks"""
        with open(file_path, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            chunk = []
            
            for row in reader:
                chunk.append(row)
                if len(chunk) >= chunk_size:
                    yield chunk
                    chunk = []
            
            # Yield remaining records
            if chunk:
                yield chunk
    
    def _count_csv_records(self, file_path: Path) -> int:
        """Count total records in CSV file"""
        with open(file_path, 'r', encoding='utf-8') as f:
            return sum(1 for _ in f) - 1  # Subtract header row
    
    def _create_chunk_file(self, chunk_data: List[Dict], chunk_num: int, op_id: str) -> Path:
        """Create temporary CSV file for chunk"""
        chunk_file = self.cache_dir / f"chunk_{op_id}_{chunk_num}.csv"
        
        with open(chunk_file, 'w', newline='', encoding='utf-8') as f:
            if chunk_data:
                writer = csv.DictWriter(f, fieldnames=chunk_data[0].keys())
                writer.writeheader()
                writer.writerows(chunk_data)
        
        return chunk_file
    
    def _process_chunk(self,
                      chunk_file: Path,
                      operation: str,
                      object_name: str,
                      chunk_num: int,
                      total_chunks: int,
                      **kwargs) -> Dict[str, Any]:
        """Process a single chunk"""
        org_alias = kwargs.get('org_alias', '')
        external_id = kwargs.get('external_id', 'Id')
        
        # Build command based on operation
        if operation == 'insert':
            cmd = f"sf data import bulk --sobject {object_name} --file {chunk_file}"
        elif operation == 'update':
            cmd = f"sf data update bulk --sobject {object_name} --file {chunk_file}"
        elif operation == 'upsert':
            cmd = f"sf data upsert bulk --sobject {object_name} --file {chunk_file} --external-id {external_id}"
        elif operation == 'delete':
            cmd = f"sf data delete bulk --sobject {object_name} --file {chunk_file}"
        else:
            raise ValueError(f"Unknown operation: {operation}")
        
        # Add org alias if provided
        if org_alias:
            cmd += f" --target-org {org_alias}"
        
        # Add JSON output
        cmd += " --json --wait 10"
        
        # Execute command
        try:
            logger.debug(f"Executing: {cmd}")
            result = subprocess.run(
                cmd,
                shell=True,
                capture_output=True,
                text=True,
                timeout=600  # 10 minute timeout per chunk
            )
            
            # Parse result
            parsed = self.json_parser.parse_safely(result.stdout)
            
            if parsed.get('error'):
                return {
                    'success': False,
                    'chunk': chunk_num,
                    'error': parsed.get('error_message', 'Unknown error'),
                    'failed': len(chunk_file.read_text().split('\n')) - 1
                }
            
            # Extract success metrics
            job_result = parsed.get('result', {})
            return {
                'success': True,
                'chunk': chunk_num,
                'processed': job_result.get('numberRecordsProcessed', 0),
                'successful': job_result.get('numberRecordsSuccessful', 0),
                'failed': job_result.get('numberRecordsFailed', 0),
                'job_id': job_result.get('id')
            }
            
        except subprocess.TimeoutExpired:
            logger.error(f"Chunk {chunk_num} timed out")
            return {
                'success': False,
                'chunk': chunk_num,
                'error': 'Timeout',
                'failed': len(chunk_file.read_text().split('\n')) - 1
            }
        except Exception as e:
            logger.error(f"Chunk {chunk_num} failed: {e}")
            return {
                'success': False,
                'chunk': chunk_num,
                'error': str(e),
                'failed': len(chunk_file.read_text().split('\n')) - 1
            }
    
    def _execute_query(self, query: str, org_alias: Optional[str] = None) -> Dict[str, Any]:
        """Execute a SOQL query"""
        cmd = f'sf data query --query "{query}"'
        
        if org_alias:
            cmd += f" --target-org {org_alias}"
        
        cmd += " --json"
        
        try:
            result = subprocess.run(
                cmd,
                shell=True,
                capture_output=True,
                text=True,
                timeout=300
            )
            
            return self.json_parser.parse_safely(result.stdout)
            
        except subprocess.TimeoutExpired:
            return {'error': True, 'error_message': 'Query timeout'}
        except Exception as e:
            return {'error': True, 'error_message': str(e)}
    
    def _generate_operation_id(self, file_path: Path, operation: str, object_name: str) -> str:
        """Generate unique ID for operation"""
        content = f"{file_path.absolute()}:{operation}:{object_name}"
        return hashlib.md5(content.encode()).hexdigest()[:12]
    
    def _save_operation_state(self, op_id: str, state: Dict[str, Any]):
        """Save operation state for resume capability"""
        state_file = self.cache_dir / f"state_{op_id}.pkl"
        with open(state_file, 'wb') as f:
            pickle.dump(state, f)
    
    def _load_operation_state(self, op_id: str) -> Optional[Dict[str, Any]]:
        """Load saved operation state"""
        state_file = self.cache_dir / f"state_{op_id}.pkl"
        if state_file.exists():
            try:
                with open(state_file, 'rb') as f:
                    return pickle.load(f)
            except:
                logger.warning("Could not load saved state")
        return None
    
    def _clear_operation_state(self, op_id: str):
        """Clear saved operation state"""
        state_file = self.cache_dir / f"state_{op_id}.pkl"
        if state_file.exists():
            state_file.unlink()
    
    def _should_abort(self, error_count: int, total_records: int) -> bool:
        """Determine if operation should be aborted due to errors"""
        # Abort if more than 10% of records have failed
        error_rate = error_count / total_records if total_records > 0 else 0
        return error_rate > 0.1
    
    def _show_progress(self, percentage: float, success: int, errors: int):
        """Display progress bar"""
        bar_length = 50
        filled = int(bar_length * percentage / 100)
        bar = '█' * filled + '░' * (bar_length - filled)
        
        print(f'\rProgress: [{bar}] {percentage:.1f}% | ✓ {success} | ✗ {errors}', end='', flush=True)
        
        if percentage >= 100:
            print()  # New line at completion
    
    def _aggregate_results(self, chunk_results: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Aggregate results from all chunks"""
        total_processed = sum(r.get('processed', 0) for r in chunk_results if r.get('success'))
        total_successful = sum(r.get('successful', 0) for r in chunk_results if r.get('success'))
        total_failed = sum(r.get('failed', 0) for r in chunk_results)
        
        failed_chunks = [r['chunk'] for r in chunk_results if not r.get('success')]
        
        return {
            'success': len(failed_chunks) == 0,
            'total_processed': total_processed,
            'total_successful': total_successful,
            'total_failed': total_failed,
            'success_rate': (total_successful / total_processed * 100) if total_processed > 0 else 0,
            'failed_chunks': failed_chunks,
            'chunk_results': chunk_results
        }


def main():
    """Main entry point for CLI usage"""
    import argparse
    import re
    
    parser = argparse.ArgumentParser(
        description='Process large Salesforce operations in chunks'
    )
    parser.add_argument(
        'operation',
        choices=['insert', 'update', 'upsert', 'delete', 'query'],
        help='Operation type'
    )
    parser.add_argument(
        'object',
        help='Salesforce object name'
    )
    parser.add_argument(
        '--file', '-f',
        help='CSV file path (for data operations)'
    )
    parser.add_argument(
        '--query', '-q',
        help='SOQL query (for query operation)'
    )
    parser.add_argument(
        '--chunk-size', '-c',
        type=int,
        help='Records per chunk'
    )
    parser.add_argument(
        '--org', '-o',
        help='Salesforce org alias'
    )
    parser.add_argument(
        '--external-id', '-e',
        default='Id',
        help='External ID field for upsert'
    )
    parser.add_argument(
        '--no-resume',
        action='store_true',
        help='Do not resume from previous state'
    )
    parser.add_argument(
        '--pretty', '-p',
        action='store_true',
        help='Pretty print results'
    )
    
    args = parser.parse_args()
    
    # Initialize manager
    manager = ChunkedOperationManager(
        chunk_size=args.chunk_size if args.chunk_size else 200
    )
    
    try:
        if args.operation == 'query':
            if not args.query:
                print("Error: Query is required for query operation", file=sys.stderr)
                sys.exit(1)
            
            result = manager.process_query(
                args.query,
                args.org,
                args.chunk_size or 2000
            )
        else:
            if not args.file:
                print("Error: File is required for data operations", file=sys.stderr)
                sys.exit(1)
            
            result = manager.process_file(
                Path(args.file),
                args.operation,
                args.object,
                chunk_size=args.chunk_size,
                resume=not args.no_resume,
                org_alias=args.org,
                external_id=args.external_id
            )
        
        # Output results
        if args.pretty:
            print(json.dumps(result, indent=2))
        else:
            print(json.dumps(result))
        
        # Exit with appropriate code
        sys.exit(0 if result.get('success') else 1)
        
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()