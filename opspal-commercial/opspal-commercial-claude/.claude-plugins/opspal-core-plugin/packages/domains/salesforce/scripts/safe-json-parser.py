#!/usr/bin/env python3

"""
safe-json-parser.py - Robust JSON parsing with validation and recovery
Handles malformed JSON, incomplete responses, and provides fallback strategies
"""

import json
import re
import sys
import subprocess
import time
from pathlib import Path
from typing import Dict, Any, Optional, Union, List
import logging
from datetime import datetime

# Setup logging
log_dir = Path(__file__).parent.parent / 'logs' / 'json-parser'
log_dir.mkdir(parents=True, exist_ok=True)
log_file = log_dir / f'parser-{datetime.now().strftime("%Y%m%d")}.log'

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(log_file),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

class SafeJSONParser:
    """Safe JSON parser with multiple fallback strategies"""
    
    def __init__(self, cache_dir: Optional[Path] = None):
        """Initialize the parser with optional caching"""
        if cache_dir is None:
            cache_dir = Path(__file__).parent.parent / '.cache' / 'json-responses'
        
        self.cache_dir = cache_dir
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        
        # Common JSON error patterns
        self.error_patterns = {
            'truncated': r'Expecting.*?,.*?line \d+ column \d+',
            'invalid_escape': r'Invalid.*?escape',
            'utf8_error': r'utf-8.*?decode',
            'trailing_comma': r'Expecting property name',
            'single_quotes': r"Expecting.*?'.*?'",
        }
        
        # Recovery strategies
        self.recovery_strategies = [
            self._fix_truncated_json,
            self._fix_trailing_commas,
            self._fix_single_quotes,
            self._extract_json_from_text,
            self._parse_partial_json,
            self._fallback_to_csv
        ]
    
    def parse_safely(self, 
                    input_data: Union[str, bytes, Path],
                    command: Optional[str] = None,
                    retries: int = 3) -> Dict[str, Any]:
        """
        Safely parse JSON with multiple recovery strategies
        
        Args:
            input_data: JSON string, bytes, or path to file
            command: Original command that generated the JSON (for retry)
            retries: Number of retry attempts
            
        Returns:
            Parsed JSON as dictionary, or error information
        """
        # Handle different input types
        json_string = self._get_json_string(input_data)
        
        # Try standard parsing first
        try:
            result = json.loads(json_string)
            logger.info("Successfully parsed JSON on first attempt")
            return result
        except json.JSONDecodeError as e:
            logger.warning(f"Initial JSON parse failed: {e}")
            original_error = str(e)
        
        # Try recovery strategies
        for strategy in self.recovery_strategies:
            try:
                logger.info(f"Trying recovery strategy: {strategy.__name__}")
                result = strategy(json_string)
                if result:
                    logger.info(f"Recovery successful with {strategy.__name__}")
                    return result
            except Exception as e:
                logger.debug(f"Strategy {strategy.__name__} failed: {e}")
                continue
        
        # If we have a command, try re-executing
        if command and retries > 0:
            logger.info(f"Attempting to re-execute command (retries left: {retries})")
            return self._retry_command(command, retries)
        
        # Return error information
        return {
            'error': True,
            'error_type': 'JSON_PARSE_ERROR',
            'original_error': original_error,
            'partial_data': self._extract_safe_data(json_string),
            'recommendations': self._get_recommendations(original_error)
        }
    
    def _get_json_string(self, input_data: Union[str, bytes, Path]) -> str:
        """Convert input to JSON string"""
        if isinstance(input_data, Path):
            with open(input_data, 'r', encoding='utf-8', errors='ignore') as f:
                return f.read()
        elif isinstance(input_data, bytes):
            return input_data.decode('utf-8', errors='ignore')
        else:
            return str(input_data)
    
    def _fix_truncated_json(self, json_string: str) -> Optional[Dict]:
        """Fix truncated JSON by adding closing brackets"""
        # Count opening and closing brackets
        open_braces = json_string.count('{')
        close_braces = json_string.count('}')
        open_brackets = json_string.count('[')
        close_brackets = json_string.count(']')
        
        # Add missing closing characters
        if open_braces > close_braces:
            json_string += '}' * (open_braces - close_braces)
        if open_brackets > close_brackets:
            json_string += ']' * (open_brackets - close_brackets)
        
        # Remove incomplete last item if present
        json_string = re.sub(r',\s*$', '', json_string)
        
        try:
            return json.loads(json_string)
        except:
            return None
    
    def _fix_trailing_commas(self, json_string: str) -> Optional[Dict]:
        """Remove trailing commas from JSON"""
        # Remove trailing commas before closing brackets/braces
        json_string = re.sub(r',\s*}', '}', json_string)
        json_string = re.sub(r',\s*]', ']', json_string)
        
        try:
            return json.loads(json_string)
        except:
            return None
    
    def _fix_single_quotes(self, json_string: str) -> Optional[Dict]:
        """Replace single quotes with double quotes"""
        # This is tricky - need to avoid replacing quotes inside strings
        # Simple approach for common cases
        json_string = re.sub(r"'([^']*)':", r'"\1":', json_string)  # Keys
        json_string = re.sub(r":\s*'([^']*)'", r': "\1"', json_string)  # Values
        
        try:
            return json.loads(json_string)
        except:
            return None
    
    def _extract_json_from_text(self, text: str) -> Optional[Dict]:
        """Extract JSON from mixed text output"""
        # Look for JSON-like structures
        json_patterns = [
            r'\{.*\}',  # Object
            r'\[.*\]',  # Array
        ]
        
        for pattern in json_patterns:
            matches = re.findall(pattern, text, re.DOTALL)
            for match in matches:
                try:
                    return json.loads(match)
                except:
                    continue
        
        return None
    
    def _parse_partial_json(self, json_string: str) -> Optional[Dict]:
        """Parse as much as possible from partial JSON"""
        result = {'partial': True, 'data': {}}
        
        # Try to extract key-value pairs
        kv_pattern = r'"([^"]+)"\s*:\s*("(?:[^"\\]|\\.)*"|\d+|true|false|null|\[.*?\]|\{.*?\})'
        matches = re.findall(kv_pattern, json_string)
        
        for key, value in matches:
            try:
                # Try to parse the value
                if value.startswith('"'):
                    result['data'][key] = json.loads(value)
                elif value in ('true', 'false', 'null'):
                    result['data'][key] = json.loads(value)
                elif value.isdigit():
                    result['data'][key] = int(value)
                else:
                    result['data'][key] = value
            except:
                result['data'][key] = value
        
        return result if result['data'] else None
    
    def _fallback_to_csv(self, data: str) -> Optional[Dict]:
        """Convert CSV-like output to JSON"""
        lines = data.strip().split('\n')
        if len(lines) < 2:
            return None
        
        # Try to parse as CSV
        try:
            import csv
            import io
            
            reader = csv.DictReader(io.StringIO(data))
            records = list(reader)
            
            return {
                'fallback': 'CSV',
                'records': records,
                'count': len(records)
            }
        except:
            return None
    
    def _retry_command(self, command: str, retries: int) -> Dict[str, Any]:
        """Re-execute command and try parsing again"""
        # Add --json flag if not present
        if '--json' not in command and command.startswith(('sf',)):
            command += ' --json'
        
        for attempt in range(retries):
            try:
                logger.info(f"Retry attempt {attempt + 1}/{retries}")
                
                # Add timeout to prevent hanging
                result = subprocess.run(
                    command,
                    shell=True,
                    capture_output=True,
                    text=True,
                    timeout=300  # 5 minute timeout
                )
                
                # Try parsing the output
                if result.stdout:
                    parsed = self.parse_safely(result.stdout, None, 0)
                    if not parsed.get('error'):
                        return parsed
                
                # Check if we should try CSV format
                if '--json' in command and attempt == retries - 1:
                    csv_command = command.replace('--json', '--result-format csv')
                    logger.info("Trying CSV format as fallback")
                    csv_result = subprocess.run(
                        csv_command,
                        shell=True,
                        capture_output=True,
                        text=True,
                        timeout=300
                    )
                    if csv_result.stdout:
                        return self._fallback_to_csv(csv_result.stdout)
                
            except subprocess.TimeoutExpired:
                logger.error(f"Command timed out on attempt {attempt + 1}")
            except Exception as e:
                logger.error(f"Retry failed: {e}")
            
            # Wait before next retry (exponential backoff)
            if attempt < retries - 1:
                wait_time = 2 ** attempt
                logger.info(f"Waiting {wait_time}s before next retry")
                time.sleep(wait_time)
        
        return {'error': True, 'error_type': 'RETRY_EXHAUSTED'}
    
    def _extract_safe_data(self, json_string: str) -> Dict[str, Any]:
        """Extract any salvageable data from malformed JSON"""
        safe_data = {}
        
        # Try to extract specific fields
        field_patterns = {
            'id': r'"[iI]d"\s*:\s*"([^"]+)"',
            'name': r'"[nN]ame"\s*:\s*"([^"]+)"',
            'success': r'"success"\s*:\s*(true|false)',
            'status': r'"status"\s*:\s*(\d+)',
            'message': r'"message"\s*:\s*"([^"]+)"',
            'error': r'"error"\s*:\s*"([^"]+)"',
            'totalSize': r'"totalSize"\s*:\s*(\d+)',
            'records': r'"records"\s*:\s*\[(.*?)\]'
        }
        
        for field, pattern in field_patterns.items():
            match = re.search(pattern, json_string)
            if match:
                value = match.group(1)
                # Try to parse value appropriately
                if value in ('true', 'false'):
                    safe_data[field] = value == 'true'
                elif value.isdigit():
                    safe_data[field] = int(value)
                else:
                    safe_data[field] = value
        
        return safe_data
    
    def _get_recommendations(self, error: str) -> List[str]:
        """Get recommendations based on error type"""
        recommendations = []
        
        if 'Expecting' in error:
            recommendations.append("Try re-running command with increased timeout")
            recommendations.append("Check if response was truncated due to size limits")
        
        if 'utf-8' in error.lower():
            recommendations.append("Check character encoding of source data")
            recommendations.append("Try using --result-format csv instead of --json")
        
        if 'timeout' in error.lower():
            recommendations.append("Increase timeout for large operations")
            recommendations.append("Consider chunking the operation")
        
        recommendations.append("Use fallback to CSV format if JSON continues to fail")
        recommendations.append("Check Salesforce API limits and throttling")
        
        return recommendations
    
    def validate_response(self, response: Dict) -> bool:
        """Validate that response has expected structure"""
        # Check for error indicators
        if response.get('error'):
            return False
        
        # Check for common Salesforce response structures
        if 'result' in response or 'records' in response or 'status' in response:
            return True
        
        # Check if it's a partial response
        if response.get('partial'):
            logger.warning("Response is partial - some data may be missing")
            return True
        
        return False


