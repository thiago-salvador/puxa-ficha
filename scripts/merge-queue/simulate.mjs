#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { evaluateSnapshot } from './engine.mjs';

export function simulate(input) {
  return evaluateSnapshot(input.config ?? {}, input.snapshot ?? input);
}

async function main() {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const path = args.find((arg) => arg !== '--json');
  if (!path) throw new Error('Usage: node scripts/merge-queue/simulate.mjs [--json] <fixture.json>');
  const input = JSON.parse(await readFile(path, 'utf8'));
  const result = { ...simulate(input), remoteWrites: 0, simulation: 'PASS' };
  if (json) process.stdout.write(`${JSON.stringify(result)}\n`);
  else process.stdout.write(`SIMULATION PASS decision=${result.decision} owner=${result.owner ?? 'none'} remoteWrites=0\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    await main();
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ ok: false, error: 'SIMULATION_ERROR', message: error.message })}\n`);
    process.exitCode = 1;
  }
}
