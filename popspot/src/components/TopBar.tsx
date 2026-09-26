import { products } from '../data/products';
import { useStore } from '../lib/store';
import { BrandMark } from './BrandMark';

const LINKS: [string, string][] = [
  ['#universes', 'Universes'],
  ['#wall', 'The Wall'],
  ['#shelf', 'Shelf'],
  ['#scanner', 'Scanner'],
  ['#drops', 'Drops'],
  ['#vault', 'Vault'],
];

export function TopBar() {
  const { bag, vault, setSearchOpen, setBagOpen } = useStore();
  return (
    <header className="topbar">
      <a className="topbar__brand" href="#top" data-cursor="HOME">
        <BrandMark />
        <span className="topbar__sub mono">
          Collectorverse
          <br />
          <span className="mute">Unofficial concept</span>
        </span>
      </a>
      <nav className="topbar__nav" aria-label="Sections">
        {LINKS.map(([href, label], i) => (
          <a key={href} href={href} className="topbar__link" data-cursor="ENTER">
            <span className="mono">{String(i + 1).padStart(2, '0')}</span>
            {label}
          </a>
        ))}
      </nav>
      <div className="topbar__actions">
        <span className="topbar__count mono" title="Derived from the product manifest">
          <b>{String(products.length).padStart(2, '0')}</b> objects spotted
        </span>
        <button className="topbar__hunt" onClick={() => setSearchOpen(true)} data-cursor="HUNT">
          <span className="topbar__hunt-spot" aria-hidden />
          Hunt
          <kbd className="mono">/</kbd>
        </button>
        <a className="topbar__pill" href="#vault" data-vault-target data-cursor="VAULT" aria-label={`Vault, ${vault.length} items`}>
          <span className="mono">Vault</span>
          <b>{String(vault.length).padStart(2, '0')}</b>
        </a>
        <button
          className="topbar__pill topbar__pill--blue"
          onClick={() => setBagOpen(true)}
          data-bag-target
          data-cursor="BAG"
          aria-label={`Collection bag, ${bag.length} items`}
        >
          <span className="mono">Bag</span>
          <b>{String(bag.length).padStart(2, '0')}</b>
        </button>
      </div>
    </header>
  );
}
