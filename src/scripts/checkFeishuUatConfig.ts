import { runFeishuConfigCheck } from '../uat/feishuConfigCheck.js';

const result = await runFeishuConfigCheck();
for (const step of result.steps) console.log(`${step.name}: ${step.status}${step.failureCode ? ` (${step.failureCode})` : ''}`);
console.log(`mode: ${result.mode}`);
if (!result.ok) process.exitCode = 1;
