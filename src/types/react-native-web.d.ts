/**
 * react-native-web ships no TypeScript types.
 *
 * We use exactly one thing from it: `unstable_createElement`, the library's
 * supported escape hatch for rendering a real DOM element (a `<input
 * type="date">`, in our case) from inside a React Native tree.
 */
declare module 'react-native-web' {
  import type { ReactElement } from 'react';

  export function unstable_createElement(
    component: string,
    props?: Record<string, unknown>,
    ...children: unknown[]
  ): ReactElement;
}
