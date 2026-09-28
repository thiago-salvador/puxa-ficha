/**
 * Ruído do navegador que não é erro do site: webview de app (Instagram,
 * Facebook), extensão de carteira, script de terceiro injetado na página e
 * falha de rede do próprio usuário. Padrões ancorados na mensagem inteira para
 * não engolir erro real com texto parecido.
 */
export const SENTRY_CLIENT_IGNORE_ERRORS: RegExp[] = [
  // Ponte nativa do webview do Instagram/Facebook.
  /^Error invoking postMessage: Java (?:exception was raised during method invocation|object is gone)$/,
  /^undefined is not an object \(evaluating 'window\.webkit\.messageHandlers'\)$/,
  // Extensão MetaMask tentando conectar em qualquer página.
  /^Failed to connect to MetaMask$/,
  /^MetaMask extension not found$/,
  // Script de terceiro lendo JSON-LD da página.
  /^undefined is not an object \(evaluating '[\w$]+\["@context"\]\.toLowerCase'\)$/,
  // Executor injetado (`executors/200.js`), fora do bundle do site.
  /^Cannot read properties of undefined \(reading 'M_ID'\)$/,
  // Rede do usuário caiu no meio do fetch (Safari e Firefox).
  /^Load failed$/,
  /^network error$/,
  // Crawler de link seguro de e-mail rejeitando com objeto.
  /^Non-Error promise rejection captured with value: Object Not Found Matching Id:\d+, MethodName:\w+, ParamCount:\d+$/,
  // Cliente fechou a conexão antes do fim do stream.
  /^The destination stream closed early\.?$/,
]

/**
 * Frames cuja origem é extensão ou script injetado, nunca o bundle do site
 * (que vive em `/_next/`). Casa pelo caminho porque o SDK pode reescrever a
 * origem do frame para `app:///`.
 */
export const SENTRY_CLIENT_DENY_URLS: RegExp[] = [
  /^(?:chrome|moz|safari(?:-web)?)-extension:\/\//,
  /^[a-z-]+:\/\/[^/]*\/scripts\/inpage\.js(?:[?#]|$)/,
  /^[a-z-]+:\/\/[^/]*\/executors\/\d+\.js(?:[?#]|$)/,
]
