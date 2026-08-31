import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const navbar = readFileSync("src/components/Navbar.tsx", "utf8")

test("Navbar troca fundo e cores de contraste atomicamente", () => {
  assert.doesNotMatch(navbar, /transition-all duration-300/)
  assert.doesNotMatch(navbar, /transition-colors duration-300/)
  assert.match(navbar, /const useDarkText = scrolled \|\| isMenuOpen/)
})
