# Busca de pesquisas duas vezes por semana

A rotina `pesquisas-de-voto-presidente-e-27-ufs`, criada no Codex, executa nesta
tarefa às segundas e quintas, às 9h de São Paulo. O agendamento exige o ambiente
local do Codex disponível. É uma busca assistida na web, seguida da atualização
dos catálogos que as fichas já leem. O monitor diário do GitHub continua sendo
uma verificação distinta das fontes previamente cadastradas.

## Em cada execução

1. Conferir a branch, os catálogos, `scripts/data/pesquisas-busca-semanal.json`
   e a sequência obrigatória de `scripts/data/pesquisas-buscas-alternativas.json`.
2. Buscar `pesquisa de voto presidente Brasil` e `pesquisa de voto governo
   [estado]` para cada uma das 27 UFs, incluindo o Distrito Federal.
3. Procurar divulgações desde o último período concluído por UF, com dois dias
   de sobreposição para notícias indexadas depois. Sem cursor anterior, começar
   em três dias, ampliar para sete e quatorze. O limite é a data de referência
   menos N dias, inclusive. Sem pesquisa nessa faixa, registrar a fonte mais
   recente encontrada e sua idade, sem anunciar ausência de pesquisas.
4. Ler uma fonte jornalística confiável ou o instituto. Se estiver inacessível,
   pesquisar o mesmo instituto, UF e registro em outros veículos. Não confundir
   falha de acesso com falta de pesquisa e não contornar bloqueios de segurança.
5. Extrair cada cenário separadamente, com todos os candidatos e categorias
   publicados. Preservar zeros, Outros, indecisos, brancos/nulos, agrupamentos e
   distinção entre votos válidos e totais. Não calcular percentuais individuais
   para nomes agrupados nem transformar omissão em zero.
   Quando faltar percentual individual, pesquisar também `Pesquisa votos
   [estado] [nome do candidato]`, usando o nome de urna, o nome completo e
   variantes comprovadas. Combinar o nome com instituto, registro e data da
   rodada; consultar outros veículos e a tabela ou PDF original do instituto.
   Quando os números estiverem em gráfico, imagem ou PDF, abrir e ler a tabela
   visualmente. Ausência no texto extraído não significa ausência no relatório.
   Preservar a URL da imagem ou a página do PDF com a transcrição conferida.
   Essa segunda busca inclui nomes em Outros, omitidos, com vínculo pendente
   ou apenas com resultado histórico. Um agrupamento na primeira matéria não
   encerra a busca. Registrar por candidato as consultas, fontes lidas e o
   resultado da tentativa. Se só houver pesquisa anterior, manter sua data
   explícita, sem atribuir o valor à rodada mais nova.
6. Conferir divulgação, campo, amostra, margem, confiança, método, contratante
   quando informado e registro. Metadado ausente permanece indeterminado. Uma
   matéria nova sobre uma rodada antiga não é pesquisa nova.
7. Conservar captura textual da fonte e seu SHA-256. Deduplicar por instituto,
   registro, campo e cenário. Correções da mesma rodada atualizam a evidência,
   preservando o histórico da alteração no Git.
8. Associar rótulos às fichas apenas com identidade de pessoa, cargo e UF
   comprovada pelo roster oficial vigente e pelos aliases revisados. Vínculo
   ambíguo fica indeterminado, com o resultado bruto preservado.
9. Atualizar os catálogos presidenciais/estaduais e o scorecard de fontes. A
   preferência pode incluir institutos revisados através de veículos distintos;
   não limitar a descoberta aos adaptadores do monitor antigo.
10. Rodar `npm run verify:pesquisas` com Node 24 e o teste
    `tests/pesquisas-busca-semanal.test.ts`. Conferir as fichas afetadas em
    navegador e, após a publicação pelo fluxo autorizado do projeto, verificar
    `/api/deployment-info` e os percentuais servidos. Dados apenas locais não
    significam fichas públicas atualizadas.

## Cursor e resultado

### Publicação das atualizações verificadas

Em 10/09/2026, Thiago autorizou aplicar os resultados no site e manter a lógica
de atualização com novas pesquisas de fontes confiáveis. Essa autorização cobre
commit, push, PR, merge e publicação das atualizações de pesquisas que passem
pelas verificações do projeto. Não abrange mudanças em outras áreas do produto.

