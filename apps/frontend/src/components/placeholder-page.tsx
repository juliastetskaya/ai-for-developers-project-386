function PlaceholderPage({ title }: { title: string }) {
  return (
    <section className="flex flex-col items-center gap-4 py-24 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
      <p className="text-muted-foreground">This page is under construction.</p>
    </section>
  )
}

export default PlaceholderPage
