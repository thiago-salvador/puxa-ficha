import assert from 'node:assert/strict';
import test from 'node:test';
import { CoordinatorError, evaluateSnapshot } from '../../scripts/merge-queue/engine.mjs';
import { config, pr } from './helpers.mjs';

test('one PR acquires the only slot', () => {
  const result = evaluateSnapshot(config, { prs: [pr(43)], main: { sha: 'main-a' } });
  assert.equal(result.decision, 'MERGE');
  assert.equal(result.owner, 43);
  assert.deepEqual(result.queue, [{ number: 43, disposition: 'MERGE' }]);
});

test('two PRs are ordered by createdAt then number', () => {
  const newerSmallNumber = pr(2, { createdAt: '2026-08-20T12:00:00Z' });
  const olderLargeNumber = pr(99, { createdAt: '2026-08-20T11:00:00Z' });
  const result = evaluateSnapshot(config, { prs: [newerSmallNumber, olderLargeNumber], main: { sha: 'main-a' } });
  assert.equal(result.owner, 99);
  assert.deepEqual(result.queue.map((item) => item.disposition), ['MERGE', 'WAIT']);
});

test('ten green PRs still select exactly the FIFO head', () => {
  const prs = Array.from({ length: 10 }, (_, index) => pr(43 + index, {
    createdAt: `2026-08-20T10:${String(index).padStart(2, '0')}:00Z`,
  })).toReversed();
  const result = evaluateSnapshot(config, { prs, main: { sha: 'main-a' } });
  assert.equal(result.owner, 43);
  assert.equal(result.queue.filter((item) => item.disposition === 'MERGE').length, 1);
  assert.equal(result.queue.filter((item) => item.disposition === 'WAIT').length, 9);
});

test('existing active lock wins over check completion order', () => {
  const locked = pr(44, { labels: ['active', 'blocked'], checks: [{ name: 'verify', sha: 'head-44', conclusion: 'failure' }] });
  const result = evaluateSnapshot(config, { prs: [pr(43), locked, pr(45)], main: { sha: 'main-a' } });
  assert.equal(result.owner, 44);
  assert.equal(result.decision, 'BLOCK');
  assert.equal(result.queue.find((item) => item.number === 43).disposition, 'WAIT');
});

test('two active locks fail closed as coordinator error', () => {
  assert.throws(
    () => evaluateSnapshot(config, { prs: [pr(43, { labels: ['active'] }), pr(44, { labels: ['active'] })] }),
    (error) => error instanceof CoordinatorError && /More than one/.test(error.message),
  );
});

test('contradictory phase labels fail closed', () => {
  assert.throws(
    () => evaluateSnapshot(config, { prs: [pr(43, { labels: ['active', 'pre-merge', 'post-merge'] })] }),
    (error) => error instanceof CoordinatorError && /contradictory/.test(error.message),
  );
});
