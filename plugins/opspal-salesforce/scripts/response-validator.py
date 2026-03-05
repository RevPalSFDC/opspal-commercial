#!/usr/bin/env python3
"""
response-validator.py - Deep validation for Salesforce API responses
Validates response structure, data integrity, and success indicators
"""

import json
import logging
import re
from typing import Dict, List, Any, Optional, Tuple
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
import hashlib

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@dataclass
class ValidationResult:
    """Result of response validation"""
    is_valid: bool
    success_count: int = 0
    failure_count: int = 0
    warning_count: int = 0
    errors: List[Dict[str, Any]] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)
    validation_time: datetime = field(default_factory=datetime.now)
    
    @property
    def success_rate(self) -> float:
        total = self.success_count + self.failure_count
        return (self.success_count / total * 100) if total > 0 else 0.0
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            'is_valid': self.is_valid,
            'success_count': self.success_count,
            'failure_count': self.failure_count,
            'warning_count': self.warning_count,
            'success_rate': self.success_rate,
            'errors': self.errors,
            'warnings': self.warnings,
            'metadata': self.metadata,
            'validation_time': self.validation_time.isoformat()
        }

class ResponseValidator:
    """Validates Salesforce API responses with deep inspection"""
    
    # Known Salesforce error codes
    KNOWN_ERROR_CODES = {
        'DUPLICATE_VALUE': 'Record already exists',
        'FIELD_CUSTOM_VALIDATION_EXCEPTION': 'Validation rule failed',
        'REQUIRED_FIELD_MISSING': 'Required field is missing',
        'INVALID_FIELD': 'Field does not exist',
        'INSUFFICIENT_ACCESS': 'User lacks permission',
        'UNABLE_TO_LOCK_ROW': 'Record is locked',
        'STORAGE_LIMIT_EXCEEDED': 'Storage limit exceeded',
        'INVALID_SESSION_ID': 'Session has expired',
        'REQUEST_LIMIT_EXCEEDED': 'API limit exceeded',
        'ENTITY_IS_DELETED': 'Record has been deleted'
    }
    
    # Success indicators in responses
    SUCCESS_INDICATORS = [
        'success', 'succeeded', 'created', 'updated', 
        'id', 'recordId', 'totalSize', 'done'
    ]
    
    # Failure indicators
    FAILURE_INDICATORS = [
        'error', 'errors', 'failed', 'failure', 
        'exception', 'fault', 'invalid', 'rejected'
    ]
    
    def __init__(self, strict_mode: bool = False):
        """
        Initialize validator
        
        Args:
            strict_mode: If True, warnings are treated as errors
        """
        self.strict_mode = strict_mode
        self.validation_rules = self._initialize_validation_rules()
        
    def _initialize_validation_rules(self) -> Dict[str, callable]:
        """Initialize validation rules for different response types"""
        return {
            'single_record': self._validate_single_record,
            'bulk_records': self._validate_bulk_records,
            'query_result': self._validate_query_result,
            'composite': self._validate_composite_response,
            'metadata': self._validate_metadata_response,
            'job_result': self._validate_job_result,
            'batch_result': self._validate_batch_result
        }
    
    def validate(self, response: Any, response_type: str = 'auto', 
                 expected_count: Optional[int] = None) -> ValidationResult:
        """
        Validate a Salesforce API response
        
        Args:
            response: The response to validate (dict, list, or string)
            response_type: Type of response or 'auto' to detect
            expected_count: Expected number of records (optional)
            
        Returns:
            ValidationResult with detailed findings
        """
        result = ValidationResult(is_valid=True)
        
        try:
            # Parse response if string
            if isinstance(response, str):
                try:
                    response = json.loads(response)
                except json.JSONDecodeError as e:
                    result.is_valid = False
                    result.errors.append({
                        'type': 'JSON_PARSE_ERROR',
                        'message': str(e),
                        'response_snippet': response[:500] if len(response) > 500 else response
                    })
                    return result
            
            # Detect response type if auto
            if response_type == 'auto':
                response_type = self._detect_response_type(response)
                result.metadata['detected_type'] = response_type
            
            # Apply appropriate validation
            if response_type in self.validation_rules:
                result = self.validation_rules[response_type](response, result)
            else:
                result = self._validate_generic(response, result)
            
            # Check expected count if provided
            if expected_count is not None:
                actual_count = result.success_count + result.failure_count
                if actual_count != expected_count:
                    result.warnings.append(
                        f"Expected {expected_count} records, got {actual_count}"
                    )
                    if self.strict_mode:
                        result.is_valid = False
            
            # Final validation
            result.is_valid = self._final_validation(result)
            
        except Exception as e:
            logger.exception("Validation error")
            result.is_valid = False
            result.errors.append({
                'type': 'VALIDATION_ERROR',
                'message': str(e)
            })
        
        return result
    
    def _detect_response_type(self, response: Any) -> str:
        """Detect the type of Salesforce response"""
        if isinstance(response, list):
            if all(isinstance(r, dict) and 'id' in r for r in response[:5]):
                return 'bulk_records'
            return 'batch_result'
        
        if isinstance(response, dict):
            # Query result
            if 'totalSize' in response and 'records' in response:
                return 'query_result'
            
            # Composite response
            if 'compositeResponse' in response:
                return 'composite'
            
            # Job result
            if 'state' in response and 'object' in response:
                return 'job_result'
            
            # Metadata response
            if 'fullName' in response or 'metadataType' in response:
                return 'metadata'
            
            # Single record
            if 'id' in response or 'success' in response:
                return 'single_record'
        
        return 'generic'
    
    def _validate_single_record(self, response: Dict, result: ValidationResult) -> ValidationResult:
        """Validate single record response"""
        # Check for success field
        if 'success' in response:
            if response['success']:
                result.success_count = 1
                
                # Validate ID presence
                if 'id' not in response and 'Id' not in response:
                    result.warnings.append("Success but no ID returned")
            else:
                result.failure_count = 1
                result.is_valid = False
                
                # Extract error details
                if 'errors' in response:
                    for error in response['errors']:
                        result.errors.append(self._parse_error(error))
        
        # Check for error indicators
        elif any(key in response for key in self.FAILURE_INDICATORS):
            result.failure_count = 1
            result.is_valid = False
            result.errors.append({
                'type': 'RESPONSE_ERROR',
                'response': response
            })
        
        # Check for success indicators
        elif any(key in response for key in self.SUCCESS_INDICATORS):
            result.success_count = 1
        
        else:
            result.warnings.append("Cannot determine success/failure status")
        
        return result
    
    def _validate_bulk_records(self, response: List, result: ValidationResult) -> ValidationResult:
        """Validate bulk records response"""
        for idx, record in enumerate(response):
            if not isinstance(record, dict):
                result.warnings.append(f"Record {idx} is not a dictionary")
                continue
            
            if 'success' in record:
                if record['success']:
                    result.success_count += 1
                else:
                    result.failure_count += 1
                    if 'errors' in record:
                        for error in record['errors']:
                            error_detail = self._parse_error(error)
                            error_detail['record_index'] = idx
                            result.errors.append(error_detail)
            elif 'id' in record or 'Id' in record:
                result.success_count += 1
            else:
                result.warnings.append(f"Record {idx} has unknown status")
        
        # Check if any failures make the whole operation invalid
        if result.failure_count > 0:
            failure_rate = (result.failure_count / len(response)) * 100
            if failure_rate > 5:  # More than 5% failure rate
                result.is_valid = False
                result.errors.append({
                    'type': 'HIGH_FAILURE_RATE',
                    'message': f'Failure rate: {failure_rate:.2f}%'
                })
        
        return result
    
    def _validate_query_result(self, response: Dict, result: ValidationResult) -> ValidationResult:
        """Validate query result response"""
        # Check required fields
        if 'totalSize' not in response:
            result.warnings.append("Missing totalSize field")
        
        if 'done' not in response:
            result.warnings.append("Missing done field")
        
        if 'records' in response:
            records = response['records']
            if not isinstance(records, list):
                result.is_valid = False
                result.errors.append({
                    'type': 'INVALID_STRUCTURE',
                    'message': 'Records field is not a list'
                })
            else:
                result.success_count = len(records)
                
                # Validate total size matches
                if 'totalSize' in response:
                    if response['done'] and response['totalSize'] != len(records):
                        result.warnings.append(
                            f"totalSize ({response['totalSize']}) doesn't match "
                            f"records count ({len(records)})"
                        )
        else:
            result.warnings.append("No records field in query response")
        
        return result
    
    def _validate_composite_response(self, response: Dict, result: ValidationResult) -> ValidationResult:
        """Validate composite API response"""
        if 'compositeResponse' not in response:
            result.is_valid = False
            result.errors.append({
                'type': 'INVALID_COMPOSITE',
                'message': 'Missing compositeResponse field'
            })
            return result
        
        for subrequest in response['compositeResponse']:
            if subrequest.get('httpStatusCode', 500) < 300:
                result.success_count += 1
            else:
                result.failure_count += 1
                if 'body' in subrequest:
                    result.errors.append({
                        'type': 'COMPOSITE_ERROR',
                        'status': subrequest.get('httpStatusCode'),
                        'reference': subrequest.get('referenceId'),
                        'body': subrequest['body']
                    })
        
        if result.failure_count > 0:
            result.is_valid = False
        
        return result
    
    def _validate_metadata_response(self, response: Dict, result: ValidationResult) -> ValidationResult:
        """Validate metadata API response"""
        if 'success' in response:
            if response['success']:
                result.success_count = 1
            else:
                result.failure_count = 1
                result.is_valid = False
        
        # Check for deploy results
        if 'deployResult' in response:
            deploy = response['deployResult']
            if 'numberComponentsDeployed' in deploy:
                result.success_count = deploy['numberComponentsDeployed']
            if 'numberComponentErrors' in deploy:
                result.failure_count = deploy['numberComponentErrors']
                if result.failure_count > 0:
                    result.is_valid = False
        
        return result
    
    def _validate_job_result(self, response: Dict, result: ValidationResult) -> ValidationResult:
        """Validate bulk job result"""
        state = response.get('state', '').upper()
        
        if state in ['JOBCOMPLETE', 'COMPLETED']:
            result.success_count = response.get('numberRecordsProcessed', 0)
            result.failure_count = response.get('numberRecordsFailed', 0)
            
            if result.failure_count > 0:
                failure_rate = (result.failure_count / 
                               (result.success_count + result.failure_count)) * 100
                if failure_rate > 5:
                    result.is_valid = False
                    result.errors.append({
                        'type': 'JOB_FAILURES',
                        'message': f'{result.failure_count} records failed',
                        'failure_rate': failure_rate
                    })
        
        elif state in ['FAILED', 'ABORTED']:
            result.is_valid = False
            result.failure_count = response.get('numberRecordsProcessed', 1)
            result.errors.append({
                'type': 'JOB_FAILED',
                'state': state,
                'message': response.get('stateMessage', 'Job failed')
            })
        
        elif state in ['INPROGRESS', 'QUEUED', 'PREPARING']:
            result.warnings.append(f"Job still in progress: {state}")
        
        return result
    
    def _validate_batch_result(self, response: List, result: ValidationResult) -> ValidationResult:
        """Validate batch operation result"""
        for item in response:
            if isinstance(item, dict):
                # Apply single record validation
                item_result = self._validate_single_record(item, ValidationResult(is_valid=True))
                result.success_count += item_result.success_count
                result.failure_count += item_result.failure_count
                result.errors.extend(item_result.errors)
                result.warnings.extend(item_result.warnings)
        
        if result.failure_count > 0:
            result.is_valid = False
        
        return result
    
    def _validate_generic(self, response: Any, result: ValidationResult) -> ValidationResult:
        """Generic validation for unknown response types"""
        response_str = str(response).lower()
        
        # Look for error indicators
        if any(indicator in response_str for indicator in ['error', 'fail', 'exception']):
            result.is_valid = False
            result.failure_count = 1
            result.errors.append({
                'type': 'GENERIC_ERROR',
                'response': response
            })
        
        # Look for success indicators  
        elif any(indicator in response_str for indicator in ['success', 'complete', 'done']):
            result.success_count = 1
        
        else:
            result.warnings.append("Unable to determine response status")
        
        return result
    
    def _parse_error(self, error: Any) -> Dict[str, Any]:
        """Parse Salesforce error into structured format"""
        if isinstance(error, dict):
            error_code = error.get('statusCode', 'UNKNOWN')
            return {
                'type': error_code,
                'message': error.get('message', ''),
                'fields': error.get('fields', []),
                'description': self.KNOWN_ERROR_CODES.get(error_code, 'Unknown error')
            }
        else:
            return {
                'type': 'UNKNOWN',
                'message': str(error)
            }
    
    def _final_validation(self, result: ValidationResult) -> bool:
        """Perform final validation checks"""
        # In strict mode, warnings are errors
        if self.strict_mode and result.warnings:
            return False
        
        # Check for critical errors
        if result.errors:
            for error in result.errors:
                if error.get('type') in ['INVALID_SESSION_ID', 'REQUEST_LIMIT_EXCEEDED']:
                    return False
        
        # Already marked as invalid
        if not result.is_valid:
            return False
        
        # Check success rate
        if result.success_count + result.failure_count > 0:
            if result.success_rate < 95:  # Less than 95% success rate
                return False
        
        return True
    
    def validate_file(self, file_path: str, response_type: str = 'auto') -> ValidationResult:
        """Validate response from file"""
        try:
            with open(file_path, 'r') as f:
                content = f.read()
            return self.validate(content, response_type)
        except Exception as e:
            result = ValidationResult(is_valid=False)
            result.errors.append({
                'type': 'FILE_ERROR',
                'message': str(e)
            })
            return result
    
    def compare_responses(self, response1: Any, response2: Any) -> Dict[str, Any]:
        """Compare two responses for differences"""
        result1 = self.validate(response1)
        result2 = self.validate(response2)
        
        comparison = {
            'both_valid': result1.is_valid and result2.is_valid,
            'response1': result1.to_dict(),
            'response2': result2.to_dict(),
            'differences': {
                'success_count_diff': result2.success_count - result1.success_count,
                'failure_count_diff': result2.failure_count - result1.failure_count,
                'success_rate_diff': result2.success_rate - result1.success_rate
            }
        }
        
        return comparison


