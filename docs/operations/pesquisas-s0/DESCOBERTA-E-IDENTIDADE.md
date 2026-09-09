# Descoberta e identificação dos candidatos

## Evidência de execução

A execução presidencial no GitHub terminou com sucesso em preparação, coleta e consolidação: https://github.com/thiago-salvador/puxa-ficha/actions/runs/34349694256. Os artefatos contêm cinco cenários e 24 respostas conciliadas com o PesqEle. A promoção foi ignorada conforme os controles vigentes. Branch publicada não é produção.

O coletor de descoberta consulta as listagens públicas R7 Eleições, PoderData e Folha Poder, independentemente das URLs do catálogo. Na captura local de 9 de setembro foram observados 13 links novos para validar. Isso inclui possíveis publicações complementares da mesma pesquisa; não significa 13 pesquisas inéditas. Podcasts, aprovação, rejeição e Senado são filtrados. A classificação por título é somente indício.

O inventário contém Brasil e 27 UFs. O catálogo atual possui pesquisas estaduais em 16 UFs. As demais não são marcadas como ausência de pesquisa. `freshness_status` permanece `not_assessed` até coleta e conciliação; `absence_of_poll_confirmed` permanece falso. Evidência: `/private/tmp/pf-pesquisas-s0-discovery-final/discovery.json`.

O workflow conserva a descoberta como artefato e bloqueia promoção quando há URLs novas pendentes, erro ou ausência de resultado dessa etapa. A matriz de coleta ainda é a dos alvos cadastrados. Integrar a fila descoberta ao cadastro de pesquisas novas continua necessário.

## Identidade e aplicação

A pendência Cabo Daciolo foi investigada no documento canônico `src/data/programas-governo/governadores-2026/cabo-daciolo.json`. O registro aprovado do checkout contém eleição 2026, cargo Governador, UF AM, nome de urna CABO DACIOLO, partido MOBILIZA e slug cabo-daciolo. Esse vínculo vem da curadoria existente, não de comparação aproximada de nomes. Uma tentativa de reconferir o ZIP no CDN do TSE retornou HTTP 403; não há claim de nova verificação remota desse documento. A consulta pública do registro da pesquisa continuou funcionando.

O resolvedor exige correspondência de nome completo e partido, ano, cargo e UF, registro aprovado e proveniência com hash. Nomes curtos, partido diferente, duplicidade ou ausência de correspondência permanecem sem vínculo. Um nome sem partido em outro cenário só recebe o vínculo quando corresponde a um único nome completo já resolvido e impresso na mesma publicação. A prova usada é registrada na evidência.

A captura local final do Amazonas ficou elegível com sete cenários e 32 respostas. A consolidação produziu uma operação, 13 diferenças por candidato e 13 aliases escopados por cenário. Evidência: `/private/tmp/pf-pesquisas-s0-am-consolidated/diff.json`. Nenhum catálogo real foi aplicado.

O teste de aplicação em cópia detectou duas falhas adicionais: a proposta não persistia aliases novos e o aplicador zerava a preferência da fonte, contrariando o scorecard exigido pelo parser público. A correção persiste somente aliases documentados e escopados, preserva a preferência da fonte, mantém os dados como indeterminados para revisão e conserva URLs de apoio novas. O teste confirma leitura pelo parser do site e repetição sem duplicação ou nova operação.

## Verificação e próximo bloco

Os seis gates locais, TypeScript, ESLint e build passaram. A descoberta tem quatro testes; PesqEle, PDF, cenários, identidade e aplicação têm 17 testes; atualização agendada mantém 20 testes. Os próximos gates são o diagnóstico remoto do novo SHA, conciliação da fila de URLs novas, cadastro seguro das pesquisas descobertas e cobertura dos formatos ainda não suportados. Ativação e leitura pública continuam fora do estado concluído.
