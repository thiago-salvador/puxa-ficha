import { readFileSync } from "node:fs"
import assert from "node:assert/strict"
import { describe, it } from "node:test"

// cspell:ignore labelledby

import {
  CANDIDATO_PROFILE_NAV_TAB_IDS,
  CANDIDATO_PROFILE_TAB_IDS,
  normalizeCandidatoProfileNavTab,
  normalizeCandidatoProfileTab,
} from "../src/lib/candidato-profile-tabs"

describe("candidato profile tab navigation", () => {
  it("keeps timeline routable but hidden from the profile tab navigation", () => {
    assert.ok((CANDIDATO_PROFILE_TAB_IDS as readonly string[]).includes("timeline"))
    assert.equal(normalizeCandidatoProfileTab("timeline"), "timeline")

    assert.equal((CANDIDATO_PROFILE_NAV_TAB_IDS as readonly string[]).includes("timeline"), false)
    assert.equal(normalizeCandidatoProfileNavTab("timeline"), undefined)
  })

  it("keeps supported visible tabs navigable", () => {
    assert.deepEqual([...CANDIDATO_PROFILE_NAV_TAB_IDS], [
      "geral",
      "pesquisas",
      "programa",
      "media",
      "dinheiro",
      "justica",
      "votos",
      "trajetoria",
      "legislacao",
      "alertas",
    ])
    assert.equal(normalizeCandidatoProfileNavTab("legislacao"), "legislacao")
    assert.equal(normalizeCandidatoProfileNavTab("trajetoria"), "trajetoria")
    assert.equal(normalizeCandidatoProfileNavTab("media"), "media")
    assert.equal(normalizeCandidatoProfileNavTab("pesquisas"), "pesquisas")
    assert.equal(normalizeCandidatoProfileNavTab("programa"), "programa")
  })

  it("uses visible-tab normalization for UI navigation and query params", () => {
    const src = readFileSync("src/components/CandidatoProfile.tsx", "utf-8")

    assert.match(src, /CANDIDATO_PROFILE_NAV_TAB_IDS\s*\.filter[\s\S]*\.map/)
    assert.match(src, /normalizeCandidatoProfileNavTab\(tabParam\)/)
    assert.match(src, /normalizeCandidatoProfileNavTab\(tabId\)/)
    assert.match(src, /pushProfileTabUrl\(next\)/)
    assert.match(src, /url\.searchParams\.set\("tab", tabId\)/)
    assert.match(src, /window\.addEventListener\("popstate", onStoreChange\)/)
    assert.match(src, /window\.history\.pushState/)
    assert.doesNotMatch(src, /id:\s*["']timeline["'],\s*label:\s*["']Linha do tempo["']/)
    assert.match(src, /id !== "pesquisas" \|\| pesquisasEnabled/)
    assert.match(src, /id !== "programa" \|\| programaEnabled/)
    assert.match(src, /requestedTab === "timeline" \|\| tabDefs\.some/)
  })

  it("renders semantic tablist/tab/tabpanel wiring", () => {
    const tabsSrc = readFileSync("src/components/ProfileTabs.tsx", "utf-8")
    const profileSrc = readFileSync("src/components/CandidatoProfile.tsx", "utf-8")

    assert.match(tabsSrc, /role="tablist"/)
    assert.match(tabsSrc, /role="tab"/)
    assert.match(tabsSrc, /aria-selected=\{isActive\}/)
    assert.match(tabsSrc, /aria-controls=\{`profile-panel-\$\{tab\.id\}`\}/)
    assert.match(profileSrc, /role="tabpanel"/)
    assert.match(profileSrc, /aria-labelledby=\{\(CANDIDATO_PROFILE_NAV_TAB_IDS as readonly string\[\]\)\.includes\(activeTab\)/)
  })

  it("does not render the profile freshness box in Visão Geral", () => {
    const profileSrc = readFileSync("src/components/CandidatoProfile.tsx", "utf-8")

    assert.doesNotMatch(profileSrc, /sectionFreshness\.perfil_atual/)
    assert.match(profileSrc, /DataFreshnessNotice info=\{sectionFreshness\.votos_candidato\}/)
  })
})
