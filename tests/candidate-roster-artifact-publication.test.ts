import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { publishArtifactsAtomically } from "../scripts/audit/collect-divulgacand-current";

test("publica os dois artefatos na mesma transação local", () => {
  const directory = mkdtempSync(join(tmpdir(), "pf-roster-artifacts-"));
  try {
    const roster = join(directory, "roster.json");
    const crosswalk = join(directory, "crosswalk.json");
    writeFileSync(roster, "roster-antigo");
    writeFileSync(crosswalk, "crosswalk-antigo");

    publishArtifactsAtomically([
      { path: roster, content: "roster-novo" },
      { path: crosswalk, content: "crosswalk-novo" },
    ]);

    assert.equal(readFileSync(roster, "utf8"), "roster-novo");
    assert.equal(readFileSync(crosswalk, "utf8"), "crosswalk-novo");
    assert.deepEqual(readdirSync(directory).sort(), [
      "crosswalk.json",
      "roster.json",
    ]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("falha ao preparar o segundo artefato preserva a geração anterior", () => {
  const directory = mkdtempSync(join(tmpdir(), "pf-roster-artifacts-"));
  try {
    const roster = join(directory, "roster.json");
    const crosswalk = join(directory, "crosswalk.json");
    const blockedParent = join(directory, "not-a-directory");
    writeFileSync(roster, "roster-antigo");
    writeFileSync(crosswalk, "crosswalk-antigo");
    writeFileSync(blockedParent, "arquivo");

    assert.throws(() =>
      publishArtifactsAtomically([
        { path: roster, content: "roster-novo" },
        { path: join(blockedParent, "crosswalk.json"), content: "novo" },
      ]),
    );
    assert.equal(readFileSync(roster, "utf8"), "roster-antigo");
    assert.equal(readFileSync(crosswalk, "utf8"), "crosswalk-antigo");
    assert.equal(
      readdirSync(directory).some((name) => name.endsWith(".tmp")),
      false,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
