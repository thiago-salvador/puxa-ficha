export const revalidate = 3600

export default async function CandidatoPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <h1 className="text-3xl font-bold">Ficha: {slug}</h1>
      <p className="mt-4 text-muted-foreground">Em construcao</p>
    </main>
  )
}
