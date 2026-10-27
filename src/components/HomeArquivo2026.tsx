// cspell:ignore operacao migracoes
import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { ArquivoGraficoSemanal } from "@/components/ArquivoGraficoSemanal"
import { Footer } from "@/components/Footer"
import { ARQUIVO_ELEICOES_2026 } from "@/lib/arquivo"
import { diasEntre, formatarInteiro, getNumerosArquivo } from "@/lib/arquivo-home"

const EYEBROW = "text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.12em]"
const LINK_SETA = "inline-flex min-h-11 items-center gap-1.5 text-[length:var(--text-body-sm)] font-bold underline underline-offset-4"
const TITULO_SECAO = "mt-2 font-heading text-[length:var(--text-heading)] uppercase leading-none text-foreground"

// As seções do site como ficaram no arquivo, com o que cada uma fazia.
const SECOES_ARQUIVADAS: { href: string; nome: string; texto: string }[] = [
  { href: "/2o-turno", nome: "2º turno", texto: "Resultado oficial de 25/10, os finalistas lado a lado e os governadores eleitos." },
  { href: "/1o-turno", nome: "1º turno", texto: "O site como estava até a votação de 4/10 e o resultado de cada estado." },
  { href: "/governadores", nome: "Governadores", texto: "Mapa e diretório dos candidatos a governador por estado." },
  { href: "/comparar", nome: "Comparador", texto: "Duas ou mais fichas lado a lado." },
  { href: "/programas", nome: "Programas", texto: "Trechos dos programas de governo registrados no TSE, com página e versão." },
  { href: "/doadores", nome: "Doadores", texto: "Quem financiou as campanhas, a partir das prestações de contas." },
  { href: "/rankings", nome: "Listas", texto: "Recortes das fichas em ordem: processos, patrimônio, gastos." },
  { href: "/colinha", nome: "Colinha", texto: "Montava os seis votos na ordem da urna." },
  { href: "/quiz", nome: "Quiz", texto: "Comparava as respostas de quem jogava com as posições declaradas dos candidatos." },
  { href: "/imprensa", nome: "Imprensa", texto: "Sala de imprensa com fatos de cada finalista e pacotes por estado." },
  { href: "/dados-abertos", nome: "Dados abertos", texto: "O cadastro público de candidatos em CSV ou JSON." },
  { href: "/metodologia", nome: "Metodologia", texto: "De onde vinha cada dado e como a coleta funcionava." },
]

