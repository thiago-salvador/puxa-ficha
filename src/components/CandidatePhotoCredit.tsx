import { FOTO_CREDITO_ORIGEM_TEXTO, normalizeFotoCredito } from "@/lib/foto-credito"
import type { FotoCredito } from "@/lib/types"

function safeHttpUrl(value: string | null | undefined): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null
  } catch {
    return null
  }
}

export function CandidatePhotoCredit({
  credit: creditInput,
  variant = "caption",
}: {
  /** Aceita o jsonb bruto: string escalar ou objeto parcial não derrubam a ficha. */
  credit: FotoCredito | string | null | undefined
  variant?: "caption" | "footer"
}) {
  const credit = normalizeFotoCredito(creditInput)
  if (!credit) return null

  const className =
    variant === "caption"
      ? "mt-2 max-w-[96px] text-xs leading-snug text-muted-foreground sm:max-w-[270px] lg:max-w-[315px]"
      : "mt-2 max-w-3xl text-[length:var(--text-eyebrow)] leading-relaxed text-muted-foreground"

  if (credit.origem === "tse") {
    return (
      <p className={className} data-pf-photo-credit="tse">
        Foto: Divulgação/TSE.
      </p>
    )
  }

  const sourceUrl = safeHttpUrl(credit.fonte_url)

  if (credit.origem === "wikimedia_commons" && credit.autor && credit.licenca) {
    const licenseUrl = safeHttpUrl(credit.licenca_url)

    return (
      <p className={className} data-pf-photo-credit="wikimedia_commons">
        Foto: {credit.autor},{" "}
        {sourceUrl ? (
          <a className="underline underline-offset-2" href={sourceUrl} rel="noopener noreferrer" target="_blank">
            Wikimedia Commons
          </a>
        ) : (
          "Wikimedia Commons"
        )}
        ,{" "}
        {licenseUrl ? (
          <a className="underline underline-offset-2" href={licenseUrl} rel="noopener noreferrer" target="_blank">
            {credit.licenca}
          </a>
        ) : (
          credit.licenca
        )}
        .
      </p>
    )
  }

  const description =
    credit.descricao || (credit.origem === FOTO_CREDITO_ORIGEM_TEXTO ? null : credit.origem)
  if (!description && !sourceUrl) return null
  const label = description ?? "Fonte da imagem"
  // Crédito em texto livre costuma já começar com "Foto ..."; evita "Foto: Foto".
  const text = /^foto\b/i.test(label) ? label.replace(/[.\s]+$/, "") : `Foto: ${label.replace(/[.\s]+$/, "")}`

  return (
    <p className={className} data-pf-photo-credit="source">
      {text}.{" "}
      {sourceUrl && (
        <a className="underline underline-offset-2" href={sourceUrl} rel="noopener noreferrer" target="_blank">
          Fonte da foto
        </a>
      )}
    </p>
  )
}
