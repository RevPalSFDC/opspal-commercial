#!/usr/bin/env python3
"""
test_python_commons.py
Test script for python_commons.py library
Usage: python3 test_python_commons.py
"""

import os
import sys
import time
import tempfile
import json
from pathlib import Path

# Add lib directory to path
sys.path.insert(0, os.path.dirname(__file__))

# Import our commons library
from python_commons import *

def test_logging():
    """Test logging functionality."""
    print(f"{Colors.BLUE}Test 1: Logging Functions{Colors.RESET}")
    
    log_info("Testing info logging")
    log_success("Testing success logging")
    log_warning("Testing warning logging")
    log_error("Testing error logging (this is expected)")
    log_debug("Testing debug logging")
    
    print("✓ Logging functions work correctly")

def test_file_operations():
    """Test file operation utilities."""
    print(f"\n{Colors.BLUE}Test 2: File Operations{Colors.RESET}")
    
    with tempfile.TemporaryDirectory() as temp_dir:
        test_file = os.path.join(temp_dir, "test.txt")
        
        # Test file writing and reading
        FileUtils.write_file_safely(test_file, "Test content\nLine 2", backup=False)
        content = FileUtils.read_file_safely(test_file)
        
        assert "Test content" in content
        print("✓ File read/write operations work")
        
        # Test backup
        backup_path = FileUtils.backup_file(test_file, temp_dir)
        assert Path(backup_path).exists()
        print("✓ File backup works")
        
        # Test directory creation
        test_dir = os.path.join(temp_dir, "subdir", "nested")
        FileUtils.ensure_directory(test_dir)
        assert Path(test_dir).exists()
        print("✓ Directory creation works")

def test_csv_operations():
    """Test CSV utilities."""
    print(f"\n{Colors.BLUE}Test 3: CSV Operations{Colors.RESET}")
    
    with tempfile.TemporaryDirectory() as temp_dir:
        csv_file = os.path.join(temp_dir, "test.csv")
        
        # Create test CSV
        test_data = [
            {"Name": "John Doe", "Email": "john@example.com", "Phone": "555-1234"},
            {"Name": "Jane Smith", "Email": "jane@example.com", "Phone": "555-5678"}
        ]
        
        # Test CSV writing
        CSVUtils.write_csv_safely(csv_file, test_data, backup=False)
        assert Path(csv_file).exists()
        print("✓ CSV writing works")
        
        # Test CSV reading
        read_data = CSVUtils.read_csv_safely(csv_file)
        assert len(read_data) == 2
        assert read_data[0]["Name"] == "John Doe"
        print("✓ CSV reading works")
        
        # Test CSV validation
        validation = CSVUtils.validate_csv(
            csv_file,
            expected_columns=["Name", "Email", "Phone"]
        )
        
        assert validation.is_valid
        assert validation.row_count == 2
        assert validation.column_count == 3
        print("✓ CSV validation works")

def test_json_operations():
    """Test JSON utilities."""
    print(f"\n{Colors.BLUE}Test 4: JSON Operations{Colors.RESET}")
    
    with tempfile.TemporaryDirectory() as temp_dir:
        json_file = os.path.join(temp_dir, "test.json")
        
        # Test data
        test_data = {
            "name": "Test Project",
            "version": "1.0.0",
            "config": {
                "debug": True,
                "timeout": 300
            }
        }
        
        # Test JSON writing
        DataUtils.write_json(json_file, test_data, backup=False)
        assert Path(json_file).exists()
        print("✓ JSON writing works")
        
        # Test JSON reading
        read_data = DataUtils.read_json(json_file)
        assert read_data["name"] == "Test Project"
        assert read_data["config"]["debug"] is True
        print("✓ JSON reading works")