// Home do arquivo: o projeto em si. O que o site reuniu, a coleta semana a semana, a linha do tempo e
// como foi construído. Todo número sai de src/data/numeros-arquivo-2026.json (scripts/arquivo/numeros-arquivo.ts).
// O resultado do 2º turno fica em /2o-turno.
export function HomeArquivo2026() {
  const n = getNumerosArquivo()
  const { dados, operacao, construcao, serie_semanal: serie, marcos } = n
  const dias = diasEntre(operacao.registros_coleta.inicio, operacao.registros_coleta.fim)
  const marcosDoGrafico = [
    { data: "2026-10-04", rotulo: "1º turno" },
    { data: "2026-10-25", rotulo: "2º turno" },
  ]
  const fontes = [
    ...Object.entries(dados),
    ...Object.entries(operacao),
    ...Object.entries(construcao),
  ].map(([chave, item]) => ({ chave, valor: item.valor, fonte: item.fonte }))

  return (
    <div className="min-h-screen bg-background">
      {/* Filho direto de "main > div": o Navbar reconhece a faixa preta e fica transparente sobre ela. */}
      <section className="relative overflow-hidden bg-black text-white" data-pf-home-hero="arquivo">
        <div className="relative mx-auto max-w-7xl px-5 pb-14 pt-28 sm:pb-20 md:px-12 lg:pt-36">
          <p className={`${EYEBROW} text-white/70`}>
            {ARQUIVO_ELEICOES_2026.titulo} · {formatarData(operacao.registros_coleta.inicio)} a {formatarData(operacao.registros_coleta.fim)}
          </p>
          <h1 className="mt-3 max-w-5xl font-heading text-[clamp(3rem,8vw,7rem)] uppercase leading-[0.88] [text-wrap:balance]">
            {dias} dias puxando a ficha de {formatarInteiro(dados.fichas.valor)} candidatos
          </h1>
          <p className="mt-6 max-w-2xl text-[length:var(--text-body)] font-medium leading-relaxed text-white/80 sm:text-[17px]">
            O Puxa Ficha juntou em fichas públicas o que os candidatos a presidente, governador e senador de 2026
            tinham na Justiça, no patrimônio, nas contas de campanha e no mandato, cada dado com a fonte.
            Concebido, construído e mantido por Thiago Salvador, de março a outubro de 2026.
          </p>
          <FichasEmQuadrados
            grupos={[
              { rotulo: "à Presidência", valor: dados.fichas.presidente },
              { rotulo: "a governador", valor: dados.fichas.governador },
              { rotulo: "ao Senado", valor: dados.fichas.senador },
            ]}
          />
          <div className="mt-10 grid grid-cols-2 gap-x-6 gap-y-8 lg:grid-cols-4" data-pf-arquivo-destaques>
            <Destaque valor={formatarInteiro(dados.noticias.valor)} rotulo="notícias monitoradas" />
            <Destaque valor={formatarInteiro(dados.projetos_lei.valor)} rotulo="projetos de lei" />
            <Destaque valor={formatarInteiro(operacao.mudancas_rastreadas.valor)} rotulo="mudanças rastreadas nas fichas" />
            <Destaque valor={formatarInteiro(construcao.testes.valor)} rotulo="testes automatizados" />
          </div>
          <div className="mt-10 flex flex-wrap gap-x-6 gap-y-1">
            <Link href="/2o-turno" className={`${LINK_SETA} text-white`}>
              Resultado do 2º turno <ArrowRight className="size-3.5" aria-hidden="true" />
            </Link>
            <Link href="/dados-abertos" className={`${LINK_SETA} text-white`}>
              Baixar os dados abertos <ArrowRight className="size-3.5" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-14 sm:py-20 md:px-12" aria-labelledby="arquivo-numeros" data-pf-arquivo-numeros>
        <p className={`${EYEBROW} text-muted-foreground`}>{ARQUIVO_ELEICOES_2026.titulo}</p>
        <h2 id="arquivo-numeros" className={TITULO_SECAO}>O que o Puxa Ficha reuniu</h2>
        <p className="mt-3 max-w-prose text-[length:var(--text-body)] font-medium leading-relaxed text-muted-foreground">
          Registro congelado em {ARQUIVO_ELEICOES_2026.dataCorte}, dia do 2º turno.
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
      </section>

      <section className="border-y border-border bg-[var(--gray-50,#fafafa)]" aria-labelledby="arquivo-coleta" data-pf-arquivo-coleta>
        <div className="mx-auto max-w-7xl px-5 py-14 sm:py-20 md:px-12">
          <h2 id="arquivo-coleta" className={TITULO_SECAO}>A coleta, semana a semana</h2>
          <p className="mt-3 max-w-prose text-[length:var(--text-body)] font-medium leading-relaxed text-muted-foreground">
            O que entrou no banco a cada semana, de {formatarData(operacao.registros_coleta.inicio)} ao 2º turno.
            Foram {formatarInteiro(operacao.registros_coleta.valor)} registros de coleta, feitos por {operacao.rotinas_coleta.valor} rotinas.
          </p>
          <div className="mt-10 grid grid-cols-1 gap-12 lg:grid-cols-2">
            <ArquivoGraficoSemanal id="grafico-noticias" titulo="Notícias coletadas por semana" semanas={serie.semanas} valores={serie.noticias} unidade="notícias" marcos={marcosDoGrafico} />
            <ArquivoGraficoSemanal id="grafico-mudancas" titulo="Mudanças registradas nas fichas por semana" semanas={serie.semanas} valores={serie.mudancas} unidade="mudanças" marcos={marcosDoGrafico} />
          </div>
          <p className="mt-6 max-w-3xl text-[length:var(--text-caption)] font-medium text-muted-foreground">Fonte: {serie.fonte}.</p>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-14 sm:py-20 md:px-12" aria-labelledby="arquivo-linha-do-tempo">
        <h2 id="arquivo-linha-do-tempo" className={TITULO_SECAO}>Linha do tempo</h2>
        <ol className="mt-8 grid grid-cols-1 gap-x-10 border-t-[3px] border-foreground sm:grid-cols-2 lg:grid-cols-3" data-pf-arquivo-marcos>
          {marcos.map((m) => (
            <li key={`${m.data}-${m.titulo}`} className="border-b border-border py-4">
              <p className="font-heading text-[length:var(--text-heading-sm)] leading-none tabular-nums text-foreground">{formatarData(m.data)}</p>
              <p className="mt-1.5 text-[length:var(--text-body-sm)] font-bold leading-snug text-foreground">{m.titulo}</p>
              <p className="mt-0.5 text-[length:var(--text-caption)] font-medium text-muted-foreground">Fonte: {m.fonte}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-14 sm:pb-20 md:px-12">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-2">
          <div>
            <h2 className="font-heading text-[length:var(--text-heading-sm)] uppercase leading-none text-foreground">Como funcionava</h2>
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
            <h2 className="font-heading text-[length:var(--text-heading-sm)] uppercase leading-none text-foreground">Como foi construído</h2>
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
      </section>

      <section className="border-t border-border" aria-labelledby="arquivo-secoes">
        <div className="mx-auto max-w-7xl px-5 py-14 sm:py-20 md:px-12">
          <h2 id="arquivo-secoes" className={TITULO_SECAO}>O site como era</h2>
          <p className="mt-3 max-w-prose text-[length:var(--text-body)] font-medium leading-relaxed text-muted-foreground">
            As seções seguem abertas, com os dados de {ARQUIVO_ELEICOES_2026.dataCorte}.
          </p>
          <ul className="mt-8 grid grid-cols-1 gap-px overflow-hidden rounded-[14px] border border-border bg-border sm:grid-cols-2 lg:grid-cols-3" data-pf-arquivo-secoes>
            {SECOES_ARQUIVADAS.map((s) => (
              <li key={s.href} className="bg-background">
                <Link href={s.href} className="group flex h-full min-h-11 flex-col gap-1 px-5 py-4 hover:bg-[var(--accent)]">
                  <span className="inline-flex items-center gap-1.5 font-bold text-foreground group-hover:underline">
                    {s.nome} <ArrowRight className="size-3.5" aria-hidden="true" />
                  </span>
                  <span className="text-[length:var(--text-body-sm)] font-medium text-muted-foreground">{s.texto}</span>
                </Link>
              </li>
            ))}
          </ul>
          <details className="mt-10 max-w-3xl text-[length:var(--text-caption)] text-muted-foreground">
            <summary className="cursor-pointer font-bold">De onde vêm estes números</summary>
            <ul className="mt-2 space-y-1">
              {fontes.map((f) => (
                <li key={f.chave}><span className="font-bold tabular-nums text-foreground">{formatarInteiro(f.valor)}</span>: {f.fonte}.</li>
              ))}
            </ul>
            <p className="mt-2">Medido em {formatarData(n.medido_em.slice(0, 10))}, no código {n.ref_codigo}.</p>
          </details>
        </div>
      </section>

      <Footer />
    </div>
  )
}

// Uma ficha, um quadrado: o tamanho do acervo à vista, separado por cargo. A posição diz o cargo,
// sem depender de cor; o número e o rótulo vêm escritos acima de cada grupo.
function FichasEmQuadrados({ grupos }: { grupos: { rotulo: string; valor: number }[] }) {
  return (
    <div className="mt-10 max-w-5xl space-y-3" data-pf-arquivo-quadrados role="img" aria-label={`Fichas: ${grupos.map((g) => `${g.valor} ${g.rotulo}`).join(", ")}`}>
      {grupos.map((g) => (
        <div key={g.rotulo} className="grid grid-cols-1 items-start gap-x-5 gap-y-1.5 sm:grid-cols-[9.5rem_1fr]">
          <p className="text-[length:var(--text-body-sm)] font-bold leading-none text-white" aria-hidden="true">
            <span className="font-heading text-[length:var(--text-heading-sm)] tabular-nums">{g.valor}</span> {g.rotulo}
          </p>
          <div className="flex flex-wrap gap-[3px] sm:pt-1" aria-hidden="true">
            {Array.from({ length: g.valor }, (_, i) => (
              <span key={i} className="size-[9px] rounded-[2px] bg-white" />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function Destaque({ valor, rotulo }: { valor: string; rotulo: string }) {
  return (
    <div className="min-w-0 border-t-[3px] border-white pt-3">
      <p className="font-heading text-[clamp(2.25rem,5vw,3.75rem)] leading-none tabular-nums text-white">{valor}</p>
      <p className="mt-1 text-[length:var(--text-body-sm)] font-bold text-white/80">{rotulo}</p>
    </div>
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

function formatarData(iso: string): string {
  const [ano, mes, dia] = iso.split("-")
  return `${dia}/${mes}/${ano}`
}
