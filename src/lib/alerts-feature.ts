import { ARQUIVO_ELEICOES_2026 } from "@/lib/arquivo"

// No modo arquivo os alertas acabaram com a eleição: nem inscrição nem envio,
// qualquer que seja a flag do ambiente.
export function isAlertsEmailFeatureEnabled(
  env: Readonly<Record<string, string | undefined>> = process.env,
  arquivoAtivo: boolean = ARQUIVO_ELEICOES_2026.ativo,
): boolean {
  return !arquivoAtivo && env.NEXT_PUBLIC_ALERTS_EMAIL_ENABLED === "true"
}
