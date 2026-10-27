// cspell:ignore operacao migracoes
import { getImageProps } from "next/image"
import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { ArquivoGraficoSemanal } from "@/components/ArquivoGraficoSemanal"
import { Footer } from "@/components/Footer"
import { TituloSecao } from "@/components/Resultado1TurnoPartes"
import { SlashDivider } from "@/components/SlashDivider"
import { ARQUIVO_ELEICOES_2026 } from "@/lib/arquivo"
import { diasEntre, formatarInteiro, getNumerosArquivo } from "@/lib/arquivo-home"

// Mesma régua do hero do 2º turno: rótulo em caixa alta sobre o preto, apoio em branco 80%.
const ROTULO_ESCURO = "text-[length:var(--text-eyebrow)] font-semibold uppercase tracking-[0.12em] text-white"
const LINK_ESCURO =
  "inline-flex min-h-11 items-center gap-1 whitespace-nowrap text-[length:var(--text-body-sm)] font-bold text-white underline underline-offset-4 hover:text-white/80"
const LINK_CLARO =
  "inline-flex min-h-11 items-center gap-1 whitespace-nowrap text-[length:var(--text-body-sm)] font-bold underline underline-offset-4 hover:text-[var(--gray-600)]"
const PILULA_BRANCA =
  "group inline-flex min-h-12 items-center justify-center gap-3 whitespace-nowrap rounded-full bg-white px-6 font-heading text-[length:var(--text-heading-sm)] uppercase leading-none tracking-[0.02em] text-black transition-colors duration-200 hover:bg-[var(--gray-200)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white sm:min-h-[60px] sm:px-12 sm:text-[clamp(1.5rem,2vw,2rem)]"
const NUMERO_GRANDE = "font-heading text-[clamp(2rem,4vw,3.25rem)] leading-none tabular-nums text-foreground"

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

