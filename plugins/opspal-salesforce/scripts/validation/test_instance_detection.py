#!/usr/bin/env python3

"""
Test instance detection logic for Salesforce sub-agents
"""

def detect_instance_type(instance_url):
    """
    Detect whether a Salesforce instance is Sandbox or Production
    """
    if not instance_url:
        return {
            'type': 'UNKNOWN',
            'error': 'No instance URL provided'
        }
    
    # Check for sandbox indicators
    is_sandbox = (
        '.sandbox.' in instance_url.lower() or
        '--' in instance_url or
        'test.salesforce.com' in instance_url.lower()
    )
    
    return {
        'type': 'SANDBOX' if is_sandbox else 'PRODUCTION',
        'url': instance_url,
        'skip_field_utilization': is_sandbox,
        'analysis_mode': 'METADATA_ONLY' if is_sandbox else 'FULL_ANALYSIS',
        'disclaimer': (
            '⚠️ SANDBOX INSTANCE - Field utilization statistics omitted. Analysis based on metadata only.'
            if is_sandbox else
            '✅ PRODUCTION INSTANCE - Full analysis including field utilization statistics.'
        )
    }

def test_instance_detection():
    """
    Test various Salesforce instance URLs
    """
    test_urls = [
        # Sandbox URLs
        ('https://delta-corp--revpalsb.sandbox.my.salesforce.com', 'SANDBOX'),
        ('https://company--dev.sandbox.my.salesforce.com', 'SANDBOX'),
        ('https://mycompany.sandbox.my.salesforce.com', 'SANDBOX'),
        ('https://test.salesforce.com', 'SANDBOX'),
        ('https://company--uat.my.salesforce.com', 'SANDBOX'),
        
        # Production URLs
        ('https://mycompany.my.salesforce.com', 'PRODUCTION'),
        ('https://delta-corp.my.salesforce.com', 'PRODUCTION'),
        ('https://login.salesforce.com', 'PRODUCTION'),
        ('https://na123.salesforce.com', 'PRODUCTION'),
        
        # Edge cases
        ('', 'UNKNOWN'),
        (None, 'UNKNOWN'),
    ]
    
    print("="*80)
    print("SALESFORCE INSTANCE TYPE DETECTION TEST")
    print("="*80)
    
    passed = 0
    failed = 0
    
    for url, expected_type in test_urls:
        result = detect_instance_type(url)
        actual_type = result.get('type', 'UNKNOWN')
        
        if actual_type == expected_type:
            status = "✅ PASS"
            passed += 1
        else:
            status = "❌ FAIL"
            failed += 1
        
        print(f"\nURL: {url or '[empty]'}")
        print(f"Expected: {expected_type}")
        print(f"Detected: {actual_type}")
        print(f"Status: {status}")
        
        if actual_type != 'UNKNOWN':
            print(f"Analysis Mode: {result.get('analysis_mode')}")
            print(f"Skip Field Util: {result.get('skip_field_utilization')}")
    
    print("\n" + "="*80)
    print(f"TEST RESULTS: {passed} passed, {failed} failed")
    print("="*80)
    
    # Test current connection
    print("\n" + "="*80)
    print("TESTING CURRENT DELTA_CORP SANDBOX CONNECTION")
    print("="*80)
    
    current_url = "https://delta-corp--revpalsb.sandbox.my.salesforce.com"
    result = detect_instance_type(current_url)
    
    print(f"Current Instance URL: {current_url}")
    print(f"Detected Type: {result['type']}")
    print(f"Analysis Mode: {result['analysis_mode']}")
    print(f"Skip Field Utilization: {result['skip_field_utilization']}")
    print(f"\nDisclaimer that would be shown:")
    print(result['disclaimer'])
    
    if result['type'] == 'SANDBOX' and result['skip_field_utilization']:
        print("\n✅ Instance detection working correctly for current sandbox!")
        print("Field utilization analysis will be skipped for this instance.")
    else:
        print("\n❌ Instance detection may have issues - please review.")

if __name__ == '__main__':
    test_instance_detection()