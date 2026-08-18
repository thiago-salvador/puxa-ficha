import assert from "node:assert/strict"
import { describe, it } from "node:test"

import type { GlobalSearchIndexItem } from "@/lib/global-search"
import { normalizeForSearch } from "@/lib/global-search"
import {
  GLOBAL_SEARCH_MAX_RECENT_CANDIDATES,
  GLOBAL_SEARCH_MAX_RECENT_QUERIES,
  GLOBAL_SEARCH_STORAGE_CANDIDATES,
  GLOBAL_SEARCH_STORAGE_QUERIES,
  exploreCandidatesExcludingHrefs,
  hydrateRecentCandidatesFromIndex,
  normalizeRecentCandidates,
  readRecentCandidates,
  readRecentQueries,
  recordRecentCandidateVisit,
  recordRecentSearchQuery,
  writeRecentCandidates,
  type GlobalSearchRecentCandidateStored,
} from "@/lib/global-search-recents"

function mockStorage(): Storage {
  const store: Record<string, string> = {}
  return {
    getItem: (k) => store[k] ?? null,
    setItem: (k, v) => {
      store[k] = v
    },
    removeItem: (k) => {
      delete store[k]
    },
    clear: () => {
      for (const k of Object.keys(store)) delete store[k]
    },
    get length() {
      return Object.keys(store).length
    },
    key: (i) => Object.keys(store)[i] ?? null,
  }
}

describe("normalizeRecentCandidates", () => {
  it("dedupes by href keeping most recent ts", () => {
    const entries: GlobalSearchRecentCandidateStored[] = [
      { href: "/candidato/a", title: "A", subtitle: "x", ts: 1 },
      { href: "/candidato/a", title: "A2", subtitle: "y", ts: 99 },
      { href: "/candidato/b", title: "B", subtitle: "z", ts: 50 },
    ]
    const out = normalizeRecentCandidates(entries, 10)
    assert.equal(out.length, 2)
    assert.equal(out[0].href, "/candidato/a")
    assert.equal(out[0].ts, 99)
    assert.equal(out[1].href, "/candidato/b")
  })

  it("respects max length", () => {
    const entries: GlobalSearchRecentCandidateStored[] = Array.from({ length: 20 }, (_, i) => ({
      href: `/candidato/x${i}`,
      title: `T${i}`,
      subtitle: "",
      ts: i,
    })).reverse()
    const out = normalizeRecentCandidates(entries, GLOBAL_SEARCH_MAX_RECENT_CANDIDATES)
    assert.equal(out.length, GLOBAL_SEARCH_MAX_RECENT_CANDIDATES)
  })
})

describe("hydrateRecentCandidatesFromIndex", () => {
  it("drops entries missing from index", () => {
    const stored: GlobalSearchRecentCandidateStored[] = [
      { href: "/candidato/gone", title: "G", subtitle: "", ts: 10 },
    ]
    const live: GlobalSearchIndexItem = {
      href: "/candidato/live",
      title: "Live",
      subtitle: "PX",
      searchText: normalizeForSearch("Live PX"),
    }
    const m = new Map<string, GlobalSearchIndexItem>([[live.href, live]])
    const out = hydrateRecentCandidatesFromIndex(stored, m)
    assert.equal(out.length, 0)
  })

  it("returns live rows in recency order", () => {
    const stored: GlobalSearchRecentCandidateStored[] = [
      { href: "/candidato/b", title: "B", subtitle: "", ts: 2 },
      { href: "/candidato/a", title: "A", subtitle: "", ts: 9 },
    ]
    const a: GlobalSearchIndexItem = {
      href: "/candidato/a",
      title: "A",
      subtitle: "",
      searchText: normalizeForSearch("A"),
    }
    const b: GlobalSearchIndexItem = {
      href: "/candidato/b",
      title: "B",
      subtitle: "",
      searchText: normalizeForSearch("B"),
    }
    const m = new Map([
      [a.href, a],
      [b.href, b],
    ])
    const out = hydrateRecentCandidatesFromIndex(stored, m)
    assert.deepEqual(
      out.map((x) => x.href),
      ["/candidato/a", "/candidato/b"]
    )
  })
})

describe("exploreCandidatesExcludingHrefs", () => {
  it("excludes hrefs and slices", () => {
    const items: GlobalSearchIndexItem[] = [
      { href: "/candidato/1", title: "1", subtitle: "", searchText: "1" },
      { href: "/candidato/2", title: "2", subtitle: "", searchText: "2" },
      { href: "/candidato/3", title: "3", subtitle: "", searchText: "3" },
    ]
    const out = exploreCandidatesExcludingHrefs(items, new Set(["/candidato/2"]), 2)
    assert.deepEqual(
      out.map((x) => x.href),
      ["/candidato/1", "/candidato/3"]
    )
  })
})

describe("recordRecentCandidateVisit (storage)", () => {
  it("prepends newest visit first", () => {
    const s = mockStorage()
    recordRecentCandidateVisit(
      { href: "/candidato/x", title: "X", subtitle: "PX" },
      s
    )
    let list = readRecentCandidates(s)
    assert.equal(list.length, 1)
    recordRecentCandidateVisit({ href: "/candidato/y", title: "Y", subtitle: "PY" }, s)
    list = readRecentCandidates(s)
    assert.equal(list[0].href, "/candidato/y")
  })

  it("ignores non-candidato hrefs", () => {
    const s = mockStorage()
    recordRecentCandidateVisit({ href: "/sobre", title: "S", subtitle: "" }, s)
    assert.equal(readRecentCandidates(s).length, 0)
  })
})

describe("recordRecentSearchQuery (storage)", () => {
  it("dedupes normalized and caps", () => {
    const s = mockStorage()
    recordRecentSearchQuery("economia", s)
    recordRecentSearchQuery("Economia", s)
    const q = readRecentQueries(s)
    assert.equal(q.length, 1)
    assert.equal(q[0], "Economia")
    for (let i = 0; i < GLOBAL_SEARCH_MAX_RECENT_QUERIES + 3; i++) {
      recordRecentSearchQuery(`termo${i}`, s)
    }
    assert.equal(readRecentQueries(s).length, GLOBAL_SEARCH_MAX_RECENT_QUERIES)
  })

  it("skips very short queries", () => {
    const s = mockStorage()
    recordRecentSearchQuery("a", s)
    assert.equal(readRecentQueries(s).length, 0)
  })
})

describe("readRecentCandidates parsing", () => {
  it("returns empty on invalid json", () => {
    const s = mockStorage()
    s.setItem(GLOBAL_SEARCH_STORAGE_CANDIDATES, "not-json")
    assert.equal(readRecentCandidates(s).length, 0)
  })
})

describe("readRecentQueries parsing", () => {
  it("returns empty on invalid json", () => {
    const s = mockStorage()
    s.setItem(GLOBAL_SEARCH_STORAGE_QUERIES, "{}")
    assert.equal(readRecentQueries(s).length, 0)
  })
})

describe("writeRecentCandidates roundtrip", () => {
  it("persists array", () => {
    const s = mockStorage()
    const entries: GlobalSearchRecentCandidateStored[] = [
      { href: "/candidato/z", title: "Z", subtitle: "PZ", ts: 42 },
    ]
    writeRecentCandidates(entries, s)
    const back = readRecentCandidates(s)
    assert.equal(back.length, 1)
    assert.equal(back[0].href, "/candidato/z")
  })
})
