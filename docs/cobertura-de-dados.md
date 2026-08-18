# Cobertura de dados: como medir, e por que só de um jeito

Quanto de cada ficha está preenchido. Uma medida só, um comando só.

```bash
npm run audit:cobertura
```

Sai um HTML em `~/.disposable-html/AAAA-MM-DD-puxa-ficha-cobertura-dados.descartavel.html`,
o snapshot que o alimentou num `.json` irmão, e as páginas de revisão em
`revisao/` ao lado.

## Readback público Fase 4 aposentado

O workflow manual `Readback público Fase 4` foi aposentado em 15/08/2026. Ele
auditava o snapshot fixo de 194 fichas, universo extinto pela Onda P, e não deve
ser usado como gate corrente.

A função de prova foi absorvida pelo QA de três camadas e pelo readback por
estado da Onda G. A régua continua sendo redescoberta a partir do universo
publicável atual, sem converter 194 em constante nem perder as provas de banco,
API/DTO e superfície renderizada.

## Por que este documento existe

Em 04/08/2026 duas medidas de cobertura conviveram e discordaram, e a discordância
virou alarme de regressão que não existia. Uma página montada à mão fora do repo
contou os **280 registros da tabela crua** em vez dos **194 publicáveis**, e cobrou
as três posições do quiz de **181 candidatos a Governador**, sendo que o quiz é
presidencial. Nenhuma das duas coisas era regressão de dado: eram réguas
diferentes medindo coisas diferentes e chamando as duas de "cobertura".

A regra que sai daí é curta: **número de cobertura que não vem de
`npm run audit:cobertura` não é número de cobertura.** Página, planilha ou
consulta avulsa que meça o mesmo é derivada, precisa dizer isso no topo, e perde
para o script em caso de conflito. Duas réguas geram dois vocabulários, e a
diferença entre eles é indistinguível de regressão para quem lê.

## O que a régua mede

Mede **o que o leitor vê em puxaficha.com.br**, não o que existe no banco. Onde
os dois divergem, vale a superfície pública.

**Universo: só os publicáveis.** A entrada é a view `candidatos_publico`, não a
tabela `candidatos`. Hoje são 194 de 280: as outras 86 são desistentes, removidos
e pré-candidatos ainda não publicados. Contá-las infla lacuna com gente fora da
corrida.

**Quiz: só os presidenciáveis.** A coluna "Posições (quiz)" é `x/3`, um por tema
do quiz, e vale só para quem disputa a Presidência. Para os outros 183 a célula é
`n/a`, não lacuna. O quiz não pergunta nada a candidato a Governador, então
posição faltando ali não é buraco. Vale também o filtro do próprio quiz: só conta
posição com `verificado = true`, porque é o que `src/lib/api.ts` consome. Posição
gravada e não revisada não vai ao ar, e por isso não vira verde: vira item na
coluna "Aguardando aprovação".

### Patrimônio por eleição aplicável

Até 07/08/2026 a célula de patrimônio media por PRESENÇA: qualquer bem publicado
dava "ok", e com isso escondia eleições aplicáveis sem dado. Caso real que motivou
a mudança: `rui-costa-pimenta` tem bens de 2006 e 2010 publicados, mas a eleição
de 2014, confirmada sem bens no pacote oficial do TSE, não aparecia em lugar
nenhum; e candidaturas de 2018/2022 sem coleta contavam como ficha completa.

Agora a coluna mede **cobertos sobre aplicáveis**, por eleição:

- **Eleições aplicáveis**: anos a partir de 2006 (janela da série `bem_candidato`
  dos dados abertos do TSE; antes disso não há pacote oficial para confirmar dado
  nem ausência), vindos de três fontes em união deduplicada: o histórico político
  com proveniência `tse` (cujo `periodo_inicio` é o ano da eleição), os anos com
  bem publicado e os anos com ausência oficial confirmada.
- **Por ano, o estado é um de três:**

