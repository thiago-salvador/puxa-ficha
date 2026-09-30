import assert from "node:assert/strict"
import { after, test } from "node:test"

const PREV_PUBLIC = process.env.NEXT_PUBLIC_SUPABASE_URL
const PREV_SERVER = process.env.SUPABASE_URL
delete process.env.NEXT_PUBLIC_SUPABASE_URL
process.env.SUPABASE_URL = "https://pf-server.supabase.co"

after(() => {
  if (PREV_PUBLIC === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL
  else process.env.NEXT_PUBLIC_SUPABASE_URL = PREV_PUBLIC
  if (PREV_SERVER === undefined) delete process.env.SUPABASE_URL
  else process.env.SUPABASE_URL = PREV_SERVER
})

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { isAllowedImageSource } = require("../src/lib/remote-image-hosts")

test("sem a variável pública, o Storage do SUPABASE_URL continua aceito no card", () => {
  assert.equal(isAllowedImageSource("https://pf-server.supabase.co/storage/v1/object/public/candidatos-fotos/roster-2026/1.jpg"), true)
  assert.equal(isAllowedImageSource("https://pf-server.supabase.co/rest/v1/candidatos"), false)
})
