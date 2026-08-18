# Histórico da proposta de proveniência de trajetória, oito fichas

Esta pasta preserva a proposta local que embasou a decisão editorial. Em
11/08/2026, o Thiago aprovou a persistência das oito verificações como
`sem_achado_no_escopo`. A versão aplicável preparada, ainda não aplicada, está
em:

- `supabase/migrations/20260810124000_destaques_trajetoria_tse_8.sql`;
- `supabase/rollback/20260810124000_destaques_trajetoria_tse_8.rollback.sql`;
- `supabase/readback/20260810124000_destaques_trajetoria_tse_8.readback.sql`;
- `scripts/audit/allowlist-destaques-trajetoria-tse-8-20260811.json`.

Os SQLs desta pasta são o snapshot histórico da proposta e não são entrada de
release. A promoção aplicável acrescenta guards fail-closed, comparação do
payload inteiro e URL nula quando a evidência depende de mais de um pacote.
`recortes.json` continua sob responsabilidade da integração da Raiz.

As oito fichas tinham `destaques-trajetoria` em `nunca_verificado`. A auditoria
baixou os pacotes atuais `consulta_cand` do TSE, conferiu identidade por
`SQ_CANDIDATO` mais nome e encontrou somente candidaturas sem resultado eleito
nos pleitos versionados. O resultado proposto é `sem_achado_no_escopo`, que
explicita a limitação. Não é `vazio_confirmado`, não declara carreira pública
inexistente e não fecha o vazio integral da ficha.

O artefato `../auditoria-fontes-32.json` registra por ficha os SQs, resultados,
URLs, SHA-256 e tamanho de cada pacote oficial consultado.
