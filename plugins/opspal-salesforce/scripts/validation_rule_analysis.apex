// Validation Rule Distribution
Map<String, Integer> objectRuleCounts = new Map<String, Integer>();

List<ValidationRule> rules = [SELECT Id, ValidationName, 
    EntityDefinition.QualifiedApiName 
    FROM ValidationRule 
    WHERE Active = TRUE];

for (ValidationRule rule : rules) {
    String objectName = rule.EntityDefinition.QualifiedApiName;
    if (!objectRuleCounts.containsKey(objectName)) {
        objectRuleCounts.put(objectName, 0);
    }
    objectRuleCounts.put(objectName, objectRuleCounts.get(objectName) + 1);
}

System.debug('VALIDATION_RULE_DISTRIBUTION_START');
for (String objectName : objectRuleCounts.keySet()) {
    System.debug(objectName + ': ' + objectRuleCounts.get(objectName));
}
System.debug('VALIDATION_RULE_DISTRIBUTION_END');