import { createRequire } from "node:module"

// Test-only equivalent of the react-server condition, without changing React's
// exports for the UI tests that share the standard test command.
const require = createRequire(import.meta.url)
const serverOnlyPath = require.resolve("server-only")
require.cache[serverOnlyPath] = {
  id: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  exports: {},
} as never
