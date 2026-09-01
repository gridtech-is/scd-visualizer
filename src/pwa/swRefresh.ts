/**
 * Reload the page (once) when a new service worker takes control.
 *
 * The PWA registers with autoUpdate (skipWaiting + cleanupOutdatedCaches): after a
 * deploy, the new SW claims already-open pages from the old build and deletes their
 * precache. Any lazy chunk the old page then requests — e.g. the parse worker fetched
 * on the first file open — 404s on the server and misses the cache, so opening an SCD
 * silently fails until the user hard-refreshes. Reloading on controllerchange moves
 * the page onto the new assets immediately.
 */
export function setupSwRefresh(
  sw: EventTarget | undefined,
  reload: () => void,
): void {
  if (!sw) {
    return;
  }
  let refreshing = false;
  sw.addEventListener('controllerchange', () => {
    if (refreshing) {
      return;
    }
    refreshing = true;
    reload();
  });
}
