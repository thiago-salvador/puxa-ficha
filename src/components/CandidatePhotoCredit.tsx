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
  credit,
  variant = "caption",
}: {
  credit: FotoCredito | null | undefined
  variant?: "caption" | "footer"
}) {
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

  const description = credit.descricao?.trim() || credit.origem.trim()
  if (!description && !sourceUrl) return null

  return (
    <p className={className} data-pf-photo-credit="source">
      Foto: {description || "Fonte da imagem"}.{" "}
      {sourceUrl && (
        <a className="underline underline-offset-2" href={sourceUrl} rel="noopener noreferrer" target="_blank">
          Fonte da foto
        </a>
      )}
    </p>
  )
}
