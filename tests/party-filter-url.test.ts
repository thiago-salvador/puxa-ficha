import assert from "node:assert/strict"
import test from "node:test"

import {
  readPartyFilterFromSearchParams,
  writePartyFilterToSearchParams,
} from "@/lib/party-filter-url"

test("lê a sigla canônica e ignora partido inválido ou incerto", () => {
  assert.equal(readPartyFilterFromSearchParams("?partido=PODEMOS"), "PODE")
  assert.equal(readPartyFilterFromSearchParams("?partido=nao-existe"), "")
  assert.equal(readPartyFilterFromSearchParams("?partido=incerto"), "")
  assert.equal(readPartyFilterFromSearchParams("?partido=sem%20partido"), "")
})

test("escreve ou remove partido sem perder outros parâmetros", () => {
  assert.equal(
    writePartyFilterToSearchParams("q=13%20SP&tab=votos", "PODEMOS"),
    "q=13+SP&tab=votos&partido=PODE",
  )
  assert.equal(
    writePartyFilterToSearchParams("q=13+SP&partido=PT&view=list", ""),
    "q=13+SP&view=list",
  )
  assert.equal(
    writePartyFilterToSearchParams("partido=PT&view=list", "nao-existe"),
    "view=list",
  )
})
