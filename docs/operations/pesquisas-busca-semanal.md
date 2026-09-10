# Busca de pesquisas duas vezes por semana

A rotina `pesquisas-de-voto-presidente-e-27-ufs`, criada no Codex, executa nesta
tarefa às segundas e quintas, às 9h de São Paulo. O agendamento exige o ambiente
local do Codex disponível. É uma busca assistida na web, seguida da atualização
dos catálogos que as fichas já leem. O monitor diário do GitHub continua sendo
uma verificação distinta das fontes previamente cadastradas.

## Em cada execução

1. Conferir a branch, os catálogos e `scripts/data/pesquisas-busca-semanal.json`.
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
