public class ValidationRuleAnalyzer {
    public List<Map<String, Object>> analyzeValidationRules() {
        List<Map<String, Object>> ruleResults = new List<Map<String, Object>>();
        
        // Get all validation rules
        List<Schema.SObjectType> allObjectTypes = Schema.getGlobalDescribe().values();
        
        for (Schema.SObjectType objType : allObjectTypes) {
            Schema.DescribeSObjectResult objDescribe = objType.getDescribe();
            
            // Skip unsupported types
            if (!objDescribe.isCreateable() || !objDescribe.isCustom()) continue;
            
            List<Schema.ValidationRule> rules = objDescribe.getValidationRules();
            
            for (Schema.ValidationRule rule : rules) {
                Schema.DescribeValidationRuleResult ruleDescribe = rule.getDescribe();
                
                Map<String, Object> ruleInfo = new Map<String, Object>{
                    'objectName' => objDescribe.getName(),
                    'ruleName' => ruleDescribe.getName(),
                    'active' => ruleDescribe.isActive(),
                    'errorMessage' => ruleDescribe.getErrorMessage(),
                    'formula' => ruleDescribe.getFormulaDefinition()
                };
                
                ruleResults.add(ruleInfo);
            }
        }
        
        return ruleResults;
    }
    
    // Execute and print results
    public void executeAnalysis() {
        List<Map<String, Object>> results = analyzeValidationRules();
        System.debug('VALIDATION_RULE_ANALYSIS_START');
        System.debug(JSON.serialize(results));
        System.debug('VALIDATION_RULE_ANALYSIS_END');
    }
}