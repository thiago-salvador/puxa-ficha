# Política de Segurança

O Puxa Ficha é uma plataforma cívica de consulta pública sobre candidatos das
eleições brasileiras de 2026. Este repositório reúne a camada de operação e
documentação do projeto e, em `app/`, o código da aplicação que roda em
https://puxaficha.com.br.

## Não abra issue pública para falha de segurança

Se o que você encontrou é uma falha de segurança, **não abra issue, não comente
em PR e não publique nas redes antes de falar com o mantenedor.** Uma issue
pública sobre uma falha aberta descreve para qualquer pessoa como explorá-la
enquanto ela ainda está de pé.

Issue pública continua sendo o lugar certo para todo o resto: erro de dado,
fonte melhor, discordância de critério, bug de interface. Isso está em
[CONTRIBUTING.md](CONTRIBUTING.md).

## Como reportar em privado

Duas portas, as duas privadas:

1. **GitHub Private vulnerability reporting.** Na aba **Security** deste
   repositório, use **Report a vulnerability**. O relato fica visível apenas
   para você e para o mantenedor. Como funciona:
   https://docs.github.com/pt/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability
2. **Email** para **contato@puxaficha.com.br**, com o assunto começando por
   `[SECURITY]`.

Ajuda muito receber: o que está exposto, o caminho para reproduzir (URL,
requisição, passos), o impacto que você estima e a data e hora em que observou.
Se tiver uma sugestão de correção, mande junto.

## Prazo de resposta, sem promessa que não dá para cumprir

Quem mantém este projeto é uma pessoa só, Thiago Salvador, e isto não é o
trabalho de tempo integral dele. Não existe plantão, não existe turno de
madrugada e não existe segundo par de olhos para acionar. O que dá para
prometer:

- **Primeiro retorno em até 5 dias úteis**, confirmando que o relato chegou e
  foi lido.
- **Triagem em até 10 dias úteis**, dizendo se a falha foi reproduzida, qual a
  severidade atribuída e se vai ser corrigida.
- **Exposição de dado pessoal tem prioridade sobre qualquer outra coisa na
  fila**, incluindo o cronograma de produto.
- Enquanto o caso estiver aberto, você recebe notícia do andamento, mesmo que
  seja para dizer que ainda não foi resolvido.

Não há prazo prometido para a correção em si. Ele depende do tamanho da falha, e
inventar uma data aqui seria só uma data inventada. O que houver de real sobre o
prazo vai na resposta ao seu relato.

Não existe programa de recompensa. Se você quiser crédito público, diga como
prefere ser identificado e o crédito entra no anúncio da correção.

## O que conta como vulnerabilidade aqui

Dentro do escopo:

- **Exposição de dado pessoal.** É a categoria mais importante deste projeto.
  CPF não deve chegar ao cliente em hipótese alguma: ele é usado apenas como
  chave de cruzamento no servidor, durante a ingestão. Se você vir CPF, ou
  qualquer identificador pessoal, num payload de API, no HTML entregue, num
  arquivo estático, num artefato de build ou num arquivo versionado, isso é
  vulnerabilidade, mesmo que a tela não mostre.
- Dado pessoal de quem **não é candidato** (doador pessoa física, assessor,
  familiar) aparecendo de forma identificável em qualquer lugar do repositório
  ou do site.
- Falha de controle de acesso: leitura ou escrita em dado que deveria ser
  restrito, endpoint administrativo alcançável sem autenticação, permissão de
  banco mais larga do que a rota precisa.
- Injeção (SQL, comando, template), XSS, SSRF, path traversal, desserialização
  insegura.
- Segredo vivo commitado ou alcançável: chave de service role, token de API,
  credencial em histórico de git, em log, em backup ou em artefato de entrega
  dentro deste repositório.
- Falha na cadeia de build ou deploy que permita a terceiros alterar o que vai
  ao ar.
- Qualquer caminho que permita adulterar o conteúdo publicado de uma ficha sem
  passar pela revisão do mantenedor. Numa plataforma eleitoral, adulterar dado
  publicado é um problema de segurança, não só de produto.

Fora do escopo, por serem outra conversa e não falha de segurança:

- Discordar de um critério editorial, do recorte de uma ficha ou da metodologia.
  Isso é issue pública, e é contribuição legítima.
- Dado errado ou desatualizado numa ficha. Isso é correção de dado, com fonte
  oficial, pelo fluxo do [CONTRIBUTING.md](CONTRIBUTING.md).
- Saída de scanner automático sem impacto demonstrado, cabeçalho HTTP ausente
  sem exploração associada, resultado de teste de força de TLS sem consequência
  prática.
- Volume de requisições e negação de serviço por saturação. Não teste isso: o
  site é de interesse público e derrubá-lo em período eleitoral prejudica quem
  quer consultar.
- Engenharia social, phishing contra o mantenedor, acesso físico.

## Não faça isto ao testar

Testar contra a produção é aceitável desde que você não cause dano. Não vale
extrair base de dados, alterar ou apagar registro, acessar conta de terceiro,
degradar o serviço nem manter acesso depois de confirmar a falha. Se topar com
dado pessoal durante o teste, pare, não copie e diga isso no relato.

Relato feito de boa fé, dentro deste escopo e destas regras, não vai ser tratado
como ataque.

## Segredos

Nenhum segredo é versionado. As variáveis de ambiente são documentadas pelo
nome, nunca pelo valor, e o `.gitignore` da raiz bloqueia `.env`, `.env.*`,
`*.pem`, `*.key`, `credentials.json` e `service-account*.json`.

Se um segredo vazar, a ordem é: rotacionar a credencial primeiro, remover do
histórico depois. Rotacionar antes evita que a limpeza do histórico vire aviso
para quem já copiou.

## Versões suportadas

Este é um projeto de aplicação, não uma biblioteca versionada. Não há release
antiga com suporte: a correção de segurança é aplicada na branch `main` e
publicada em produção a partir dela.
