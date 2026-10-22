import { createRequire } from "node:module"

// Node's markup tests do not load stylesheets; browsers still render the real CSS.
const require = createRequire(import.meta.url)
require.extensions[".css"] = module => {
  const target: Record<string, unknown> = {}
  const styles = new Proxy(target, { get: (object, property) => property === "default" ? object.default : property })
  target.default = styles
  module.exports = styles
}
