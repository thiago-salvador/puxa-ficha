import assert from "node:assert/strict"
import { Socket } from "node:net"
import { resolve } from "node:path"
import test from "node:test"
import { fetchInternalImage } from "next/dist/server/image-optimizer.js"
import { serveStatic } from "next/dist/server/serve-static.js"

test("otimizador termina a leitura de imagem local quando o cliente já desconectou", { timeout: 2_000 }, async () => {
  const socket = new Socket()
  socket.destroy()
  const image = await fetchInternalImage(
    "/images/hero-dossie.webp",
    { method: "GET", socket },
    {},
    1_000_000,
    (request, response) => serveStatic(request, response, resolve("public/images/hero-dossie.webp")),
  )

  assert.equal(image.contentType, "image/webp")
  assert.ok(image.buffer.length > 0)
})
