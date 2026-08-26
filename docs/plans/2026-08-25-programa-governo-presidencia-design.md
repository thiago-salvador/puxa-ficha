# Programa de governo presidencial 2026: design aprovado

**Status:** aprovado por Thiago Salvador em 2026-08-25

## Contexto

O Tribunal Superior Eleitoral publica as propostas de governo entregues pelas candidaturas a cargos do Executivo. A ficha pública do PuxaFicha ainda não apresenta esse documento nem uma síntese que ajude o eleitor a compreender seus temas centrais.

O piloto cobre apenas candidaturas à Presidência em 2026. A fonte de autoridade é o documento oficial publicado pelo TSE. O resumo é produzido por inteligência artificial a partir desse documento, passa por revisão humana e só então pode ser publicado.

## Objetivos

1. Exibir na aba Visão geral um resumo neutro do programa, com 120 a 180 palavras e de quatro a seis temas centrais.
2. Adicionar a aba Programa com o texto integral extraído, pesquisável e acessível.
3. Manter um botão para abrir o PDF original no domínio oficial do TSE.
4. Tornar fonte, extração, geração por IA e revisão auditáveis e reproduzíveis.
5. Carregar o texto integral somente quando a aba for aberta, sem aumentar o payload inicial da ficha.
6. Distinguir ausência oficial, coleta pendente, falha de extração, revisão pendente e conteúdo aprovado.

## Não objetivos do piloto

- Programas de candidaturas a governos estaduais ou eleições anteriores.
- Geração de resumo durante a visita do usuário.
- Comparação, pontuação, análise de viabilidade ou julgamento editorial das propostas.
- Um CMS ou painel administrativo para revisão.
- Publicação automática após a geração por IA.
- Hospedagem de uma cópia do PDF como substituta da fonte oficial.

## Decisões de produto

### Visão geral

O box Programa de governo contém:

- resumo neutro de 120 a 180 palavras;
- quatro a seis temas centrais;
- selo `Resumo por IA, revisado editorialmente`;
- ação primária `Ler programa completo`;
- ação secundária para abrir o PDF original no TSE;
- data da revisão e identificação clara do documento fonte.

O box não atribui ao candidato conclusões que não estejam sustentadas pelo documento. Ele também não traduz proposta em promessa cumprida, não avalia exequibilidade e não mistura fontes externas.

### Aba Programa

A aba apresenta:

- busca textual com rótulo acessível;
- contagem de resultados e navegação entre correspondências;
- sumário com âncoras para as seções extraídas;
- texto integral na ordem do PDF, preservando títulos, parágrafos e listas;
- indicação de páginas ou intervalos de páginas quando disponíveis;
- metadados de fonte, extração, geração e revisão;
- botão para abrir o PDF original no TSE.

A busca acontece no navegador depois do carregamento da aba. O texto continua disponível integralmente para tecnologias assistivas e não depende de realce visual para ser compreendido.

### Estados públicos

Cada candidatura presidencial pode estar em um dos seguintes estados:

1. `nao_coletado`: ainda não houve coleta conclusiva.
2. `fonte_ausente`: uma verificação registrada no TSE não encontrou documento publicável.
3. `extracao_falhou`: existe documento oficial, mas não foi possível produzir texto integral confiável.
4. `aguardando_revisao`: texto e resumo foram produzidos, mas ainda não receberam aprovação humana.
5. `aprovado`: conteúdo integral e resumo foram revisados e estão liberados para publicação.

Somente `aprovado` publica resumo ou texto integral. Os outros estados exibem uma mensagem específica e verdadeira. `Fonte ausente` só pode ser usado quando a ausência foi verificada e datada. Falha técnica nunca vira ausência oficial.

## Arquitetura

### Conteúdo versionado e geração fora do runtime

O piloto usa arquivos versionados no repositório. Não haverá chamada a modelo de IA nem extração de PDF no caminho de renderização da aplicação.

O conteúdo fica dividido em duas superfícies:

1. Um manifesto pequeno, importado pela ficha, contém estado público, resumo aprovado, temas e metadados mínimos.
2. Um registro integral por candidatura contém as seções extraídas e é carregado sob demanda por uma rota dedicada quando a aba Programa abre.

Essa separação impede que documentos longos sejam serializados no DTO inicial ou no JavaScript da Visão geral.

### Modelo editorial

Cada registro deve guardar, no mínimo:

- `slug` do PuxaFicha;
- `sq_candidato` do TSE;
- ano e cargo;
- estado editorial;
- URL direta do PDF oficial e URL do conjunto de dados de origem;
- hash SHA-256 do PDF;
- hash SHA-256 do texto extraído;
- data da coleta e da última verificação da fonte;
- método de extração e total de páginas;
- seções com identificador, título, texto e páginas de origem;
- resumo, temas e evidências por página ou seção;
- provedor, modelo, versão do prompt e data da geração;
- data da revisão humana.

O nome do revisor pode permanecer apenas no artefato editorial e não precisa ser publicado. O estado `aprovado` exige data de revisão, hashes e evidências completas.

### Fluxo de ingestão

