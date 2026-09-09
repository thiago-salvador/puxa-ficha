# Acesso público alternativo ao registro TSE

Verificação de 9 de setembro de 2026, através da interface pública do PesqEle. Consulta por eleição 2026 e identificação AM-09965/2026, seguida de abertura dos detalhes. Não houve autenticação, CAPTCHA ou tentativa de obter arquivo restrito.

[Consulta pública do PesqEle](https://pesqele-divulgacao.tse.jus.br/app/pesquisa/listar.xhtml).

## Registro confirmado

| Campo | Valor observado na fonte primária |
|---|---|
| Identificação | AM-09965/2026 |
| Registro | 20/08/2026 |
| Divulgação | 26/08/2026 |
| Instituto | REAL TIME MIDIA LTDA / REAL TIME BIG DATA |
| Abrangência | Amazonas |
| Cargos registrados | Governador e Senador |
| Entrevistados | 1.600 |
| Campo | 21 a 25/08/2026 |
| Método | Abordagens telefônicas e digitais, com entrevistadores humanos e recursos de inteligência artificial |
| Confiança informada | 95% |
| Margem máxima informada | Aproximadamente 2 pontos percentuais |

Essa leitura confirma os metadados que faltavam na matéria do R7. Não comprova os percentuais publicados na matéria nem a existência de uma pesquisa posterior.

Ao abrir a opção de relatório completo, a interface informou que o arquivo foi fornecido pela empresa, mas só será disponibilizado após o término das eleições. Nenhuma tentativa de acessar o arquivo por outra via foi feita.

## Limites da prova

- Esta é uma transcrição da leitura direta da interface nesta sessão, não um snapshot HTML assinado nem uma captura executada pelo monitor.
- A página de detalhes depende da sessão de consulta. O endereço genérico não reproduz sozinho o registro; usar a busca pelo número acima.
- O portal de downloads e o ZIP continuaram indisponíveis nas tentativas documentadas no diagnóstico anterior.
- A consulta pelo navegador demonstrou uma via pública funcional. Integrá-la ao monitor exige um coletor próprio, preservação da evidência e testes de correspondência de registro, cargo e UF. O monitor atual ainda não usa essa via.

## Correção da coleta única

O consolidador passou a reconhecer `proposal.json` na raiz do download quando a matriz identifica exatamente uma combinação de fonte e UF. Matriz ambígua, item incorreto e duplicatas continuam bloqueados. Cinco testes novos reproduziram o defeito antes da correção e passaram depois.

O artefato real da primeira execução remota foi reprocessado localmente. O resumo mudou de um artefato esperado e zero recebidos para um esperado e um recebido, preservando o bloqueio real `source_unavailable` e zero operações. Testes do monitor, atualização agendada, TypeScript, ESLint, build e quatro gates Unlazy passaram.

[confidence: alta, source: interface pública do PesqEle, artefatos do GitHub e testes locais desta sessão] [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
