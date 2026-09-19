import { applyPlatformDirection, resetDocumentDirection } from '@/i18n/direction';

/**
 * The web half of the direction architecture, which only a DOM can check.
 *
 * On web `I18nManager` is a stub — `forceRTL` does nothing and there is no
 * `isRTL` property — so the browser's own mechanism stands in for the native
 * flag. That mechanism is the document's direction: CSS lays
 * `flex-direction: row` along the inline axis, so everything inside
 * `dir="rtl"` reverses, including the rows nobody remembered to ask about and
 * the scroll origin of every horizontal rail. Neither is reachable from a
 * per-component JS flip.
 */
afterEach(() => {
  resetDocumentDirection();
  document.documentElement.dir = 'ltr';
});

it('hands the browser the job the native flag does', () => {
  applyPlatformDirection('ar');
  expect(document.documentElement.dir).toBe('rtl');
  expect(document.documentElement.lang).toBe('ar');
});

it('takes it back again', () => {
  applyPlatformDirection('ar');
  applyPlatformDirection('en');
  expect(document.documentElement.dir).toBe('ltr');
  expect(document.documentElement.lang).toBe('en');
});

it('sets it on documentElement, so a drawer or toast outside the tree gets it too', () => {
  // A drawer, a modal and a toast render into their own roots. Anything
  // scoped to the app's own wrapper would leave them reading left-to-right.
  applyPlatformDirection('ar');
  expect(document.documentElement.dir).toBe('rtl');
  expect(document.body.parentElement).toBe(document.documentElement);
});
