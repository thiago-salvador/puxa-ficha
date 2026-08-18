"use client"

import { useSearchParams } from "next/navigation"
import { NoticePanel } from "@/components/NoticePanel"

/**
 * Aviso mostrado quando alguém chega na landing do quiz por um link curto de
 * resultado que não existe mais. A rota /quiz/r/[token] redireciona para
 * /quiz?erro=link-expirado em vez de devolver um 404 de texto cru.
 *
 * A leitura do parâmetro é feita no cliente, dentro de um Suspense, para a
 * página do quiz continuar sendo renderizada estaticamente.
 */
export function QuizLinkExpiradoAviso() {
  const searchParams = useSearchParams()

  if (searchParams.get("erro") !== "link-expirado") return null

  return (
    <div className="mx-auto max-w-7xl px-5 pt-8 md:px-12">
      <NoticePanel
        role="status"
        tone="caution"
        eyebrow="Link de resultado indisponível"
        description="Esse link de resultado expirou ou não existe. Faça o quiz de novo para gerar um novo link."
      />
    </div>
  )
}
