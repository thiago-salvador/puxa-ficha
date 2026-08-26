import { mkdir, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..")
const output = resolve(root, "tests/fixtures/programas-governo")

function literal(value) {
  return Buffer.from(value, "latin1").toString("binary").replace(/([\\()])/g, "\\$1")
}

function textStream(lines) {
  return `BT\n/F1 13 Tf\n72 760 Td\n${lines.map((line, index) => `${index ? "0 -24 Td\n" : ""}(${literal(line)}) Tj`).join("\n")}\nET`
}

function buildPdf(pageStreams) {
  const pageObjectIds = pageStreams.map((_, index) => 3 + index * 2)
  const fontObjectId = 3 + pageStreams.length * 2
  const objects = new Map()
  objects.set(1, "<< /Type /Catalog /Pages 2 0 R >>")
  objects.set(2, `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageStreams.length} >>`)
  pageStreams.forEach((stream, index) => {
    const pageId = pageObjectIds[index]
    const contentId = pageId + 1
    objects.set(pageId, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontObjectId} 0 R >> >> /Contents ${contentId} 0 R >>`)
    objects.set(contentId, `<< /Length ${Buffer.byteLength(stream, "binary")} >>\nstream\n${stream}\nendstream`)
  })
  objects.set(fontObjectId, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>")

  let pdf = "%PDF-1.4\n%âãÏÓ\n"
  const offsets = [0]
  for (let id = 1; id <= fontObjectId; id += 1) {
    offsets[id] = Buffer.byteLength(pdf, "binary")
    pdf += `${id} 0 obj\n${objects.get(id)}\nendobj\n`
  }
  const xref = Buffer.byteLength(pdf, "binary")
  pdf += `xref\n0 ${fontObjectId + 1}\n0000000000 65535 f \n`
  for (let id = 1; id <= fontObjectId; id += 1) pdf += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`
  pdf += `trailer\n<< /Size ${fontObjectId + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(pdf, "binary")
}

await mkdir(output, { recursive: true })
await writeFile(resolve(output, "textual.pdf"), buildPdf([
  textStream(["Eixo 1 - Educação", "Primeiro parágrafo do programa.", "\x95 Item preservado na extração."]),
  textStream(["Eixo 2 - Saúde", "Segundo parágrafo do programa.", "Atenção básica e prevenção."]),
]))
await writeFile(resolve(output, "scan-sem-texto.pdf"), buildPdf(["0.5 w\n72 72 468 648 re\nS"]))
