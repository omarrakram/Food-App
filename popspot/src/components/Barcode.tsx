/** A decorative barcode derived deterministically from a string (not scannable). */
export function Barcode({ value, className = '', height = 26 }: { value: string; className?: string; height?: number }) {
  const bars: number[] = [];
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i);
    bars.push((c % 3) + 1, ((c >> 2) % 2) + 1, ((c >> 3) % 3) + 1, (c % 2) + 1);
  }
  return (
    <span className={`barcode ${className}`} style={{ height }} aria-hidden>
      {bars.map((w, i) => (
        <i key={i} style={{ width: w * 1.5, marginRight: ((i * 7) % 3) + 1.5, opacity: i % 2 ? 1 : 1 }} />
      ))}
    </span>
  );
}
