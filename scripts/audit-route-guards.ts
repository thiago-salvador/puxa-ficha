import { ROUTE_GUARDS } from "@/lib/route-guards"

const prefixes = ROUTE_GUARDS.reduce((total, guard) => total + guard.prefixes.length, 0)

console.log(
  JSON.stringify(
    {
      guardCount: ROUTE_GUARDS.length,
      prefixCount: prefixes,
      guards: ROUTE_GUARDS,
    },
    null,
    2,
  ),
)
