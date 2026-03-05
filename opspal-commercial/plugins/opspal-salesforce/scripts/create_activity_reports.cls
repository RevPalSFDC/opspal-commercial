public class ActivityReportCreator {
    public static void createSalesActivityReports() {
        // Sales Activity Distribution Report
        Report__c salesActivityDistribution = new Report__c(
            Name = 'Sales Activity Distribution',
            Description = 'Task and Event types by Sales Rep',
            DeveloperName = 'Sales_Activity_Distribution_' + System.now().getTime(),
            FolderName = '00lUw000004h47hIAA',
            ReportExtendedMetadata__c = JSON.serialize(new Map<String, Object>{
                'detailColumns' => new List<String>{'TASK_TYPE', 'TASK_SUBJECT', 'ASSIGNED_USER_NAME'},
                'groupingsDown' => new List<Map<String, Object>>{
                    new Map<String, Object>{
                        'name' => 'ASSIGNED_USER_NAME',
                        'sortOrder' => 'Ascending'
                    }
                },
                'chartType' => 'Bar'
            }),
            ReportType__c = 'Opportunities_with_Tasks_and_Events',
            ReportFilters__c = JSON.serialize(new List<Map<String, String>>{
                new Map<String, String>{
                    'column' => 'TASK_CREATED_DATE',
                    'operator' => 'lessThan',
                    'value' => 'LAST_N_DAYS:90'
                }
            })
        );
        
        // Daily Sales Activity Volume Report
        Report__c dailySalesActivityVolume = new Report__c(
            Name = 'Daily Sales Activity Volume',
            Description = 'Daily activity volume by sales rep',
            DeveloperName = 'Daily_Sales_Activity_Volume_' + System.now().getTime(),
            FolderName = '00lUw000004h47hIAA',
            ReportExtendedMetadata__c = JSON.serialize(new Map<String, Object>{
                'detailColumns' => new List<String>{'TASK_CREATED_DATE', 'ASSIGNED_USER_NAME', 'TASK_TYPE'},
                'groupingsDown' => new List<Map<String, Object>>{
                    new Map<String, Object>{
                        'name' => 'TASK_CREATED_DATE',
                        'sortOrder' => 'Descending'
                    },
                    new Map<String, Object>{
                        'name' => 'ASSIGNED_USER_NAME',
                        'sortOrder' => 'Ascending'
                    }
                },
                'chartType' => 'Line'
            }),
            ReportType__c = 'Opportunities_with_Tasks_and_Events',
            ReportFilters__c = JSON.serialize(new List<Map<String, String>>{
                new Map<String, String>{
                    'column' => 'TASK_CREATED_DATE',
                    'operator' => 'lessThan',
                    'value' => 'LAST_N_DAYS:90'
                }
            })
        );
        
        List<Report__c> reportsToInsert = new List<Report__c>{
            salesActivityDistribution,
            dailySalesActivityVolume
        };
        
        insert reportsToInsert;
    }
}