export interface CanonicalPersonEntry {
  canonicalSlug: string
  personName: string
  slugs: string[]
}

const GROUPS: CanonicalPersonEntry[] = [
  {
    canonicalSlug: "ciro-gomes",
    personName: "Ciro Ferreira Gomes",
    slugs: ["ciro-gomes", "ciro-gomes-gov-ce"],
  },
  {
    canonicalSlug: "tarcisio",
    personName: "Tarcisio Gomes de Freitas",
    slugs: ["tarcisio", "tarcisio-gov-sp"],
  },
]

const CANONICAL_BY_SLUG = new Map<string, CanonicalPersonEntry>()

for (const group of GROUPS) {
  for (const slug of group.slugs) {
    CANONICAL_BY_SLUG.set(slug, group)
  }
}

export function getCanonicalPerson(slug: string): CanonicalPersonEntry {
  const mapped = CANONICAL_BY_SLUG.get(slug)
  if (mapped) return mapped

  return {
    canonicalSlug: slug,
    personName: slug,
    slugs: [slug],
  }
}

export function getCanonicalSlug(slug: string): string {
  return getCanonicalPerson(slug).canonicalSlug
}

export function getRelatedPersonSlugs(slug: string): string[] {
  return getCanonicalPerson(slug).slugs
}
