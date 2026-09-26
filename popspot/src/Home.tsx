import './styles/site.css';

import { useState } from 'react';

import { BagDrawer } from './components/BagDrawer';
import { Boot } from './components/Boot';
import { Cursor } from './components/Cursor';
import { ProductDetail } from './components/ProductDetail';
import { SearchHunt } from './components/SearchHunt';
import { Toast } from './components/Toast';
import { TopBar } from './components/TopBar';
import { StoreProvider } from './lib/store';
import { CollectorShelf } from './sections/CollectorShelf';
import { CollectorWall } from './sections/CollectorWall';
import { DropMachine } from './sections/DropMachine';
import { EndFrame } from './sections/EndFrame';
import { FandomPortal } from './sections/FandomPortal';
import { PortalHero } from './sections/PortalHero';
import { RarityScanner } from './sections/RarityScanner';
import { Vault } from './sections/Vault';

export function Home() {
  const [ready, setReady] = useState(false);
  return (
    <StoreProvider>
      <a className="skip mono" href="#universes">
        Skip to the collection
      </a>
      {!ready && <Boot onDone={() => setReady(true)} />}
      <TopBar />
      <main>
        <PortalHero ready={ready} />
        <FandomPortal />
        <CollectorWall />
        <CollectorShelf />
        <RarityScanner />
        <DropMachine />
        <Vault />
      </main>
      <EndFrame />
      <ProductDetail />
      <SearchHunt />
      <BagDrawer />
      <Toast />
      <Cursor />
    </StoreProvider>
  );
}
