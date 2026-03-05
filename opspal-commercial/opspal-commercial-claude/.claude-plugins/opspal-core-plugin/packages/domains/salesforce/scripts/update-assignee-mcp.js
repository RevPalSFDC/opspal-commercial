// This script shows the task GIDs that need assignee updates
const TASK_GIDS = [
  '1211517473355085',
  '1211517323835456', 
  '1211517688229481',
  '1211517683705077',
  '1211517323626939'
];

console.log('Tasks requiring assignee update to team@gorevpal.com:');
TASK_GIDS.forEach((gid, i) => {
  console.log(`${i + 1}. Task GID: ${gid}`);
  console.log(`   URL: https://app.asana.com/0/1210981797907748/${gid}`);
});
