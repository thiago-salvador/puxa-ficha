import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import ts from "typescript"
import { findRouteGuard, ROUTE_GUARDS } from "@/lib/route-guards"

type NextMiddlewareMatcher = {
  regexp: string
  originalSource: string
}

const { getMiddlewareMatchers } = createRequire(import.meta.url)(
  "next/dist/build/analysis/get-page-static-info",
) as {
  getMiddlewareMatchers: (
    matcherOrMatchers: string | string[],
    nextConfig: Record<string, unknown>,
  ) => NextMiddlewareMatcher[]
}

function readStaticMiddlewareMatchers() {
  const fileName = "middleware.ts"
  const source = ts.createSourceFile(
    fileName,
    readFileSync(fileName, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )

  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue

    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || declaration.name.text !== "config") continue
      if (!declaration.initializer || !ts.isObjectLiteralExpression(declaration.initializer)) break

      const matcherProperty = declaration.initializer.properties.find(
        (property): property is ts.PropertyAssignment =>
          ts.isPropertyAssignment(property) &&
          ((ts.isIdentifier(property.name) && property.name.text === "matcher") ||
            (ts.isStringLiteral(property.name) && property.name.text === "matcher")),
      )

      assert.ok(matcherProperty, "middleware config must declare matcher")
      assert.ok(
        ts.isArrayLiteralExpression(matcherProperty.initializer),
        "middleware config.matcher must remain a static array",
      )

      return matcherProperty.initializer.elements.map((element) => {
        assert.ok(
          ts.isStringLiteralLike(element),
          "every middleware matcher must remain a static string",
        )
        return element.text
      })
    }
  }

  throw new Error("middleware.ts must export a static config.matcher array")
}

function compileMatcher(source: string) {
  const [matcher] = getMiddlewareMatchers([source], {})
  assert.ok(matcher, `Next did not compile matcher ${source}`)
  return new RegExp(matcher.regexp)
}

const prefixes = ROUTE_GUARDS.reduce((total, guard) => total + guard.prefixes.length, 0)
const matcherSources = readStaticMiddlewareMatchers()
const dottedPathByPrefix = new Map([
  ["/preview", "/preview/candidato/a.b"],
  ["/internaltest", "/internaltest/a.b"],
  ["/styleguide", "/styleguide/a.b"],
  ["/candidato", "/candidato/foo.bar"],
  ["/rankings", "/rankings/foo.bar"],
  ["/uf", "/uf/sp.br"],
])
const canonicalMatcherSources = ROUTE_GUARDS.flatMap(({ prefixes: guardPrefixes }) =>
  guardPrefixes.map((prefix) => `${prefix}/:path*`),
)
const literalGuardMatchers = matcherSources.filter((source) => source.endsWith("/:path*"))

assert.deepEqual(
  literalGuardMatchers,
  canonicalMatcherSources,
  "literal middleware matchers must exactly cover the canonical guard prefixes",
)

let coveredPathCount = 0
let rejectedNeighborCount = 0

for (const guard of ROUTE_GUARDS) {
  for (const prefix of guard.prefixes) {
    const matcher = compileMatcher(`${prefix}/:path*`)
    const dottedPath = dottedPathByPrefix.get(prefix)
    assert.ok(dottedPath, `missing dotted regression path for ${prefix}`)
    const matcherPaths = [prefix, `${prefix}/plain`, dottedPath]

    for (const pathname of matcherPaths) {
      assert.equal(matcher.test(pathname), true, `${pathname} must match ${prefix}`)
      coveredPathCount += 1
    }

    const guardedPaths = guard.match === "exact-or-subpath" ? matcherPaths : matcherPaths.slice(1)
    for (const pathname of guardedPaths) {
      assert.equal(
        findRouteGuard(pathname)?.guard.id,
        guard.id,
        `${pathname} must resolve to ${guard.id}`,
      )
    }

    for (const pathname of [`${prefix}x`, `${prefix}.x`, `${prefix}x/with.dot`]) {
      assert.equal(matcher.test(pathname), false, `${pathname} must not match ${prefix}`)
      assert.equal(findRouteGuard(pathname), null, `${pathname} must stay outside the inventory`)
      rejectedNeighborCount += 1
    }
  }
}

console.log(
  JSON.stringify(
    {
      guardCount: ROUTE_GUARDS.length,
      prefixCount: prefixes,
      literalMatcherCount: literalGuardMatchers.length,
      coveredPathCount,
      rejectedNeighborCount,
      guards: ROUTE_GUARDS,
    },
    null,
    2,
  ),
)
