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
- Espírito Santo e Distrito Federal também passaram na execução remota: ES com quatro cenários e 18 respostas; DF com seis cenários e 35 respostas. A Bahia conservou dois cenários e 11 respostas, mas ficou bloqueada por identidades não resolvidas.
- A rodada presidencial de agosto com registro BR-04974/2026 continua bloqueada: gráfico de primeiro turno sem a tabela conciliada exigida pelo extrator. A rodada BR-06868/2026 continua bloqueada por ausência de link integral inequívoco nas matérias consultadas. A falha permanece explícita.
- A execução [Monitoramento de pesquisas eleitorais](https://github.com/thiago-salvador/puxa-ficha/actions/runs/34357192078), no commit `ec5ff6bd640f1a1b0b3ae6445c1a85889d1836e2`, recebeu 20/20 artefatos de fonte/UF e processou 24 pesquisas. Cinco foram elegíveis, somando 140 respostas: PoderData julho e setembro, Amazonas, Distrito Federal e Espírito Santo. As outras 19 ficaram bloqueadas: 15 por extração incompleta, três por metadados e uma por identidade. A consolidação permaneceu bloqueada, com zero operações e promoção ignorada. Recibo: `/private/tmp/pf-pesquisas-s0-remote-entrada`. [confidence: alta, source: jobs e artefatos da execução GitHub indicada] [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]

## Correção posterior de datas e modalidades

A extração aceita períodos com dia da semana e confere o calendário. Data incompatível não é deslocada para outro mês. Quando o dia final não está escrito, somente a referência explícita a esta semana e o dia de publicação compatível permitem resolver a data. O diagnóstico informa os campos e valores em conflito, sem substituir datas da publicação pelas do registro.

Na releitura local dos recibos remotos, permaneceram diferenças no fim do campo: nacional Datafolha, 19 versus 20 de agosto; São Paulo, 19 versus 21; Minas Gerais e Pernambuco, 20 versus 21. A diferença é um bloqueio de conciliação, não uma conclusão sobre irregularidade da pesquisa.

As listas de Mato Grosso do Sul e Sergipe agora conservam espontânea, estimulada e segundo turno, com 19 e 16 respostas, respectivamente. A lista estimulada ocupa o cenário principal mesmo quando a espontânea aparece primeiro. As seções de Senado não entram na pesquisa de governador. Ambos ainda estão bloqueados por identidade: Renato Gomes e Reinaldo Azambuja em MS; Dr. Helton Monteiro em SE. Os cinco casos anteriormente elegíveis continuaram elegíveis na repetição local com os mesmos recibos. Essa repetição não equivale a uma nova coleta remota. [confidence: alta, source: replay local dos HTMLs, documentos e registros de pf-pesquisas-s0-remote-entrada] [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]

Foi localizado e lido um [relatório integral do Paraná](https://prmais.com/wp-content/uploads/2026/08/Parana%CC%81-PR-09262_2026_Ago26.pdf), vinculado pela matéria do publicador: registro PR-09262/2026, divulgação em 18 de agosto, campo de 13 a 17 de agosto, 1.600 entrevistas. Ele contém respostas espontâneas, cenário estimulado e três duelos. Não foi incorporado ao coletor: requer suporte ao formato e validação da origem; não houve aumento silencioso do limite de PDF nem inclusão automática de fonte. [confidence: alta, source: leitura direta do PDF com pdftotext] [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]

## Confirmação remota da correção

A execução [Monitoramento de pesquisas eleitorais](https://github.com/thiago-salvador/puxa-ficha/actions/runs/34360285171) terminou no commit de código `bb92f435cc6913dad9fc1b682aaf0315b9301ffd`. Recebeu 20/20 artefatos e processou 24 pesquisas. As mesmas cinco permaneceram elegíveis, com 140 respostas. As 19 restantes ficaram bloqueadas: 11 por extração incompleta, três por identidade e cinco por metadados conflitantes. Estes cinco incluem quatro divergências de datas e o título abreviado de segundo turno no RS. MS e SE preservaram remotamente 19 e 16 respostas, respectivamente, com as identidades pendentes já descritas. A consolidação falhou com zero operações; a preparação de draft PR foi ignorada. Recibo: `/private/tmp/pf-pesquisas-s0-remote-datas`. [confidence: alta, source: readback de jobs, proposal.json, summary.md e diff.json da execução indicada] [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]

A descoberta também bloqueou uma nova matéria da Folha sobre interesse político por idade: a consulta da página respondeu HTTP 200, mas não forneceu registro identificável ao extrator. Não se concluiu que inexiste uma pesquisa; tampouco foram aproveitados percentuais sem conciliação. Recibo: `pesquisas-descoberta-34360285171/discovered-targets.json`, dentro do diretório remoto indicado. A descoberta de matérias complementares exige tratamento antes da ativação. [confidence: alta, source: artefato de descoberta e consulta direta da publicação] [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]

## Verificação

Sete gates locais, TypeScript, ESLint e build. Os novos testes cobrem inserção presidencial, criação de UF, parser público, idempotência, destino externo, geografia regional, candidato com zero omitido, datas inconsistentes, Total divergente, listas alternativas e nota de Outros.

## Trabalho restante

Resolver os formatos ainda bloqueados, tratar as divergências com evidência, ampliar descoberta além das páginas iniciais e provar cobertura e atualização por BR e 27 UFs. Uma listagem sem novidade não prova ausência de pesquisa. A aprovação dos testes não demonstra que todos os estados estão atualizados, e não autoriza merge, ativação da promoção ou publicação em produção.