// Home do arquivo: o projeto em si, no desenho do hero e das seções do 2º turno. O que o site reuniu, a coleta
// semana a semana, a linha do tempo e como foi construído. Todo número sai de src/data/numeros-arquivo-2026.json
// (scripts/arquivo/numeros-arquivo.ts). O resultado do 2º turno fica em /2o-turno.
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
  // A foto do dossiê do hero de fichas, a mesma da home antes do resultado.
  const { props: fundo } = getImageProps({ src: "/images/hero-dossie.webp", alt: "", width: 1600, height: 893, sizes: "100vw", loading: "eager", fetchPriority: "high", className: "h-full w-full object-cover" })

  return (
    <div className="min-h-screen bg-background">
      {/* Filho direto de "main > div": o Navbar reconhece a faixa preta e fica transparente sobre ela. */}
      <section className="relative overflow-hidden bg-black pb-10 sm:pb-16" data-pf-home-hero="arquivo">
        <div className="absolute inset-0 opacity-40" aria-hidden="true">
          <picture>
            <source media="(max-width: 640px)" srcSet="/images/hero-dossie-mobile.webp" />
            <img {...fundo} alt="" />
          </picture>
        </div>
        {/* Escurece a foto: o texto branco fica acima de 4,5:1 em qualquer ponto. */}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-black/60" aria-hidden="true" />

        <div className="relative mx-auto max-w-7xl px-5 pt-[clamp(72px,11vh,80px)] sm:pt-[clamp(76px,11vh,128px)] md:px-12">
          <h1
            className="hero-fade font-heading text-[clamp(48px,min(17vw,9vh),100px)] uppercase leading-[0.85] tracking-[-0.02em] text-white sm:text-[clamp(64px,min(13vw,12vh),176px)]"
            style={{ animationDelay: "0.1s" }}
          >
            Puxa Ficha
          </h1>
          <SlashDivider className="hero-fade my-3 sm:my-[clamp(10px,2vh,24px)]" color="text-white" />
          <div className="hero-fade" style={{ animationDelay: "0.3s" }}>
            <p className="text-[clamp(0.875rem,1.3vw,1.3rem)] font-medium uppercase tracking-[0.35em] text-white/90">
              {ARQUIVO_ELEICOES_2026.titulo}
            </p>
            <p className="mt-3 max-w-4xl font-heading text-[clamp(2rem,4.6vw,4rem)] uppercase leading-[0.92] text-white [text-wrap:balance]">
              {dias} dias puxando a ficha de {formatarInteiro(dados.fichas.valor)} candidatos
            </p>
            <p className="mt-5 max-w-2xl text-[length:var(--text-body)] font-medium leading-relaxed text-white/80 sm:text-[17px]">
              De {formatarData(operacao.registros_coleta.inicio)} a {formatarData(operacao.registros_coleta.fim)}, o Puxa Ficha juntou em fichas públicas o que os
              candidatos a presidente, governador e senador tinham na Justiça, no patrimônio, nas contas de campanha e no mandato, cada
              dado com a fonte. Concebido, construído e mantido por Thiago Salvador, de março a outubro de 2026.
            </p>
            <div className="mt-8 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-6">
              <Link href="/2o-turno" className={PILULA_BRANCA}>
                Resultado do 2º turno
                <ArrowRight className="size-6 transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden="true" />
              </Link>
              <span aria-hidden="true" className="hidden h-7 w-px bg-white/40 sm:block" />
              <Link href="/dados-abertos" className={LINK_ESCURO}>
                Baixar os dados abertos <ArrowRight className="size-3.5" aria-hidden="true" />
              </Link>
            </div>
          </div>

          {/* Faixa "em números", como a do 2º turno: número em cima, rótulo em caixa alta, traço fino entre colunas. */}
          <div className="mt-10 border-t border-white/30 pt-5 sm:mt-14 sm:pt-6" data-pf-arquivo-destaques>
            <p className={`text-center ${ROTULO_ESCURO}`}>O arquivo em números</p>
            <dl className="mx-auto mt-5 grid max-w-5xl grid-cols-2 gap-y-6 text-center sm:grid-cols-4 sm:divide-x sm:divide-white/20">
              <Destaque valor={formatarInteiro(dados.noticias.valor)} rotulo="notícias monitoradas" />
              <Destaque valor={formatarInteiro(dados.projetos_lei.valor)} rotulo="projetos de lei" />
              <Destaque valor={formatarInteiro(operacao.mudancas_rastreadas.valor)} rotulo="mudanças rastreadas" />
              <Destaque valor={formatarInteiro(construcao.testes.valor)} rotulo="testes automatizados" />
            </dl>
          </div>

          <FichasEmQuadrados
            total={dados.fichas.valor}
            grupos={[
              { rotulo: "à Presidência", valor: dados.fichas.presidente },
              { rotulo: "a governador", valor: dados.fichas.governador },
              { rotulo: "ao Senado", valor: dados.fichas.senador },
            ]}
          />
        </div>
      </section>

      <div className="mx-auto max-w-7xl space-y-16 px-5 py-12 sm:space-y-20 sm:py-16 md:px-12">
        <section aria-labelledby="arquivo-numeros" data-pf-arquivo-numeros>
          <TituloSecao titulo="O que o Puxa Ficha reuniu" id="arquivo-numeros">
            Registro congelado em {ARQUIVO_ELEICOES_2026.dataCorte}, dia do 2º turno.
          </TituloSecao>
          <SlashDivider className="mb-6 mt-6" />
          <dl className="grid grid-cols-1 overflow-hidden rounded-[18px] border border-border min-[480px]:grid-cols-2 lg:grid-cols-4">
            <Numero valor={formatarInteiro(dados.fichas.valor)} rotulo="fichas de candidatos" detalhe={`${dados.fichas.presidente} à Presidência, ${dados.fichas.governador} a governador e ${dados.fichas.senador} ao Senado, nas ${dados.fichas.ufs} UFs`} />
            <Numero valor={formatarInteiro(dados.noticias.valor)} rotulo="notícias monitoradas" detalhe={`de ${formatarInteiro(dados.noticias.fontes)} veículos e fontes`} />
            <Numero valor={formatarInteiro(dados.projetos_lei.valor)} rotulo="projetos de lei" detalhe="dos candidatos com mandato no Legislativo" />
            <Numero valor={formatarInteiro(dados.atos_governo.valor)} rotulo="atos de governo" detalhe="de quem já exerceu mandato no Executivo" />
            <Numero valor={formatarInteiro(dados.processos.valor)} rotulo="processos judiciais" detalhe={`em ${dados.processos.tribunais} tribunais`} />
            <Numero valor={formatarInteiro(dados.prestacoes_contas.valor)} rotulo="prestações de contas" detalhe={`de campanhas de ${dados.prestacoes_contas.ano_inicial} a ${dados.prestacoes_contas.ano_final}`} />
            <Numero valor={formatarInteiro(dados.bens_declarados.valor)} rotulo="bens declarados ao TSE" detalhe={`em ${formatarInteiro(dados.bens_declarados.declaracoes)} declarações de patrimônio`} />
            <Numero valor={formatarInteiro(dados.candidaturas_tse.valor)} rotulo="candidaturas no cadastro do TSE" detalhe="todas as de 2026, deputados inclusive" />
          </dl>
        </section>

        <section aria-labelledby="arquivo-coleta" data-pf-arquivo-coleta>
          <TituloSecao titulo="A coleta, semana a semana" id="arquivo-coleta">
            O que entrou no banco a cada semana, de {formatarData(operacao.registros_coleta.inicio)} ao 2º turno: {formatarInteiro(operacao.registros_coleta.valor)} registros
            de coleta, feitos por {operacao.rotinas_coleta.valor} rotinas.
          </TituloSecao>
          <SlashDivider className="mb-6 mt-6" />
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-[18px] border border-border p-5 sm:p-6">
              <ArquivoGraficoSemanal id="grafico-noticias" titulo="Notícias coletadas por semana" semanas={serie.semanas} valores={serie.noticias} unidade="notícias" marcos={marcosDoGrafico} />
            </div>
            <div className="rounded-[18px] border border-border p-5 sm:p-6">
              <ArquivoGraficoSemanal id="grafico-mudancas" titulo="Mudanças registradas nas fichas por semana" semanas={serie.semanas} valores={serie.mudancas} unidade="mudanças" marcos={marcosDoGrafico} />
            </div>
          </div>
          <p className="mt-4 max-w-3xl text-[length:var(--text-caption)] font-medium text-muted-foreground">Fonte: {serie.fonte}.</p>
        </section>

        <section aria-labelledby="arquivo-linha-do-tempo">
          <TituloSecao titulo="Linha do tempo" id="arquivo-linha-do-tempo">
            Cada data tem registro no banco, no histórico do código ou no calendário do TSE.
          </TituloSecao>
          <SlashDivider className="mb-2 mt-6" />
          <ol className="grid grid-cols-1 gap-x-12 sm:grid-cols-2 lg:grid-cols-3" data-pf-arquivo-marcos>
            {marcos.map((m) => (
              <li key={`${m.data}-${m.titulo}`} className="border-b border-border py-5">
                <p className="font-heading text-[length:var(--text-heading)] leading-none tabular-nums text-foreground">{formatarData(m.data)}</p>
                <p className="mt-2 text-[length:var(--text-body-sm)] font-bold leading-snug text-foreground">{m.titulo}</p>
                <p className="mt-0.5 text-[length:var(--text-caption)] font-medium text-muted-foreground">Fonte: {m.fonte}</p>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="arquivo-por-dentro">
          <TituloSecao titulo="Por dentro" id="arquivo-por-dentro">
            A coleta que manteve as fichas atualizadas e o código que fez o site, aberto no{" "}
            <a href="https://github.com/thiago-salvador/puxa-ficha" className="font-bold text-foreground underline underline-offset-4" rel="noreferrer">GitHub</a>.
          </TituloSecao>
          <SlashDivider className="mb-8 mt-6" />
          <div className="grid gap-y-10 lg:grid-cols-2 lg:divide-x lg:divide-border">
            <div className="min-w-0 lg:pr-10">
              <h3 className="font-heading text-[length:var(--text-heading)] uppercase leading-none text-foreground">Como funcionava</h3>
              <dl className="mt-5 grid grid-cols-1 gap-6 min-[480px]:grid-cols-3">
                <NumeroSimples valor={formatarInteiro(operacao.registros_coleta.valor)} rotulo="registros de coleta" />
                <NumeroSimples valor={formatarInteiro(operacao.mudancas_rastreadas.valor)} rotulo="mudanças rastreadas nas fichas" />
                <NumeroSimples valor={formatarInteiro(operacao.rotinas_coleta.valor)} rotulo="rotinas de coleta e curadoria" />
              </dl>
            </div>
            <div className="min-w-0 lg:pl-10">
              <h3 className="font-heading text-[length:var(--text-heading)] uppercase leading-none text-foreground">Como foi construído</h3>
              <dl className="mt-5 grid grid-cols-2 gap-6 sm:grid-cols-4">
                <NumeroSimples valor={formatarInteiro(construcao.testes.valor)} rotulo="testes automatizados" />
                <NumeroSimples valor={formatarInteiro(construcao.prs_mesclados.valor)} rotulo="pull requests" />
                <NumeroSimples valor={formatarInteiro(construcao.commits.valor)} rotulo="commits" />
                <NumeroSimples valor={formatarInteiro(construcao.migracoes.valor)} rotulo="migrações de banco" />
              </dl>
            </div>
          </div>
        </section>

        <section aria-labelledby="arquivo-secoes">
          <TituloSecao titulo="O site como era" id="arquivo-secoes">
            As seções seguem abertas, com os dados de {ARQUIVO_ELEICOES_2026.dataCorte}.
          </TituloSecao>
          <SlashDivider className="mb-2 mt-6" />
          <ul className="grid grid-cols-1 gap-x-12 sm:grid-cols-2 lg:grid-cols-3" data-pf-arquivo-secoes>
            {SECOES_ARQUIVADAS.map((s) => (
              <li key={s.href} className="border-b border-border py-5">
                <div className="flex items-center justify-between gap-4">
                  <h3 className="font-heading text-[length:var(--text-heading-sm)] uppercase leading-none text-foreground">{s.nome}</h3>
                  <Link href={s.href} aria-label={`Abrir ${s.nome}`} className={LINK_CLARO}>
                    Abrir <ArrowRight className="size-3.5" aria-hidden="true" />
                  </Link>
                </div>
                <p className="mt-2 text-[length:var(--text-body-sm)] font-medium text-muted-foreground">{s.texto}</p>
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
        </section>
      </div>

      <Footer />
    </div>
  )
}

// Uma ficha, um quadrado: o tamanho do acervo à vista, separado por cargo. A posição diz o cargo,
// sem depender de cor; o número e o rótulo vêm escritos ao lado de cada grupo.
function FichasEmQuadrados({ total, grupos }: { total: number; grupos: { rotulo: string; valor: number }[] }) {
  return (
    <div className="mt-10 border-t border-white/30 pt-5 sm:mt-12 sm:pt-6" data-pf-arquivo-quadrados role="img" aria-label={`${total} fichas: ${grupos.map((g) => `${g.valor} ${g.rotulo}`).join(", ")}`}>
      <p className={`text-center ${ROTULO_ESCURO}`} aria-hidden="true">As {formatarInteiro(total)} fichas, uma por quadrado</p>
      <div className="mx-auto mt-5 max-w-5xl space-y-3" aria-hidden="true">
        {grupos.map((g) => (
          <div key={g.rotulo} className="grid grid-cols-1 items-start gap-x-5 gap-y-1.5 sm:grid-cols-[9.5rem_1fr]">
            <p className="text-[length:var(--text-body-sm)] font-bold leading-none text-white">
              <span className="font-heading text-[length:var(--text-heading-sm)] tabular-nums">{g.valor}</span> {g.rotulo}
            </p>
            <div className="flex flex-wrap gap-[3px] sm:pt-1">
              {Array.from({ length: g.valor }, (_, i) => (
                <span key={i} className="size-[9px] rounded-[2px] bg-white" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function Destaque({ valor, rotulo }: { valor: string; rotulo: string }) {
  return (
    // dt antes do dd no DOM (ordem válida de <dl>); `order` põe o número em cima.
    <div className="flex min-w-0 flex-col items-center px-3">
      <dt className="order-2 mt-1 text-[length:var(--text-eyebrow)] font-semibold uppercase tracking-[0.06em] text-white">{rotulo}</dt>
      <dd className="order-1 font-heading text-[length:var(--text-heading)] leading-none tabular-nums text-white xl:text-[length:var(--text-heading-lg)]">{valor}</dd>
    </div>
  )
}

/** Célula do quadro "O que o Puxa Ficha reuniu": linhas finas entre as células, como o lado a lado. */
function Numero({ valor, rotulo, detalhe }: { valor: string; rotulo: string; detalhe?: string }) {
  return (
    <div className="flex min-w-0 flex-col border-b border-r border-border p-5 sm:p-6">
      <dt className="order-2 mt-2 text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.08em] text-foreground">{rotulo}</dt>
      <dd className={`order-1 ${NUMERO_GRANDE}`}>{valor}</dd>
      {detalhe && <dd className="order-3 mt-1 text-[length:var(--text-caption)] font-medium text-muted-foreground">{detalhe}</dd>}
    </div>
  )
}

function NumeroSimples({ valor, rotulo }: { valor: string; rotulo: string }) {
  return (
    <div className="flex min-w-0 flex-col">
      <dt className="order-2 mt-1 text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.08em] text-foreground">{rotulo}</dt>
      <dd className={`order-1 ${NUMERO_GRANDE}`}>{valor}</dd>
    </div>
  )
}

function formatarData(iso: string): string {
  const [ano, mes, dia] = iso.split("-")
  return `${dia}/${mes}/${ano}`
}
