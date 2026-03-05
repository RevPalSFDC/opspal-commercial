#!/usr/bin/env python3
"""
python_commons.py
Common Python utilities for Salesforce script optimization
Version: 1.0.0
Usage: from lib.python_commons import *
"""

import json
import csv
import os
import sys
import time
import logging
import subprocess
import functools
import re
import yaml
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Any, Union, Callable, Tuple
from dataclasses import dataclass
import requests
from urllib.parse import quote_plus, urljoin

# Version and metadata
__version__ = "1.0.0"
__author__ = "Salesforce Script Optimization Team"

# =============================================================================
# CONFIGURATION AND CONSTANTS
# =============================================================================

# Color codes for terminal output
class Colors:
    RED = '\033[0;31m'
    GREEN = '\033[0;32m'
    YELLOW = '\033[1;33m'
    BLUE = '\033[0;34m'
    PURPLE = '\033[0;35m'
    CYAN = '\033[0;36m'
    WHITE = '\033[1;37m'
    GRAY = '\033[0;90m'
    RESET = '\033[0m'
    BOLD = '\033[1m'

# Status symbols
STATUS_SYMBOLS = {
    'success': '✓',
    'error': '✗',
    'warning': '⚠',
    'info': 'ℹ',
    'progress': '➤'
}

# Default configuration
DEFAULT_CONFIG = {
    'log_level': 'INFO',
    'log_format': '%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    'sf_cli': 'sf',  # Salesforce CLI binary
    'timeout': 300,  # 5 minutes
    'retry_attempts': 3,
    'retry_delay': 1,
    'csv_delimiter': ',',
    'json_indent': 2
}

# =============================================================================
# DATA CLASSES
# =============================================================================

@dataclass
class SalesforceOrg:
    """Represents a Salesforce organization configuration."""
    alias: str
    username: str
    instance_url: str
    access_token: Optional[str] = None
    is_sandbox: bool = False
    api_version: str = '60.0'

@dataclass
class ScriptResult:
    """Represents the result of a script operation."""
    success: bool
    message: str
    data: Optional[Any] = None
    error: Optional[str] = None
    execution_time: Optional[float] = None

@dataclass
class CSVValidation:
    """Represents CSV validation results."""
    is_valid: bool
    errors: List[str]
    warnings: List[str]
    row_count: int
    column_count: int

# =============================================================================
# LOGGING UTILITIES
# =============================================================================

class ColoredFormatter(logging.Formatter):
    """Custom formatter that adds colors to log levels."""
    
    COLORS = {
        logging.DEBUG: Colors.GRAY,
        logging.INFO: Colors.CYAN,
        logging.WARNING: Colors.YELLOW,
        logging.ERROR: Colors.RED,
        logging.CRITICAL: Colors.RED + Colors.BOLD
    }
    
    def format(self, record):
        color = self.COLORS.get(record.levelno, '')
        record.levelname = f"{color}{record.levelname}{Colors.RESET}"
        return super().format(record)

def setup_logging(
    level: str = 'INFO',
    log_file: Optional[str] = None,
    format_string: Optional[str] = None,
    use_colors: bool = True
) -> logging.Logger:
    """
    Set up logging configuration.
    
    Args:
        level: Logging level (DEBUG, INFO, WARNING, ERROR, CRITICAL)
        log_file: Optional log file path
        format_string: Custom format string
        use_colors: Whether to use colored output
    
    Returns:
        Configured logger instance
    """
    logger = logging.getLogger('salesforce_commons')
    logger.setLevel(getattr(logging, level.upper()))
    
    # Clear existing handlers
    logger.handlers.clear()
    
    # Console handler
    console_handler = logging.StreamHandler()
    if use_colors and sys.stdout.isatty():
        formatter = ColoredFormatter(
            format_string or DEFAULT_CONFIG['log_format']
        )
    else:
        formatter = logging.Formatter(
            format_string or DEFAULT_CONFIG['log_format']
        )
    console_handler.setFormatter(formatter)
    logger.addHandler(console_handler)
    
    # File handler if specified
    if log_file:
        file_handler = logging.FileHandler(log_file)
        file_formatter = logging.Formatter(
            format_string or DEFAULT_CONFIG['log_format']
        )
        file_handler.setFormatter(file_formatter)
        logger.addHandler(file_handler)
    
    return logger

# Global logger instance
logger = setup_logging()

def log_info(message: str) -> None:
    """Log info message with symbol."""
    logger.info(f"{STATUS_SYMBOLS['info']} {message}")

