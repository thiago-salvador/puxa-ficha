# Critério editorial: processos judiciais (2026-08-05)

Este documento responde duas perguntas que a coluna `processos` deixava em
aberto: por que não existe coleta automatizada, e quem recebe busca ativa
manual. Ele acompanha a mudança de comunicação na ficha feita na mesma data
(ver "O que a ficha diz" abaixo).

## O que existe hoje

- 30 linhas em `public.processos`, cobrindo 21 candidatos (parte deles
  arquivados), todas de verificação manual: STF, MP-RJ, ALEMA, Justiça
  Federal/TRF3 e imprensa com processo nomeado.
- Nenhum ingest automático alimenta a tabela. A fonte
  `processos-curadoria` registra no `coleta_log` se a revisão manual foi feita,
  sem se apresentar como pipeline automático.
- Consequência honesta: para a maioria das fichas, zero processos significa
  "ninguém verificou", não "verificado e limpo".

## Por que não há coleta automatizada (avaliação DataJud/CNJ, 2026-08-05)

Avaliado com chamada real à API Pública do DataJud
(`api-publica.datajud.cnj.jus.br/api_publica_{tribunal}/_search`, APIKey
pública do CNJ):

1. **A API não expõe as partes do processo.** O documento retornado traz
   `numeroProcesso`, `classe`, `orgaoJulgador`, `assuntos`, `movimentos`,
   `nivelSigilo`, datas. Não há nome de parte nem CPF (política de dados do
   CNJ na API pública, alinhada à LGPD). Portanto **não existe a consulta
   "processos da pessoa X"**: só se consulta o que já se tem por número.
2. **As alternativas de busca por nome são o vetor de homônimo.** Consultas
   processuais por nome (e-SAJ, PJe, portais de tribunal) são por tribunal,
   atrás de captcha, e casam por nome, exatamente o que este projeto proíbe
   em toda fonte estruturada (regra do `tse-resolver`: nome sozinho nunca
   casa). Processo de homônimo publicado numa ficha eleitoral é acusação
   falsa contra pessoa real, a pior classe de erro do projeto.
3. **Decisão: não implementar coleta automatizada.** O DataJud serve como
   fonte de **conferência** (dado um número CNJ, confirmar classe, órgão e
   movimentação), e é útil exatamente nesse papel dentro da busca ativa
   manual descrita abaixo.

## O que a ficha diz (implementado em 2026-08-05)

- A seção Justiça com zero processos deixou de dizer "Nenhum processo
  encontrado ... nas bases consultadas" (afirmava consulta que não houve).
  Agora diz que a busca ativa ainda não foi feita para aquela ficha e que a
  ausência de registros **não significa ficha limpa**.
- O card "Processos" do overview mostra "—" com a legenda "não verificado"
  quando a contagem é zero, em vez de um "0" que afirmava ficha limpa. O
  atributo `data-pf-overview-raw` segue com o número cru.
- O rótulo da seção omite "(0)": zero ali é ausência de verificação, não
  contagem apurada.
- O comparador (`ComparadorPanel`) segue a mesma régua: a tabela e a linha
  "Processos" da comparação usam `processosOverviewDisplay`, mostrando "—" com
  a legenda "não verificado" quando a contagem é zero. A lista compacta e o
  `aria-label` do botão dizem "processos não verificados" em vez de "0
  processos", para o leitor de tela ouvir a mesma coisa que a tela mostra.
  O atributo `data-pf-comparador-processos` continua com o valor cru, e o
  destaque "maior" segue calculado sobre os números crus.
- O skeleton da ficha deferida (`CandidatoProfileSkeleton`) também renderiza a
  legenda: sem ela, o "—" aparecia sozinho na primeira pintura e reintroduzia
  a afirmação de ficha limpa durante o carregamento.

## Quem recebe busca ativa manual (ordem de prioridade)

1. **Presidenciáveis** (cabeças de chapa ao Planalto): todos, sempre.
2. **Quem já chefiou Executivo** (governador, prefeito, ministro de Estado)
   e disputa governo estadual: gestão pública implica exposição a ações de
   improbidade e contas julgadas; a ausência precisa ser verificada, não
   presumida.
3. **Busca dirigida por menção existente**: candidato com ponto de atenção,
   notícia no site ou fato noticiado que cite investigação, ação ou
   condenação. A menção obriga a localizar o processo (número CNJ ou fonte
   oficial) antes de o ponto ir ao ar como verificado.
4. **Report de leitor com número de processo**: conferência obrigatória em
   fonte oficial (tribunal ou DataJud pelo número) antes de qualquer
   publicação.

Fora dessas faixas, a ficha permanece com o estado honesto de "não
verificado". Cobrir 194 fichas com busca manual de qualidade não é viável, e
fingir cobertura seria pior que declarar o limite.

## Regras de identidade e publicação (valem para toda busca ativa)

- Só se publica processo com **número CNJ** ou com fonte oficial que nomeie a
  pessoa de forma inequívoca (nome completo + cargo/contexto), sempre com URL
  pública (gate da migration `20260725160000` para gravidade alta/crítica).
- Nome sozinho nunca identifica: conferir contra cargo, UF, partido e
  trajetória antes de atribuir.
- Processo de terceiro homônimo descoberto no caminho é descartado com
  registro no texto da revisão, não silenciosamente.
- **Vazio verificado deixa rastro**: quando a busca ativa termina sem achado,
  use `npm run data:curadoria:registrar`. O resultado `vazio_confirmado` só é
  aceito quando o detalhe traz `órgãos`, `jurisdição`, `período` e `termos` da
  busca. As URLs consultadas e a prova de identidade também são obrigatórias.
  O registro diz que não houve processo naquele escopo. Ele não promete uma
  busca universal.
- O comando exige slug válido e aceita identidade por `id-oficial` ou
  `cargo-e-uf`, sempre com URL. Nome sozinho é recusado. Um resultado
  `encontrado` exige uma URL marcada como `--evidencia-publicavel`, além de
  constar em `--url`.
- O padrão é dry-run. `--apply` grava apenas em `coleta_log`; processos e outros
  dados de candidato continuam fora do escopo do comando.
