export default function Loading() {
  return (
    <div className="max-w-4xl mx-auto px-6 py-16 animate-pulse">
      {/* Header skeleton */}
      <div className="h-6 w-32 rounded-full bg-surface-container mb-8" />
      <div className="h-12 w-2/3 rounded-lg bg-surface-container mb-4" />
      <div className="h-5 w-full rounded bg-surface-container mb-2" />
      <div className="h-5 w-4/5 rounded bg-surface-container mb-10" />

      {/* Card grid skeleton */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-40 rounded-lg bg-surface-container" />
        ))}
      </div>
    </div>
  )
}
