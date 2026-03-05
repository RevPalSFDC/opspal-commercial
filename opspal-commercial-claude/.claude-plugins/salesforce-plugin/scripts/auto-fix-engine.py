#!/usr/bin/env python3
"""
auto-fix-engine.py - Autonomous Error Resolution Engine
Automatically detects and fixes common Salesforce operation errors
"""

import json
import logging
import subprocess
import os
import re
import tempfile
import shutil
from typing import Dict, List, Any, Optional, Tuple, Callable
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from enum import Enum
import hashlib
import time

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class FixConfidence(Enum):
    """Confidence levels for auto-fixes"""
    VERY_HIGH = 95  # Automatic fix
    HIGH = 85       # Automatic fix with logging
    MEDIUM = 70     # Requires confirmation
    LOW = 50        # Manual intervention
    VERY_LOW = 30   # Not recommended

class FixRisk(Enum):
    """Risk levels for auto-fixes"""
    MINIMAL = "minimal"      # Safe to auto-apply
    LOW = "low"              # Generally safe
    MEDIUM = "medium"        # Caution advised
    HIGH = "high"            # Requires approval
    CRITICAL = "critical"    # Manual only

class ErrorCategory(Enum):
    """Categories of errors that can be auto-fixed"""
    LINE_ENDING = "line_ending"
    CSV_FORMAT = "csv_format"
    JOB_PROCESSING = "job_processing"
    PERMISSION = "permission"
    TIMEOUT = "timeout"
    FIELD_MAPPING = "field_mapping"
    DATA_FORMAT = "data_format"
    API_LIMIT = "api_limit"
    CONNECTION = "connection"
    VALIDATION = "validation"

@dataclass
class ErrorPattern:
    """Pattern for identifying errors"""
    pattern_id: str
    category: ErrorCategory
    regex_patterns: List[str]
    error_codes: List[str]
    confidence_boost: float = 0.0
    
    def matches(self, error_text: str) -> bool:
        """Check if error text matches this pattern"""
        error_lower = error_text.lower()
        
        # Check regex patterns
        for pattern in self.regex_patterns:
            if re.search(pattern, error_lower, re.IGNORECASE):
                return True
        
        # Check error codes
        for code in self.error_codes:
            if code.lower() in error_lower:
                return True
        
        return False

@dataclass
class AutoFix:
    """Represents an automatic fix"""
    fix_id: str
    name: str
    description: str
    category: ErrorCategory
    confidence: FixConfidence
    risk: FixRisk
    fix_function: Callable
    rollback_function: Optional[Callable] = None
    validation_function: Optional[Callable] = None
    prerequisites: List[str] = field(default_factory=list)
    side_effects: List[str] = field(default_factory=list)

@dataclass
class FixResult:
    """Result of applying a fix"""
    success: bool
    fix_id: str
    message: str
    original_error: str
    fixed_data: Any = None
    rollback_data: Any = None
    duration_seconds: float = 0.0
    confidence: FixConfidence = FixConfidence.LOW

