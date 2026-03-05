SELECT 
  id,
  org_alias,
  created_at,
  data,
  roi_annual_value,
  reflection_status
FROM reflections
WHERE reflection_status = 'new'
ORDER BY created_at DESC;
