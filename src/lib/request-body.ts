const PUBLIC_JSON_BODY_LIMIT_BYTES = 16 * 1024

export class RequestBodyTooLargeError extends Error {
  constructor(readonly limitBytes: number) {
    super(`Request body exceeds ${limitBytes} bytes`)
    this.name = "RequestBodyTooLargeError"
  }
}

export function isRequestBodyTooLargeError(error: unknown): error is RequestBodyTooLargeError {
  return error instanceof RequestBodyTooLargeError
}

async function readTextBodyWithLimit(
  request: Request,
  limitBytes = PUBLIC_JSON_BODY_LIMIT_BYTES,
): Promise<string> {
  const contentLength = request.headers.get("content-length")
  if (contentLength) {
    const parsed = Number.parseInt(contentLength, 10)
    if (Number.isFinite(parsed) && parsed > limitBytes) {
      throw new RequestBodyTooLargeError(limitBytes)
    }
  }

  const stream = request.body
  if (!stream) return ""

  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let total = 0

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue

      total += value.byteLength
      if (total > limitBytes) {
        await reader.cancel().catch(() => {})
        throw new RequestBodyTooLargeError(limitBytes)
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }

  const body = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(body)
}

export async function readJsonBodyWithLimit(
  request: Request,
  limitBytes = PUBLIC_JSON_BODY_LIMIT_BYTES,
): Promise<unknown> {
  const text = await readTextBodyWithLimit(request, limitBytes)
  if (!text.trim()) return null
  return JSON.parse(text)
}
