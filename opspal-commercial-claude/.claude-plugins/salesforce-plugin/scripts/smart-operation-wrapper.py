#!/usr/bin/env python3
"""
smart-operation-wrapper.py - Intelligent Salesforce Operation Wrapper
Wraps SF CLI operations with automatic error detection, fixing, and retry logic
"""

import subprocess
import json
import time
import os
import sys
import re
import tempfile
import shutil
from typing import Dict, List, Any, Optional, Tuple
from pathlib import Path
from datetime import datetime
from enum import Enum
import logging
import argparse

# Add script directory to path for imports
script_dir = Path(__file__).parent
sys.path.insert(0, str(script_dir))

# Import auto-fix engine
try:
    from auto_fix_engine import AutoFixEngine, FixConfidence
except ImportError:
    # Fallback if not available
    AutoFixEngine = None
    
    class FixConfidence(Enum):
        HIGH = 85

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class RetryStrategy(Enum):
    """Retry strategies for failed operations"""
    EXPONENTIAL_BACKOFF = "exponential"
    LINEAR_BACKOFF = "linear"
    IMMEDIATE = "immediate"
    ADAPTIVE = "adaptive"

class OperationType(Enum):
    """Types of Salesforce operations"""
    DATA_QUERY = "data_query"
    DATA_UPSERT = "data_upsert"
    DATA_INSERT = "data_insert"
    DATA_UPDATE = "data_update"
    DATA_DELETE = "data_delete"
    METADATA_DEPLOY = "metadata_deploy"
    METADATA_RETRIEVE = "metadata_retrieve"
    APEX_EXECUTE = "apex_execute"
    ORG_DISPLAY = "org_display"
    UNKNOWN = "unknown"

class OperationResult:
    """Result of an operation execution"""
    def __init__(self, success: bool, output: str = "", error: str = "", 
                 exit_code: int = 0, duration: float = 0.0, 
                 fixes_applied: List[str] = None):
        self.success = success
        self.output = output
        self.error = error
        self.exit_code = exit_code
        self.duration = duration
        self.fixes_applied = fixes_applied or []
        self.timestamp = datetime.now()