def log_success(message: str) -> None:
    """Log success message with symbol."""
    print(f"{Colors.GREEN}{STATUS_SYMBOLS['success']}{Colors.RESET} {message}")

def log_warning(message: str) -> None:
    """Log warning message with symbol."""
    logger.warning(f"{STATUS_SYMBOLS['warning']} {message}")

def log_error(message: str) -> None:
    """Log error message with symbol."""
    logger.error(f"{STATUS_SYMBOLS['error']} {message}")

def log_debug(message: str) -> None:
    """Log debug message."""
    logger.debug(message)

# =============================================================================
# ERROR HANDLING AND RETRY DECORATORS
# =============================================================================

def retry_on_failure(
    max_attempts: int = 3,
    delay: float = 1.0,
    backoff_multiplier: float = 2.0,
    exceptions: Tuple[Exception, ...] = (Exception,)
):
    """
    Decorator that retries a function on failure with exponential backoff.
    
    Args:
        max_attempts: Maximum number of retry attempts
        delay: Initial delay between retries in seconds
        backoff_multiplier: Multiplier for delay on each retry
        exceptions: Tuple of exceptions to catch and retry on
    """
    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            current_delay = delay
            last_exception = None
            
            for attempt in range(max_attempts):
                try:
                    log_debug(f"Attempt {attempt + 1}/{max_attempts}: {func.__name__}")
                    result = func(*args, **kwargs)
                    if attempt > 0:
                        log_success(f"Function {func.__name__} succeeded on attempt {attempt + 1}")
                    return result
                
                except exceptions as e:
                    last_exception = e
                    
                    if attempt == max_attempts - 1:
                        log_error(f"Function {func.__name__} failed after {max_attempts} attempts")
                        raise e
                    
                    log_warning(
                        f"Attempt {attempt + 1} failed for {func.__name__}: {str(e)}"
                        f". Retrying in {current_delay:.1f}s..."
                    )
                    time.sleep(current_delay)
                    current_delay *= backoff_multiplier
            
            raise last_exception
        
        return wrapper
    return decorator

def handle_exceptions(
    default_return: Any = None,
    log_errors: bool = True,
    reraise: bool = False
):
    """
    Decorator that handles exceptions gracefully.
    
    Args:
        default_return: Value to return if an exception occurs
        log_errors: Whether to log caught exceptions
        reraise: Whether to re-raise the exception after handling
    """
    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            try:
                return func(*args, **kwargs)
            except Exception as e:
                if log_errors:
                    log_error(f"Exception in {func.__name__}: {str(e)}")
                
                if reraise:
                    raise
                
                return default_return
        
        return wrapper
    return decorator

# =============================================================================
# SALESFORCE CLI WRAPPERS
# =============================================================================

