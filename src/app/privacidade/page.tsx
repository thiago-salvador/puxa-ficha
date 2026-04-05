import type { Metadata } from "next"
import { SectionLabel, SectionTitle, SectionDivider } from "@/components/SectionHeader"
import { Footer } from "@/components/Footer"
import { buildTwitterMetadata } from "@/lib/metadata"

const title = "Politica de Privacidade — Puxa Ficha"
const description =
  "Como o Puxa Ficha trata dados pessoais, bases legais, direitos do titular e contato do encarregado."

export const metadata: Metadata = {
  title,
  description,
  alternates: {
    canonical: "/privacidade",
  },
  openGraph: {
    title,
    description,
    url: "https://puxaficha.com.br/privacidade",
  },
  twitter: buildTwitterMetadata({
    title,
    description,
  }),
}

function P({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[length:var(--text-body)] font-medium leading-relaxed text-foreground sm:text-[length:var(--text-body-lg)]">
      {children}
    </p>
  )
}

function Ul({ children }: { children: React.ReactNode }) {
  return (
    <ul className="list-disc space-y-1.5 pl-5 text-[length:var(--text-body)] font-medium leading-relaxed text-foreground sm:text-[length:var(--text-body-lg)]">
      {children}
    </ul>
  )
}

export default function PrivacidadePage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <section className="relative overflow-hidden bg-black">
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/40 to-black/60" />
        <div className="relative mx-auto max-w-7xl px-5 pb-12 pt-28 sm:pb-16 sm:pt-32 md:px-12 lg:pb-20 lg:pt-40">
          <p className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.12em] text-white">
            Legal
          </p>
          <h1
            className="mt-2 font-heading uppercase leading-[0.85] text-white"
            style={{ fontSize: "clamp(36px, 8vw, 80px)" }}
          >
            Privacidade
          </h1>
        </div>
      </section>

      <div className="pt-8 sm:pt-12">
        <SectionDivider />
      </div>

      {/* Intro */}
      <section className="mx-auto max-w-7xl px-5 py-8 sm:py-12 md:px-12 lg:py-16">
        <div className="max-w-2xl space-y-5">
          <P>
            Esta politica descreve como o Puxa Ficha trata dados pessoais, em conformidade com a
            Lei Geral de Protecao de Dados (LGPD, Lei 13.709/2018).
          </P>
          <P>
            Ultima atualizacao: 5 de abril de 2026.
          </P>
        </div>
      </section>

      <SectionDivider />

      {/* 01 Controlador */}
      <section className="mx-auto max-w-7xl px-5 py-8 sm:py-12 md:px-12 lg:py-16">
        <SectionLabel>01</SectionLabel>
        <SectionTitle>Controlador</SectionTitle>
        <div className="mt-6 max-w-2xl space-y-5 sm:mt-8">
          <P>
            O Puxa Ficha e um projeto pessoal de Thiago Salvador, responsavel pelas decisoes sobre
            o tratamento de dados pessoais publicados nesta plataforma.
          </P>
          <P>
            Contato do encarregado (DPO):{" "}
            <a
              href="mailto:privacidade@puxaficha.com.br"
              className="font-bold text-foreground underline decoration-foreground/20 underline-offset-2 hover:decoration-foreground/60"
            >
              privacidade@puxaficha.com.br
            </a>
          </P>
          <P>
            Contato geral:{" "}
            <a
              href="mailto:contato@puxaficha.com.br"
              className="font-bold text-foreground underline decoration-foreground/20 underline-offset-2 hover:decoration-foreground/60"
            >
              contato@puxaficha.com.br
            </a>
          </P>
        </div>
      </section>

      <SectionDivider />

      {/* 02 Dados tratados */}
      <section className="mx-auto max-w-7xl px-5 py-8 sm:py-12 md:px-12 lg:py-16">
        <SectionLabel>02</SectionLabel>
        <SectionTitle>Quais dados tratamos</SectionTitle>
        <div className="mt-6 max-w-2xl space-y-5 sm:mt-8">
          <P>
            O Puxa Ficha trata exclusivamente dados de candidatos a cargos publicos nas eleicoes
            brasileiras de 2026. Tambem podemos tratar dados de visitantes que optam por receber
            alertas por email sobre fichas acompanhadas, sem criar conta ou login tradicional.
          </P>
          <P>Dados dos candidatos incluem:</P>
          <Ul>
            <li>Nome, nome de urna, foto, data de nascimento, naturalidade</li>
            <li>Partido, cargo atual e disputado, historico politico</li>
            <li>Patrimonio declarado ao TSE</li>
            <li>Financiamento de campanha e doadores (dados publicos do TSE)</li>
            <li>Votacoes em plenario e projetos de lei</li>
            <li>Gastos parlamentares (CEAP)</li>
            <li>Processos judiciais publicos</li>
            <li>Sancoes administrativas (CEIS, CNEP, TCU)</li>
            <li>Noticias de fontes publicas</li>
            <li>Genero, cor/raca e estado civil (declarados ao TSE)</li>
            <li>CPF (usado apenas internamente para cruzamento de fontes, nunca exposto publicamente)</li>
          </Ul>
          <P>Quando voce ativa alertas por email, tratamos apenas o minimo necessario:</P>
          <Ul>
            <li>Email informado no formulario de acompanhamento</li>
            <li>Hash do IP do consentimento e timestamp de confirmacao</li>
            <li>Hashes tecnicos de tokens de verificacao e gestao</li>
            <li>Lista de fichas acompanhadas e historico basico de envio dos digests</li>
          </Ul>
        </div>
      </section>

      <SectionDivider />

      {/* 03 Base legal */}
      <section className="mx-auto max-w-7xl px-5 py-8 sm:py-12 md:px-12 lg:py-16">
        <SectionLabel>03</SectionLabel>
        <SectionTitle>Base legal</SectionTitle>
        <div className="mt-6 max-w-2xl space-y-5 sm:mt-8">
          <P>
            O tratamento de dados pessoais de candidatos se fundamenta nas seguintes bases legais
            da LGPD:
          </P>
          <Ul>
            <li>
              <strong>Interesse publico (Art. 7, III):</strong> base principal. Dados de candidatos
              e agentes publicos sao tratados para fins de transparencia e controle social,
              direito garantido pela Constituicao Federal.
            </li>
            <li>
              <strong>Dados tornados publicos pelo titular (Art. 7, IV):</strong> fotos, redes
              sociais e emails de campanha publicados pelos proprios candidatos.
            </li>
            <li>
              <strong>Dados sensiveis para politicas publicas (Art. 11, II, b):</strong> genero,
              cor/raca e estado civil, declarados ao TSE e relevantes para analise de
              representatividade.
            </li>
          </Ul>
        </div>
      </section>

      <SectionDivider />

      {/* 04 Fontes */}
      <section className="mx-auto max-w-7xl px-5 py-8 sm:py-12 md:px-12 lg:py-16">
        <SectionLabel>04</SectionLabel>
        <SectionTitle>Fontes dos dados</SectionTitle>
        <div className="mt-6 max-w-2xl space-y-5 sm:mt-8">
          <P>Todos os dados sao obtidos de fontes publicas oficiais:</P>
          <Ul>
            <li>Tribunal Superior Eleitoral (TSE)</li>
            <li>Camara dos Deputados (API de Dados Abertos)</li>
            <li>Senado Federal (API de Dados Abertos)</li>
            <li>Portal da Transparencia (CGU)</li>
            <li>Wikipedia e Wikidata (biografias e fotos)</li>
            <li>Google News (noticias via RSS publico)</li>
          </Ul>
          <P>
            Nao compramos, vendemos ou recebemos dados de fontes privadas.
          </P>
        </div>
      </section>

      <SectionDivider />

      {/* 05 Compartilhamento */}
      <section className="mx-auto max-w-7xl px-5 py-8 sm:py-12 md:px-12 lg:py-16">
        <SectionLabel>05</SectionLabel>
        <SectionTitle>Compartilhamento</SectionTitle>
        <div className="mt-6 max-w-2xl space-y-5 sm:mt-8">
          <P>
            Os dados sao armazenados no Supabase (banco de dados) e servidos pela Vercel (hosting).
            Ambos os provedores possuem certificacao SOC 2 Type II.
          </P>
          <P>
            Quando o envio de alertas por email esta habilitado, o Puxa Ficha tambem compartilha o
            endereco de email e o conteudo estritamente necessario da mensagem com o provedor de
            entrega transacional configurado para disparar confirmacoes e digests.
          </P>
          <P>
            Dados sensiveis como CPF sao bloqueados para acesso publico via controles de seguranca
            no banco (Row Level Security). Apenas o pipeline interno de ingestao tem acesso a esses
            campos.
          </P>
          <P>
            Nao compartilhamos dados com terceiros para fins comerciais, publicitarios ou de
            marketing.
          </P>
        </div>
      </section>

      <SectionDivider />

      {/* 06 Retencao */}
      <section className="mx-auto max-w-7xl px-5 py-8 sm:py-12 md:px-12 lg:py-16">
        <SectionLabel>06</SectionLabel>
        <SectionTitle>Retencao</SectionTitle>
        <div className="mt-6 max-w-2xl space-y-5 sm:mt-8">
          <P>
            Dados de historico politico, patrimonio, votacoes e projetos de lei sao mantidos
            permanentemente como registro historico.
          </P>
          <P>
            CPF de candidatos e dado publico por lei eleitoral (Lei 9.504/97) e e mantido
            permanentemente para cruzamento entre fontes. Nunca e exposto publicamente.
          </P>
          <P>
            Noticias sao mantidas por ate 12 meses apos a publicacao original.
          </P>
          <P>
            Dados de alertas por email sao mantidos enquanto houver assinaturas ativas ou ate o
            titular apagar o cadastro na area de gestao. Logs minimos de envio podem permanecer
            pelo tempo necessario para prevencao de abuso, auditoria e resolucao de falhas.
          </P>
        </div>
      </section>

      <SectionDivider />

      {/* 07 Uso de IA */}
      <section className="mx-auto max-w-7xl px-5 py-8 sm:py-12 md:px-12 lg:py-16">
        <SectionLabel>07</SectionLabel>
        <SectionTitle>Uso de inteligencia artificial</SectionTitle>
        <div className="mt-6 max-w-2xl space-y-5 sm:mt-8">
          <P>
            Parte dos alertas editoriais (pontos de atencao) e gerada ou estruturada com auxilio
            de inteligencia artificial. Quando a origem e automatizada, isso e identificado na
            interface. Pontos gerados por IA so entram na superficie publica depois de revisao
            humana, e o sistema mantem flags internas para distinguir itens verificados dos que
            ainda aguardam revisao adicional em ambiente interno.
          </P>
          <P>
            A IA nao e usada para recomendacao de voto, ranking automatico de candidatos ou
            decisao politica automatizada. A responsabilidade editorial continua sendo do projeto.
          </P>
        </div>
      </section>

      <SectionDivider />

      {/* 08 Direitos */}
      <section className="mx-auto max-w-7xl px-5 py-8 sm:py-12 md:px-12 lg:py-16">
        <SectionLabel>08</SectionLabel>
        <SectionTitle>Direitos do titular</SectionTitle>
        <div className="mt-6 max-w-2xl space-y-5 sm:mt-8">
          <P>
            Candidatos cujos dados sao tratados nesta plataforma podem exercer os direitos
            previstos na LGPD:
          </P>
          <Ul>
            <li>Confirmacao da existencia de tratamento</li>
            <li>Acesso aos dados pessoais tratados</li>
            <li>Correcao de dados incompletos, inexatos ou desatualizados</li>
            <li>Informacao sobre compartilhamento de dados</li>
            <li>Oposicao ao tratamento, quando aplicavel</li>
          </Ul>
          <P>
            Solicitacoes devem ser enviadas para{" "}
            <a
              href="mailto:privacidade@puxaficha.com.br"
              className="font-bold text-foreground underline decoration-foreground/20 underline-offset-2 hover:decoration-foreground/60"
            >
              privacidade@puxaficha.com.br
            </a>
            . O prazo de
            resposta e de ate 15 dias uteis, conforme Art. 18 da LGPD.
          </P>
          <P>
            Titulares inscritos nos alertas por email tambem podem cancelar assinaturas ou apagar
            seus dados diretamente pela pagina <strong>/alertas/gerenciar</strong>, acessada pelo
            link individual enviado por email.
          </P>
          <P>
            Dados de interesse publico sobre candidatos a cargos eletivos podem ter limitacoes
            ao direito de exclusao, conforme Art. 16, III da LGPD (tratamento pelo poder publico
            ou para fins de interesse publico).
          </P>
        </div>
      </section>

      <SectionDivider />

      {/* 09 Seguranca */}
      <section className="mx-auto max-w-7xl px-5 py-8 sm:py-12 md:px-12 lg:py-16">
        <SectionLabel>09</SectionLabel>
        <SectionTitle>Seguranca</SectionTitle>
        <div className="mt-6 max-w-2xl space-y-5 sm:mt-8">
          <P>Medidas de seguranca implementadas:</P>
          <Ul>
            <li>Row Level Security (RLS) no banco de dados para restringir acesso a dados sensiveis</li>
            <li>Separacao entre dados publicos (views) e dados completos (tabela base)</li>
            <li>Secrets e tokens gerenciados via variaveis de ambiente, nunca no codigo</li>
            <li>Deploy via Vercel com HTTPS obrigatorio</li>
            <li>Auditoria periodica de superficie publica e acessos</li>
          </Ul>
        </div>
      </section>

      <SectionDivider />

      {/* 10 Cookies */}
      <section className="mx-auto max-w-7xl px-5 py-8 sm:py-12 md:px-12 lg:py-16">
        <SectionLabel>10</SectionLabel>
        <SectionTitle>Cookies e rastreamento</SectionTitle>
        <div className="mt-6 max-w-2xl space-y-5 sm:mt-8">
          <P>
            O Puxa Ficha nao utiliza cookies de rastreamento, analytics de terceiros ou pixels de
            conversao. Quando o usuario ativa alertas, o navegador pode armazenar localmente um
            token tecnico de gestao e a lista das fichas acompanhadas para evitar novo login por
            email a cada visita.
          </P>
          <P>
            Esse armazenamento local nao e usado para publicidade comportamental nem para perfilacao
            comercial. Serve apenas para reconhecer o dispositivo que recebeu o link legitimo de
            gestao dos alertas.
          </P>
        </div>
      </section>

      <SectionDivider />

      {/* 11 Atualizacoes */}
      <section className="mx-auto max-w-7xl px-5 py-8 sm:py-12 md:px-12 lg:py-16">
        <SectionLabel>11</SectionLabel>
        <SectionTitle>Atualizacoes desta politica</SectionTitle>
        <div className="mt-6 max-w-2xl space-y-5 sm:mt-8">
          <P>
            Esta politica pode ser atualizada para refletir mudancas no tratamento de dados ou
            na legislacao. A data da ultima atualizacao e sempre indicada no inicio do documento.
          </P>
        </div>
      </section>

      <Footer />
    </div>
  )
}
