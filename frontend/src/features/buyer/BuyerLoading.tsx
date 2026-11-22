export function BuyerLoading({ label = 'Loading buyer data…' }: { label?: string }) {
  return <div role="status" aria-busy="true"><span className="sr-only">{label}</span>
    <div aria-hidden="true" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map(index => <div key={index} className="h-32 rounded-lg border bg-muted motion-safe:animate-pulse" />)}</div>
    <div aria-hidden="true" className="mt-6 h-56 rounded-lg border bg-muted motion-safe:animate-pulse" />
  </div>;
}
