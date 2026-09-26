import { lazy, Suspense } from 'react';

import { Home } from './Home';

const Showcase = lazy(() => import('./showcase/Showcase'));

/** Two routes, no router needed: `/` is the site, `/showcase` is the collector-film. */
export function App() {
  const path = window.location.pathname.replace(/\/+$/, '');
  if (path.endsWith('/showcase')) {
    return (
      <Suspense fallback={null}>
        <Showcase />
      </Suspense>
    );
  }
  return <Home />;
}