1. Descobrir o documento presidencial no TSE e associá-lo por `SQ_CANDIDATO`, nunca somente por nome.
2. Rejeitar URLs que não pertençam à lista oficial de domínios do TSE.
3. Baixar o PDF para diretório temporário, calcular o hash e registrar os metadados.
4. Extrair texto por página. Usar OCR somente como fallback explícito; sem extração íntegra, marcar `extracao_falhou`.
5. Normalizar quebras de linha sem reescrever o conteúdo.
6. Detectar títulos e listas de modo conservador, preservando a ordem original.
7. Gerar resumo e temas com IA usando apenas o texto extraído.
8. Exigir evidência de página ou seção para cada tema e afirmação material do resumo.
9. Salvar o resultado como `aguardando_revisao`.
10. Publicar apenas depois de revisão humana e alteração explícita para `aprovado`.

Arquivos temporários e PDFs baixados não entram no Git. Apenas metadados, texto extraído, resumo aprovado e evidências versionadas fazem parte da entrega.

### Contrato da IA

O prompt de geração deve exigir:

- português brasileiro;
- neutralidade política;
- uso exclusivo do programa fornecido;
- proibição de inferir intenção, custo, viabilidade ou impacto;
- distinção entre objetivo, diretriz e proposta concreta;
- resumo entre 120 e 180 palavras;
- quatro a seis temas sem duplicação;
- evidências rastreáveis para cada afirmação;
- saída estruturada e validada por schema;
- resposta de falha quando o documento não sustenta uma síntese íntegra.

O modelo gerador não pode aprovar o próprio texto. A fidelidade será julgada por um modelo de família diferente e confirmada por revisão humana no piloto.

### Integração com a ficha

O identificador `programa` entra na lista canônica de abas do perfil. A aba fica disponível apenas nas fichas presidenciais do piloto. O parâmetro `?tab=programa` segue o mesmo contrato das outras abas e deve funcionar com navegação por clique, teclado e histórico do navegador.

O componente da Visão geral recebe somente o manifesto pequeno. Ao selecionar a aba, o cliente consulta uma rota pública por slug. A rota:

- valida o slug;
- retorna conteúdo somente para registros aprovados;
- retorna um estado público específico para os demais casos;
- não expõe campos editoriais internos;
- aplica os guardas e limites já usados pelas rotas de perfil;
- mantém o documento integral fora do payload inicial.

## Tratamento de falhas

- Documento não encontrado após verificação: `fonte_ausente`, com data e fonte consultada.
- URL fora do TSE: coleta rejeitada.
- PDF alterado: novo hash invalida a aprovação anterior e retorna o registro para `aguardando_revisao`.
- PDF sem texto suficiente ou com páginas não extraídas: `extracao_falhou`.
- Saída da IA fora do schema, sem evidência ou fora do limite: geração rejeitada.
- Resumo ainda não revisado: nenhum resumo ou texto é publicado.
- Falha da rota sob demanda: aviso neutro com tentativa novamente, sem substituir pelo PDF como se o texto estivesse disponível.
- Busca sem resultados: mensagem específica, preservando o texto integral.

## Acessibilidade e responsividade

- A nova aba segue o padrão ARIA existente de `ProfileTabs`.
- O campo de busca possui `label`, descrição e anúncio do total de resultados.
- O sumário usa navegação semântica e links de âncora.
- Títulos do documento mantêm hierarquia coerente, sem saltos artificiais.
- Realces de busca não removem o texto do fluxo acessível.
- Links externos identificam o destino TSE e têm foco visível.
- Texto longo, títulos extensos e URLs não causam overflow em 320 px.
- O layout é validado em desktop e mobile com screenshot real e Axe.

## Verificação

O eval será criado antes da implementação e cobrirá outcome, policy e custo. Os graders determinísticos têm preferência sobre julgamento de modelo.

Critérios mínimos:

- matching por `SQ_CANDIDATO` e allowlist de domínio TSE;
- hashes e invalidação da aprovação quando a fonte muda;
- schema e estados fail-closed;
- resumo no limite acordado e quatro a seis temas;
- evidências presentes para toda afirmação material;
- texto integral e ordenado por página;
- nenhum conteúdo pendente publicado pelo manifesto ou pela rota;
- payload inicial sem o texto integral;
- aba, URL, teclado, busca e estados vazios funcionando;
- ausência de overflow em mobile;
- Axe sem violações na rota real;
- testes unitários, lint, typecheck e build verdes;
- screenshots reais de uma ficha aprovada e de um estado não aprovado;
- fidelidade do resumo avaliada por modelo diferente do gerador e revisão humana.

O `GATES.md` do unlazy será criado em modo solo a partir desse eval. Done exige 100% dos gates atendidos e revalidados. Nenhuma falha será convertida em critério mais fraco para permitir a conclusão.

## Custo e operação

A IA é usada somente na ingestão. Visitas à ficha não geram custo de modelo. O custo do piloto cresce com o número e o tamanho dos programas presidenciais processados, não com o tráfego público.

O processamento deve registrar quantidade de documentos, páginas, caracteres extraídos, chamadas de geração, falhas e tempo total. Esses números serão medidos na execução e comparados ao orçamento declarado no eval.

## Condições que invalidam esta arquitetura

A solução baseada em arquivos deixa de ser a melhor escolha se o escopo passar a incluir eleições históricas, todos os cargos executivos, atualizações frequentes sem PR ou uma equipe editorial simultânea. Nessa situação, o mesmo schema deve migrar para Supabase e armazenamento de objetos, mantendo a geração offline, a revisão humana e a publicação fail-closed.