class SalesforceCLI:
    """Wrapper for Salesforce CLI operations."""
    
    def __init__(self, cli_command: str = 'sf', timeout: int = 300):
        self.cli = cli_command
        self.timeout = timeout
        self._verify_cli()
    
    def _verify_cli(self) -> None:
        """Verify that the Salesforce CLI is available."""
        try:
            result = subprocess.run(
                [self.cli, '--version'],
                capture_output=True,
                text=True,
                timeout=10
            )
            if result.returncode != 0:
                raise RuntimeError(f"Salesforce CLI not working: {result.stderr}")
            log_debug(f"Salesforce CLI verified: {result.stdout.strip()}")
        except (subprocess.TimeoutExpired, FileNotFoundError) as e:
            raise RuntimeError(f"Salesforce CLI not found or not working: {e}")
    
    @retry_on_failure(max_attempts=3)
    def execute_command(
        self,
        args: List[str],
        org_alias: Optional[str] = None,
        capture_output: bool = True,
        check_result: bool = True
    ) -> subprocess.CompletedProcess:
        """
        Execute a Salesforce CLI command.
        
        Args:
            args: Command arguments (excluding the CLI command itself)
            org_alias: Target org alias
            capture_output: Whether to capture output
            check_result: Whether to check for errors
        
        Returns:
            Completed process result
        """
        cmd = [self.cli] + args
        
        if org_alias:
            cmd.extend(['--target-org', org_alias])
        
        log_debug(f"Executing: {' '.join(cmd)}")
        
        try:
            result = subprocess.run(
                cmd,
                capture_output=capture_output,
                text=True,
                timeout=self.timeout
            )
            
            if check_result and result.returncode != 0:
                error_msg = f"Command failed: {' '.join(cmd)}\nStderr: {result.stderr}"
                raise subprocess.CalledProcessError(result.returncode, cmd, error_msg)
            
            return result
            
        except subprocess.TimeoutExpired as e:
            log_error(f"Command timed out after {self.timeout}s: {' '.join(cmd)}")
            raise e
    
    def query(
        self,
        soql: str,
        org_alias: Optional[str] = None,
        output_format: str = 'json'
    ) -> Union[Dict, List]:
        """
        Execute a SOQL query.
        
        Args:
            soql: SOQL query string
            org_alias: Target org alias
            output_format: Output format ('json' or 'csv')
        
        Returns:
            Query results
        """
        args = ['data', 'query', '--query', soql]
        
        if output_format == 'json':
            args.append('--json')
        elif output_format == 'csv':
            args.extend(['--result-format', 'csv'])
        
        result = self.execute_command(args, org_alias)
        
        if output_format == 'json':
            return json.loads(result.stdout)
        else:
            return result.stdout
    
    def deploy(
        self,
        source_path: str,
        org_alias: Optional[str] = None,
        check_only: bool = False,
        test_level: str = 'NoTestRun'
    ) -> Dict:
        """
        Deploy metadata to Salesforce.
        
        Args:
            source_path: Path to source directory or metadata
            org_alias: Target org alias
            check_only: Whether to perform a validation-only deployment
            test_level: Test level for deployment
        
        Returns:
            Deployment result
        """
        if not Path(source_path).exists():
            raise FileNotFoundError(f"Source path does not exist: {source_path}")
        
        args = ['project', 'deploy', 'start']
        
        if Path(source_path).is_dir():
            args.extend(['--source-dir', source_path])
        else:
            args.extend(['--metadata-dir', source_path])
        
        if check_only:
            args.append('--dry-run')
        
        args.extend(['--test-level', test_level, '--json'])
        
        result = self.execute_command(args, org_alias)
        return json.loads(result.stdout)
    
    def get_org_info(self, org_alias: Optional[str] = None) -> Dict:
        """Get organization information."""
        args = ['org', 'display', '--json']
        result = self.execute_command(args, org_alias)
        return json.loads(result.stdout)

# Global Salesforce CLI instance
sf_cli = SalesforceCLI()

# =============================================================================
# FILE AND DATA UTILITIES
# =============================================================================

class FileUtils:
    """Utilities for file operations."""
    
    @staticmethod
    def backup_file(file_path: str, backup_dir: Optional[str] = None) -> str:
        """
        Create a backup of a file with timestamp.
        
        Args:
            file_path: Path to file to backup
            backup_dir: Directory for backup (defaults to same as original)
        
        Returns:
            Path to backup file
        """
        file_path = Path(file_path)
        if not file_path.exists():
            raise FileNotFoundError(f"File to backup does not exist: {file_path}")
        
        if backup_dir:
            backup_path = Path(backup_dir)
        else:
            backup_path = file_path.parent
        
        backup_path.mkdir(parents=True, exist_ok=True)
        
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        backup_file_path = backup_path / f"{file_path.stem}.backup.{timestamp}{file_path.suffix}"
        
        import shutil
        shutil.copy2(file_path, backup_file_path)
        
        log_success(f"Backup created: {backup_file_path}")
        return str(backup_file_path)
    
    @staticmethod
    def ensure_directory(dir_path: str, mode: int = 0o755) -> None:
        """Ensure directory exists with proper permissions."""
        path = Path(dir_path)
        path.mkdir(parents=True, exist_ok=True, mode=mode)
    
    @staticmethod
    def read_file_safely(file_path: str, encoding: str = 'utf-8') -> str:
        """Read file content safely with error handling."""
        try:
            return Path(file_path).read_text(encoding=encoding)
        except UnicodeDecodeError:
            log_warning(f"UTF-8 decode failed for {file_path}, trying latin-1")
            return Path(file_path).read_text(encoding='latin-1')
    
    @staticmethod
    def write_file_safely(
        file_path: str,
        content: str,
        encoding: str = 'utf-8',
        backup: bool = True
    ) -> None:
        """Write file content safely with optional backup."""
        path = Path(file_path)
        
        if backup and path.exists():
            FileUtils.backup_file(str(path))
        
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding=encoding)

