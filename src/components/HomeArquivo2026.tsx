// cspell:ignore legivel operacao migracoes
import { getImageProps } from "next/image"
import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { ARQUIVO_ELEICOES_2026 } from "@/lib/arquivo"
import {
  disputaFinal,
  formatarGeradoTse,
  formatarInteiro,
  getNumerosArquivo,
  getResultado2Turno,
  type CandidatoFinal2Turno,
} from "@/lib/arquivo-home"
import { nomeLegivel } from "@/lib/compartilhar-duelo"
import { carregadorRetrato } from "@/lib/carregador-retrato"
import { retratoHero } from "@/lib/hero-retratos-2turno"
import { formatarPercentual } from "@/lib/resultados-1turno"

const EYEBROW = "text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.12em]"
const LINK_SETA = "inline-flex min-h-11 items-center gap-1.5 text-[length:var(--text-body-sm)] font-bold underline underline-offset-4"

interface Props {
  /** Nome de urna como a ficha mostra, por slug; o do TSE vem sem acento. */
  nomes: Record<string, string>
}

function nomeDe(c: CandidatoFinal2Turno, nomes: Record<string, string>) {
  return nomes[c.slug] ?? nomeLegivel(c.nome_urna)
}

// Home do arquivo: a vitória do eleito no topo, os governadores do 2º turno e
// o tamanho do que o site reuniu e construiu. Fica no lugar do hero da campanha.
export function HomeArquivo2026({ nomes }: Props) {
  const resultado = getResultado2Turno()
  const presidente = disputaFinal(resultado, "Presidente", "BR")
  const governadores = resultado.disputas
    .filter((d) => d.cargo === "Governador")
    .map((d) => ({ uf: d.uf, final: disputaFinal(resultado, d.cargo, d.uf) }))
  if (!presidente) return null
  const { eleito, fonte } = presidente
  const nome = nomeDe(eleito, nomes)
  const retrato = retratoHero(eleito.slug)
  // getImageProps no servidor: o carregador é função e não atravessa para o componente de cliente.
  const imagem = retrato
    ? getImageProps({ src: retrato.url, alt: `${nome}, presidente eleito`, width: retrato.largura, height: retrato.altura, priority: true, loader: carregadorRetrato, sizes: "(min-width: 1024px) 60vw, 100vw" }).props
    : null

  return (
    <>
      <section className="relative overflow-hidden bg-black text-white" data-pf-home-hero="arquivo">
        {imagem && retrato && (
          // Retrato oficial: no desktop ocupa a metade direita e some no preto; no celular vem acima do texto.
          <div
            className="relative mt-16 aspect-[16/10] w-full lg:mt-0 [mask-image:linear-gradient(to_bottom,#000_70%,transparent)] lg:absolute lg:inset-y-0 lg:right-0 lg:aspect-auto lg:w-[60%] lg:[mask-composite:intersect] lg:[mask-image:linear-gradient(to_right,transparent,#000_35%),linear-gradient(to_bottom,#000_75%,transparent)]"
            data-pf-arquivo-retrato
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- atributos do getImageProps, montados no servidor */}
            <img
              {...imagem}
              alt={imagem.alt}
              className="absolute inset-0 h-full w-full object-cover"
              style={{ objectPosition: `${Math.round(retrato.rosto_x * 100)}% 20%` }}
            />
          </div>
        )}
        <div className="relative mx-auto max-w-7xl px-5 pb-12 pt-6 sm:pb-16 md:px-12 lg:min-h-[640px] lg:pt-36">
          <div className="max-w-xl">
            <p className={`${EYEBROW} text-white/70`}>
              {ARQUIVO_ELEICOES_2026.titulo} · 2º turno, {ARQUIVO_ELEICOES_2026.dataCorte}
            </p>
            <h1 className="mt-3 font-heading text-[clamp(3.25rem,9vw,7.5rem)] uppercase leading-[0.88] [text-wrap:balance]">
              {nome} eleito presidente
            </h1>
            <p className="mt-6 font-heading text-[clamp(3rem,7vw,5.5rem)] leading-none tabular-nums" data-pf-arquivo-percentual>
              {formatarPercentual(eleito.percentual_validos)}
            </p>
            <p className="mt-1 text-[length:var(--text-body)] font-bold text-white">
              dos votos válidos{eleito.votos === null ? "" : `, ${formatarInteiro(eleito.votos)} votos`}
            </p>
            <p className="mt-4 max-w-md text-[length:var(--text-body)] font-medium leading-relaxed text-white/80">
              {nomeLegivel(eleito.nome)} ({eleito.partido}) foi eleito presidente da República no 2º turno de 25 de outubro de 2026.
            </p>
            <div className="mt-6 flex flex-wrap gap-x-6 gap-y-1">
              <Link href={`/candidato/${eleito.slug}`} className={`${LINK_SETA} text-white`}>
                Ficha de {nome} <ArrowRight className="size-3.5" aria-hidden="true" />
              </Link>
              <Link href="/1o-turno" className={`${LINK_SETA} text-white`}>
                Resultado do 1º turno <ArrowRight className="size-3.5" aria-hidden="true" />
              </Link>
            </div>
            <p className="mt-6 text-[length:var(--text-caption)] font-medium text-white/60">
              Fonte:{" "}
              <a href={fonte.url} className="underline underline-offset-2 hover:text-white" rel="noreferrer">
                TSE, resultado totalizado em {formatarGeradoTse(fonte.gerado_tse)}
              </a>
              .
              {retrato && (
                <>
                  {" "}Foto:{" "}
                  <a href={retrato.pagina} className="underline underline-offset-2 hover:text-white" rel="noreferrer">
                    {retrato.credito}, {retrato.licenca}
                  </a>
                  .
                </>
              )}
            </p>
          </div>
        </div>
      </section>

      {governadores.length > 0 && (
        <section className="mx-auto max-w-7xl px-5 pt-12 sm:pt-16 md:px-12" aria-labelledby="arquivo-governadores">
          <h2 id="arquivo-governadores" className={`${EYEBROW} text-muted-foreground`}>Governadores eleitos no 2º turno</h2>
          <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {governadores.map(({ uf, final }) =>
              final ? (
                <li key={uf} className="flex min-w-0 items-baseline justify-between gap-3 rounded-[14px] border border-border px-4 py-3" data-pf-arquivo-governador={uf}>
                  <span className="min-w-0">
                    <span className="mr-2 text-[length:var(--text-caption)] font-bold text-muted-foreground">{uf}</span>
                    <Link href={`/candidato/${final.eleito.slug}`} className="font-bold text-foreground hover:underline">{nomeDe(final.eleito, nomes)}</Link>
                    <span className="block text-[length:var(--text-caption)] font-medium text-muted-foreground">venceu {nomeDe(final.derrotado, nomes)}</span>
                  </span>
                  <span className="shrink-0 font-heading text-2xl tabular-nums text-foreground">{formatarPercentual(final.eleito.percentual_validos)}</span>
                </li>
              ) : null,
            )}
          </ul>
        </section>
      )}
      <HomeArquivoNumeros />
    </>
  )
}

