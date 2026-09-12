import assert from "node:assert/strict"
import { test } from "node:test"
import { conteudoSerializadoClickPb } from "../scripts/lib/falas-conteudo-serializado"

const url = "https://www.clickpb.com.br/eleicoes/ana.html"
const body = "<p>Saúde e educação.</p>"
const text = `a:T${Buffer.byteLength(body).toString(16)},${body}`
const row = `b:${JSON.stringify({ Article: { uri: "/eleicoes/ana.html", title: "Ana", datePublished: "2026-09-08T12:00:00-03:00", content: "$a" } })}\n`
const wrap = (stream: string) => `<script>self.__next_f.push(${JSON.stringify([1, stream])})</script>`

test("ignora hints HL anônimos e rotulados sem consumir os IDs", () => {
  const stream = `:HL["style"]\n:HD["font"]\n2:HC["script"]\n2:HL["style"]\n${text}${row}`
  assert.equal(conteudoSerializadoClickPb(wrap(stream), url)?.body, body)
})

test("rejeita hint truncado sem newline", () => {
  assert.equal(conteudoSerializadoClickPb(wrap(":HD[\"font\"]"), url), null)
})

test("mantém falha fechada para IDs reais duplicados", () => {
  const duplicate = `${text}${row}${row}`
  assert.equal(conteudoSerializadoClickPb(wrap(duplicate), url), null)
})