| Estado | Significado |
|---|---|
| Publicado | Há bem declarado na tabela `patrimonio` para aquela eleição. |
| Vazio confirmado | O pacote oficial `bem_candidato` daquele ano foi lido de ponta a ponta e não traz bens para o SQ_CANDIDATO. Registrado na tabela `patrimonio_ausencia_oficial`. Não é zero fabricado: é a confirmação, com fonte e data, de que a fonte oficial não tem registro para aquele pleito. |
| Lacuna | Eleição aplicável sem dado nem confirmação. É o que a célula cobra. |

A célula é `ok` quando não há lacuna, `partial` quando há publicado e lacuna, e
`missing` quando nada foi publicado e há eleição aplicável. O rótulo mostra a
conta (cobertos/aplicáveis) e quantas ausências confirmadas entram nela. Quem
declarou ao TSE mas não tem nenhuma eleição aplicável na janela (ex.: carreira
só anterior a 2006) sai como `n/a`, não como lacuna. **Evolução patrimonial e
bens ano a ano continuam medindo apenas o conjunto publicado**: a régua por
eleção muda a célula de patrimônio, não o denominador delas.

**2026 fica de fora até o snapshot do TSE estabilizar.** Nenhuma ausência de
2026 é registrada enquanto os pacotes oficiais estão em andamento (registros em
aberto), e candidatura de 2026 ainda não tem registro no histórico com
proveniência `tse`. Quando o TSE publicar o snapshot definitivo, a janela passa
a cobrir 2026 pelos mesmos três caminhos.

O relatório funciona em banco **sem** a tabela `patrimonio_ausencia_oficial`
(migration ainda não aplicada, banco novo, fork): o bloco que lê a tabela é
removido do SQL antes do envio (mesmo mecanismo do bloco de `coleta`), o
snapshot sai sem a chave e o leitor normaliza para lista vazia. Ausência de
prova não vira prova de ausência: sem a tabela, toda eleição aplicável sem dado
conta como lacuna, que é o lado conservador do erro.

**Índice de preenchimento: 15 colunas.** Entram foto, bio, redes sociais, dados
pessoais, patrimônio, evolução patrimonial, bens ano a ano, financiamento,
doadores detalhados, votações-chave, projetos de lei, cota parlamentar,
legislação do Executivo, notícias e posições. Ficam **fora** as oito colunas de
achado: cargos ocupados, histórico partidário, contradições, processos, alertas,
sanções, projetos em destaque e itens aguardando aprovação.

O motivo é o mesmo para todas: **elas medem o mundo, não o nosso esforço.** Um
governador sem nenhuma sanção administrativa não tem ficha pior que a de um com
cinco; contar sanção como preenchimento premiaria quem tem mais problema. Projeto
em destaque é curadoria editorial, e item a revisar é fila de trabalho: nenhum dos
dois é dado do candidato. Por isso existe ficha com 100% de preenchimento e célula
amarela de destaque, e isso está certo.

## Verificado e vazio, ou nunca coletado

As seis colunas de zero (cargos, partidos, contradições, processos, alertas,
sanções) carregam um traço colorido embaixo, lido da última tentativa registrada
em `coleta_log`:

| Traço | Significado |
|---|---|
| Verde | A fonte foi consultada e respondeu vazio. Único caso em que o zero afirma algo. |
| Âmbar | Nenhuma tentativa registrada. O zero não quer dizer nada. |
| Vermelho | A tentativa foi inconclusiva. Não fecha cobertura. |
| Azul | A curadoria terminou sem achado no escopo declarado. Não prova ausência absoluta. |
| Cinza | Não existe ingest automático para a coluna. |
| Sem traço | Este relatório não leu o log de coleta. |

A regra é conservadora: só vira verde quando **todas** as fontes daquela coluna
responderam. Uma fonte não consultada rebaixa o veredito, porque pode ser
justamente a que tinha o dado. O mapa coluna → fonte está em `FONTES_POR_COLUNA`
(`scripts/audit/lib/coleta-proveniencia.ts`) e sai de quem escreve em cada tabela, não
de suposição.

