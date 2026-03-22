#!/usr/bin/env bun
/**
 * Simplified scheduler — thin wrapper that triggers orchestrator productions.
 *
 * Usage:
 *   bun run scripts/scheduler.ts --slot flagship
 *   bun run scripts/scheduler.ts --slot all-claude
 *   bun run scripts/scheduler.ts --all
 */

import { runProduction, PRODUCTIONS } from "./orchestrator.ts";

const args = process.argv.slice(2);

if (args.includes("--all")) {
  for (const [name, config] of Object.entries(PRODUCTIONS)) {
    console.log(`\n=== Starting ${name} production ===`);
    await runProduction(config);
    console.log(`=== ${name} complete ===\n`);
  }
} else {
  const slotIdx = args.indexOf("--slot");
  const slotName = slotIdx >= 0 ? args[slotIdx + 1] : "flagship";
  const config = PRODUCTIONS[slotName];
  if (!config) {
    console.error(`Unknown slot: ${slotName}. Available: ${Object.keys(PRODUCTIONS).join(", ")}`);
    process.exit(1);
  }
  console.log(`\n=== Starting ${slotName} production ===`);
  await runProduction(config);
  console.log(`=== ${slotName} complete ===\n`);
}