class CSVUtils:
    """Utilities for CSV file operations."""
    
    @staticmethod
    def validate_csv(
        file_path: str,
        expected_columns: Optional[List[str]] = None,
        delimiter: str = ',',
        required_columns: Optional[List[str]] = None
    ) -> CSVValidation:
        """
        Validate a CSV file.
        
        Args:
            file_path: Path to CSV file
            expected_columns: Expected column names
            delimiter: CSV delimiter
            required_columns: Required column names
        
        Returns:
            Validation results
        """
        errors = []
        warnings = []
        row_count = 0
        column_count = 0
        
        path = Path(file_path)
        
        if not path.exists():
            errors.append(f"File does not exist: {file_path}")
            return CSVValidation(False, errors, warnings, 0, 0)
        
        if path.stat().st_size == 0:
            errors.append("File is empty")
            return CSVValidation(False, errors, warnings, 0, 0)
        
        try:
            with open(path, 'r', encoding='utf-8') as f:
                # Check for BOM
                first_char = f.read(1)
                if first_char == '\ufeff':
                    warnings.append("File contains BOM (Byte Order Mark)")
                f.seek(0)
                
                reader = csv.reader(f, delimiter=delimiter)
                
                # Read header
                try:
                    header = next(reader)
                    column_count = len(header)
                except StopIteration:
                    errors.append("File has no header row")
                    return CSVValidation(False, errors, warnings, 0, 0)
                
                # Validate columns
                if expected_columns:
                    if len(header) != len(expected_columns):
                        errors.append(
                            f"Column count mismatch. Expected: {len(expected_columns)}, "
                            f"Found: {len(header)}"
                        )
                    
                    missing_columns = set(expected_columns) - set(header)
                    if missing_columns:
                        errors.append(f"Missing columns: {', '.join(missing_columns)}")
                    
                    extra_columns = set(header) - set(expected_columns)
                    if extra_columns:
                        warnings.append(f"Extra columns: {', '.join(extra_columns)}")
                
                if required_columns:
                    missing_required = set(required_columns) - set(header)
                    if missing_required:
                        errors.append(f"Missing required columns: {', '.join(missing_required)}")
                
                # Count rows
                for row_num, row in enumerate(reader, 2):  # Start from 2 (after header)
                    row_count += 1
                    if len(row) != column_count:
                        warnings.append(f"Row {row_num} has {len(row)} columns, expected {column_count}")
        
        except UnicodeDecodeError as e:
            errors.append(f"Encoding error: {str(e)}")
        except Exception as e:
            errors.append(f"Unexpected error reading CSV: {str(e)}")
        
        is_valid = len(errors) == 0
        return CSVValidation(is_valid, errors, warnings, row_count, column_count)
    
    @staticmethod
    def read_csv_safely(
        file_path: str,
        delimiter: str = ',',
        encoding: str = 'utf-8'
    ) -> List[Dict[str, str]]:
        """Read CSV file safely and return as list of dictionaries."""
        data = []
        
        try:
            with open(file_path, 'r', encoding=encoding) as f:
                reader = csv.DictReader(f, delimiter=delimiter)
                data = list(reader)
        except UnicodeDecodeError:
            log_warning(f"UTF-8 decode failed for {file_path}, trying latin-1")
            with open(file_path, 'r', encoding='latin-1') as f:
                reader = csv.DictReader(f, delimiter=delimiter)
                data = list(reader)
        
        log_success(f"Read {len(data)} rows from CSV: {file_path}")
        return data
    
    @staticmethod
    def write_csv_safely(
        file_path: str,
        data: List[Dict[str, Any]],
        fieldnames: Optional[List[str]] = None,
        delimiter: str = ',',
        backup: bool = True
    ) -> None:
        """Write data to CSV file safely."""
        if backup and Path(file_path).exists():
            FileUtils.backup_file(file_path)
        
        if not data:
            log_warning("No data to write to CSV")
            return
        
        if fieldnames is None:
            fieldnames = list(data[0].keys())
        
        Path(file_path).parent.mkdir(parents=True, exist_ok=True)
        
        with open(file_path, 'w', newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames, delimiter=delimiter)
            writer.writeheader()
            writer.writerows(data)
        
        log_success(f"Written {len(data)} rows to CSV: {file_path}")

# =============================================================================
# JSON AND YAML UTILITIES
# =============================================================================