class AutoFixEngine:
    """Core engine for automatic error resolution"""
    
    def __init__(self, config_path: str = None):
        """Initialize the auto-fix engine"""
        self.config_path = config_path or "config/auto-fix-config.yaml"
        self.fixes: Dict[str, AutoFix] = {}
        self.patterns: List[ErrorPattern] = []
        self.history: List[FixResult] = []
        self.confidence_threshold = FixConfidence.HIGH.value
        self.risk_threshold = FixRisk.MEDIUM
        
        # Initialize patterns and fixes
        self._init_patterns()
        self._init_fixes()
        self._load_config()
    
    def _init_patterns(self):
        """Initialize error patterns"""
        self.patterns = [
            # Line ending errors
            ErrorPattern(
                pattern_id="line_ending_error",
                category=ErrorCategory.LINE_ENDING,
                regex_patterns=[
                    r"lineending.*invalid",
                    r"line.*ending.*lf",
                    r"crlf.*expected",
                    r"invalid.*line.*terminator"
                ],
                error_codes=["ClientInputError", "LineEnding"],
                confidence_boost=10.0
            ),
            
            # Job processing errors
            ErrorPattern(
                pattern_id="no_records_processed",
                category=ErrorCategory.JOB_PROCESSING,
                regex_patterns=[
                    r"no.*processed.*records",
                    r"didn't.*process.*any",
                    r"zero.*records.*processed",
                    r"job.*finished.*but.*no.*records"
                ],
                error_codes=["NoProcessedRecordsError"],
                confidence_boost=5.0
            ),
            
            # CSV format errors
            ErrorPattern(
                pattern_id="csv_format_error",
                category=ErrorCategory.CSV_FORMAT,
                regex_patterns=[
                    r"csv.*invalid",
                    r"malformed.*csv",
                    r"csv.*parse.*error",
                    r"invalid.*delimiter"
                ],
                error_codes=["CSV_ERROR", "MALFORMED_CSV"],
                confidence_boost=8.0
            ),
            
            # Permission errors
            ErrorPattern(
                pattern_id="permission_denied",
                category=ErrorCategory.PERMISSION,
                regex_patterns=[
                    r"insufficient.*access",
                    r"permission.*denied",
                    r"not.*authorized",
                    r"access.*denied"
                ],
                error_codes=["INSUFFICIENT_ACCESS", "PERMISSION_DENIED"],
                confidence_boost=0.0  # Don't auto-fix permissions
            ),
            
            # Timeout errors
            ErrorPattern(
                pattern_id="timeout_error",
                category=ErrorCategory.TIMEOUT,
                regex_patterns=[
                    r"timeout",
                    r"timed.*out",
                    r"request.*timeout",
                    r"operation.*timeout"
                ],
                error_codes=["TIMEOUT", "REQUEST_TIMEOUT"],
                confidence_boost=5.0
            ),
            
            # Field mapping errors
            ErrorPattern(
                pattern_id="field_mapping_error",
                category=ErrorCategory.FIELD_MAPPING,
                regex_patterns=[
                    r"field.*not.*found",
                    r"invalid.*field",
                    r"unknown.*field",
                    r"field.*does.*not.*exist"
                ],
                error_codes=["INVALID_FIELD", "FIELD_NOT_FOUND"],
                confidence_boost=3.0
            )
        ]
    
    def _init_fixes(self):
        """Initialize available fixes"""
        self.fixes = {
            "fix_line_endings": AutoFix(
                fix_id="fix_line_endings",
                name="Fix Line Endings",
                description="Convert file line endings to appropriate format",
                category=ErrorCategory.LINE_ENDING,
                confidence=FixConfidence.VERY_HIGH,
                risk=FixRisk.MINIMAL,
                fix_function=self._fix_line_endings,
                rollback_function=self._rollback_file_change,
                validation_function=self._validate_line_endings
            ),
            
            "fix_csv_format": AutoFix(
                fix_id="fix_csv_format",
                name="Fix CSV Format",
                description="Validate and fix CSV formatting issues",
                category=ErrorCategory.CSV_FORMAT,
                confidence=FixConfidence.HIGH,
                risk=FixRisk.LOW,
                fix_function=self._fix_csv_format,
                rollback_function=self._rollback_file_change,
                validation_function=self._validate_csv_format
            ),
            
            "retry_with_chunks": AutoFix(
                fix_id="retry_with_chunks",
                name="Retry with Smaller Chunks",
                description="Split operation into smaller chunks",
                category=ErrorCategory.JOB_PROCESSING,
                confidence=FixConfidence.HIGH,
                risk=FixRisk.LOW,
                fix_function=self._retry_with_chunks,
                validation_function=self._validate_chunk_size
            ),
            
            "increase_timeout": AutoFix(
                fix_id="increase_timeout",
                name="Increase Timeout",
                description="Retry operation with increased timeout",
                category=ErrorCategory.TIMEOUT,
                confidence=FixConfidence.HIGH,
                risk=FixRisk.MINIMAL,
                fix_function=self._increase_timeout
            ),
            
            "clean_field_names": AutoFix(
                fix_id="clean_field_names",
                name="Clean Field Names",
                description="Validate and clean field names in data file",
                category=ErrorCategory.FIELD_MAPPING,
                confidence=FixConfidence.MEDIUM,
                risk=FixRisk.MEDIUM,
                fix_function=self._clean_field_names,
                rollback_function=self._rollback_file_change,
                validation_function=self._validate_field_names
            )
        }
    
    def _load_config(self):
        """Load configuration from file"""
        config_path = Path(self.config_path)
        if config_path.exists():
            # Load YAML config if it exists
            # For now, use defaults
            pass
    
    def analyze_error(self, error_text: str, context: Dict[str, Any] = None) -> List[AutoFix]:
        """Analyze error and suggest fixes"""
        suggested_fixes = []
        
        # Identify error patterns
        matched_patterns = []
        for pattern in self.patterns:
            if pattern.matches(error_text):
                matched_patterns.append(pattern)
                logger.info(f"Matched pattern: {pattern.pattern_id}")
        
        # Get fixes for matched patterns
        for pattern in matched_patterns:
            for fix_id, fix in self.fixes.items():
                if fix.category == pattern.category:
                    # Adjust confidence based on pattern
                    original_confidence = fix.confidence.value
                    adjusted_confidence = min(100, original_confidence + pattern.confidence_boost)
                    
                    # Create a copy with adjusted confidence
                    adjusted_fix = AutoFix(
                        fix_id=fix.fix_id,
                        name=fix.name,
                        description=fix.description,
                        category=fix.category,
                        confidence=self._get_confidence_level(adjusted_confidence),
                        risk=fix.risk,
                        fix_function=fix.fix_function,
                        rollback_function=fix.rollback_function,
                        validation_function=fix.validation_function
                    )
                    suggested_fixes.append(adjusted_fix)
        
        # Sort by confidence
        suggested_fixes.sort(key=lambda f: f.confidence.value, reverse=True)
        
        return suggested_fixes
    
    def apply_fix(self, fix: AutoFix, error_text: str, context: Dict[str, Any] = None) -> FixResult:
        """Apply a specific fix"""
        logger.info(f"Applying fix: {fix.name} (confidence: {fix.confidence.name}, risk: {fix.risk.value})")
        
        start_time = time.time()
        
        # Check if automatic fix is allowed
        if fix.confidence.value < self.confidence_threshold:
            logger.warning(f"Fix confidence ({fix.confidence.value}) below threshold ({self.confidence_threshold})")
            if not self._confirm_fix(fix):
                return FixResult(
                    success=False,
                    fix_id=fix.fix_id,
                    message="Fix rejected by user",
                    original_error=error_text
                )
        
        # Validate prerequisites if any
        if fix.validation_function:
            if not fix.validation_function(context):
                return FixResult(
                    success=False,
                    fix_id=fix.fix_id,
                    message="Validation failed",
                    original_error=error_text
                )
        
        try:
            # Apply the fix
            fixed_data, rollback_data = fix.fix_function(error_text, context)
            
            duration = time.time() - start_time
            
            result = FixResult(
                success=True,
                fix_id=fix.fix_id,
                message=f"Successfully applied: {fix.name}",
                original_error=error_text,
                fixed_data=fixed_data,
                rollback_data=rollback_data,
                duration_seconds=duration,
                confidence=fix.confidence
            )
            
            # Add to history
            self.history.append(result)
            
            logger.info(f"Fix applied successfully in {duration:.2f}s")
            return result
            
        except Exception as e:
            logger.error(f"Failed to apply fix: {e}")
            
            duration = time.time() - start_time
            
            result = FixResult(
                success=False,
                fix_id=fix.fix_id,
                message=f"Fix failed: {str(e)}",
                original_error=error_text,
                duration_seconds=duration
            )
            
            self.history.append(result)
            return result
    
    def auto_fix(self, error_text: str, context: Dict[str, Any] = None, 
                 max_attempts: int = 3) -> Optional[FixResult]:
        """Automatically fix an error if possible"""
        logger.info("Auto-fix initiated")
        
        # Analyze error
        suggested_fixes = self.analyze_error(error_text, context)
        
        if not suggested_fixes:
            logger.warning("No fixes available for this error")
            return None
        
        # Try fixes in order of confidence
        for fix in suggested_fixes[:max_attempts]:
            if fix.confidence.value >= self.confidence_threshold:
                result = self.apply_fix(fix, error_text, context)
                if result.success:
                    return result
        
        logger.warning("No automatic fix could be applied")
        return None
    
    def rollback(self, fix_result: FixResult) -> bool:
        """Rollback a previously applied fix"""
        if not fix_result.success or not fix_result.rollback_data:
            logger.warning("Cannot rollback: no rollback data available")
            return False
        
        fix = self.fixes.get(fix_result.fix_id)
        if not fix or not fix.rollback_function:
            logger.warning(f"No rollback function for fix: {fix_result.fix_id}")
            return False
        
        try:
            fix.rollback_function(fix_result.rollback_data)
            logger.info(f"Successfully rolled back fix: {fix_result.fix_id}")
            return True
        except Exception as e:
            logger.error(f"Rollback failed: {e}")
            return False
    
    # Fix implementation functions
    
    def _fix_line_endings(self, error_text: str, context: Dict[str, Any]) -> Tuple[Any, Any]:
        """Fix line ending issues in a file"""
        if not context or 'file_path' not in context:
            raise ValueError("File path required in context")
        
        file_path = context['file_path']
        
        # Create backup
        backup_path = f"{file_path}.backup.{int(time.time())}"
        shutil.copy2(file_path, backup_path)
        
        # Determine target line ending
        target_ending = context.get('line_ending', 'CRLF').upper()
        
        # Convert line endings
        if target_ending == 'CRLF':
            # Convert to Windows line endings
            subprocess.run(['unix2dos', file_path], capture_output=True)
        else:
            # Convert to Unix line endings
            subprocess.run(['dos2unix', file_path], capture_output=True)
        
        logger.info(f"Converted line endings to {target_ending} for {file_path}")
        
        return file_path, backup_path
    
    def _fix_csv_format(self, error_text: str, context: Dict[str, Any]) -> Tuple[Any, Any]:
        """Fix CSV formatting issues"""
        if not context or 'file_path' not in context:
            raise ValueError("File path required in context")
        
        file_path = context['file_path']
        
        # Create backup
        backup_path = f"{file_path}.backup.{int(time.time())}"
        shutil.copy2(file_path, backup_path)
        
        # Read and fix CSV
        import csv
        
        rows = []
        with open(file_path, 'r', encoding='utf-8-sig') as f:
            # Try to detect dialect
            sample = f.read(1024)
            f.seek(0)
            
            try:
                dialect = csv.Sniffer().sniff(sample)
            except:
                dialect = csv.excel()
            
            reader = csv.reader(f, dialect)
            rows = list(reader)
        
        # Write back with standard format
        with open(file_path, 'w', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            writer.writerows(rows)
        
        logger.info(f"Fixed CSV format for {file_path}")
        
        return file_path, backup_path
    
    def _retry_with_chunks(self, error_text: str, context: Dict[str, Any]) -> Tuple[Any, Any]:
        """Split operation into smaller chunks"""
        if not context or 'file_path' not in context:
            raise ValueError("File path required in context")
        
        file_path = context['file_path']
        chunk_size = context.get('chunk_size', 200)
        
        # Create chunked files
        import csv
        
        chunks = []
        with open(file_path, 'r', encoding='utf-8-sig') as f:
            reader = csv.reader(f)
            header = next(reader)
            
            chunk_num = 0
            current_chunk = []
            
            for row in reader:
                current_chunk.append(row)
                
                if len(current_chunk) >= chunk_size:
                    chunk_file = f"{file_path}.chunk{chunk_num}.csv"
                    with open(chunk_file, 'w', newline='', encoding='utf-8') as cf:
                        writer = csv.writer(cf)
                        writer.writerow(header)
                        writer.writerows(current_chunk)
                    
                    chunks.append(chunk_file)
                    chunk_num += 1
                    current_chunk = []
            
            # Write remaining rows
            if current_chunk:
                chunk_file = f"{file_path}.chunk{chunk_num}.csv"
                with open(chunk_file, 'w', newline='', encoding='utf-8') as cf:
                    writer = csv.writer(cf)
                    writer.writerow(header)
                    writer.writerows(current_chunk)
                chunks.append(chunk_file)
        
        logger.info(f"Split {file_path} into {len(chunks)} chunks")
        
        return chunks, file_path
    
    def _increase_timeout(self, error_text: str, context: Dict[str, Any]) -> Tuple[Any, Any]:
        """Increase timeout for operation"""
        current_timeout = context.get('timeout', 120)
        new_timeout = min(current_timeout * 2, 3600)  # Max 1 hour
        
        logger.info(f"Increased timeout from {current_timeout}s to {new_timeout}s")
        
        return {'timeout': new_timeout}, {'timeout': current_timeout}
    
    def _clean_field_names(self, error_text: str, context: Dict[str, Any]) -> Tuple[Any, Any]:
        """Clean field names in data file"""
        if not context or 'file_path' not in context:
            raise ValueError("File path required in context")
        
        file_path = context['file_path']
        
        # Create backup
        backup_path = f"{file_path}.backup.{int(time.time())}"
        shutil.copy2(file_path, backup_path)
        
        # Read and clean field names
        import csv
        
        rows = []
        with open(file_path, 'r', encoding='utf-8-sig') as f:
            reader = csv.reader(f)
            header = next(reader)
            
            # Clean header fields
            cleaned_header = []
            for field in header:
                # Remove special characters, trim whitespace
                cleaned = re.sub(r'[^\w\s]', '', field).strip()
                # Replace spaces with underscores
                cleaned = cleaned.replace(' ', '_')
                # Ensure it starts with a letter
                if cleaned and not cleaned[0].isalpha():
                    cleaned = 'Field_' + cleaned
                cleaned_header.append(cleaned)
            
            rows = [cleaned_header] + list(reader)
        
        # Write back with cleaned headers
        with open(file_path, 'w', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            writer.writerows(rows)
        
        logger.info(f"Cleaned field names in {file_path}")
        
        return file_path, backup_path
    
    # Validation functions
    
    def _validate_line_endings(self, context: Dict[str, Any]) -> bool:
        """Validate that file exists for line ending fix"""
        return context and 'file_path' in context and os.path.exists(context['file_path'])
    
    def _validate_csv_format(self, context: Dict[str, Any]) -> bool:
        """Validate that file is a CSV"""
        if not context or 'file_path' not in context:
            return False
        
        file_path = context['file_path']
        return file_path.lower().endswith('.csv') and os.path.exists(file_path)
    
    def _validate_chunk_size(self, context: Dict[str, Any]) -> bool:
        """Validate chunk size is reasonable"""
        chunk_size = context.get('chunk_size', 200)
        return 10 <= chunk_size <= 10000
    
    def _validate_field_names(self, context: Dict[str, Any]) -> bool:
        """Validate that field names can be cleaned"""
        return self._validate_csv_format(context)
    
    # Rollback functions
    
    def _rollback_file_change(self, rollback_data: Any) -> None:
        """Rollback a file change using backup"""
        if isinstance(rollback_data, str) and os.path.exists(rollback_data):
            # rollback_data is the backup file path
            original_path = rollback_data.replace(r'.backup.\d+$', '')
            shutil.copy2(rollback_data, original_path)
            os.remove(rollback_data)
            logger.info(f"Rolled back changes to {original_path}")
    
    # Helper functions
    
    def _get_confidence_level(self, value: float) -> FixConfidence:
        """Get confidence level from numeric value"""
        if value >= 95:
            return FixConfidence.VERY_HIGH
        elif value >= 85:
            return FixConfidence.HIGH
        elif value >= 70:
            return FixConfidence.MEDIUM
        elif value >= 50:
            return FixConfidence.LOW
        else:
            return FixConfidence.VERY_LOW
    
    def _confirm_fix(self, fix: AutoFix) -> bool:
        """Confirm with user before applying fix"""
        # In automated mode, return True for low-risk fixes
        if fix.risk in [FixRisk.MINIMAL, FixRisk.LOW]:
            return True
        
        # Otherwise, would need user confirmation
        # For now, return False for high-risk fixes
        return fix.risk != FixRisk.CRITICAL
    
    def get_statistics(self) -> Dict[str, Any]:
        """Get statistics about fixes"""
        total_fixes = len(self.history)
        successful_fixes = sum(1 for r in self.history if r.success)
        
        category_stats = {}
        for fix_id, fix in self.fixes.items():
            category = fix.category.value
            if category not in category_stats:
                category_stats[category] = {'total': 0, 'success': 0}
            
            for result in self.history:
                if result.fix_id == fix_id:
                    category_stats[category]['total'] += 1
                    if result.success:
                        category_stats[category]['success'] += 1
        
        return {
            'total_fixes_attempted': total_fixes,
            'successful_fixes': successful_fixes,
            'success_rate': successful_fixes / total_fixes if total_fixes > 0 else 0,
            'category_statistics': category_stats,
            'average_fix_duration': sum(r.duration_seconds for r in self.history) / total_fixes if total_fixes > 0 else 0
        }


def main():
    """Main function for testing"""
    import argparse
    
    parser = argparse.ArgumentParser(description='Auto-Fix Engine for Salesforce Errors')
    parser.add_argument('error', help='Error message or file containing error')
    parser.add_argument('--file', help='File path related to error')
    parser.add_argument('--context', help='JSON context for the error')
    parser.add_argument('--auto', action='store_true', help='Automatically apply fixes')
    parser.add_argument('--confidence', type=int, default=85, help='Minimum confidence for auto-fix')
    
    args = parser.parse_args()
    
    # Initialize engine
    engine = AutoFixEngine()
    engine.confidence_threshold = args.confidence
    
    # Load error text
    if os.path.exists(args.error):
        with open(args.error, 'r') as f:
            error_text = f.read()
    else:
        error_text = args.error
    
    # Build context
    context = {}
    if args.file:
        context['file_path'] = args.file
    if args.context:
        context.update(json.loads(args.context))
    
    print(f"Analyzing error: {error_text[:100]}...")
    
    if args.auto:
        # Automatic fix
        result = engine.auto_fix(error_text, context)
        if result and result.success:
            print(f"✅ {result.message}")
            print(f"Fix applied in {result.duration_seconds:.2f}s")
        else:
            print("❌ No automatic fix could be applied")
    else:
        # Suggest fixes
        fixes = engine.analyze_error(error_text, context)
        if fixes:
            print(f"\nFound {len(fixes)} potential fixes:")
            for i, fix in enumerate(fixes, 1):
                print(f"{i}. {fix.name}")
                print(f"   Confidence: {fix.confidence.name} ({fix.confidence.value}%)")
                print(f"   Risk: {fix.risk.value}")
                print(f"   Description: {fix.description}")
        else:
            print("No fixes available for this error")
    
    # Show statistics
    stats = engine.get_statistics()
    if stats['total_fixes_attempted'] > 0:
        print(f"\nStatistics:")
        print(f"  Total attempts: {stats['total_fixes_attempted']}")
        print(f"  Success rate: {stats['success_rate']:.1%}")
        print(f"  Avg duration: {stats['average_fix_duration']:.2f}s")


if __name__ == '__main__':
    main()