def main():
    """Main function for command-line usage"""
    import sys
    import argparse
    
    parser = argparse.ArgumentParser(description='Validate Salesforce API responses')
    parser.add_argument('input', help='Response file or JSON string')
    parser.add_argument('--type', default='auto', 
                       choices=['auto', 'single_record', 'bulk_records', 'query_result',
                               'composite', 'metadata', 'job_result', 'batch_result'],
                       help='Response type')
    parser.add_argument('--expected-count', type=int, help='Expected number of records')
    parser.add_argument('--strict', action='store_true', help='Treat warnings as errors')
    parser.add_argument('--compare', help='Second response to compare')
    parser.add_argument('--output', help='Output file for results')
    
    args = parser.parse_args()
    
    validator = ResponseValidator(strict_mode=args.strict)
    
    # Load input
    if Path(args.input).exists():
        with open(args.input, 'r') as f:
            response = f.read()
    else:
        response = args.input
    
    # Validate or compare
    if args.compare:
        if Path(args.compare).exists():
            with open(args.compare, 'r') as f:
                response2 = f.read()
        else:
            response2 = args.compare
        
        result = validator.compare_responses(response, response2)
    else:
        result = validator.validate(response, args.type, args.expected_count)
        result = result.to_dict()
    
    # Output results
    output_json = json.dumps(result, indent=2)
    
    if args.output:
        with open(args.output, 'w') as f:
            f.write(output_json)
        print(f"Results written to {args.output}")
    else:
        print(output_json)
    
    # Exit code based on validation
    if isinstance(result, dict) and 'is_valid' in result:
        sys.exit(0 if result['is_valid'] else 1)
    elif isinstance(result, dict) and 'both_valid' in result:
        sys.exit(0 if result['both_valid'] else 1)


if __name__ == '__main__':
    main()