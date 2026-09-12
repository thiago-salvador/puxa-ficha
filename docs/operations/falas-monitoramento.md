# Falas de candidatos na imprensa

O monitoramento busca falas dos presidenciáveis e candidatos a governador publicados no site. A rotina cobre hoje e os 13 dias anteriores no calendário de São Paulo. Na primeira carga, autorizada nesta tarefa, a busca dos perfis sem aspa avança por 14 dias e, para preencher lacunas, o período da campanha oficial iniciado em 16 de agosto de 2026. Cada frase precisa de atribuição, contexto, data da fala e link da matéria original. Falas anteriores à campanha e declarações como pré-candidato são rejeitadas, inclusive quando republicadas depois. O fallback amplia termos e fontes, nunca o período anterior a 16/08/2026.

## Consultas alternativas e divisão do trabalho

O plano de consultas é gerado por `scripts/falas-plano-busca.ts`. Usa o cadastro inteiro, nome de urna, nome completo e somente aliases documentados. Varia debate, entrevista e sabatina; tenta retirar o cargo quando ele restringe os resultados; acrescenta estado por extenso, ano e veículos regionais aprovados. A geração de consultas não conta como busca executada.

| Responsável | Trabalho |
| --- | --- |
| Código | Cadastro, fila, consultas, deduplicação, limites, validação literal e cobertura. |
| Luna | Abrir fontes já encontradas; executar consultas alternativas; extrair aspa curta, contexto, identidade, data e link; registrar cada tentativa. |
| Astra | Resolver ambiguidades de autoria, identidade e data; avaliar novas fontes; revisar contexto antes de aceitar o achado. |

Distribuir a fila em lotes por região, sem sobrepor candidatos entre agentes. Cada agente recebe apenas seu lote, critérios e caminho de saída. Primeiro reaproveitar evidências; depois executar consultas da janela atual. Ao encontrar uma aspa válida na primeira carga, parar a busca daquele candidato. Se não encontrar, avançar para outros termos, programas e veículos dentro do mesmo período. Falhas de acesso, fontes rejeitadas e consultas não realizadas ficam explícitas; não são prova de ausência de fala.

Na rotina, consultar todos novamente dentro dos 14 dias, inclusive os que já têm aspa. O plano oferece alternativas de nome completo e de urna, rádio, TV, podcast, coletiva, “disse à”, “afirmou à”, Roda Viva, Bom Dia, Jornal da Manhã e fontes regionais. Executar os caminhos necessários para cada candidato, aproveitando recibos anteriores e registrando o próximo caminho pendente. Os limites não declaram esgotamento. Candidatos sem resultado continuam na fila. O Luna não aprova a própria extração: o importador e a revisão de contexto conferem o original. Usar o Astra somente para exceções e revisão; busca e repetição ficam no Luna.

Quando o índice externo trouxer somente reproduções, abrir a busca interna do veículo original e suas interfaces públicas de notícias, quando disponíveis. Relatos retrospectivos da agenda podem localizar entrevistas efetivamente realizadas e servir de prova complementar; agendas futuras não cumprem esse papel. Veículo jornalístico ainda fora da lista de fontes deve passar por avaliação editorial, em vez de encerrar a pesquisa por esse motivo. Registrar falha de acesso por cliente: uma resposta bloqueada da ferramenta web não prova que o original esteja indisponível por HTTP.

Incluir reportagens de agenda com termos como “cumpre agenda”, “diz que”, “propõe”, “defende”, “declarou” e “foi questionado”. Entrevistas breves à reportagem durante a campanha são elegíveis quando o original mostra perguntas e respostas, identifica o candidato e comprova a data. Falas literais em panfletagens, comícios ou outros atos de campanha, compartilhadas por uma redação aprovada, entram como “Declaração em campanha”, com trecho original que comprove esse contexto. Não são rotuladas como entrevista. Trechos de planos de governo não são declarações faladas; falas institucionais sem vínculo com a candidatura ficam fora. Índices de republicações podem revelar o título e o caminho do g1; conferir e arquivar a página original antes de importar.