A ausência de linha no log é o dado mais importante, mas só representa "nunca
verificado" quando a fonte é aplicável ao candidato. No eixo por fonte, Câmara e
Jarbas viram `N/A` sem ID oficial nem mandato de deputado federal; Senado e CEAPS
viram `N/A` sem ID oficial nem mandato de senador. O histórico funciona como
segunda prova para não esconder um ID ausente no seed. Se houver tentativa
registrada, o desfecho real sempre prevalece sobre essa inferência.

Há uma diferença deliberada entre *o log não foi lido* (procedência
desconhecida), *a fonte não se aplica* (`N/A`) e *o log foi lido, a fonte se
aplica e este candidato não tem tentativa* (nunca verificado). Colapsar esses
casos repõe exatamente o bug que a tabela veio corrigir.

O relatório funciona em banco **sem** `coleta_log`: a leitura é opcional e, sem a
tabela, todo zero sai com procedência não lida. Detalhe do vocabulário de
`resultado` na migration `coleta_log_tentativa_por_fonte`.

### Curadoria manual de processos e contradições

As fontes `processos-curadoria` e `contradicoes-curadoria` também escrevem em
`coleta_log`, mas continuam marcadas como curadoria, não como ingest automático.
O comando seguro é:

```bash
npm run data:curadoria:registrar -- \
  --slug=<slug> --frente=<processos|contradicoes> --data=AAAA-MM-DD \
  --resultado=<resultado> --detalhe="<detalhe>" \
  --identidade=<id-oficial|cargo-e-uf> \
  --identidade-url=<url também listada em --url> \
  --url=<url consultada>
```

O padrão é dry-run. A escrita exige `--apply`. O comando valida o slug na view
`candidatos_publico`, exige fonte pública, rejeita nome sozinho como prova de
identidade e não aceita `encontrado` sem `--evidencia-publicavel=<url>`. Toda URL
de identidade ou evidência precisa constar também entre as URLs consultadas.

Para processos, `vazio_confirmado` só é aceito quando `--detalhe` declara quatro
campos não vazios, separados por ponto e vírgula: `órgãos`, `jurisdição`,
`período` e `termos`. Para contradições, `vazio_confirmado` é proibido. Use
`sem_achado_no_escopo`, que aparece no relatório como "curadoria concluída sem
achado no escopo". Uma execução `indeterminado` continua como "tentativa
inconclusiva" e não fecha cobertura.

## Eixo por fonte, por candidato

Cada seção de estado mantém a tabela de cobertura e acrescenta uma segunda
tabela: uma linha por fonte e candidato, com desfecho, volume, data da última
tentativa e detalhe. As fontes não consultadas aparecem primeiro dentro de cada
candidato.

A lista-base vem das fontes de escopo `candidato` em `scripts/lib/coleta-log.ts`,
mais `tse-cpf`, que já existe em `coleta_log_ultima` e é obrigatório nesta visão.
Fonte adicional efetivamente registrada no log também aparece naquele candidato.
Ela não é projetada como lacuna para os demais enquanto não entrar no catálogo
canônico. Fontes territoriais ficam fora, porque o alvo delas é a UF ou um
agregado estatístico.

Este eixo não cria estado de célula nem altera o índice. A régua das 23 frentes
continua inteira em `coverage-model.ts`; a visão por fonte só expõe o mesmo
objeto `coleta` que já acompanha cada candidato no snapshot.

## Acesso ao banco

O snapshot é SQL rodado contra produção em **modo somente leitura**. O transporte
é a Management API do Supabase (`/v1/projects/:ref/database/query`), a mesma que o
MCP do Supabase usa, sempre com `read_only: true` — o servidor abre a transação
em modo somente leitura e recusa escrita, então o caminho não consegue tocar em
produção nem por engano.

A credencial é o **Personal Access Token** (`sbp_…`), não a service role key:

