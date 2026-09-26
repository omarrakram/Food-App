import { forwardRef, type CSSProperties, type HTMLAttributes } from 'react';

import type { Product } from '../data/products';

interface Props extends HTMLAttributes<HTMLDivElement> {
  product: Product;
  /** CSS height of the object (width follows the photo's own aspect ratio). */
  height: number | string;
  shadow?: boolean;
  bounce?: boolean;
  eager?: boolean;
  /**
   * Cap the rendered height at 1.6x the photo's native pixels (the supplied
   * images are small screenshots) so no product is ever shown blurry.
   */
  cap?: boolean;
  /** Shrink to fit the parent's width too (wide photos in narrow slots). */
  fit?: boolean;
}

/** Native pixel height of the supplied photo (cutouts are stored at 2x). */
export const nativeHeight = (p: Product) => p.h / 2;

/** A real product photograph treated as a physical object: contact shadow + blue bounce light. */
export const ProductObject = forwardRef<HTMLDivElement, Props>(function ProductObject(
  { product, height, shadow = true, bounce = false, eager = false, cap = true, fit = false, className = '', style, ...rest },
  ref,
) {
  const h = typeof height === 'number' ? `${height}px` : height;
  const s: CSSProperties = {
    height: h,
    aspectRatio: `${product.w} / ${product.h}`,
    ...(cap ? { maxHeight: `${Math.round(nativeHeight(product) * 1.6)}px` } : null),
    ...style,
  };
  return (
    <div ref={ref} className={`pobj ${fit ? 'pobj--fit' : ''} ${className}`} style={s} {...rest}>
      {bounce && <span className="pobj__bounce" />}
      {shadow && <span className="pobj__shadow" />}
      <img
        className="pobj__img"
        src={product.image}
        width={product.w}
        height={product.h}
        alt={product.verification === 'unverified' ? `Collectible ${product.n} (unlisted)` : product.name}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        draggable={false}
      />
    </div>
  );
});
