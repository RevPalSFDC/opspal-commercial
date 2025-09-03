// Renewal Layout Assignment Script

// List of profiles to assign the layout
List<String> profileIds = new List<String>{
    '00e2A000001CCCHQA4', '00e2A000000fW2aQAE', '00e2A000000fWEbQAM', 
    '00e2A000000fWdCQAU', '00e2A000001CDRPQA4', '00e3j000000c3MAAAY', 
    '00e3j000000c3MFAAY', '00e3j000000fjbrAAA', '00e3j000000fjfAAAQ', 
    '00e3j000000ztHGAAY', '00e3j000001MwVCAA0', '00e3j000001R3sOAAS', 
    '00e3j000001R4TdAAK', '00e3j000001VHvLAAW', '00eF00000015uyYIAQ', 
    '00eF00000015uyeIAA', '00eF00000015uygIAA', '00eF00000015uyfIAA', 
    '00eRh000001REhRIAW', '00e3j000000fjjHAAQ'
};

// Renewal record type ID
Id renewalRecordTypeId = '012TI000002HAxyYAG';

// Configuration of layout assignments
List<Metadata.Metadata> layoutAssignments = new List<Metadata.Metadata>();

for (String profileId : profileIds) {
    Metadata.LayoutAssignment assignment = new Metadata.LayoutAssignment();
    assignment.layout = 'Opportunity_Renewal_Layout';
    assignment.recordType = renewalRecordTypeId;
    assignment.profile = profileId;
    layoutAssignments.add(assignment);
}

// Submit metadata deployment
if (!layoutAssignments.isEmpty()) {
    Metadata.DeployContainer container = new Metadata.DeployContainer();
    for (Metadata.Metadata assignment : layoutAssignments) {
        container.addMetadata(assignment);
    }
    
    Metadata.Operations.enqueueDeployment(container, null);
    System.debug('Renewal Layout assignments queued for deployment');
} else {
    System.debug('No layout assignments to deploy');
}