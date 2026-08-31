import type { BrowserContext } from "playwright"

export function automationBypassHeaders(value: string | undefined): Record<string, string> | undefined {
  const secret = value?.trim()
  if (!secret) return undefined
  return {
    "x-vercel-protection-bypass": secret,
    "x-vercel-set-bypass-cookie": "true",
  }
}

export async function establishAutomationBypass(
  context: BrowserContext,
  baseUrl: string,
  value: string | undefined,
): Promise<void> {
  const headers = automationBypassHeaders(value)
  if (!headers) return

  const target = new URL(baseUrl)
  if (target.protocol !== "https:" || !target.hostname.endsWith(".vercel.app")) {
    throw new Error("bypass de automacao permitido somente em deployment HTTPS da Vercel")
  }
  const origin = target.origin
  const response = await context.request.get(origin, {
    failOnStatusCode: false,
    headers,
    maxRedirects: 0,
  })
  try {
    if (response.status() !== 200 && response.status() !== 307) {
      throw new Error(`bypass de automacao respondeu HTTP ${response.status()}`)
    }
    if (response.status() === 307) {
      const cookies = await context.cookies(origin)
      if (!cookies.some((cookie) => cookie.name === "_vercel_jwt")) {
        throw new Error("bypass de automacao nao criou o cookie Vercel")
      }
    }
  } finally {
    await response.dispose()
  }
}