## Duas etapas de coleta

A pesquisa individual é executada nesta tarefa pelo agendamento ativo do Codex, segunda e quinta às 08h17. Reconsulta o cadastro público, procura cada nome e verifica matérias nacionais e regionais. O agendamento não publica nem altera banco de produção. Novos achados e lacunas são preparados localmente para revisão.

O coletor de editorias em `scripts/falas-monitoramento.ts` é complementar. Lê o cadastro público com chave pública, segue links e paginação exposta pelos veículos, extrai citações com atribuição determinística e produz evidências. Seu orçamento é de seis minutos, duas páginas e 12 matérias por fonte. Não representa busca individual concluída nem esgotamento das notícias do período. O workflow no GitHub está apenas preparado nesta branch local.

O módulo `scripts/lib/falas-descoberta.ts` registra consultas individuais e consegue reconhecer índices originais. O RSS do Google News retornou bloqueio em tentativas anteriores, mas consultas HTTP posteriores conseguiram respostas válidas. Registrar o resultado real de cada cliente e tentativa. O RSS serve para descobrir títulos e veículos; seu link opaco não comprova o conteúdo nem substitui a abertura da matéria original. A pesquisa da tarefa combina busca web, RSS acessível, busca interna e interfaces públicas dos veículos.

## Validação e cobertura

A extração determinística exige nome e atribuição explícitos no mesmo parágrafo. A revisão de contexto pode confirmar atribuições entre parágrafos; a importação exige que aspa, trecho de identidade e trecho da data estejam literalmente presentes no HTML original. Confere candidato por id e slug, fonte aprovada, URL canônica e data da fala resolvida no calendário. A revisão editorial é necessária para comprovar que os trechos pertencem à mesma fala.

A data de publicação não é usada automaticamente como data da fala. Republicações, datas de cabeçalho, gravações sem data, títulos sem citação literal atribuída e material de assessoria sem publicação jornalística identificada permanecem pendentes ou são descartados. Quando uma redação aprovada publica a fala e credita informações à assessoria, esse crédito é preservado na ficha; a matéria não é apresentada como apuração independente do evento. Uma aspa no título exige marcação explícita na revisão, citação completa, verbo de atribuição e candidato nomeado; a ficha informa que a aspa vem do título. Não há inventário de todas as aparições.

O fallback de áudio e vídeo usa formato separado, identificado publicamente como transcrição automática. Reaproveitar legendas e recortes, executar Whisper local sem API paga e revisar somente trechos curtos. O pacote exige original jornalístico, vínculo da mídia, data efetiva, autoria, contexto, WAV PCM mono de 16 kHz, hashes e concordância em duas transcrições. Silêncio, divergência e gravação sem data são rejeitados. A concordância automática não é escuta humana e o site informa a possibilidade de erros. `node --conditions react-server --import tsx scripts/falas-validar-transcricoes.ts manifesto.json` confere o pacote; `--write-catalog` incorpora somente os aprovados no catálogo local, sem sobrescrever registros divergentes. Os arquivos de evidência em `reports/falas-monitoramento` não fazem parte do código compilado do produto.

No ClickPB, o corpo pode vir serializado nos dados React enviados no HTML original. A leitura aceita somente JSON e registros de texto do artigo cuja URL e metadados correspondem à matéria; não executa scripts. A evidência e seu hash permanecem os da resposta original. Respostas textuais da ferramenta web também são preservadas integralmente, com URL, data e linhas em ordem. Nunca reconstruir uma resposta a partir de trechos, completar linhas truncadas ou apresentar HTML derivado como original.

Uma transmissão ao vivo pode comprovar a data de uma aspa já escrita por uma redação. Nesse formato editorial, exigir canal oficial aprovado, metadados de transmissão concluída, data do título compatível com o início real da transmissão, publicação posterior e ligação explícita da matéria com a entrevista. O revisor precisa conferir que o segmento estava ao vivo. As legendas automáticas apenas localizam e cruzam a aspa já escrita. O formato separado de transcrição aceita também anúncio datado com link para o canal oficial, desde que o episódio nomeie o candidato e sua transmissão efetiva coincida com a data anunciada. Arquivar metadados completos, legendas e quadro conferido, com hashes e posição no vídeo. Data de upload ou selo de transmissão ao vivo do programa inteiro, isoladamente, não comprovam quando uma entrevista gravada ocorreu.

