#!/usr/bin/env node

import { existsSync } from "node:fs"
import Module from "node:module"
import path from "node:path"

const originalLoad = Module._load

// O shim só faz sentido no layout do yargs 17 (build/index.cjs). O yargs 18,
// que o c8 12 usa, é ESM puro e não tem esse arquivo; nesse caso o require(esm)
// nativo do Node >= 22.12 resolve sozinho e interceptar quebraria o load.
const yargsLegacyBuild = path.join(process.cwd(), "node_modules", "yargs", "build", "index.cjs")

Module._load = function loadWithYargsCompat(request, parent, ...rest) {
  if (request === "yargs/yargs" && existsSync(yargsLegacyBuild)) {
    const yargsBuildPath = yargsLegacyBuild
    const { applyExtends, cjsPlatformShim, Parser, Yargs, processArgv } = originalLoad.call(
      this,
      yargsBuildPath,
      parent,
      false
    )

    Yargs.applyExtends = (config, cwd, mergeExtends) => {
      return applyExtends(config, cwd, mergeExtends, cjsPlatformShim)
    }
    Yargs.hideBin = processArgv.hideBin
    Yargs.Parser = Parser
    return Yargs
  }

  return originalLoad.call(this, request, parent, ...rest)
}

await import("../node_modules/c8/bin/c8.js")
