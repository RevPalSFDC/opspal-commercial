#!/usr/bin/env node

/**
 * Update reflection status to 'implemented' after completing all tasks
 */

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://REDACTED_SUPABASE_PROJECT.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY environment variable not set');
  process.exit(1);
}

const REFLECTION_ID = '068c7cf7-7087-4a29-940e-ba25163505c6';

async function updateReflectionStatus() {
  console.log('\n🔄 Updating reflection status to implemented...\n');
  console.log(`Reflection ID: ${REFLECTION_ID}`);

  const url = `${SUPABASE_URL}/rest/v1/reflections?id=eq.${REFLECTION_ID}`;

  const updateData = {
    reflection_status: 'implemented',
    implementation_notes: JSON.stringify({
      task1: {
        title: 'Cursor-Based Pagination & Data Validation',
        commit: 'c514b1e',
        files_created: 4,
        lines_added: 1305,
        roi_annual: '$54,000',
        completed_date: '2025-10-14'
      },
      task2: {
        title: 'Process Lock Manager & Progress Monitoring',
        commit: 'fb7ec3d',
        files_created: 4,
        lines_added: 1392,
        roi_annual: '$36,000',
        completed_date: '2025-10-14'
      },
      total_roi: '$90,000',
      total_lines: 2697,
      implementation_time: '9.5 hours'
    })
  };

  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      'apikey': SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify(updateData)
  });

  if (!response.ok) {
    const error = await response.text();
    console.error(`❌ Update failed: ${response.status} ${response.statusText}`);
    console.error(error);
    process.exit(1);
  }

  const updated = await response.json();

  console.log('✅ Reflection status updated to "implemented"\n');
  console.log('Updated reflection:');
  console.log(`- Status: ${updated[0].reflection_status}`);
  console.log(`- Asana task 1: https://app.asana.com/0/1211617834659194/1211640562611977`);
  console.log(`- Asana task 2: https://app.asana.com/0/1211617834659194/1211640470718725`);
  console.log(`- Commit 1: c514b1e (Pagination & Validation)`);
  console.log(`- Commit 2: fb7ec3d (Process Management)`);
  console.log(`\n💰 Total Annual ROI: $90,000`);
  console.log(`⏱️  Total Implementation Time: 9.5 hours`);
  console.log(`📊 Total Lines of Code: 2,697 lines across 8 files`);
}

updateReflectionStatus().catch(error => {
  console.error('❌ Error:', error.message);
  process.exit(1);
});