def parse_command_output(command: str, timeout: int = 300) -> Dict[str, Any]:
    """
    Execute command and parse output safely
    
    Args:
        command: Shell command to execute
        timeout: Command timeout in seconds
        
    Returns:
        Parsed output or error information
    """
    parser = SafeJSONParser()
    
    try:
        # Execute command
        result = subprocess.run(
            command,
            shell=True,
            capture_output=True,
            text=True,
            timeout=timeout
        )
        
        # Parse output
        if result.stdout:
            parsed = parser.parse_safely(result.stdout, command)
            
            # Add metadata
            parsed['_metadata'] = {
                'command': command,
                'exit_code': result.returncode,
                'execution_time': timeout
            }
            
            return parsed
        else:
            return {
                'error': True,
                'error_type': 'NO_OUTPUT',
                'stderr': result.stderr,
                'exit_code': result.returncode
            }
            
    except subprocess.TimeoutExpired:
        return {
            'error': True,
            'error_type': 'TIMEOUT',
            'timeout': timeout,
            'command': command
        }
    except Exception as e:
        return {
            'error': True,
            'error_type': 'EXECUTION_ERROR',
            'error_message': str(e),
            'command': command
        }


def main():
    """Main entry point for CLI usage"""
    import argparse
    
    parser = argparse.ArgumentParser(
        description='Safely parse JSON with recovery strategies'
    )
    parser.add_argument(
        'input',
        help='JSON file path, JSON string, or - for stdin'
    )
    parser.add_argument(
        '--command', '-c',
        help='Command that generated the JSON (for retry)'
    )
    parser.add_argument(
        '--retries', '-r',
        type=int,
        default=3,
        help='Number of retry attempts (default: 3)'
    )
    parser.add_argument(
        '--validate', '-v',
        action='store_true',
        help='Validate response structure'
    )
    parser.add_argument(
        '--pretty', '-p',
        action='store_true',
        help='Pretty print output'
    )
    
    args = parser.parse_args()
    
    # Get input
    if args.input == '-':
        input_data = sys.stdin.read()
    elif Path(args.input).exists():
        input_data = Path(args.input)
    else:
        input_data = args.input
    
    # Parse
    json_parser = SafeJSONParser()
    result = json_parser.parse_safely(input_data, args.command, args.retries)
    
    # Validate if requested
    if args.validate:
        is_valid = json_parser.validate_response(result)
        result['_valid'] = is_valid
    
    # Output
    if args.pretty:
        print(json.dumps(result, indent=2))
    else:
        print(json.dumps(result))
    
    # Exit with appropriate code
    sys.exit(0 if not result.get('error') else 1)


if __name__ == '__main__':
    main()
