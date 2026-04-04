/**
 * Page module: /beatmapsets  (beatmapset search / listing page)
 *
 * Add features here that apply to the beatmapset search listing.
 * `init()` is called by the Router every time this page is navigated to.
 * Return a cleanup function from `init()` if you need to undo DOM changes
 * when the user navigates away.
 */

window.OsuExpertPlus = window.OsuExpertPlus || {};
OsuExpertPlus.pages = OsuExpertPlus.pages || {};

OsuExpertPlus.pages.beatmapsetsListing = (() => {
  const name = 'BeatmapsetsListing';
  const { manageStyle, createCleanupBag } = OsuExpertPlus.dom;
  const settings = OsuExpertPlus.settings;

  // Reuse the existing setting so one toggle controls both user profile
  // beatmap cards and the global beatmapset listing page.
  const alwaysShowStats = manageStyle('osu-expertplus-beatmapsets-stats', `
    .beatmapset-panel { --stats-opacity: 1 !important; }
  `);

  /**
   * @param {RegExpMatchArray} _match  URL match (unused here).
   * @returns {function|void}  Optional cleanup function.
   */
  function init(_match) {
    console.debug('[osu! Expert+] BeatmapsetsListing init');

    const bag = createCleanupBag();

    const applyAlwaysShow = (enabled) => {
      enabled ? alwaysShowStats.inject() : alwaysShowStats.remove();
    };

    applyAlwaysShow(settings.isEnabled(settings.IDS.ALWAYS_SHOW_STATS));
    bag.add(settings.onChange(settings.IDS.ALWAYS_SHOW_STATS, applyAlwaysShow));
    bag.add(alwaysShowStats.remove);

    bag.add(OsuExpertPlus.beatmapCardExtra.start(settings));

    return () => bag.dispose();
  }

  return { name, init };
})();
