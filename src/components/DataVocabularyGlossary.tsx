import { PUBLIC_DATA_VOCABULARY } from "@/lib/public-data-vocabulary"

export function DataVocabularyGlossary() {
  return <details className="mt-4" id="estados-dos-dados">
    <summary className="cursor-pointer font-bold focus-visible:outline-2 focus-visible:outline-offset-4">O que significa cada estado</summary>
    <dl className="mt-3 space-y-3">{Object.entries(PUBLIC_DATA_VOCABULARY).map(([key, copy]) => <div key={key}><dt className="font-semibold">{copy.label}</dt><dd className="text-muted-foreground">{copy.description}</dd></div>)}</dl>
  </details>
}
