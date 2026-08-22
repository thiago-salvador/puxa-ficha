import { unstable_cache } from "next/cache"

type AsyncOperation<Args extends unknown[], Result> = (...args: Args) => Promise<Result>

const UNDEFINED_ARGUMENT = { __singleFlightUndefined: true }

function serializeArguments(args: unknown[]): string {
  return JSON.stringify(args, (_key, value) =>
    value === undefined ? UNDEFINED_ARGUMENT : value
  )
}

/**
 * Coalesce concurrent calls with the same arguments inside one Node.js instance.
 * The entry exists only while the operation is pending, so successes and failures
 * never become an extra cache layer.
 */
export function createSingleFlight<Args extends unknown[], Result>(
  operation: AsyncOperation<Args, Result>
): AsyncOperation<Args, Result> {
  const inFlight = new Map<string, Promise<Result>>()

  return (...args: Args): Promise<Result> => {
    const key = serializeArguments(args)
    const current = inFlight.get(key)
    if (current) return current

    const pending = Promise.resolve().then(() => operation(...args))
    inFlight.set(key, pending)

    const clear = () => {
      if (inFlight.get(key) === pending) inFlight.delete(key)
    }
    void pending.then(clear, clear)

    return pending
  }
}

/**
 * `unstable_cache` persists results across requests, while this wrapper only
 * coalesces simultaneous reads during a cold miss. Scope is deliberately local
 * to the function instance; it does not change Next's TTL, tags or HTML policy.
 */
export function unstableCacheWithSingleFlight<Args extends unknown[], Result>(
  operation: AsyncOperation<Args, Result>,
  keyParts?: string[],
  options?: { revalidate?: number | false; tags?: string[] }
): AsyncOperation<Args, Result> {
  return createSingleFlight(unstable_cache(operation, keyParts, options))
}