def test_error_handling():
    """Test error handling decorators."""
    print(f"\n{Colors.BLUE}Test 5: Error Handling{Colors.RESET}")
    
    # Test retry decorator
    @retry_on_failure(max_attempts=3, delay=0.1)
    def flaky_function(should_succeed=True):
        if should_succeed:
            return "Success!"
        raise ValueError("Simulated error")
    
    # Test successful retry
    result = flaky_function(True)
    assert result == "Success!"
    print("✓ Retry decorator works for successful operations")
    
    # Test exception handling decorator
    @handle_exceptions(default_return="Default", log_errors=False)
    def failing_function():
        raise RuntimeError("This always fails")
    
    result = failing_function()
    assert result == "Default"
    print("✓ Exception handling decorator works")

def test_progress_reporting():
    """Test progress reporting utilities."""
    print(f"\n{Colors.BLUE}Test 6: Progress Reporting{Colors.RESET}")
    
    # Test progress reporter
    progress = ProgressReporter(10, "Test Progress")
    for i in range(10):
        time.sleep(0.05)
        progress.update(1, f"Item {i+1}")
    
    print("✓ Progress reporter works")
    
    # Test spinner (brief test)
    print("Testing spinner (2 seconds)...")
    with show_spinner("Processing test data"):
        time.sleep(1)
    
    print("✓ Spinner works")

def test_configuration():
    """Test configuration management."""
    print(f"\n{Colors.BLUE}Test 7: Configuration Management{Colors.RESET}")
    
    # Test default config
    config_manager = ConfigManager()
    log_level = config_manager.get('log_level')
    assert log_level == 'INFO'
    print("✓ Default configuration works")
    
    # Test config setting
    config_manager.set('custom_setting', 'test_value')
    assert config_manager.get('custom_setting') == 'test_value'
    print("✓ Configuration setting works")
    
    # Test org alias resolution
    os.environ['ORG_ALIAS'] = 'test-org-alias'
    org_alias = config_manager.get_org_alias()
    assert org_alias == 'test-org-alias'
    print("✓ Org alias resolution works")
    
    # Clean up
    del os.environ['ORG_ALIAS']

def test_utilities():
    """Test utility functions."""
    print(f"\n{Colors.BLUE}Test 8: Utility Functions{Colors.RESET}")
    
    # Test timestamp
    timestamp = get_timestamp()
    assert len(timestamp) > 10
    print("✓ Timestamp generation works")
    
    # Test URL encoding
    encoded = url_encode("test string with spaces")
    assert encoded == "test+string+with+spaces"
    print("✓ URL encoding works")
    
    # Test email validation
    assert validate_email("test@example.com") is True
    assert validate_email("invalid-email") is False
    print("✓ Email validation works")
    
    # Test filename sanitization
    sanitized = sanitize_filename("file<>name.txt")
    assert "<" not in sanitized and ">" not in sanitized
    print("✓ Filename sanitization works")
    
    # Test byte formatting
    formatted = format_bytes(1024 * 1024)
    assert "1.0MB" in formatted
    print("✓ Byte formatting works")

def test_salesforce_cli():
    """Test Salesforce CLI wrapper (if available)."""
    print(f"\n{Colors.BLUE}Test 9: Salesforce CLI Wrapper{Colors.RESET}")
    
    try:
        sf_cli_instance = SalesforceCLI()
        print("✓ Salesforce CLI detected and wrapper created")
        
        # Note: We don't run actual SF commands in tests since they require auth
        print("✓ Salesforce CLI wrapper initialized successfully")
        
    except RuntimeError as e:
        print(f"⚠ Salesforce CLI not available: {str(e)}")
        print("  This is expected if SF CLI is not installed")

def test_execution_timing():
    """Test execution timing decorator."""
    print(f"\n{Colors.BLUE}Test 10: Execution Timing{Colors.RESET}")
    
    @measure_execution_time
    def timed_function():
        time.sleep(0.1)
        return "Completed"
    
    result = timed_function()
    assert result == "Completed"
    print("✓ Execution timing decorator works")

