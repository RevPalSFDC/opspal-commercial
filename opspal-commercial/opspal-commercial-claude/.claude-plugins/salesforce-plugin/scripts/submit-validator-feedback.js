#!/usr/bin/env node

/**
 * Interactive Validator Feedback Submission
 *
 * Provides an easy interface for users to submit feedback on validator accuracy.
 *
 * Usage:
 *   node submit-validator-feedback.js <validator-name> [timestamp]
 *   node submit-validator-feedback.js metadata-dependency-analyzer
 *
 * Interactive prompts guide user through feedback submission.
 */

const readline = require('readline');
const ValidatorTelemetry = require('./lib/validator-telemetry');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise(resolve => {
    rl.question(prompt, answer => {
      resolve(answer.trim());
    });
  });
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.error('Usage: node submit-validator-feedback.js <validator-name> [timestamp]');
    console.error('\nAvailable validators:');
    console.error('  - metadata-dependency-analyzer');
    console.error('  - flow-xml-validator');
    console.error('  - csv-parser-safe');
    console.error('  - automation-feasibility-analyzer');
    process.exit(1);
  }

  const validatorName = args[0];
  const timestamp = args[1] || new Date().toISOString();

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  VALIDATOR FEEDBACK SUBMISSION');
  console.log('═══════════════════════════════════════════════════════════\n');
  console.log(`Validator: ${validatorName}`);
  console.log(`Timestamp: ${timestamp}\n`);

  const feedback = {};

  // Question 1: Was validation accurate?
  console.log('1. Was the validation accurate?\n');
  console.log('   1) Yes - The validation was correct');
  console.log('   2) No - False positive (blocked a valid operation)');
  console.log('   3) No - False negative (missed an actual error)');
  console.log('   4) Unsure\n');

  const accuracyChoice = await question('Your choice (1-4): ');

  switch (accuracyChoice) {
    case '1':
      feedback.accurate = true;
      feedback.falsePositive = false;
      feedback.falseNegative = false;
      break;
    case '2':
      feedback.accurate = false;
      feedback.falsePositive = true;
      feedback.falseNegative = false;
      break;
    case '3':
      feedback.accurate = false;
      feedback.falsePositive = false;
      feedback.falseNegative = true;
      break;
    case '4':
      feedback.accurate = null;
      feedback.falsePositive = false;
      feedback.falseNegative = false;
      break;
    default:
      console.log('\n❌ Invalid choice. Exiting.');
      rl.close();
      process.exit(1);
  }

  // Question 2: Did it save time?
  console.log('\n2. Did this validation save you time?\n');
  console.log('   1) Yes');
  console.log('   2) No\n');

  const savedTimeChoice = await question('Your choice (1-2): ');

  if (savedTimeChoice === '1') {
    const minutes = await question('\nHow much time did it save? (minutes): ');
    feedback.timeSaved = parseInt(minutes) || 0;
  } else {
    feedback.timeSaved = 0;
  }

  // Question 3: Satisfaction rating
  console.log('\n3. Overall satisfaction with this validation:\n');
  console.log('   1) ★☆☆☆☆ - Very dissatisfied');
  console.log('   2) ★★☆☆☆ - Dissatisfied');
  console.log('   3) ★★★☆☆ - Neutral');
  console.log('   4) ★★★★☆ - Satisfied');
  console.log('   5) ★★★★★ - Very satisfied\n');

  const satisfiedChoice = await question('Your choice (1-5): ');
  feedback.satisfied = parseInt(satisfiedChoice) || 3;

  // Question 4: Additional comments
  console.log('\n4. Additional comments (optional, press Enter to skip):\n');
  const comments = await question('Comments: ');
  feedback.comments = comments || '';

  // Confirm submission
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  FEEDBACK SUMMARY');
  console.log('═══════════════════════════════════════════════════════════\n');
  console.log(`Accurate: ${feedback.accurate}`);
  console.log(`False Positive: ${feedback.falsePositive}`);
  console.log(`False Negative: ${feedback.falseNegative}`);
  console.log(`Time Saved: ${feedback.timeSaved} minutes`);
  console.log(`Satisfaction: ${'★'.repeat(feedback.satisfied)}${'☆'.repeat(5 - feedback.satisfied)}`);
  if (feedback.comments) {
    console.log(`Comments: ${feedback.comments}`);
  }
  console.log('');

  const confirm = await question('Submit this feedback? (y/n): ');

  if (confirm.toLowerCase() === 'y' || confirm.toLowerCase() === 'yes') {
    const telemetry = new ValidatorTelemetry(validatorName, { verbose: true });
    telemetry.logFeedback(timestamp, feedback);

    console.log('\n✅ Feedback submitted successfully!');
    console.log('\nThank you for helping improve the validation system!\n');
  } else {
    console.log('\n❌ Feedback submission cancelled.\n');
  }

  rl.close();
}

main().catch(error => {
  console.error(`\n❌ Error: ${error.message}\n`);
  rl.close();
  process.exit(1);
});