function Numero({ valor, rotulo, detalhe }: { valor: string; rotulo: string; detalhe?: string }) {
  return (
    <div className="min-w-0 border-t-[3px] border-foreground pt-3">
      <p className="font-heading text-[clamp(2rem,4vw,2.75rem)] leading-none tabular-nums text-foreground">{valor}</p>
      <p className="mt-1 text-[length:var(--text-body-sm)] font-bold text-foreground">{rotulo}</p>
      {detalhe && <p className="mt-0.5 text-[length:var(--text-caption)] font-medium text-muted-foreground">{detalhe}</p>}
    </div>
  )
}

function HomeArquivoNumeros() {
  const n = getNumerosArquivo()
  const { dados, operacao, construcao } = n
  const fontes = [
    ...Object.entries(dados),
    ...Object.entries(operacao),
    ...Object.entries(construcao),
  ].map(([chave, item]) => ({ chave, valor: item.valor, fonte: item.fonte }))

  return (
    <section className="mx-auto max-w-7xl px-5 py-14 sm:py-20 md:px-12" aria-labelledby="arquivo-numeros" data-pf-arquivo-numeros>
      <p className={`${EYEBROW} text-muted-foreground`}>{ARQUIVO_ELEICOES_2026.titulo}</p>
      <h2 id="arquivo-numeros" className="mt-2 font-heading text-[length:var(--text-heading)] uppercase leading-none text-foreground">
        O que o Puxa Ficha reuniu
      </h2>
      <p className="mt-3 max-w-prose text-[length:var(--text-body)] font-medium leading-relaxed text-muted-foreground">
        Registro congelado em {ARQUIVO_ELEICOES_2026.dataCorte}, dia do 2º turno. Concebido, construído e mantido por Thiago Salvador, de março a outubro de 2026.
      </p>

      <div className="mt-8 grid grid-cols-1 gap-x-6 gap-y-8 min-[480px]:grid-cols-2 lg:grid-cols-4">
        <Numero valor={formatarInteiro(dados.fichas.valor)} rotulo="fichas de candidatos" detalhe={`${dados.fichas.presidente} à Presidência, ${dados.fichas.governador} a governador e ${dados.fichas.senador} ao Senado, nas ${dados.fichas.ufs} UFs`} />
        <Numero valor={formatarInteiro(dados.noticias.valor)} rotulo="notícias monitoradas" detalhe={`de ${formatarInteiro(dados.noticias.fontes)} veículos e fontes`} />
        <Numero valor={formatarInteiro(dados.projetos_lei.valor)} rotulo="projetos de lei" detalhe="dos candidatos com mandato no Legislativo" />
        <Numero valor={formatarInteiro(dados.atos_governo.valor)} rotulo="atos de governo" detalhe="de quem já exerceu mandato no Executivo" />
        <Numero valor={formatarInteiro(dados.processos.valor)} rotulo="processos judiciais" detalhe={`em ${dados.processos.tribunais} tribunais`} />
        <Numero valor={formatarInteiro(dados.prestacoes_contas.valor)} rotulo="prestações de contas" detalhe={`de campanhas de ${dados.prestacoes_contas.ano_inicial} a ${dados.prestacoes_contas.ano_final}`} />
        <Numero valor={formatarInteiro(dados.bens_declarados.valor)} rotulo="bens declarados ao TSE" detalhe={`em ${formatarInteiro(dados.bens_declarados.declaracoes)} declarações de patrimônio`} />
        <Numero valor={formatarInteiro(dados.candidaturas_tse.valor)} rotulo="candidaturas no cadastro do TSE" detalhe="todas as de 2026, deputados inclusive" />
      </div>

      <div className="mt-14 grid grid-cols-1 gap-12 lg:grid-cols-2">
        <div>
          <h3 className="font-heading text-[length:var(--text-heading-sm)] uppercase leading-none text-foreground">Como funcionava</h3>
          <p className="mt-2 text-[length:var(--text-body-sm)] font-medium text-muted-foreground">
            A coleta que manteve as fichas atualizadas, de {formatarData(operacao.registros_coleta.inicio)} a {formatarData(operacao.registros_coleta.fim)}.
          </p>
          <div className="mt-5 grid grid-cols-1 gap-6 min-[480px]:grid-cols-3">
            <Numero valor={formatarInteiro(operacao.registros_coleta.valor)} rotulo="registros de coleta" />
            <Numero valor={formatarInteiro(operacao.mudancas_rastreadas.valor)} rotulo="mudanças rastreadas nas fichas" />
            <Numero valor={formatarInteiro(operacao.rotinas_coleta.valor)} rotulo="rotinas de coleta e curadoria" />
          </div>
        </div>
        <div>
          <h3 className="font-heading text-[length:var(--text-heading-sm)] uppercase leading-none text-foreground">Como foi construído</h3>
          <p className="mt-2 text-[length:var(--text-body-sm)] font-medium text-muted-foreground">
            Código aberto no{" "}
            <a href="https://github.com/thiago-salvador/puxa-ficha" className="font-bold text-foreground underline underline-offset-4" rel="noreferrer">GitHub</a>.
          </p>
          <div className="mt-5 grid grid-cols-2 gap-6 sm:grid-cols-4">
            <Numero valor={formatarInteiro(construcao.testes.valor)} rotulo="testes automatizados" />
            <Numero valor={formatarInteiro(construcao.prs_mesclados.valor)} rotulo="pull requests" />
            <Numero valor={formatarInteiro(construcao.commits.valor)} rotulo="commits" />
            <Numero valor={formatarInteiro(construcao.migracoes.valor)} rotulo="migrações de banco" />
          </div>
        </div>
      </div>

      <div className="mt-12 flex flex-wrap items-center gap-x-6 gap-y-2">
        <Link href="/dados-abertos" className={`${LINK_SETA} text-foreground`}>Baixar os dados abertos <ArrowRight className="size-3.5" aria-hidden="true" /></Link>
        <Link href="/metodologia" className={`${LINK_SETA} text-foreground`}>Como funcionava a coleta <ArrowRight className="size-3.5" aria-hidden="true" /></Link>
      </div>
      <details className="mt-6 max-w-3xl text-[length:var(--text-caption)] text-muted-foreground">
        <summary className="cursor-pointer font-bold">De onde vêm estes números</summary>
        <ul className="mt-2 space-y-1">
          {fontes.map((f) => (
            <li key={f.chave}><span className="font-bold tabular-nums text-foreground">{formatarInteiro(f.valor)}</span>: {f.fonte}.</li>
          ))}
        </ul>
        <p className="mt-2">Medido em {formatarData(n.medido_em.slice(0, 10))}, no código {n.ref_codigo}.</p>
      </details>
    </section>
  )
}

function formatarData(iso: string): string {
  const [ano, mes, dia] = iso.split("-")
  return `${dia}/${mes}/${ano}`
}
