/** Campo-isca do subscribe. Arquivo sem Node API para o formulário cliente poder importar. */
export const ALERT_SUBSCRIBE_HONEYPOT_FIELD = "website"

export function isAlertSubscribeHoneypotFilled(body: unknown): boolean {
  const value = (body as Record<string, unknown> | null)?.[ALERT_SUBSCRIBE_HONEYPOT_FIELD]
  return typeof value === "string" && value.trim().length > 0
}
