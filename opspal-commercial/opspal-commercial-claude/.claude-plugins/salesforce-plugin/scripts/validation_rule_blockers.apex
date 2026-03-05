// Potential Validation Rule Blockers
List<ValidationRuleBlocker> potentialBlockers = new List<ValidationRuleBlocker>();

for (ValidationRule rule : [SELECT Id, ValidationName, 
    EntityDefinition.QualifiedApiName, 
    Metadata 
    FROM ValidationRule 
    WHERE Active = TRUE]) {
    
    String formulaText = rule.Metadata.errorConditionFormula;
    String errorMessage = rule.Metadata.errorMessage;
    
    // Heuristics to identify potential operation blockers
    Boolean isPotentialBlocker = false;
    String blockReason = '';
    
    if (formulaText != null) {
        // Check for complex conditions that might block operations
        if (formulaText.containsIgnoreCase('ISNULL') || 
            formulaText.containsIgnoreCase('ISBLANK') || 
            formulaText.containsIgnoreCase('ISPICKVAL') ||
            formulaText.containsIgnoreCase('INCLUDES') ||
            formulaText.length() > 300) {
            
            isPotentialBlocker = true;
            blockReason = 'Complex validation condition';
        }
        
        // Check for specific blocking patterns
        if (formulaText.containsIgnoreCase('NOT(') || 
            formulaText.containsIgnoreCase('AND(') || 
            formulaText.containsIgnoreCase('OR(')) {
            
            isPotentialBlocker = true;
            blockReason += (blockReason.length() > 0 ? ', ' : '') + 'Compound logical conditions';
        }
    }
    
    if (isPotentialBlocker) {
        potentialBlockers.add(new ValidationRuleBlocker(
            rule.EntityDefinition.QualifiedApiName,
            rule.ValidationName,
            formulaText,
            errorMessage,
            blockReason
        ));
    }
}

System.debug('POTENTIAL_VALIDATION_RULE_BLOCKERS_START');
for (ValidationRuleBlocker blocker : potentialBlockers) {
    System.debug('Object: ' + blocker.objectName + 
                 ', Rule: ' + blocker.ruleName + 
                 ', Reason: ' + blocker.blockReason + 
                 ', Error Message: ' + blocker.errorMessage);
}
System.debug('POTENTIAL_VALIDATION_RULE_BLOCKERS_END');

// Inner class to hold validation rule blocker details
public class ValidationRuleBlocker {
    public String objectName;
    public String ruleName;
    public String formulaText;
    public String errorMessage;
    public String blockReason;
    
    public ValidationRuleBlocker(String obj, String name, String formula, String error, String reason) {
        objectName = obj;
        ruleName = name;
        formulaText = formula;
        errorMessage = error;
        blockReason = reason;
    }
}