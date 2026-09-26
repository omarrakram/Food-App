/** Fetch and decode images so no product ever appears half-loaded. */
export function preloadImages(srcs: string[], onProgress?: (done: number, total: number) => void) {
  let done = 0;
  const unique = [...new Set(srcs)];
  return Promise.all(
    unique.map(
      (src) =>
        new Promise<void>((resolve) => {
          const img = new Image();
          img.decoding = 'async';
          img.src = src;
          const finish = () => {
            done += 1;
            onProgress?.(done, unique.length);
            resolve();
          };
          img
            .decode()
            .then(finish)
            .catch(() => (img.complete ? finish() : img.addEventListener('load', finish, { once: true })));
          img.addEventListener('error', finish, { once: true });
        }),
    ),
  );
}
