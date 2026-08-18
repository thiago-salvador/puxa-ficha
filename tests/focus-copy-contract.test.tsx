import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, it } from "node:test"
import { renderToStaticMarkup } from "react-dom/server"
import { PartyCombobox } from "../src/components/PartyCombobox"
import { SortOrderMenu } from "../src/components/SortOrderMenu"

function read(relativePath: string): string {
  return readFileSync(path.resolve(process.cwd(), relativePath), "utf-8")
}

describe("PT-BR navigation copy", () => {
  it("keeps visible navbar and footer labels accented without changing paths", () => {
    const navbar = read("src/components/Navbar.tsx")
    const footer = read("src/components/Footer.tsx")

    assert.match(navbar, /href: \"\/\", label: \"Presidência\"/)
    assert.match(footer, /Páginas/)
    assert.match(footer, /href: \"\/\", label: \"Presidência\"/)
    assert.doesNotMatch(`${navbar}\n${footer}`, /Presidencia|Paginas/)
  })
})

describe("filter focus styles", () => {
  it("renders visible focus classes on PartyCombobox controls and options", () => {
    const html = renderToStaticMarkup(
      <PartyCombobox options={["PT", "PSOL"]} value="PT" onChange={() => undefined} />,
    )

    assert.match(html, /aria-label="Filtrar por partido"/)
    assert.match(html, /focus-visible:ring-2/)
    assert.match(html, /aria-label="Limpar partido"/)
  })

  it("renders visible focus classes on SortOrderMenu trigger and items", () => {
    const html = renderToStaticMarkup(
      <SortOrderMenu value="nome" onChange={() => undefined} />,
    )

    assert.match(html, /aria-label="Ordenar candidatos: A-Z"/)
    assert.match(html, /focus-visible:ring-2/)
  })
})
