/**
 * Settings store — wraps GM_getValue / GM_setValue and maintains a central
 * registry of every toggleable feature in the script.
 *
 * Usage:
 *   OsuExpertPlus.settings.isEnabled('userProfile.alwaysShowStats')
 *   OsuExpertPlus.settings.set('userProfile.alwaysShowStats', false)
 *   OsuExpertPlus.settings.onChange('userProfile.alwaysShowStats', (val) => …)
 */

window.OsuExpertPlus = window.OsuExpertPlus || {};

OsuExpertPlus.settings = (() => {
  // ─── Feature registry ──────────────────────────────────────────────────
  // Add a new entry here whenever a new toggleable feature is introduced.
  //
  // Each feature:
  //   id          – unique dot-namespaced key (also used as GM storage key)
  //   label       – short display name shown in the settings panel
  //   description – one-sentence explanation shown below the toggle
  //   group       – section heading in the settings panel
  //   default     – whether the feature is on by default

  const FEATURES = [
    {
      id: "userProfile.alwaysShowStats",
      label: "Always show play count & favourites",
      description:
        "Keeps the play count and favourite count visible on beatmap cards without needing to hover.",
      group: "User Profile",
      default: true,
    },
    {
      id: "userProfile.beatmapCardExtraInfo",
      label: "Extra metadata on beatmap cards",
      description:
        "On your profile beatmap lists and on /beatmapsets search: shows “from {source}” between the artist and mapper lines (reserved line when empty) and BPM plus longest drain length. On the profile, reuses data from osu’s own beatmaps tab request when possible instead of fetching each set again from the API.",
      group: "User Profile",
      default: false,
    },
    {
      id: "userProfile.fullBeatmapStatNumbers",
      label: "Full numbers on beatmap card stats",
      description:
        "Shows exact play count and favourite counts (e.g. 159,915 instead of 159.9K) using values from the page HTML.",
      group: "User Profile",
      default: false,
    },
    {
      id: "userProfile.scoreListDetails",
      label: "PP decimals & hit statistics on scores",
      description:
        "On best performance, pinned, and first place lists: shows pp to two decimal places (e.g. 610.27pp) and a colour-coded hit row (great / ok / meh / miss).",
      group: "User Profile",
      default: true,
    },
    {
      id: "userProfile.moddedStarRating",
      label: "Show modded star rating",
      description:
        "Fetches and displays the accurate star rating with mods applied next to each difficulty name. Requires API credentials.",
      group: "User Profile",
      default: true,
    },
    {
      id: "userProfile.modIconsAsAcronyms",
      label: "Mod acronyms instead of icons",
      description:
        "Shows mod letters (e.g. HD, DT) on score rows and beatmap leaderboards instead of sprite icons.",
      group: "User Profile",
      default: false,
    },
    {
      id: "userProfile.hideClMod",
      label: "Hide Classic (CL) mod",
      description:
        "Hides the Classic (CL) mod on score rows and leaderboards. Works whether mods are shown as icons or acronyms.",
      group: "User Profile",
      default: false,
    },
    {
      id: "userProfile.scoreCardBackgrounds",
      label: "Beatmap background on score cards",
      description:
        "Shows the beatmap cover art as a background image on each score card in the Ranks section.",
      group: "User Profile",
      default: true,
    },
    {
      id: "userProfile.scoreCardPlaceNumber",
      label: "Show score place number",
      description:
        "Displays the position (#1, #2, …) before each score card's rank grade in the Ranks section.",
      group: "User Profile",
      default: false,
    },
    {
      id: "beatmapDetail.discussionDefaultToTotal",
      label: "Discussion opens on Total tab",
      description:
        "On beatmap discussion pages, redirect default/praise landing routes to /discussion/-/generalAll/total.",
      group: "Beatmap Detail",
      default: true,
    },
    {
      id: "beatmapDetail.omdbBeatmapsetRatings",
      label: "Show OMDB difficulty ratings",
      description:
        "On beatmapset pages, shows OMDB stats above the difficulty name and star voting (0 at the left edge of the first star, then 0.5–5). Requires an OMDB API key in settings.",
      group: "Beatmap Detail",
      default: true,
    },
    {
      id: "beatmapDetail.beatmapPreview",
      label: "Gameplay preview on beatmap info",
      description:
        "On beatmapset info pages, adds an expandable osu!standard gameplay preview (osu-beatmap-renderer + PixiJS loaded from esm.sh when you open it). Uses the site preview MP3.",
      group: "Beatmap Detail",
      default: true,
    },
  ];

  // One-time: merge former userProfile.ppDecimals + userProfile.bestScoreStats.
  (function migrateScoreListDetails() {
    const flag = "userProfile._oepScoreListDetailsMigrated";
    if (GM_getValue(flag, false)) return;
    const unset = "__oep_unset__";
    const pp = GM_getValue("userProfile.ppDecimals", unset);
    const st = GM_getValue("userProfile.bestScoreStats", unset);
    if (pp === unset && st === unset) {
      GM_setValue(flag, true);
      return;
    }
    const on = (v) => (v === unset ? true : v);
    GM_setValue("userProfile.scoreListDetails", on(pp) && on(st));
    GM_deleteValue("userProfile.ppDecimals");
    GM_deleteValue("userProfile.bestScoreStats");
    GM_setValue(flag, true);
  })();

  // ─── Listeners ─────────────────────────────────────────────────────────
  /** @type {Map<string, Set<function>>} */
  const _listeners = new Map();

  // ─── Public API ─────────────────────────────────────────────────────────

  /** Return the full feature registry (read-only copy). */
  function getFeatures() {
    return FEATURES.slice();
  }

  /**
   * Read the stored value for a feature.
   * Falls back to the registered default if nothing has been saved yet.
   * @param {string} id
   * @returns {boolean}
   */
  function isEnabled(id) {
    const feature = FEATURES.find((f) => f.id === id);
    const defaultVal = feature ? feature.default : false;
    return GM_getValue(id, defaultVal);
  }

  /**
   * Persist a new value and notify all listeners for that feature.
   * @param {string} id
   * @param {boolean} value
   */
  function set(id, value) {
    GM_setValue(id, value);
    _listeners.get(id)?.forEach((fn) => {
      try {
        fn(value);
      } catch (_) {}
    });
  }

  /**
   * Subscribe to changes for a specific feature.
   * Returns an unsubscribe function.
   * @param {string} id
   * @param {function(boolean): void} fn
   * @returns {function}
   */
  function onChange(id, fn) {
    if (!_listeners.has(id)) _listeners.set(id, new Set());
    _listeners.get(id).add(fn);
    return () => _listeners.get(id)?.delete(fn);
  }

  /**
   * Canonical feature ID constants.  Page modules should reference these
   * instead of hard-coding string literals so the compiler (or a simple
   * search) can catch typos.
   */
  const IDS = Object.freeze({
    ALWAYS_SHOW_STATS: "userProfile.alwaysShowStats",
    BEATMAP_CARD_EXTRA_INFO: "userProfile.beatmapCardExtraInfo",
    FULL_BEATMAP_STAT_NUMBERS: "userProfile.fullBeatmapStatNumbers",
    SCORE_LIST_DETAILS: "userProfile.scoreListDetails",
    MODDED_STAR_RATING: "userProfile.moddedStarRating",
    MOD_ICONS_AS_ACRONYMS: "userProfile.modIconsAsAcronyms",
    HIDE_CL_MOD: "userProfile.hideClMod",
    SCORE_CARD_BACKGROUNDS: "userProfile.scoreCardBackgrounds",
    SCORE_CARD_PLACE_NUMBER: "userProfile.scoreCardPlaceNumber",
    DISCUSSION_DEFAULT_TO_TOTAL: "beatmapDetail.discussionDefaultToTotal",
    OMDB_BEATMAPSET_RATINGS: "beatmapDetail.omdbBeatmapsetRatings",
    BEATMAP_PREVIEW: "beatmapDetail.beatmapPreview",
  });

  return { IDS, getFeatures, isEnabled, set, onChange };
})();
