import { readFileSync } from "node:fs"
import assert from "node:assert/strict"
import { describe, it } from "node:test"

describe("ui tabs contract", () => {
  it("styles horizontal tabs from the Base UI orientation state", () => {
    const content = readFileSync("src/components/ui/tabs.tsx", "utf-8")

    assert.match(content, /orientation=\{orientation\}/, "must pass orientation to Base UI Tabs.Root")
    assert.match(content, /data-\[orientation=horizontal\]:flex-col/, "horizontal tabs root must stack list above panels")
    assert.match(content, /group-data-\[orientation=horizontal\]\/tabs:h-8/, "tabs list must read horizontal orientation")
    assert.match(content, /group-data-\[orientation=vertical\]\/tabs:flex-col/, "vertical list layout must read vertical orientation")
    assert.doesNotMatch(content, /data-horizontal:flex-col/, "must not rely on non-emitted data-horizontal root state")
    assert.doesNotMatch(content, /group-data-horizontal\/tabs/, "must not rely on non-emitted group data-horizontal state")
  })
})
