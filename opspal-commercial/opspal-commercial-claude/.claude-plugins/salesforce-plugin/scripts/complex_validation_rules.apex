// Complex Validation Rules
List<ValidationRuleDetail> complexRules = new List<ValidationRuleDetail>();

for (ValidationRule rule : [SELECT Id, ValidationName, 
    EntityDefinition.QualifiedApiName, 
    Metadata 
    FROM ValidationRule 
    WHERE Active = TRUE]) {
    
    String formulaText = rule.Metadata.errorConditionFormula;
    if (formulaText != null) {
        complexRules.add(new ValidationRuleDetail(
            rule.EntityDefinition.QualifiedApiName, 
            rule.ValidationName, 
            formulaText.length(),
            formulaText
        ));
    }
}

// Sort by formula length in descending order
complexRules.sort((a, b) -> b.formulaLength - a.formulaLength);

System.debug('COMPLEX_VALIDATION_RULES_START');
for (Integer i = 0; i < Math.min(10, complexRules.size()); i++) {
    ValidationRuleDetail detail = complexRules[i];
    System.debug('Object: ' + detail.objectName + 
                 ', Rule: ' + detail.ruleName + 
                 ', Length: ' + detail.formulaLength + 
                 ', Formula: ' + detail.formulaText);
}
System.debug('COMPLEX_VALIDATION_RULES_END');

// Inner class to hold validation rule details
public class ValidationRuleDetail {
    public String objectName;
    public String ruleName;
    public Integer formulaLength;
    public String formulaText;
    
    public ValidationRuleDetail(String obj, String name, Integer len, String formula) {
        objectName = obj;
        ruleName = name;
        formulaLength = len;
        formulaText = formula;
    }
}