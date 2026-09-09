# Entrada de novas pesquisas e formatos de setembro

Implementação na branch de diagnóstico. Produção não ativada.

## Comportamento

A descoberta consulta o registro público antes de criar um alvo novo. Cargo e geografia vêm do registro e precisam ser compatíveis com a publicação. URLs complementares do mesmo registro são preservadas para uma tentativa alternativa de coleta integral. Pesquisas presidenciais regionais não entram no conjunto presidencial nacional.

A matriz declara explicitamente os identificadores novos. A consolidação só propõe inserção quando existem fonte aprovada, cenário completo, identidades resolvidas e prova do registro. Uma inserção preserva as pesquisas anteriores, cria dataset estadual quando necessário e mantém o estado indeterminado até revisão humana. A aplicação em cópia passou pelo parser público e não duplicou a pesquisa ao repetir a operação.

O PDF presidencial aceita datas de coluna em inglês e português, período entre dois meses e coluna datada pela publicação. A data precisa ser a do fim do campo ou a da publicação verificada, e todos os cenários precisam concordar. A lista de primeiro turno é conciliada com a coluna Total de uma tabela independente, inclusive para candidatos com zero. Nomes de urna presidenciais são resolvidos pelos documentos já aprovados no checkout; não houve nova validação desses documentos no CDN bloqueado.

O coletor estadual preserva listas estimuladas alternativas, pesquisa espontânea e duelos de segundo turno. Notas de agrupamento acompanham Outros. Um total agregado não é dividido entre candidatos nem convertido em zeros individuais.

O diagnóstico separa acesso indisponível, extração incompleta e metadados conflitantes. O HTML observado é guardado como texto para repetição local da análise; sessões do PesqEle não são guardadas.

## Evidência observada

- A rodada PoderData divulgada em 3 de setembro, registro BR-07561/2026, foi descoberta, coletada e conciliada localmente. O PDF contém 13 candidatos e duas categorias no primeiro turno, mais quatro duelos de quatro respostas: 31 respostas em cinco cenários. Recibo: `/private/tmp/pf-pesquisas-s0-novas-presidente-v2`.
- O registro informa margem máxima prevista de 2 pontos; publicação e PDF informam 1,8. Ambos são preservados. Somente a declaração explícita de máximo previsto permite essa compatibilidade, com controle negativo em teste.
- A releitura dos HTMLs e registros capturados de Espírito Santo e Distrito Federal foi elegível: ES com quatro cenários e 18 respostas; DF com seis cenários e 35 respostas. A Bahia conservou dois cenários e 11 respostas, mas ficou bloqueada por identidades não resolvidas. Recibos originais: `/private/tmp/pf-pesquisas-s0-novas-governadores`; a elegibilidade de ES/DF foi comprovada por repetição local com o novo extrator, ainda sem readback remoto neste SHA.
- A rodada presidencial de agosto com registro BR-04974/2026 continua bloqueada: gráfico de primeiro turno sem a tabela conciliada exigida pelo extrator. A rodada BR-06868/2026 continua bloqueada por ausência de link integral inequívoco nas matérias consultadas. A falha permanece explícita.
- A execução remota completa anterior recebeu 18/18 alvos e aprovou dois. Os outros 16 falharam por extração ou divergência de metadados, e não por indisponibilidade geral das fontes. A execução remota desta ampliação ainda precisa comprovar descoberta, matriz e coleta no mesmo SHA.

## Verificação

Sete gates locais, TypeScript, ESLint e build. Os novos testes cobrem inserção presidencial, criação de UF, parser público, idempotência, destino externo, geografia regional, candidato com zero omitido, datas inconsistentes, Total divergente, listas alternativas e nota de Outros.

## Trabalho restante

Resolver os formatos ainda bloqueados, tratar as divergências com evidência, ampliar descoberta além das páginas iniciais e provar cobertura e atualização por BR e 27 UFs. Uma listagem sem novidade não prova ausência de pesquisa. A aprovação dos testes não demonstra que todos os estados estão atualizados, e não autoriza merge, ativação da promoção ou publicação em produção.
