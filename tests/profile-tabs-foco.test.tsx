import assert from "node:assert/strict"
import { test } from "node:test"
import { renderToStaticMarkup } from "react-dom/server"

import { ProfileTabs } from "@/components/ProfileTabs"

const tabs = [
  { id: "geral", label: "Visão geral", count: 0 },
  { id: "media", label: "Mídia", count: 3 },
  { id: "checagens", label: "Checagens", count: 2 },
  { id: "dinheiro", label: "Dinheiro", count: 1 },
]

function focaveis(html: string, prefixo: string): string[] {
  const ids: string[] = []
  for (const m of html.matchAll(/<button[^>]*>/g)) {
    const tag = m[0]
    const id = /id="([^"]+)"/.exec(tag)?.[1] ?? ""
    if (id.startsWith(prefixo) && /tabindex="0"/i.test(tag)) ids.push(id)
  }
  return ids
}

test("aba ativa na barra: só ela entra na ordem do Tab", () => {
  const html = renderToStaticMarkup(<ProfileTabs tabs={tabs} activeTab="checagens" onTabChange={() => {}} />)
  assert.deepEqual(focaveis(html, "profile-tab-desktop-"), ["profile-tab-desktop-checagens"])
})

test("aba ativa fora da barra (timeline): a primeira aba fica focável", () => {
  const html = renderToStaticMarkup(<ProfileTabs tabs={tabs} activeTab="timeline" onTabChange={() => {}} />)
  assert.deepEqual(focaveis(html, "profile-tab-desktop-"), ["profile-tab-desktop-geral"])
})