class SmartOperationWrapper:
    """Intelligent wrapper for Salesforce operations"""
    
    def __init__(self, config: Dict[str, Any] = None):
        """Initialize the wrapper"""
        self.config = config or self._default_config()
        self.auto_fix_engine = AutoFixEngine() if AutoFixEngine else None
        self.operation_history: List[OperationResult] = []
        self.retry_count = 0
        self.max_retries = self.config.get('max_retries', 3)
        self.retry_strategy = RetryStrategy(self.config.get('retry_strategy', 'exponential'))
        
    def _default_config(self) -> Dict[str, Any]:
        """Default configuration"""
        return {
            'max_retries': 3,
            'retry_strategy': 'exponential',
            'base_delay': 2,
            'max_delay': 60,
            'auto_fix': True,
            'prevention': True,
            'verbose': False,
            'timeout': 300,
            'confidence_threshold': 85
        }
    
    def execute(self, command: List[str], context: Dict[str, Any] = None) -> OperationResult:
        """Execute a Salesforce operation with smart handling"""
        operation_type = self._identify_operation(command)
        context = context or {}
        context['operation_type'] = operation_type.value
        
        logger.info(f"Executing {operation_type.value}: {' '.join(command)}")
        
        # Apply prevention if enabled
        if self.config.get('prevention', True):
            command = self._apply_prevention(command, context)
        
        # Execute with retries
        result = self._execute_with_retries(command, context)
        
        # Store in history
        self.operation_history.append(result)
        
        # Learn from result
        if self.auto_fix_engine:
            self._update_learning(result)
        
        return result
    
    def _identify_operation(self, command: List[str]) -> OperationType:
        """Identify the type of operation"""
        cmd_str = ' '.join(command).lower()
        
        if 'data' in cmd_str:
            if 'query' in cmd_str:
                return OperationType.DATA_QUERY
            elif 'upsert' in cmd_str:
                return OperationType.DATA_UPSERT
            elif 'insert' in cmd_str:
                return OperationType.DATA_INSERT
            elif 'update' in cmd_str:
                return OperationType.DATA_UPDATE
            elif 'delete' in cmd_str:
                return OperationType.DATA_DELETE
        elif 'metadata' in cmd_str or 'deploy' in cmd_str:
            if 'deploy' in cmd_str:
                return OperationType.METADATA_DEPLOY
            elif 'retrieve' in cmd_str:
                return OperationType.METADATA_RETRIEVE
        elif 'apex' in cmd_str:
            return OperationType.APEX_EXECUTE
        elif 'org' in cmd_str and 'display' in cmd_str:
            return OperationType.ORG_DISPLAY
        
        return OperationType.UNKNOWN
    
    def _apply_prevention(self, command: List[str], context: Dict[str, Any]) -> List[str]:
        """Apply preventive measures before execution"""
        prevention_script = script_dir / "error-prevention-guard.sh"
        
        if not prevention_script.exists():
            return command
        
        try:
            # Run prevention guard
            prevention_cmd = [str(prevention_script), "-n"] + command
            result = subprocess.run(
                prevention_cmd,
                capture_output=True,
                text=True,
                timeout=30
            )
            
            if result.stdout:
                # Parse modified command if any
                modified_cmd = result.stdout.strip().split()
                if modified_cmd != command:
                    logger.info("Prevention guard modified command")
                    return modified_cmd
        except Exception as e:
            logger.warning(f"Prevention guard failed: {e}")
        
        return command
    
    def _execute_with_retries(self, command: List[str], context: Dict[str, Any]) -> OperationResult:
        """Execute command with retry logic"""
        self.retry_count = 0
        last_result = None
        fixes_applied = []
        
        while self.retry_count <= self.max_retries:
            # Execute command
            result = self._execute_single(command, context)
            
            if result.success:
                result.fixes_applied = fixes_applied
                return result
            
            last_result = result
            
            # Try to fix error if auto-fix is enabled
            if self.config.get('auto_fix', True) and self.auto_fix_engine:
                fix_result = self._try_auto_fix(result.error, command, context)
                
                if fix_result:
                    fixes_applied.append(fix_result.fix_id)
                    
                    # Modify command or context based on fix
                    command, context = self._apply_fix_modifications(
                        command, context, fix_result
                    )
            
            # Check if we should retry
            if self.retry_count < self.max_retries:
                delay = self._calculate_retry_delay()
                logger.info(f"Retrying in {delay}s (attempt {self.retry_count + 1}/{self.max_retries})")
                time.sleep(delay)
                self.retry_count += 1
            else:
                break
        
        # All retries exhausted
        last_result.fixes_applied = fixes_applied
        return last_result
    
    def _execute_single(self, command: List[str], context: Dict[str, Any]) -> OperationResult:
        """Execute a single command"""
        start_time = time.time()
        
        try:
            # Add JSON output flag if not present
            if '--json' not in command and any(x in command for x in ['data', 'metadata', 'apex']):
                command.append('--json')
            
            # Execute command
            process = subprocess.run(
                command,
                capture_output=True,
                text=True,
                timeout=self.config.get('timeout', 300)
            )
            
            duration = time.time() - start_time
            
            # Parse result
            success = process.returncode == 0
            output = process.stdout
            error = process.stderr
            
            # Try to parse JSON output
            try:
                if output and output.strip().startswith('{'):
                    json_output = json.loads(output)
                    
                    # Check for Salesforce-specific success indicators
                    if 'status' in json_output:
                        success = json_output['status'] == 0
                    elif 'success' in json_output:
                        success = json_output['success']
                    
                    # Extract error message if present
                    if not success:
                        if 'message' in json_output:
                            error = json_output['message']
                        elif 'error' in json_output:
                            error = str(json_output['error'])
            except json.JSONDecodeError:
                pass
            
            return OperationResult(
                success=success,
                output=output,
                error=error or output,
                exit_code=process.returncode,
                duration=duration
            )
            
        except subprocess.TimeoutExpired:
            duration = time.time() - start_time
            return OperationResult(
                success=False,
                error="Operation timed out",
                exit_code=124,
                duration=duration
            )
        except Exception as e:
            duration = time.time() - start_time
            return OperationResult(
                success=False,
                error=str(e),
                exit_code=1,
                duration=duration
            )
    
    def _try_auto_fix(self, error: str, command: List[str], context: Dict[str, Any]) -> Any:
        """Try to automatically fix an error"""
        if not self.auto_fix_engine:
            return None
        
        # Add command context
        context['command'] = command
        
        # Look for file references in command
        for i, arg in enumerate(command):
            if os.path.exists(arg):
                context['file_path'] = arg
                break
        
        # Try auto-fix
        fix_result = self.auto_fix_engine.auto_fix(
            error,
            context,
            max_attempts=1
        )
        
        if fix_result and fix_result.success:
            logger.info(f"Applied fix: {fix_result.message}")
            return fix_result
        
        return None
    
    def _apply_fix_modifications(self, command: List[str], context: Dict[str, Any], 
                                 fix_result: Any) -> Tuple[List[str], Dict[str, Any]]:
        """Apply modifications from a fix result"""
        new_command = command.copy()
        new_context = context.copy()
        
        # Handle specific fix types
        if fix_result.fix_id == 'fix_line_endings' and fix_result.fixed_data:
            # File was modified in place
            pass
        elif fix_result.fix_id == 'retry_with_chunks' and fix_result.fixed_data:
            # Multiple chunk files created
            new_context['chunked_files'] = fix_result.fixed_data
        elif fix_result.fix_id == 'increase_timeout' and fix_result.fixed_data:
            # Update timeout
            if 'timeout' in fix_result.fixed_data:
                new_context['timeout'] = fix_result.fixed_data['timeout']
                self.config['timeout'] = fix_result.fixed_data['timeout']
        
        return new_command, new_context
    
    def _calculate_retry_delay(self) -> float:
        """Calculate delay before retry"""
        base_delay = self.config.get('base_delay', 2)
        max_delay = self.config.get('max_delay', 60)
        
        if self.retry_strategy == RetryStrategy.EXPONENTIAL_BACKOFF:
            delay = min(base_delay * (2 ** self.retry_count), max_delay)
        elif self.retry_strategy == RetryStrategy.LINEAR_BACKOFF:
            delay = min(base_delay * (self.retry_count + 1), max_delay)
        elif self.retry_strategy == RetryStrategy.IMMEDIATE:
            delay = 0
        elif self.retry_strategy == RetryStrategy.ADAPTIVE:
            # Adaptive based on error type
            delay = self._adaptive_delay()
        else:
            delay = base_delay
        
        return delay
    
    def _adaptive_delay(self) -> float:
        """Calculate adaptive delay based on error patterns"""
        if not self.operation_history:
            return self.config.get('base_delay', 2)
        
        last_error = self.operation_history[-1].error.lower()
        
        # Quick retry for transient errors
        if any(x in last_error for x in ['timeout', 'connection', 'network']):
            return 1
        
        # Longer delay for rate limits
        if any(x in last_error for x in ['limit', 'throttle', 'too many']):
            return 30
        
        # Medium delay for other errors
        return 5
    
    def _update_learning(self, result: OperationResult):
        """Update learning based on operation result"""
        # This would update the auto-fix engine's confidence scores
        # based on successful/failed fixes
        pass
    
    def get_statistics(self) -> Dict[str, Any]:
        """Get execution statistics"""
        total_operations = len(self.operation_history)
        successful_operations = sum(1 for r in self.operation_history if r.success)
        total_fixes = sum(len(r.fixes_applied) for r in self.operation_history)
        
        avg_duration = (
            sum(r.duration for r in self.operation_history) / total_operations
            if total_operations > 0 else 0
        )
        
        return {
            'total_operations': total_operations,
            'successful_operations': successful_operations,
            'success_rate': successful_operations / total_operations if total_operations > 0 else 0,
            'total_fixes_applied': total_fixes,
            'average_duration': avg_duration,
            'retry_stats': {
                'total_retries': sum(1 for r in self.operation_history if self.retry_count > 0),
                'max_retries_used': self.retry_count
            }
        }


