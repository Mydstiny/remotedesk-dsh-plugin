#!/usr/bin/env node
import { doctor } from '../src/doctor.mjs';
const args = process.argv.slice(2);
let runtimeRoot;
let valid = args.shift() === 'doctor';
while (args.length) {
  const arg = args.shift();
  if (arg === '--json') continue;
  if (arg === '--runtime-root' && args.length && !runtimeRoot) { runtimeRoot = args.shift(); continue; }
  valid = false;
}
if (!valid) {
  console.error('Usage: remotedesk-dsh doctor [--json] [--runtime-root <absolute dsh installation>]');
  process.exitCode = 64;
} else {
  const report = await doctor({ runtimeRoot });
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.status === 'ok' ? 0 : 2;
}
