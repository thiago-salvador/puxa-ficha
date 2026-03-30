import { getCandidatosComparaveis } from "@/lib/api"
import { formatBRL } from "@/lib/utils"
import Link from "next/link"
import type { Metadata } from "next"
import { SlashDivider } from "@/components/SlashDivider"
import { Footer } from "@/components/Footer"

export const metadata: Metadata = {
  title: "Comparador de candidatos — Puxa Ficha",
  description:
    "Compare 2 ou mais candidatos lado a lado: patrimonio, processos, partido, formacao.",
}

export const revalidate = 3600

function formatCompact(value: number): string {
  if (value >= 1_000_000) return `R$ ${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `R$ ${(value / 1_000).toFixed(0)}K`
  return formatBRL(value)
}

export default async function CompararPage() {
  const candidatos = await getCandidatosComparaveis()

  return (
    <div className="min-h-screen bg-white">
      <section className="mx-auto max-w-7xl px-5 pb-6 pt-24 sm:pb-10 sm:pt-28 md:px-12 lg:pt-32">
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-black/40">
          Comparador
        </p>
        <h1
          className="mt-2 font-heading uppercase leading-[0.85] text-black"
          style={{ fontSize: "clamp(36px, 8vw, 80px)" }}
        >
          Lado a lado
        </h1>
        <p className="mt-3 max-w-lg text-[14px] font-medium text-black/50 sm:text-[15px]">
          Compare candidatos. Clique em um nome pra ver a ficha completa.
        </p>
      </section>

      <div className="mx-auto max-w-7xl px-5 md:px-12">
        <SlashDivider />
      </div>

      {/* Mobile: card-based layout */}
      <section className="mx-auto max-w-7xl px-5 py-8 sm:py-12 md:hidden md:px-12">
        <div className="space-y-3">
          {candidatos.map((c) => (
            <Link
              key={c.id}
              href={`/candidato/${c.slug}`}
              className="block rounded-[12px] border border-black/8 px-4 py-3.5 transition-colors hover:border-black/15"
            >
              <div className="flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-black/40">
                      {c.partido_sigla}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate font-heading text-[18px] uppercase leading-tight text-black">
                    {c.nome_urna}
                  </p>
                </div>
                {c.foto_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={c.foto_url}
                    alt=""
                    className="ml-3 size-12 shrink-0 rounded-full object-cover object-top"
                  />
                )}
              </div>
              <div className="mt-2.5 flex flex-wrap gap-3 text-[11px] font-bold text-black/40">
                {c.patrimonio_declarado != null && c.patrimonio_declarado > 0 && (
                  <span>{formatCompact(c.patrimonio_declarado)}</span>
                )}
                <span>{c.total_processos} processos</span>
                {c.idade && <span>{c.idade} anos</span>}
                {c.alertas_graves > 0 && (
                  <span>{c.alertas_graves} alertas</span>
                )}
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Desktop: table layout */}
      <section className="mx-auto hidden max-w-7xl px-5 py-12 md:block md:px-12 lg:py-16">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-black/10">
                {["Candidato", "Partido", "Idade", "Formacao", "Patrimonio", "Processos", "Alertas"].map(
                  (h) => (
                    <th
                      key={h}
                      className="pb-3 text-[11px] font-bold uppercase tracking-[0.08em] text-black/40"
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {candidatos.map((c) => (
                <tr
                  key={c.id}
                  className="border-b border-black/5 transition-colors hover:bg-black/[0.02]"
                >
                  <td className="py-3 pr-4">
                    <Link
                      href={`/candidato/${c.slug}`}
                      className="flex items-center gap-3"
                    >
                      {c.foto_url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={c.foto_url}
                          alt=""
                          className="size-10 shrink-0 rounded-full object-cover object-top"
                        />
                      )}
                      <span className="font-heading text-[16px] uppercase leading-tight text-black">
                        {c.nome_urna}
                      </span>
                    </Link>
                  </td>
                  <td className="py-3 pr-4 text-[13px] font-bold text-black/50">
                    {c.partido_sigla}
                  </td>
                  <td className="py-3 pr-4 text-[13px] font-semibold tabular-nums text-black/50">
                    {c.idade ?? "--"}
                  </td>
                  <td className="max-w-[200px] truncate py-3 pr-4 text-[13px] font-medium text-black/40">
                    {c.formacao ?? "--"}
                  </td>
                  <td className="py-3 pr-4 text-[13px] font-bold tabular-nums text-black">
                    {c.patrimonio_declarado
                      ? formatCompact(c.patrimonio_declarado)
                      : "--"}
                  </td>
                  <td className="py-3 pr-4 text-[13px] font-bold tabular-nums text-black">
                    {c.total_processos}
                  </td>
                  <td className="py-3 text-[13px] font-bold tabular-nums text-black">
                    {c.alertas_graves}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-5 pb-4 md:px-12">
        <p className="text-[11px] font-semibold text-black/20">
          Dados de fontes publicas oficiais (TSE, Camara, Senado). Patrimonio refere-se a ultima
          declaracao disponivel.
        </p>
      </div>

      <Footer />
    </div>
  )
}