def main():
    """Main function for command-line usage"""
    parser = argparse.ArgumentParser(
        description='Smart wrapper for Salesforce operations',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
    # Execute with auto-fix
    %(prog)s sf data query --query "SELECT Id FROM Account"
    
    # Execute with specific retry strategy
    %(prog)s --retry-strategy linear sf data upsert bulk --sobject Account --file data.csv
    
    # Disable auto-fix
    %(prog)s --no-auto-fix sf deploy metadata
    
    # Set confidence threshold
    %(prog)s --confidence 90 sf apex execute --file script.apex
        """
    )
    
    parser.add_argument('command', nargs='+', help='Salesforce command to execute')
    parser.add_argument('--max-retries', type=int, default=3, help='Maximum retry attempts')
    parser.add_argument('--retry-strategy', choices=['exponential', 'linear', 'immediate', 'adaptive'],
                       default='exponential', help='Retry strategy')
    parser.add_argument('--no-auto-fix', action='store_true', help='Disable automatic fixes')
    parser.add_argument('--no-prevention', action='store_true', help='Disable prevention guard')
    parser.add_argument('--timeout', type=int, default=300, help='Operation timeout in seconds')
    parser.add_argument('--confidence', type=int, default=85, help='Minimum confidence for auto-fixes')
    parser.add_argument('--verbose', action='store_true', help='Verbose output')
    parser.add_argument('--stats', action='store_true', help='Show statistics after execution')
    
    args = parser.parse_args()
    
    # Configure wrapper
    config = {
        'max_retries': args.max_retries,
        'retry_strategy': args.retry_strategy,
        'auto_fix': not args.no_auto_fix,
        'prevention': not args.no_prevention,
        'timeout': args.timeout,
        'confidence_threshold': args.confidence,
        'verbose': args.verbose
    }
    
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)
    
    # Create wrapper
    wrapper = SmartOperationWrapper(config)
    
    # Execute command
    result = wrapper.execute(args.command)
    
    # Print result
    if result.success:
        print(result.output)
        if result.fixes_applied:
            print(f"\n✅ Operation succeeded with {len(result.fixes_applied)} auto-fixes applied")
    else:
        print(f"❌ Operation failed: {result.error}", file=sys.stderr)
        sys.exit(result.exit_code)
    
    # Show statistics if requested
    if args.stats:
        stats = wrapper.get_statistics()
        print("\n=== Execution Statistics ===")
        print(f"Total operations: {stats['total_operations']}")
        print(f"Success rate: {stats['success_rate']:.1%}")
        print(f"Fixes applied: {stats['total_fixes_applied']}")
        print(f"Average duration: {stats['average_duration']:.2f}s")


if __name__ == '__main__':
    main()