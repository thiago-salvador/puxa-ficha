# Política de Segurança

## Reportar uma vulnerabilidade

Se você encontrar uma vulnerabilidade de segurança, um vazamento de dados
pessoais ou uma falha de controle de acesso, **não abra uma issue pública.**

Reporte de forma privada por um destes canais:

- Email: **contato@puxaficha.com.br** (assunto começando com `[SECURITY]`)
- Ou use o [Private vulnerability reporting](https://docs.github.com/pt/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)
  do GitHub, na aba **Security** do repositório.

Inclua, se possível: descrição da falha, passos para reproduzir, impacto
estimado e qualquer sugestão de correção. A equipe se compromete a responder em
até 5 dias úteis e a manter contato até a resolução.

## Dados sensíveis

O Puxa Ficha trabalha com dados públicos de candidatos (fonte: TSE, Câmara,
Senado, Portal da Transparência). Mesmo sendo públicos, alguns campos são
tratados como sensíveis por decisão de privacidade do projeto:

- **CPF nunca é exposto no cliente.** O CPF é usado apenas como chave de
  cruzamento no pipeline de ingestão, no servidor. Se você identificar CPF ou
  qualquer identificador pessoal chegando ao browser ou a um endpoint público,
  trate como vulnerabilidade e reporte pelo canal privado.
- Não adicione ao repositório dados pessoais de pessoas físicas que não sejam os
  candidatos (assessores, doadores pessoa física, familiares).

## Segredos

- Nenhum segredo deve ser commitado. Use `.env.local` (git-ignored) a partir do
  `.env.example`.
- Se um segredo for exposto acidentalmente, rotacione a credencial antes de
  qualquer outra ação e depois remova do histórico.

## Versões suportadas

Este é um projeto de aplicação (não uma biblioteca versionada). Correções de
segurança são aplicadas sempre sobre a branch `main`.
