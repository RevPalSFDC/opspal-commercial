BEGIN {
    FS=","
    OFS=","
    print "Id,Clean_Status__c,Sync_Status__c"
}
NR > 1 {
    # Calculate score
    score = 0
    if ($2 != "") score += 30  # Email
    if ($3 != "" || $4 != "") score += 30  # Phone or Mobile
    if ($5 != "") score += 20  # AccountId
    if ($6 != "" && $6 != "Unknown") score += 20  # Name

    # Set Clean_Status
    if (score >= 70) clean = "OK"
    else if (score >= 40) clean = "Review"
    else clean = "Delete"

    # Set Sync_Status
    if ($7 != "") sync = "Synced"
    else sync = "Not Synced"

    # Output
    print $1, clean, sync
}