As aspas mantêm a redação original, com contexto e fonte. A extração automática aceita 4 a 40 palavras; a revisão admite trechos literais até 90 palavras quando necessários para preservar o sentido. O catálogo não contém registros sintéticos. As fontes aprovadas estão em `scripts/data/falas-fontes.json`.

A cobertura tem denominador explícito e separa candidatos com qualquer aspa verificada desde 16/08/2026, candidatos com aspa nos últimos 14 dias e candidatos apenas com histórico. Sempre exige correspondência de id e slug. Tentativa de consulta, consulta concluída e aspa encontrada são estados separados. Nenhum resultado implica que o candidato não falou. A ausência de uma nova fala não apaga citações já verificadas.

Quando o dia exato não aparece, a revisão pode demonstrar um intervalo: a entrevista reage explicitamente a um fato cuja ocorrência está datada em fonte aprovada, e já existia quando foi publicada. O início precisa ser comprovado pela data desse fato e pela ligação textual com a entrevista; o fim usa o timestamp original da publicação. Nesse caso, `occurred_on` permanece nulo e `occurred_between` conserva os dois limites. A ficha mostra o intervalo, sem atribuir um dia inventado. Ambos os limites precisam estar dentro da campanha; para contar como recente, ambos precisam estar nos 14 dias. O texto da fonte complementar, sua origem e o vínculo contextual continuam sujeitos à revisão editorial, pois presença de palavras não prova sozinha que se trata do mesmo fato.

## Operação

Com Node 24 e configuração pública do Supabase:

```sh
npm run monitor:falas
npm run plan:falas -- --backfill
npm run review:falas -- reports/falas-monitoramento/research/presidenciais.json
npm run review:falas -- --backfill reports/falas-monitoramento/research/backfill-nordeste.json
npm run test:falas
npm run check:scripts
```

A importação aceita vários arquivos de pesquisa na mesma chamada. O cadastro usado fica em `reports/falas-monitoramento/roster.json`. Cada arquivo de pesquisa documenta queries, URLs consultadas, candidato, achados e pendências. Somente entradas `verified` ou `validated` são candidatas à importação; a validação do original ainda pode recusá-las.

Para repetir a conferência, usar `--offline --replay-evidence`. Respostas HTTP originais obtidas separadamente podem ser fornecidas com `--html-evidence=caminho.html`; a importação confere origem e URL canônica e arquiva os bytes sem reformatar. A opção não autentica como o arquivo foi obtido: essa proveniência exige recibo e revisão independente. Usar `--web-evidence=caminho.web.json` para respostas textuais integrais da ferramenta web.

Para a prova complementar ao vivo, `--live-evidence=caminho.json` recebe um `live_video_bundle` com URL canônica, caminhos dos metadados, legendas e quadro, e posição em segundos. O importador arquiva todos os bytes em um snapshot `.live.json`. O replay confere seu hash e reconstrói a prova sem depender dos arquivos temporários. Essa prova continua subordinada à leitura literal da matéria e à revisão contextual do segmento; a conferência automatizada não deve ser descrita como revisão humana.

Sem `--backfill`, o plano e a importação mantêm os 14 dias. O modo inicial só preenche perfis vazios e marca cada fala antiga com `collection_scope.mode = initial_backfill`, preservando sua data. Nunca usar a data da coleta como data da declaração. O plano não despacha agentes sozinho: a tarefa agendada executa a distribuição acima com a ferramenta de busca disponível.

A sequência reaproveita os princípios de [pesquisas-busca-semanal.md](pesquisas-busca-semanal.md), adaptados a declarações: alternativas ordenadas, variantes comprovadas, outras fontes e pendência preservada quando falta evidência.

