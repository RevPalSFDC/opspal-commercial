public with sharing class RenewalLayoutAssigner {
    public static void assignRenewalLayout() {
        List<Profile> profiles = [
            SELECT Id, Name 
            FROM Profile 
            WHERE Id IN (
                '00e2A000001CCCHQA4', '00e2A000000fW2aQAE', '00e2A000000fWEbQAM', 
                '00e2A000000fWdCQAU', '00e2A000001CDRPQA4', '00e3j000000c3MAAAY', 
                '00e3j000000c3MFAAY', '00e3j000000fjbrAAA', '00e3j000000fjfAAAQ', 
                '00e3j000000ztHGAAY', '00e3j000001MwVCAA0', '00e3j000001R3sOAAS', 
                '00e3j000001R4TdAAK', '00e3j000001VHvLAAW', '00eF00000015uyYIAQ', 
                '00eF00000015uyeIAA', '00eF00000015uygIAA', '00eF00000015uyfIAA', 
                '00eRh000001REhRIAW', '00e3j000000fjjHAAQ'
            )
        ];

        Id renewalRecordTypeId = '012TI000002HAxyYAG';
        String layoutName = 'Opportunity_Renewal_Layout';

        List<Metadata.ProfileLayoutAssignment> layoutAssignments = new List<Metadata.ProfileLayoutAssignment>();

        for (Profile p : profiles) {
            Metadata.ProfileLayoutAssignment pla = new Metadata.ProfileLayoutAssignment();
            pla.layout = layoutName;
            pla.recordType = renewalRecordTypeId;
            pla.profile = p.Id;
            layoutAssignments.add(pla);
        }

        Metadata.DeployContainer container = new Metadata.DeployContainer();
        for (Metadata.ProfileLayoutAssignment pla : layoutAssignments) {
            container.addMetadata(pla);
        }

        Metadata.Operations.enqueueDeployment(container, null);
        System.debug('Layout assignments queued for deployment');
    }
}