def run_all_tests():
    """Run all tests."""
    print(f"{Colors.BOLD}Python Commons Library Test Suite{Colors.RESET}")
    print("=" * 50)
    
    try:
        test_logging()
        test_file_operations()
        test_csv_operations()
        test_json_operations()
        test_error_handling()
        test_progress_reporting()
        test_configuration()
        test_utilities()
        test_salesforce_cli()
        test_execution_timing()
        
        print(f"\n{Colors.GREEN}{STATUS_SYMBOLS['success']} All tests passed successfully!{Colors.RESET}")
        
        # Show usage examples
        show_usage_examples()
        
    except Exception as e:
        print(f"\n{Colors.RED}{STATUS_SYMBOLS['error']} Test failed: {str(e)}{Colors.RESET}")
        import traceback
        traceback.print_exc()
        return False
    
    return True

def show_usage_examples():
    """Show usage examples."""
    examples = """
USAGE EXAMPLES:
===============

1. Basic logging:
   from lib.python_commons import *
   
   log_info("Starting process...")
   log_success("Process completed!")
   log_error("Something went wrong")

2. File operations:
   # Safe file operations with backup
   FileUtils.write_file_safely("data.txt", "content", backup=True)
   content = FileUtils.read_file_safely("data.txt")
   
   # Create directory safely
   FileUtils.ensure_directory("/path/to/new/dir")

3. CSV operations:
   # Read CSV safely
   data = CSVUtils.read_csv_safely("data.csv")
   
   # Validate CSV
   validation = CSVUtils.validate_csv("data.csv", ["Name", "Email"])
   if not validation.is_valid:
       print("CSV validation errors:", validation.errors)
   
   # Write CSV safely
   CSVUtils.write_csv_safely("output.csv", data_list)

4. JSON/YAML operations:
   # JSON operations
   data = DataUtils.read_json("config.json")
   DataUtils.write_json("output.json", data, indent=4)
   
   # YAML operations (requires PyYAML)
   config = DataUtils.read_yaml("config.yaml")
   DataUtils.write_yaml("output.yaml", config)

5. Configuration management:
   config = ConfigManager("config.yaml")
   database_url = config.get("database_url", "default_url")
   org_alias = config.get_org_alias()

6. Error handling with decorators:
   @retry_on_failure(max_attempts=3, delay=1.0)
   def unreliable_api_call():
       return requests.get("https://api.example.com/data")
   
   @handle_exceptions(default_return=None, log_errors=True)
   def might_fail():
       return risky_operation()

7. Progress reporting:
   # Progress bar
   progress = ProgressReporter(100, "Processing records")
   for i, record in enumerate(records):
       process_record(record)
       progress.update(1, f"Processed {record.id}")
   
   # Spinner for unknown duration
   with show_spinner("Loading data"):
       long_running_operation()

8. Salesforce CLI operations:
   sf_cli = SalesforceCLI()
   
   # Execute SOQL query
   results = sf_cli.query("SELECT Id, Name FROM Account LIMIT 10", "my-org")
   
   # Deploy metadata
   deploy_result = sf_cli.deploy("force-app/", "my-org", check_only=True)
   
   # Get org info
   org_info = sf_cli.get_org_info("my-org")

9. Utility functions:
   # Timing decorator
   @measure_execution_time
   def slow_function():
       time.sleep(2)
       return "done"
   
   # Email validation
   if validate_email(user_email):
       send_notification(user_email)
   
   # Safe filename
   safe_name = sanitize_filename(user_input)
   
   # User confirmation
   if confirm_action("Delete all records?"):
       delete_records()

10. Complete script example:
    #!/usr/bin/env python3
    from lib.python_commons import *
    
    def main():
        # Setup logging
        logger = setup_logging(level='INFO', log_file='script.log')
        
        # Load configuration
        config = ConfigManager('config.yaml')
        org_alias = config.get_org_alias()
        
        log_info("Script started")
        
        try:
            # Your script logic here
            with show_spinner("Processing data"):
                results = process_salesforce_data(org_alias)
            
            log_success(f"Processed {len(results)} records")
            
        except Exception as e:
            log_error(f"Script failed: {str(e)}")
            return 1
        
        return 0
    
    if __name__ == "__main__":
        sys.exit(main())
"""
    
    print(examples)

if __name__ == "__main__":
    success = run_all_tests()
    sys.exit(0 if success else 1)