class DataUtils:
    """Utilities for data format operations."""
    
    @staticmethod
    def read_json(file_path: str) -> Dict[str, Any]:
        """Read JSON file safely."""
        try:
            content = FileUtils.read_file_safely(file_path)
            return json.loads(content)
        except json.JSONDecodeError as e:
            log_error(f"Invalid JSON in {file_path}: {str(e)}")
            raise
    
    @staticmethod
    def write_json(
        file_path: str,
        data: Any,
        indent: int = 2,
        backup: bool = True
    ) -> None:
        """Write data to JSON file safely."""
        if backup and Path(file_path).exists():
            FileUtils.backup_file(file_path)
        
        content = json.dumps(data, indent=indent, ensure_ascii=False)
        FileUtils.write_file_safely(file_path, content)
    
    @staticmethod
    def read_yaml(file_path: str) -> Dict[str, Any]:
        """Read YAML file safely."""
        try:
            content = FileUtils.read_file_safely(file_path)
            return yaml.safe_load(content)
        except yaml.YAMLError as e:
            log_error(f"Invalid YAML in {file_path}: {str(e)}")
            raise
    
    @staticmethod
    def write_yaml(
        file_path: str,
        data: Any,
        backup: bool = True
    ) -> None:
        """Write data to YAML file safely."""
        if backup and Path(file_path).exists():
            FileUtils.backup_file(file_path)
        
        content = yaml.safe_dump(data, default_flow_style=False, allow_unicode=True)
        FileUtils.write_file_safely(file_path, content)

# =============================================================================
# CONFIGURATION MANAGEMENT
# =============================================================================

class ConfigManager:
    """Configuration management utilities."""
    
    def __init__(self, config_file: Optional[str] = None):
        self.config_file = config_file
        self.config = DEFAULT_CONFIG.copy()
        
        if config_file and Path(config_file).exists():
            self.load_config(config_file)
    
    def load_config(self, config_file: str) -> None:
        """Load configuration from file."""
        path = Path(config_file)
        
        if not path.exists():
            log_warning(f"Configuration file not found: {config_file}")
            return
        
        try:
            if path.suffix.lower() in ['.yaml', '.yml']:
                config_data = DataUtils.read_yaml(str(path))
            elif path.suffix.lower() == '.json':
                config_data = DataUtils.read_json(str(path))
            else:
                # Try to load as key=value pairs
                config_data = {}
                content = FileUtils.read_file_safely(str(path))
                for line in content.splitlines():
                    line = line.strip()
                    if line and not line.startswith('#') and '=' in line:
                        key, value = line.split('=', 1)
                        config_data[key.strip()] = value.strip()
            
            self.config.update(config_data)
            log_success(f"Configuration loaded from: {config_file}")
            
        except Exception as e:
            log_error(f"Failed to load configuration from {config_file}: {str(e)}")
    
    def get(self, key: str, default: Any = None) -> Any:
        """Get configuration value."""
        return self.config.get(key, default)
    
    def set(self, key: str, value: Any) -> None:
        """Set configuration value."""
        self.config[key] = value
    
    def get_org_alias(self, default: Optional[str] = None) -> Optional[str]:
        """Get org alias from various sources with priority order."""
        # Priority: environment variable, config file, default
        return (
            os.environ.get('ORG_ALIAS') or
            os.environ.get('SF_TARGET_ORG') or
            os.environ.get('SF_TARGET_ORG') or
            self.config.get('org_alias') or
            default
        )

# Global config manager
config = ConfigManager()

# =============================================================================
# PROGRESS AND REPORTING UTILITIES
# =============================================================================

class ProgressReporter:
    """Progress reporting utilities."""
    
    def __init__(self, total: int, title: str = "Progress"):
        self.total = total
        self.title = title
        self.current = 0
        self.start_time = time.time()
    
    def update(self, increment: int = 1, message: Optional[str] = None) -> None:
        """Update progress."""
        self.current = min(self.current + increment, self.total)
        percentage = (self.current / self.total) * 100
        
        # Create progress bar
        bar_width = 50
        filled = int(bar_width * self.current / self.total)
        bar = '█' * filled + '░' * (bar_width - filled)
        
        # Calculate ETA
        elapsed = time.time() - self.start_time
        if self.current > 0:
            eta = (elapsed / self.current) * (self.total - self.current)
            eta_str = f"ETA: {eta:.1f}s"
        else:
            eta_str = "ETA: --"
        
        status_line = f"\r{self.title}: [{Colors.GREEN}{bar}{Colors.RESET}] {percentage:.1f}% ({self.current}/{self.total}) {eta_str}"
        
        if message:
            status_line += f" - {message}"
        
        print(status_line, end='', flush=True)
        
        if self.current >= self.total:
            print()  # New line when complete
    
    def complete(self) -> None:
        """Mark progress as complete."""
        self.current = self.total
        self.update(0, "Complete")

