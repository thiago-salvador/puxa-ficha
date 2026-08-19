import type { Metadata } from "next"
import { SectionLabel, SectionTitle, SectionDivider } from "@/components/SectionHeader"
import { Footer } from "@/components/Footer"
import { buildTwitterMetadata } from "@/lib/metadata"

const title = "Política de Privacidade | Puxa Ficha"
const description =
  "Como o Puxa Ficha trata dados pessoais, bases legais, direitos do titular e contato do encarregado."
const image = "/opengraph-image"

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
    type: "website",
    images: [
      {
        url: image,
        width: 1200,
        height: 630,
        alt: "Política de Privacidade | Puxa Ficha",
      },
    ],
  },
  twitter: buildTwitterMetadata({
    title,
    description,
    image,
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
            Esta política descreve como o Puxa Ficha trata dados pessoais e quais medidas adota para
            observar a Lei Geral de Proteção de Dados (LGPD, Lei 13.709/2018).
          </P>
          <P>
            Última atualização: 21 de maio de 2026.
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
            O Puxa Ficha é um projeto pessoal de Thiago Salvador, responsável pelas decisões sobre
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
            O Puxa Ficha trata dados públicos de candidatos e agentes políticos relacionados às
            eleições brasileiras de 2026. Quando um visitante opta por receber alertas por email
            sobre fichas acompanhadas, também tratamos dados mínimos necessários para esse serviço,
            sem criar conta ou login tradicional.
          </P>
          <P>Dados dos candidatos incluem:</P>
          <Ul>
            <li>Nome, nome de urna, foto, data de nascimento, naturalidade</li>
            <li>Partido, cargo atual e disputado, histórico político</li>
            <li>Patrimônio declarado ao TSE</li>
            <li>
              Financiamento de campanha e doadores (dados públicos do TSE). Quando a prestação de
              contas trouxer identificação, podemos armazenar CNPJ do doador (número já público na
              declaração) e um identificador técnico derivado por hash para pessoa física, sem guardar
              o CPF do doador em claro no JSON público da ficha. A API pública de ficha expõe apenas
              campos necessários para a interface pública e não publica identificadores fiscais crus de doadores.
            </li>
            <li>Votações em plenário e projetos de lei</li>
            <li>Gastos parlamentares (CEAP)</li>
            <li>Processos judiciais públicos</li>
            <li>Sanções administrativas (CEIS, CNEP, TCU)</li>
            <li>Notícias de fontes públicas</li>
            <li>Gênero, cor/raça e estado civil (declarados ao TSE)</li>
            <li>CPF (usado apenas internamente para cruzamento de fontes, nunca exposto publicamente)</li>
          </Ul>
          <P>Quando você ativa alertas por email, tratamos apenas o mínimo necessário:</P>
          <Ul>
            <li>Email informado no formulário de acompanhamento</li>
            <li>Hash do IP do consentimento e timestamp de confirmação</li>
            <li>Hashes técnicos de tokens de verificação e gestão</li>
            <li>Lista de fichas acompanhadas e histórico básico de envio dos digests</li>
          </Ul>
          <P>
            Também registramos eventos operacionais de uso do site. Cada evento guarda um hash
            salgado do endereço de IP, que existe apenas como limite anti-abuso das rotas públicas.
            O IP em claro nunca é armazenado, e o hash é separado por rota, de modo que o valor
            gravado não identifica a pessoa nem permite ligar o mesmo visitante entre superfícies
            diferentes. O detalhamento está na seção 10 e o prazo de descarte, na seção 06.
          </P>
        </div>
      </section>

      <SectionDivider />

      {/* 03 Base legal */}
      <section className="mx-auto max-w-7xl px-5 py-8 sm:py-12 md:px-12 lg:py-16">
        <SectionLabel>03</SectionLabel>
        <SectionTitle>Base legal</SectionTitle>
        <div className="mt-6 max-w-2xl space-y-5 sm:mt-8">
          <P>
            O tratamento de dados pessoais de candidatos se apoia nas bases legais que o projeto
            entende aplicáveis ao contexto de informação pública, transparência cívica e serviços
            solicitados pelo usuário, sempre com minimização, identificação de fontes e canal de
            correção.
          </P>
          <Ul>
            <li>
              <strong>Dados tornados manifestamente públicos pelo titular ou por fonte oficial:</strong>{" "}
              dados publicados em bases oficiais, registros eleitorais, mandatos, prestações de contas
              e canais públicos do próprio agente político podem ser tratados para finalidade
              informativa, resguardados os direitos do titular e os princípios da LGPD.
            </li>
            <li>
              <strong>Legítimo interesse e transparência cívica:</strong> quando aplicável, o
              tratamento busca organizar informação pública relevante para controle social e debate
              democrático, sem venda de dados, segmentação comercial ou publicidade comportamental.
            </li>
            <li>
              <strong>Consentimento para alertas por email:</strong> o envio de confirmação, gestão
              de assinatura e digest depende de ação do usuário e pode ser cancelado pelos links de
              gestão ou pelo contato de privacidade.
            </li>
            <li>
              <strong>Dados sensíveis:</strong> atributos como filiação partidária, cor/raça, gênero
              ou convicções políticas só são exibidos quando estiverem ligados ao contexto eleitoral
              ou institucional, vierem de fonte pública identificada e forem necessários à finalidade
              informativa. Se a base, a finalidade ou a fonte não forem suficientes, o dado deve ser
              ocultado, corrigido ou removido.
            </li>
          </Ul>
          <P>
            Esta política é informativa e não substitui parecer jurídico. Pedidos de revisão,
            oposição ou correção serão analisados caso a caso.
          </P>
        </div>
      </section>

      <SectionDivider />

      {/* 04 Fontes */}
      <section className="mx-auto max-w-7xl px-5 py-8 sm:py-12 md:px-12 lg:py-16">
        <SectionLabel>04</SectionLabel>
        <SectionTitle>Fontes dos dados</SectionTitle>
        <div className="mt-6 max-w-2xl space-y-5 sm:mt-8">
          <P>
            Os dados usados pelo produto vêm de fontes públicas, incluindo bases oficiais e fontes
            complementares identificadas.
          </P>
          <P>Bases oficiais consultadas:</P>
          <Ul>
            <li>Tribunal Superior Eleitoral (TSE)</li>
            <li>Câmara dos Deputados (API de Dados Abertos)</li>
            <li>Senado Federal (API de Dados Abertos)</li>
            <li>Portal da Transparência (CGU)</li>
            <li>
              Indicadores consolidados por estado: IBGE (API SIDRA), Ipeadata, Atlas da Violência
              (Ipea), INEP (IDEB), Tesouro Nacional (CAPAG e demonstrativos Siconfi/Data Lake).
            </li>
          </Ul>
          <P>Fontes públicas complementares, quando aplicável:</P>
          <Ul>
            <li>Wikipedia e Wikidata (biografias, fotos e dados complementares)</li>
            <li>Google News (notícias via RSS público)</li>
            <li>Jarbas/Serenata de Amor (sinais públicos sobre gastos parlamentares)</li>
          </Ul>
          <P>
            Não compramos, vendemos ou recebemos dados de fontes privadas.
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
            Os dados são armazenados no Supabase (banco de dados) e servidos pela Vercel (hosting).
            Ambos os provedores possuem certificação SOC 2 Type II.
          </P>
          <P>
            Quando o envio de alertas por email está habilitado, o Puxa Ficha também compartilha o
            endereço de email e o conteúdo estritamente necessário da mensagem com o provedor de
            entrega transacional configurado para disparar confirmações e digests.
          </P>
          <P>
            Dados sensíveis como CPF são bloqueados para acesso público via controles de segurança
            no banco (Row Level Security). Apenas o pipeline interno de ingestão tem acesso a esses
            campos.
          </P>
          <P>
            A superfície pública também aplica um DTO de ficha com lista explícita de campos
            permitidos e sanitização de sequências numéricas com formato de documento em descrições
            patrimoniais.
          </P>
          <P>
            Não compartilhamos dados com terceiros para fins comerciais, publicitários ou de
            marketing.
          </P>
        </div>
      </section>

      <SectionDivider />

      {/* 06 Retenção */}
      <section className="mx-auto max-w-7xl px-5 py-8 sm:py-12 md:px-12 lg:py-16">
        <SectionLabel>06</SectionLabel>
        <SectionTitle>Retenção</SectionTitle>
        <div className="mt-6 max-w-2xl space-y-5 sm:mt-8">
          <P>
            Dados de histórico político, patrimônio, votações e projetos de lei são mantidos
            permanentemente como registro histórico.
          </P>
          <P>
            CPF de candidatos é dado público por lei eleitoral (Lei 9.504/97) e é mantido
            permanentemente para cruzamento entre fontes. Nunca é exposto publicamente.
          </P>
          <P>
            Notícias são mantidas por até 12 meses após a publicação original.
          </P>
          <P>
            Dados de alertas por email são mantidos enquanto houver assinaturas ativas ou até o
            titular apagar o cadastro na área de gestão. Logs mínimos de envio podem permanecer
            pelo tempo necessário para prevenção de abuso, auditoria e resolução de falhas.
          </P>
          <P>
            Eventos operacionais de uso do site, que guardam apenas um código derivado do endereço
            de IP para conter abuso e nunca o IP em si, são apagados após 90 dias. O descarte roda
            automaticamente, uma vez por dia.
          </P>
        </div>
      </section>

      <SectionDivider />

      {/* 07 Uso de IA */}
      <section className="mx-auto max-w-7xl px-5 py-8 sm:py-12 md:px-12 lg:py-16">
        <SectionLabel>07</SectionLabel>
        <SectionTitle>Uso de inteligência artificial</SectionTitle>
        <div className="mt-6 max-w-2xl space-y-5 sm:mt-8">
          <P>
            Parte dos destaques editoriais (pontos de atenção) é gerada ou estruturada com auxílio
            de inteligência artificial. Quando a origem é automatizada, isso é identificado na
            interface. Pontos gerados por IA só entram na superfície pública depois de checagem
            editorial por fonte, e o sistema mantém flags internas para distinguir itens já
            checados dos que ainda aguardam verificação adicional em ambiente interno.
          </P>
          <P>
            A IA não é usada para recomendar voto, sugerir candidato, ranquear candidatos, priorizar
            campanhas ou tomar decisão política automatizada. O quiz, quando exibido, mostra
            candidatos em ordem alfabética e usa regras determinísticas documentadas para apresentar
            sinais comparáveis. A responsabilidade editorial continua sendo do projeto.
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
            Candidatos cujos dados são tratados nesta plataforma podem exercer os direitos
            previstos na LGPD:
          </P>
          <Ul>
            <li>Confirmação da existência de tratamento</li>
            <li>Acesso aos dados pessoais tratados</li>
            <li>Correção de dados incompletos, inexatos ou desatualizados</li>
            <li>Informação sobre compartilhamento de dados</li>
            <li>Oposição ao tratamento, quando aplicável</li>
          </Ul>
          <P>
            Solicitações de privacidade e exercício de direitos devem ser enviadas para{" "}
            <a
              href="mailto:privacidade@puxaficha.com.br"
              className="font-bold text-foreground underline decoration-foreground/20 underline-offset-2 hover:decoration-foreground/60"
            >
              privacidade@puxaficha.com.br
            </a>
            . O prazo de
            resposta é de até 15 dias úteis, conforme Art. 18 da LGPD.
          </P>
          <P>
            Para pedir retificação de uma ficha pública, envie para esse mesmo canal o link da
            ficha, o trecho questionado e a fonte oficial ou documento que sustenta a correção.
            Use o assunto <strong>Retificação de ficha</strong> para facilitar a triagem.
          </P>
          <P>
            Titulares inscritos nos alertas por email também podem cancelar assinaturas ou apagar
            seus dados diretamente pela página <strong>/alertas/gerenciar</strong>, acessada pelo
            link individual enviado por email.
          </P>
          <P>
            Dados de interesse público sobre candidatos a cargos eletivos podem ter limitações
            ao direito de exclusão, conforme Art. 16, III da LGPD (tratamento pelo poder público
            ou para fins de interesse público).
          </P>
        </div>
      </section>

      <SectionDivider />

      {/* 09 Segurança */}
      <section className="mx-auto max-w-7xl px-5 py-8 sm:py-12 md:px-12 lg:py-16">
        <SectionLabel>09</SectionLabel>
        <SectionTitle>Segurança</SectionTitle>
        <div className="mt-6 max-w-2xl space-y-5 sm:mt-8">
          <P>Medidas de segurança implementadas:</P>
          <Ul>
            <li>Row Level Security (RLS) no banco de dados para restringir acesso a dados sensíveis</li>
            <li>Separação entre dados públicos (views) e dados completos (tabela base)</li>
            <li>Secrets e tokens gerenciados via variáveis de ambiente, nunca no código</li>
            <li>Deploy via Vercel com HTTPS obrigatório</li>
            <li>Auditoria periódica de superfície pública e acessos</li>
          </Ul>
        </div>
      </section>

      <SectionDivider />

      {/* 10 Cookies e analytics */}
      <section className="mx-auto max-w-7xl px-5 py-8 sm:py-12 md:px-12 lg:py-16">
        <SectionLabel>10</SectionLabel>
        <SectionTitle>Cookies, analytics e observabilidade</SectionTitle>
        <div className="mt-6 max-w-2xl space-y-5 sm:mt-8">
          <P>
            O Puxa Ficha não usa cookies publicitários, pixels de conversão nem perfilação
            comercial. O site usa apenas ferramentas operacionais e de medição agregada:
          </P>
          <Ul>
            <li>
              <strong>Cloudflare Web Analytics:</strong> medição agregada de páginas visitadas via
              beacon no navegador, sem cookies persistentes de identificação pessoal. Fornece
              contagens agregadas de tráfego por rota, país e aparelho, sem mapear indivíduos.
            </li>
            <li>
              <strong>Eventos operacionais:</strong> registramos interações mínimas para medir
              uso do produto, como clique em candidato, início de comparação, conclusão do quiz,
              clique em fonte externa e busca sem resultado. Cada evento guarda contagens, tipo de
              superfície, domínio da fonte externa e um hash salgado do endereço de IP, usado
              exclusivamente como limite anti-abuso da rota. O IP em claro nunca é armazenado, o
              hash é separado por rota para que o mesmo visitante não seja correlacionável entre
              superfícies, e esses registros são apagados após 90 dias, conforme a seção 06. Os
              eventos <strong>não incluem</strong>{" "}
              termo digitado, URL completa, nome do candidato, slug, email, token ou resposta do quiz.
            </li>
            <li>
              <strong>Sentry (observabilidade de erros):</strong> captura de falhas de runtime no
              front e no back com scrubbing automático de tokens sensíveis em URL, breadcrumbs e
              tags (campos como <code>token</code>, <code>verifyToken</code>,{" "}
              <code>manageToken</code>, <code>previewToken</code>, <code>bypass</code>,{" "}
              <code>secret</code>, <code>email</code> são substituídos por{" "}
              <code>[REDACTED]</code> antes do envio).
            </li>
          </Ul>
          <P>
            Esses serviços <strong>não recebem CPF, email, senhas, tokens de verificação nem
            conteúdo de formulário</strong>. Não compartilhamos dados de visitantes com redes de
            anúncios nem com plataformas de perfilação comercial.
          </P>
          <P>
            Quando o usuário ativa alertas por email, o navegador pode armazenar localmente um
            token técnico de gestão e a lista das fichas acompanhadas para evitar novo login por
            email a cada visita. Esse armazenamento local não é usado para publicidade
            comportamental nem para perfilação comercial. Serve apenas para reconhecer o
            dispositivo que recebeu o link legítimo de gestão dos alertas.
          </P>
        </div>
      </section>

      <SectionDivider />

      {/* 11 Atualizações */}
      <section className="mx-auto max-w-7xl px-5 py-8 sm:py-12 md:px-12 lg:py-16">
        <SectionLabel>11</SectionLabel>
        <SectionTitle>Atualizações desta política</SectionTitle>
        <div className="mt-6 max-w-2xl space-y-5 sm:mt-8">
          <P>
            Esta política pode ser atualizada para refletir mudanças no tratamento de dados ou
            na legislação. A data da última atualização é sempre indicada no início do documento.
          </P>
        </div>
      </section>

      <Footer />
    </div>
  )
}
