import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { products } from '../data/products';
import { gsap, reducedMotion } from './gsap';
import { load, save } from './storage';

export type VaultState = 'WANTED' | 'OWNED' | 'PRE-ORDERED';
export interface VaultEntry {
  id: string;
  state: VaultState;
}

interface Detail {
  id: string;
  /** Where the product was on screen when it was opened, for the pull-forward transition. */
  from: DOMRect | null;
}

interface Store {
  bag: string[];
  addToBag: (id: string, from?: Element | null) => void;
  removeFromBag: (index: number) => void;
  vault: VaultEntry[];
  vaultIsDemo: boolean;
  inVault: (id: string) => boolean;
  toggleVault: (id: string, from?: Element | null) => void;
  setVaultState: (id: string, state: VaultState) => void;
  detail: Detail | null;
  openDetail: (id: string, from?: Element | null) => void;
  closeDetail: () => void;
  searchOpen: boolean;
  setSearchOpen: (open: boolean) => void;
  bagOpen: boolean;
  setBagOpen: (open: boolean) => void;
  toast: { key: number; text: string } | null;
  say: (text: string) => void;
}

const Ctx = createContext<Store | null>(null);

const DEMO_VAULT: VaultEntry[] = [
  { id: 'product-03', state: 'OWNED' },
  { id: 'product-08', state: 'WANTED' },
  { id: 'product-13', state: 'OWNED' },
  { id: 'product-10', state: 'WANTED' },
];

const valid = (id: string) => products.some((p) => p.id === id);

/**
 * A copy of the product image flies from `from` to the element matching
 * `target` and lands with a small pop on the target. Purely visual.
 */
export function flyTo(src: string, from: Element | null | undefined, target: string) {
  const to = document.querySelector(target);
  if (!from || !to || reducedMotion()) return;
  const a = from.getBoundingClientRect();
  const b = to.getBoundingClientRect();
  const img = document.createElement('img');
  img.src = src;
  img.alt = '';
  img.className = 'fly-token';
  const size = Math.min(a.height, 160);
  Object.assign(img.style, {
    left: `${a.left + a.width / 2 - size / 2}px`,
    top: `${a.top + a.height / 2 - size / 2}px`,
    height: `${size}px`,
  });
  document.body.appendChild(img);
  const dx = b.left + b.width / 2 - (a.left + a.width / 2);
  const dy = b.top + b.height / 2 - (a.top + a.height / 2);
  gsap
    .timeline({ onComplete: () => img.remove() })
    .to(img, { x: dx, duration: 0.7, ease: 'power2.in' }, 0)
    .to(img, { y: dy, duration: 0.7, ease: 'back.in(1.6)' }, 0)
    .to(img, { scale: 0.12, rotate: 200, duration: 0.7, ease: 'power2.in' }, 0)
    .fromTo(to, { scale: 1 }, { scale: 1.35, duration: 0.12, yoyo: true, repeat: 1, ease: 'power2.out' }, 0.66);
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [bag, setBag] = useState<string[]>(() => load<string[]>('ps.bag', []).filter(valid));
  const stored = load<VaultEntry[] | null>('ps.vault', null);
  const [vault, setVault] = useState<VaultEntry[]>(() => (stored ?? DEMO_VAULT).filter((e) => valid(e.id)));
  const [vaultIsDemo, setVaultIsDemo] = useState(stored === null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [bagOpen, setBagOpen] = useState(false);
  const [toast, setToast] = useState<Store['toast']>(null);

  useEffect(() => save('ps.bag', bag), [bag]);
  useEffect(() => {
    if (!vaultIsDemo) save('ps.vault', vault);
  }, [vault, vaultIsDemo]);

  const say = useCallback((text: string) => setToast({ key: Date.now(), text }), []);

  const addToBag = useCallback(
    (id: string, from?: Element | null) => {
      const prod = products.find((p) => p.id === id);
      setBag((b) => [...b, id]);
      if (prod) {
        flyTo(prod.image, from, '[data-bag-target]');
        say(`COLLECTED — ${prod.name.toUpperCase()}`);
      }
    },
    [say],
  );

  const removeFromBag = useCallback((index: number) => {
    setBag((b) => b.filter((_, i) => i !== index));
  }, []);

  const inVault = useCallback((id: string) => vault.some((e) => e.id === id), [vault]);

  const toggleVault = useCallback(
    (id: string, from?: Element | null) => {
      const prod = products.find((p) => p.id === id);
      const had = inVault(id);
      setVaultIsDemo(false);
      setVault((v) =>
        v.some((e) => e.id === id) ? v.filter((e) => e.id !== id) : [...v, { id, state: 'WANTED' }],
      );
      if (!prod) return;
      if (!had) flyTo(prod.image, from, '[data-vault-target]');
      say(had ? `REMOVED FROM VAULT — ${prod.name.toUpperCase()}` : `SAVED TO VAULT — ${prod.name.toUpperCase()}`);
    },
    [inVault, say],
  );

  const setVaultState = useCallback((id: string, state: VaultState) => {
    setVaultIsDemo(false);
    setVault((v) => v.map((e) => (e.id === id ? { ...e, state } : e)));
  }, []);

  const openDetail = useCallback((id: string, from?: Element | null) => {
    setDetail({ id, from: from ? from.getBoundingClientRect() : null });
  }, []);
  const closeDetail = useCallback(() => setDetail(null), []);

  const value = useMemo<Store>(
    () => ({
      bag,
      addToBag,
      removeFromBag,
      vault,
      vaultIsDemo,
      inVault,
      toggleVault,
      setVaultState,
      detail,
      openDetail,
      closeDetail,
      searchOpen,
      setSearchOpen,
      bagOpen,
      setBagOpen,
      toast,
      say,
    }),
    [bag, addToBag, removeFromBag, vault, vaultIsDemo, inVault, toggleVault, setVaultState, detail, openDetail, closeDetail, searchOpen, bagOpen, toast, say],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore outside StoreProvider');
  return s;
}