def show_spinner(message: str = "Processing", delay: float = 0.1):
    """Context manager for showing a spinner."""
    import threading
    import itertools
    
    class Spinner:
        def __init__(self, msg: str, delay_time: float):
            self.message = msg
            self.delay = delay_time
            self.running = False
            self.spinner_thread = None
        
        def __enter__(self):
            self.running = True
            self.spinner_thread = threading.Thread(target=self._spin)
            self.spinner_thread.start()
            return self
        
        def __exit__(self, exc_type, exc_val, exc_tb):
            self.running = False
            if self.spinner_thread:
                self.spinner_thread.join()
            print(f"\r{' ' * (len(self.message) + 10)}\r", end='')  # Clear line
        
        def _spin(self):
            spinner_chars = itertools.cycle('|/-\\')
            while self.running:
                print(f"\r{Colors.CYAN}{next(spinner_chars)} {self.message}...{Colors.RESET}", end='', flush=True)
                time.sleep(self.delay)
    
    return Spinner(message, delay)

# =============================================================================
# UTILITY FUNCTIONS
# =============================================================================

def get_timestamp(iso_format: bool = False) -> str:
    """Get current timestamp."""
    now = datetime.now(timezone.utc)
    if iso_format:
        return now.isoformat()
    else:
        return now.strftime('%Y-%m-%d %H:%M:%S UTC')

def url_encode(text: str) -> str:
    """URL encode text."""
    return quote_plus(text)

def validate_email(email: str) -> bool:
    """Validate email address format."""
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return re.match(pattern, email) is not None

def sanitize_filename(filename: str) -> str:
    """Sanitize filename for filesystem safety."""
    # Remove or replace invalid characters
    invalid_chars = '<>:"/\\|?*'
    for char in invalid_chars:
        filename = filename.replace(char, '_')
    
    # Remove leading/trailing periods and spaces
    filename = filename.strip('. ')
    
    # Limit length
    if len(filename) > 255:
        name, ext = os.path.splitext(filename)
        filename = name[:255-len(ext)] + ext
    
    return filename

def format_bytes(bytes_count: int) -> str:
    """Format byte count in human-readable format."""
    for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
        if bytes_count < 1024:
            return f"{bytes_count:.1f}{unit}"
        bytes_count /= 1024
    return f"{bytes_count:.1f}PB"

def confirm_action(message: str, default: bool = False) -> bool:
    """Prompt user for confirmation."""
    prompt = f"{message} ({'Y/n' if default else 'y/N'}): "
    
    try:
        response = input(f"{Colors.YELLOW}{prompt}{Colors.RESET}").strip().lower()
        
        if not response:
            return default
        
        return response in ['y', 'yes', 'true', '1']
    
    except (KeyboardInterrupt, EOFError):
        print()  # New line
        return False

def measure_execution_time(func: Callable) -> Callable:
    """Decorator to measure and log function execution time."""
    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        start_time = time.time()
        try:
            result = func(*args, **kwargs)
            execution_time = time.time() - start_time
            log_info(f"{func.__name__} completed in {execution_time:.2f}s")
            return result
        except Exception as e:
            execution_time = time.time() - start_time
            log_error(f"{func.__name__} failed after {execution_time:.2f}s: {str(e)}")
            raise
    
    return wrapper

# =============================================================================
# DEMO AND TESTING
# =============================================================================

def demo_commons():
    """Demonstrate the commons library functionality."""
    print(f"{Colors.BOLD}Python Commons Demo{Colors.RESET}")
    print("=" * 40)
    
    # Logging demo
    log_info("This is an info message")
    log_success("This is a success message")
    log_warning("This is a warning message")
    log_error("This is an error message")
    
    print()
    
    # Progress demo
    print("Testing progress reporter...")
    progress = ProgressReporter(10, "Demo Progress")
    for i in range(10):
        time.sleep(0.1)
        progress.update(1, f"Processing item {i+1}")
    
    print()
    
    # Spinner demo
    print("Testing spinner...")
    with show_spinner("Processing data"):
        time.sleep(2)
    
    print("Spinner demo complete!")
    
    # Config demo
    print("\nConfiguration demo:")
    print(f"Log level: {config.get('log_level')}")
    print(f"Timeout: {config.get('timeout')}")
    
    print("\nDemo completed successfully!")

# =============================================================================
# MAIN EXECUTION
# =============================================================================

if __name__ == "__main__":
    demo_commons()