Em cada execução, partir da versão atual de `origin/main` em checkout limpo e
branch própria. Não reutilizar silenciosamente uma branch já mergeada nem
incluir alterações locais de outra tarefa. Consultar os recibos locais em
`QA/evidencias/2026-09-10-pesquisas-fontes/publicacao-20260910.json`, quando
existirem, e a versão pública antes de interpretar status históricos.

Depois de incorporar novidades e concluir a validação local, publicar a branch
e criar ou atualizar a PR restrita às pesquisas. Exigir os checks obrigatórios
no head atual e sincronização com a base antes do merge, sem ignorar proteção
de branch. Capturar o deployment público anterior e verificar se há release em
andamento para evitar promoção concorrente. Identificar na Vercel o deployment
do SHA mergeado, testar a URL isolada e promover esse deployment quando a
atribuição automática de domínio estiver desligada. Conferir o mesmo SHA em
`/api/deployment-info` e os números nas fichas públicas antes de registrar
`last_published_at`. O fluxo de smoke existente é `npm run release:smoke`.

Se a busca não encontrar novidade, encerrar sem commit ou deployment. Se uma
fonte, identidade, teste ou publicação falhar, manter a pendência e avisar o
problema concreto; não marcar o site como atualizado. A execução ocorre duas
vezes por semana e depende do Codex local disponível, portanto não representa
atualização instantânea entre execuções.

### Sequência de buscas por candidato

A lista de buscas alternativas possui 14 caminhos ordenados: nome e estado;
cargo e ano; nome exato; variantes comprovadas; outros veículos; instituto e
nome; registro e nome; registro sem nome; tabela completa; PDF; site do instituto;
zero ou agrupamento; outra rodada; histórico identificado. Os seis nomes da fila
inicial têm consultas concretas e o resultado da execução registrado no arquivo.

Gerar a fila novamente a partir de todos os candidatos ativos em cada execução.
Os seis nomes iniciais não são uma lista fechada. Registrar consulta, motor,
janela, fontes, resultado e justificativa para cada caminho aplicável. Campos
desconhecidos permitem somente um adiamento justificado, retomado quando forem
descobertos. Consulta planejada não conta como consulta executada.

Um caminho sem resultado leva ao próximo. Reutilizar a mesma captura e consulta
entre candidatos, extraindo a tabela inteira uma única vez. As janelas de
3, 7 e 14 dias e o histórico ficam distintos. A rotina só pode encerrar uma lacuna
como resolvida com percentual individual confirmado; se os caminhos terminarem
sem ele, a pendência permanece. Limite de ferramenta ou tempo significa busca
incompleta. Nenhum desses estados permite anunciar todos os candidatos cobertos.

O estado mantém BR e as 27 UFs. `last_search_completed_at` avança apenas quando a
busca daquela abrangência terminou. Pendências ficam em `pending` e voltam a
ser verificadas mesmo depois do avanço do cursor. `last_published_at` só avança
após prova da versão pública; não usar data de busca como data de publicação.
Registrar fontes consultadas, registros incluídos e problemas específicos.

Avisar apenas novidades processadas, conclusão de atualização, falha material
ou ação necessária. Uma execução sem novidades não precisa produzir mensagem.

## Critérios de aceitação

- Todas as 28 abrangências têm busca e resultado ou pendência explícita.
- Cada percentual publicado possui fonte lida e vínculo exato com a ficha.
- Toda lacuna individual recebe busca por nome e estado, com tentativa e
  resultado registrados; matéria que agrupa candidatos exige fonte alternativa
  ou documento do instituto antes de concluir que o percentual não foi obtido.
- Cenários diferentes continuam identificados; a listagem não calcula tendência.
- A rodada recente substitui a antiga do mesmo instituto. A ausência de um nome
  na rodada recente não recupera silenciosamente seu percentual antigo.
- Capturas, dados e resultados selecionados são conferidos por testes; zeros e
  categorias sem candidato são preservados.
- Agendamento, preparação local e atualização pública são estados separados.
