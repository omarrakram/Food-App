import { brand } from '../data/brand';

interface Props {
  className?: string;
  /** Visual treatment of the plain-type fallback. */
  tone?: 'blue' | 'white' | 'ink';
}

/**
 * The Pop Spot name. When the official logo file is configured in
 * `data/brand.ts` it is used as-is; otherwise the name is set in plain display
 * type on a sticker, deliberately not imitating the real wordmark.
 */
export function BrandMark({ className = '', tone = 'blue' }: Props) {
  if (brand.officialLogoSrc) {
    return <img className={`brandmark brandmark--logo ${className}`} src={brand.officialLogoSrc} alt="Pop Spot" />;
  }
  return (
    <span className={`brandmark brandmark--${tone} ${className}`} aria-label="Pop Spot">
      <span aria-hidden>POP</span>
      <i aria-hidden className="brandmark__spot" />
      <span aria-hidden>SPOT</span>
    </span>
  );
}
