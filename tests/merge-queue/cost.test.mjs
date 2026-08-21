import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { performance } from 'node:perf_hooks';
import { simulate } from '../../scripts/merge-queue/simulate.mjs';
import { execFileSync } from 'node:child_process';

test('ten-PR decision stays local, bounded, and single-slot', async () => {
  const fixture = JSON.parse(await readFile(new URL('../fixtures/merge-queue-ten-prs.json', import.meta.url), 'utf8'));
  const started = performance.now();
  const result = simulate(fixture);
  const elapsed = performance.now() - started;
  assert.equal(result.owner, 43);
  assert.equal(result.queue.filter((item) => item.disposition === 'MERGE').length, 1);
  assert.ok(result.mutations.length <= 3);
  assert.ok(elapsed < 1000, `decision took ${elapsed}ms`);
});

test('simulation CLI has stable human and JSON receipts with zero remote writes', () => {
  const fixturePath = new URL('../fixtures/merge-queue-ten-prs.json', import.meta.url).pathname;
  const scriptPath = new URL('../../scripts/merge-queue/simulate.mjs', import.meta.url).pathname;
  const human = execFileSync(process.execPath, [scriptPath, fixturePath], { encoding: 'utf8' });
  assert.match(human, /^SIMULATION PASS /);
  const json = JSON.parse(execFileSync(process.execPath, [scriptPath, fixturePath, '--json'], { encoding: 'utf8' }));
  assert.equal(json.remoteWrites, 0);
  assert.equal(json.simulation, 'PASS');
  assert.equal(json.owner, 43);
});