A proposta, os recibos, a cobertura e a prévia navegável ficam em `reports/falas-monitoramento/review/`. Os HTMLs originais ficam em `evidence/`, identificados pelo hash salvo na citação. Esses arquivos são ignorados pelo Git, inclusive para impedir que o Tailwind processe HTML externo como código do produto. O catálogo servido localmente é `scripts/data/falas-candidatos.json`.

## Vídeos gravados com intervalo explícito

`scripts/falas-validar-transcricoes.ts` também confere episódios gravados do canal jornalístico The Papo. Essa entrada exige página original do YouTube, metadados do mesmo vídeo e canal, trecho de áudio não silencioso, concordância entre transcrições, quadro dentro do trecho e fonte independente que identifique o programa jornalístico. A descrição precisa dizer expressamente que recebeu o candidato naquela semana. O intervalo vai do domingo anterior até o dia da publicação no fuso de São Paulo, preservando as duas convenções usuais de início da semana. A ficha informa que o dia exato não foi fornecido.

A data de upload sozinha continua insuficiente. O código recusa canal divergente, agenda futura, intervalo encurtado, transmissão tratada como gravação e divergência entre página e metadados. A referência de identidade do veículo pode ser anterior à campanha; ela comprova apenas quem produz o programa. O período da fala permanece inteiramente dentro da campanha.

O checkout atual é `/Users/thiagosalvador/Documents/Apps/Puxa Ficha/puxa-ficha-falas`. Use caminhos absolutos para alterações e esse diretório explicitamente nos comandos. A pasta anterior em `/private/tmp` não é destino de persistência.

## Rodadas econômicas para perfis ainda vazios

Na primeira carga, use `npm run plan:falas:pendencias` antes de novas pesquisas. O arquivo `reports/falas-monitoramento/research/pendencias-economicas.json` descreve a lacuna e a próxima checagem de cada um dos 11 perfis pendentes. A fila resultante fica em `reports/falas-monitoramento/fila-pendencias-economica.json`. A rotina móvel de 14 dias continua separada.

Cada rodada permite uma checagem dirigida e até duas consultas novas por candidato. Candidatos já cobertos saem da fila. Consultas executadas nos recibos são excluídas; consultas apenas planejadas ou bloqueadas continuam distintas de execução. Esse limite restringe o gasto da rodada, sem encerrar a pendência ou provar inexistência da fala.

Antes de abrir uma fonte, leia a conclusão já salva. Reutilize páginas, legendas e trechos existentes. Para Carlos Cley, Jairo Palheta e Adriano Funileiro, investigue somente a prova da data que falta. Compartilhe a consulta do arquivo The Papo entre os dois primeiros. Para os demais, confirme a realização do evento e a presença do candidato antes de processar mídia. Não repita episódios com ausência registrada, planos de governo sem fala ou declarações de terceiros.

Use um Luna por lote curto, recebendo só a tarefa e os trechos pertinentes. Transcreva localmente apenas um trecho curto quando presença e período estiverem comprovados. Reserve a revisão mais cara para evidência concreta que possa entrar no catálogo. Não há estimativa de economia monetária: o controle mede consultas, inspeções e transcrições efetivamente realizadas.

Registre cada consulta concluída em `research/pendencias-economicas-recibos.json`, com `attempt_status: executed`, os candidatos, o resultado e as URLs. Gere novamente a fila antes da rodada seguinte. Sem pista nova, mantenha a pendência aberta até surgir conteúdo pertinente, mudança da fonte ou nova comprovação documental; não reinicie variações genéricas da mesma busca. A deduplicação usa apenas o histórico recuperado e os novos recibos, sem presumir que representam todas as buscas antigas.

## Publicação

A prévia local não comprova publicação. A ficha mostra fonte, data e link individual por citação. A pesquisa ativa no Codex prepara alterações locais; publicação, merge, deploy e banco precisam de autorização específica.

Se o workflow chegar à branch principal, a coleta complementar terá o mesmo calendário. A criação de propostas no GitHub depende de `FALAS_DRAFT_PR_ENABLED=true`; o workflow não faz merge automático. A ativação no GitHub deve ser verificada separadamente do agendamento do Codex.
