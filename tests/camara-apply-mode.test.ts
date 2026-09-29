import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { deveAtivarDryRunDoColetor } from "../scripts/lib/dry-run"

describe("modo de escrita dos coletores Câmara", () => {
  it("é dry-run por padrão e só libera apply explícito", () => {
    assert.equal(deveAtivarDryRunDoColetor({}, []), true)
    assert.equal(deveAtivarDryRunDoColetor({ apply: true }, []), false)
    assert.equal(deveAtivarDryRunDoColetor({}, ["--apply"]), false)
  })

  it("dry-run prevalece quando apply também está presente", () => {
    assert.equal(deveAtivarDryRunDoColetor({ apply: true, dryRun: true }, ["--apply"]), true)
    assert.equal(deveAtivarDryRunDoColetor({}, ["--apply", "--dry-run"]), true)
  })
})
