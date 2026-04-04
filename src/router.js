/**
 * Router — maps the current URL to the correct page module and re-runs
 * the appropriate module when osu!'s SPA navigation changes the URL.
 */

window.OsuExpertPlus = window.OsuExpertPlus || {};

OsuExpertPlus.Router = class Router {
  constructor() {
    /** @type {{ pattern: RegExp, module: { name: string, init: function } }[]} */
    this._routes = [
      {
        // /home/account/edit
        pattern: /^\/home\/account\/edit/,
        module: OsuExpertPlus.pages.accountEdit,
      },
      {
        // /beatmapsets/<id>[/<anything>]  — individual beatmap / beatmapset page
        pattern: /^\/beatmapsets\/(\d+)/,
        module: OsuExpertPlus.pages.beatmapDetail,
      },
      {
        // /beatmapsets  (listing / search page, no numeric id)
        pattern: /^\/beatmapsets(?:\/?)(?!\d)/,
        module: OsuExpertPlus.pages.beatmapsetsListing,
      },
      {
        // /users/<id or name>
        pattern: /^\/users\//,
        module: OsuExpertPlus.pages.userProfile,
      },
    ];

    this._currentPath = null;
    this._cleanupFn = null;
  }

  /** Start the router, run the matching module, and watch for SPA navigation. */
  init() {
    this._navigate(location.pathname);
    this._watchNavigation();
  }

  _navigate(path) {
    if (path === this._currentPath) return;
    this._currentPath = path;

    // Tear down previous module if it exposed a cleanup function.
    if (typeof this._cleanupFn === 'function') {
      try { this._cleanupFn(); } catch (_) {}
      this._cleanupFn = null;
    }

    for (const route of this._routes) {
      const match = path.match(route.pattern);
      if (match) {
        console.debug(`[osu! Expert+] → ${route.module.name} (${path})`);
        try {
          const result = route.module.init(match);
          // init() may be async — resolve the promise and store the cleanup fn.
          if (result && typeof result.then === 'function') {
            result.then((fn) => {
              // Only store cleanup if we haven't navigated away already.
              if (this._currentPath === path) {
                this._cleanupFn = typeof fn === 'function' ? fn : null;
              } else if (typeof fn === 'function') {
                try { fn(); } catch (_) {}
              }
            }).catch((err) => {
              console.error(`[osu! Expert+] Error in ${route.module.name}:`, err);
            });
          } else {
            this._cleanupFn = typeof result === 'function' ? result : null;
          }
        } catch (err) {
          console.error(`[osu! Expert+] Error in ${route.module.name}:`, err);
        }
        return;
      }
    }
  }

  /**
   * osu! is a React/Inertia SPA that uses the History API.
   * We use three complementary mechanisms so that no navigation is missed:
   *
   * 1. Wrap pushState / replaceState — fires when osu navigates
   *    programmatically and the call goes through window.history.
   * 2. popstate — fires on browser back / forward.  We reset _currentPath
   *    first so deduplication never suppresses a back-navigation (which can
   *    happen if osu bypassed our pushState wrapper and _currentPath is
   *    already equal to the back-destination URL).
   * 3. <title> MutationObserver — osu updates document.title on every page
   *    transition.  This acts as a reliable fallback that catches navigations
   *    not covered by the above two (e.g. in-page tab switches where the SPA
   *    framework holds a cached pushState reference from before our wrapper).
   */
  _watchNavigation() {
    const navigate = this._navigate.bind(this);

    const wrap = (original) =>
      function (...args) {
        const result = original.apply(this, args);
        navigate(location.pathname);
        return result;
      };

    history.pushState = wrap(history.pushState);
    history.replaceState = wrap(history.replaceState);

    // Back / forward: always force a re-navigate by clearing _currentPath so
    // the deduplication guard can never suppress the event.
    window.addEventListener('popstate', () => {
      this._currentPath = null;
      navigate(location.pathname);
    });

    // URL polling fallback — catches navigations where the SPA holds a
    // pre-wrapper pushState reference (Inertia.js caches it at boot, before
    // our script runs).  Also covers back/forward on sites that replace
    // <head> entirely (breaking title-element observers).
    // 200 ms is fast enough to be invisible; deduplication prevents
    // double-inits if the wrapper already fired for the same path.
    let _polledPath = location.pathname;
    setInterval(() => {
      const path = location.pathname;
      if (path !== _polledPath) {
        _polledPath = path;
        navigate(path);
      }
    }, 200);
  }
};
