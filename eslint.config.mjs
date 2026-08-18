import { createRequire } from "module"

const require = createRequire(import.meta.url)

/** Next.js 16 exporta flat config nativo; FlatCompat com eslint-config-next 16 quebra (referência circular). */
const nextCoreWebVitals = require("eslint-config-next/core-web-vitals")
const nextTypescript = require("eslint-config-next/typescript")
const reactHooks = require("eslint-plugin-react-hooks")

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      // React Compiler / hooks v7: projeto legado ainda não está alinhado; não bloquear CI.
      // Refatorar gradualmente (effects com setState, refs no render, etc.).
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/incompatible-library": "warn",
    },
  },
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      ".vercel/**",
      "out/**",
      "output/**",
      "build/**",
      ".tmp/**",
      "next-env.d.ts",
      ".claude/**",
      "playwright-report/**",
      "test-results/**",
    ],
  },
]

export default eslintConfig
