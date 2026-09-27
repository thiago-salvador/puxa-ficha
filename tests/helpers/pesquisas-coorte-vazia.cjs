const fetchOriginal = globalThis.fetch

globalThis.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input.url
  if (url.includes("/rest/v1/candidaturas_fase_2026_publico")) {
    return new Response("[]", { status: 200, headers: { "content-type": "application/json" } })
  }
  return fetchOriginal(input, init)
}