1. `SUPABASE_ACCESS_TOKEN` no ambiente, se estiver definida (é a variável oficial
   do CLI, e é o caminho para CI ou outra máquina);
2. senão, no macOS, o token que `supabase login` já guardou no Keychain.

Se as duas faltarem, o script diz o que fazer. Rode `supabase login` uma vez.

**A API REST do projeto não serve aqui.** `SUPABASE_URL` + service role key é
PostgREST: expõe tabelas e RPCs declaradas, não SQL arbitrário, e responde 403 a
um token de CLI. Foi o beco que travou o relatório entre 02 e 04/08.

Para rodar sem tocar a rede (teste, máquina sem credencial, reexecutar o desenho):

```bash
tsx scripts/audit/coverage-report.ts --from-snapshot=caminho/do/snapshot.json
```

## Arquivos

| Arquivo | Papel |
|---|---|
| `scripts/audit/coverage-snapshot.sql` | Os fatos, incluindo o campo `coleta` de cada candidato, a proveniência de cada linha do histórico e as ausências oficiais de patrimônio (`patrimonioAusenciasOficiais`). Uma linha, uma coluna `snapshot` com o array inteiro. |
| `scripts/audit/lib/coleta-proveniencia.ts` | Mapa coluna → fontes e veredito da procedência do zero. Lógica pura. |
| `scripts/audit/lib/coverage-model.ts` | A régua: cinco estados de célula, aplicabilidade, patrimônio por eleição aplicável, índice. Lógica pura. |
| `scripts/audit/lib/snapshot-fetch.ts` | Transporte e credencial. Não interpreta nada, mas remove os blocos opcionais de `coleta` e de ausências oficiais de patrimônio quando o banco não tem a view/tabela. |
| `scripts/audit/coverage-report.ts` | Monta e desenha. |
| `scripts/audit/check-report.ts` | `npm run audit:cobertura:check`, confere o relatório. |
| `scripts/registrar-revisao-curadoria.ts` | Valida e registra a revisão manual; dry-run por padrão. |

A divisão importa: o `.sql` é a **única** descrição dos fatos. Em 02/08 existia um
segundo caminho que lia o banco pelo supabase-js e reimplementava em JS as janelas
e uniões da régua; foi removido porque manter as duas versões em sincronia era
convite a duas verdades. `snapshot-fetch.ts` não reabre esse caminho: ele lê o
`.sql` como texto e manda o banco executar.

## Limitações conhecidas

**Histórico incompleto gera falso "não se aplica".** A aplicabilidade sai do
histórico político registrado no próprio site. Quem teve mandato que o banco não
conhece aparece como "não se aplica" onde deveria aparecer como lacuna. Está
escrito na própria página do relatório.

**`cargo_canonico` com o prefixo "Candidatura a X" não casa com a lista de cargos
eletivos.** `CARGOS_ELETIVOS` lista `Vereador`, `Deputado Estadual` e afins; o
banco tem 185 linhas de histórico em 66 fichas publicáveis escritas como
`Candidatura a Vereador`. Para quem só tem eventos nessa forma, `declarouAoTse`
dá falso, e patrimônio e financiamento saem como "não se aplica" em vez de
lacuna real. Hoje isso atinge **uma** ficha (`jarbas-soares`), porque as outras 32
são salvas pelo `SQ_CANDIDATO` do seed. O número cresce conforme entrar ficha nova
sem SQ no seed.

**A coluna Foto mede presença, não qualidade.** `foto_url is not null` e pronto.
Não distingue arquivo nosso em `public/candidates` de foto de terceiro (Wikimedia,
Câmara, Senado, TSE), nem enxerga resolução abaixo do slot de 562x750. Hoje 120
das 194 fichas usam foto de terceiro e 12 usam arquivo nosso em resolução baixa, e
as 132 aparecem como preenchidas.

**A coluna Dados pessoais mede 4 dos 7 campos de identidade** da view pública:
idade, naturalidade, formação e profissão. Ficam de fora gênero, estado civil e
cor/raça.
