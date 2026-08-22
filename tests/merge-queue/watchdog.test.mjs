import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const watchdogUrl = new URL('../../.github/workflows/serial-merge-queue-watchdog.yml', import.meta.url);

test('watchdog runs only for failed coordinator workflow runs', async () => {
  const workflow = await readFile(watchdogUrl, 'utf8');
  assert.match(workflow, /workflow_run:[\s\S]*Serial merge queue[\s\S]*types:\s*\n\s*- completed/);
  assert.match(workflow, /if: >-/);
  assert.match(workflow, /vars\.SERIAL_MERGE_QUEUE_ENABLED == 'true'/);
  assert.match(workflow, /&& github\.event\.workflow_run\.conclusion != 'success'/);
  assert.match(workflow, /&& github\.event\.workflow_run\.conclusion != 'skipped'/);
  assert.match(workflow, /permissions:\s*\n\s*issues: write/);
});

test('watchdog treats event fields as data and deduplicates across run ids', async () => {
  const workflow = await readFile(watchdogUrl, 'utf8');
  assert.match(workflow, /WATCHED_RUN_ID: \$\{\{ github\.event\.workflow_run\.id \}\}/);
  assert.match(workflow, /serial-merge-queue-watchdog:coordinator-failure/);
  assert.match(workflow, /contains\(\$marker\)/);
  assert.match(workflow, /if \[\[ -n "\$existing" \]\]; then[\s\S]*--method PATCH/);
  assert.doesNotMatch(workflow, /run:[^\n]*\$\{\{\s*github\.event\.workflow_run/);
});

test('watchdog creates an assigned incident without exposing command output', async () => {
  const workflow = await readFile(watchdogUrl, 'utf8');
  assert.match(workflow, /-f "assignees\[\]=thiago-salvador"/);
  assert.match(workflow, />\/dev\/null/);
  assert.match(workflow, /The queue remains fail-closed/);
});
