/** Only process plumbing crosses into a non-Node executable. */
export function minimalChildEnv(source: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const selected = { PATH: source.PATH, HOME: source.HOME, TMPDIR: source.TMPDIR }
  return Object.fromEntries(Object.entries(selected).filter(([, value]) => Boolean(value))) as NodeJS.ProcessEnv
}

/** Chrome on this macOS runner needs only the same process plumbing. */
export function chromeChildEnv(source: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return minimalChildEnv(source)
}
