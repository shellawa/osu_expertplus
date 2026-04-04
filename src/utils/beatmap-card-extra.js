/**
 * Optional extra metadata on `.beatmapset-panel` cards (user profile + /beatmapsets).
 *
 * Profile beatmap tabs: osu loads `GET /users/{id}/extra-pages/beatmaps?mode=…` once per mode;
 * we capture that JSON (ranked / loved / graveyard / … buckets) and reuse it so we skip
 * per-card `/api/v2/beatmapsets/{id}` calls when possible.
 *
 * /beatmapsets listing: falls back to GET /api/v2/beatmapsets/{id} (session or OAuth).
 */

"use strict";

window.OsuExpertPlus = window.OsuExpertPlus || {};

OsuExpertPlus.beatmapCardExtra = (() => {
  const { el, manageStyle } = OsuExpertPlus.dom;

  const STYLE_ID = "osu-expertplus-beatmap-card-extra-css";
  const BLOCK_CLASS = "oep-beatmap-card-extra";
  /** Reserved row between artist and mapper; always same min height. */
  const SOURCE_SLOT_CLASS = "oep-beatmap-card-extra__source-slot";
  /** Set to beatmapset id when done, or "loading" while fetching. */
  const PANEL_STATE_ATTR = "data-oep-card-extra";
  const MAX_CONCURRENT_FETCH = 4;

  const style = manageStyle(
    STYLE_ID,
    `
    /*
     * osu-web fixes card height (--panel-height) and content row (--main-height), which
     * clips extra rows inside .beatmapset-panel__info. Grow the card when our UI exists.
     */
    .beatmapset-panel:has(.${BLOCK_CLASS}),
    .beatmapset-panel:has(.${SOURCE_SLOT_CLASS}) {
      height: auto !important;
      min-height: var(--panel-height);
      overflow: visible;
    }
    .beatmapset-panel:has(.${BLOCK_CLASS}) .beatmapset-panel__content,
    .beatmapset-panel:has(.${SOURCE_SLOT_CLASS}) .beatmapset-panel__content {
      height: auto !important;
      min-height: var(--panel-height);
      align-items: stretch;
      overflow: visible;
    }
    .beatmapset-panel:has(.${BLOCK_CLASS}) .beatmapset-panel__cover-container,
    .beatmapset-panel:has(.${SOURCE_SLOT_CLASS}) .beatmapset-panel__cover-container {
      height: 100% !important;
      min-height: var(--panel-height);
    }
    .beatmapset-panel:has(.${BLOCK_CLASS}) .beatmapset-panel__info,
    .beatmapset-panel:has(.${SOURCE_SLOT_CLASS}) .beatmapset-panel__info {
      overflow: visible;
      min-height: 0;
    }

    /* API source lives in our slot; hide osu’s row so we don’t get two lines. */
    .beatmapset-panel:has(.${SOURCE_SLOT_CLASS}) .beatmapset-panel__info-row--source {
      display: none !important;
    }

    /* Match osu --source row; single line with ellipsis (flex min-width:0 so truncation works). */
    .beatmapset-panel__info-row.${SOURCE_SLOT_CLASS} {
      color: hsl(var(--hsl-c2));
      font-weight: 700;
      min-width: 0;
      max-width: 100%;
      box-sizing: border-box;
    }
    .${SOURCE_SLOT_CLASS} .${BLOCK_CLASS}__source-slot-line {
      box-sizing: border-box;
      flex: 1 1 0;
      min-width: 0;
      max-width: 100%;
      min-height: 1.35em;
      line-height: 1.35;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .${SOURCE_SLOT_CLASS} .${BLOCK_CLASS}__source-placeholder {
      display: inline-block;
    }

    /* Flush with neighbouring .beatmapset-panel__info-row (no extra band above BPM/length). */
    .${BLOCK_CLASS} {
      width: 100%;
      min-width: 0;
      box-sizing: border-box;
      flex-shrink: 0;
      margin: 0;
      padding: 0;
      border: none;
    }
    .${BLOCK_CLASS}__source-text {
      font-weight: 700;
      color: hsl(var(--hsl-l1, 0 0% 86%));
    }
    /* BPM / length: inherit font from panel; tune colour, spacing, shadow, truncation. */
    .${BLOCK_CLASS}__meta {
      margin: 0;
      padding: 0;
      max-width: 100%;
      font-variant-numeric: tabular-nums;
      letter-spacing: 0.03em;
      opacity: 0.9;
      color: hsl(var(--hsl-c2, 333 60% 68%));
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  `,
  );

  /** @type {Map<string, object>} */
  const cache = new Map();
  /** @type {Map<string, Promise<object>>} */
  const inflight = new Map();

  /** Keys on `…/extra-pages/beatmaps` JSON whose values are `{ items: beatmapset[] }`. */
  const EXTRA_PAGES_SECTION_KEYS = [
    "ranked",
    "loved",
    "graveyard",
    "guest",
    "pending",
    "nominated",
    "favourite",
  ];

  /**
   * Merge beatmapset objects from profile extra-pages payload into `cache` (keyed by set id).
   * @param {unknown} json
   */
  function ingestExtraPagesBeatmapsPayload(json) {
    if (!json || typeof json !== "object") return;
    for (const key of EXTRA_PAGES_SECTION_KEYS) {
      const bucket = /** @type {Record<string, unknown>} */ (json)[key];
      const items = bucket?.items;
      if (!Array.isArray(items)) continue;
      for (const item of items) {
        if (item && item.id != null) cache.set(String(item.id), item);
      }
    }
  }

  /**
   * @param {string} url
   */
  function isUsersExtraPagesBeatmapsUrl(url) {
    try {
      const u = new URL(url, location.origin);
      return /\/users\/\d+\/extra-pages\/beatmaps\b/.test(u.pathname);
    } catch (_) {
      return false;
    }
  }

  /**
   * @param {string} id
   * @param {number} maxMs
   * @param {number} stepMs
   * @returns {Promise<object|undefined>}
   */
  function waitForCachedBeatmapset(id, maxMs, stepMs) {
    const hit = cache.get(id);
    if (hit) return Promise.resolve(hit);
    const deadline = Date.now() + maxMs;
    return new Promise((resolve) => {
      const tick = () => {
        const h = cache.get(id);
        if (h) {
          resolve(h);
          return;
        }
        if (Date.now() >= deadline) {
          resolve(undefined);
          return;
        }
        window.setTimeout(tick, stepMs);
      };
      tick();
    });
  }

  let activeFetches = 0;
  /** @type {(() => void)[]} */
  const fetchWaitQueue = [];

  /** When true, `processPanel` waits briefly for profile extra-pages data before API fetch. */
  const profileExtraState = { waitForExtraPages: false };

  /** ms to wait for `…/extra-pages/beatmaps` to populate `cache` (same response as osu). */
  const PROFILE_EXTRA_CACHE_WAIT_MS = 2000;
  const PROFILE_EXTRA_CACHE_POLL_MS = 40;

  function acquireFetchSlot() {
    if (activeFetches < MAX_CONCURRENT_FETCH) {
      activeFetches++;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      fetchWaitQueue.push(() => {
        activeFetches++;
        resolve();
      });
    });
  }

  function releaseFetchSlot() {
    activeFetches--;
    const next = fetchWaitQueue.shift();
    if (next) next();
  }

  /**
   * @param {string} id
   * @returns {Promise<object>}
   */
  async function fetchBeatmapset(id) {
    if (cache.has(id)) return cache.get(id);
    if (inflight.has(id)) return inflight.get(id);

    const p = (async () => {
      await acquireFetchSlot();
      try {
        const data = await OsuExpertPlus.api.getBeatmapset(id);
        cache.set(id, data);
        return data;
      } catch (e) {
        console.debug("[osu! Expert+] beatmap card extra fetch failed:", id, e);
        throw e;
      } finally {
        releaseFetchSlot();
        inflight.delete(id);
      }
    })();

    inflight.set(id, p);
    return p;
  }

  /**
   * @param {unknown} sec
   * @returns {string}
   */
  function formatDuration(sec) {
    const s = Math.max(0, Math.floor(Number(sec) || 0));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${String(r).padStart(2, "0")}`;
  }

  /**
   * @param {object} data
   * @returns {{ bpmStr: string|null, lengthStr: string|null }}
   */
  function bpmLengthFromSet(data) {
    const maps = data?.beatmaps;
    if (!Array.isArray(maps) || maps.length === 0)
      return { bpmStr: null, lengthStr: null };

    const bpmSet = new Set();
    for (const m of maps) {
      const b = Number(m?.bpm);
      if (Number.isFinite(b)) bpmSet.add(b);
    }
    const bpms = [...bpmSet].sort((a, b) => a - b);
    let bpmStr = null;
    if (bpms.length === 1) bpmStr = `${bpms[0]} BPM`;
    else if (bpms.length > 1)
      bpmStr = `${bpms[0]}–${bpms[bpms.length - 1]} BPM`;

    const lengths = maps
      .map((m) => Number(m?.total_length))
      .filter((n) => Number.isFinite(n) && n >= 0);
    const longest = lengths.length ? Math.max(...lengths) : null;
    const lengthStr = longest != null ? formatDuration(longest) : null;
    return { bpmStr, lengthStr };
  }

  /**
   * @param {Element} panel
   * @returns {string|null}
   */
  function parseBeatmapsetId(panel) {
    const links = panel.querySelectorAll('a[href*="beatmapsets/"]');
    for (const a of links) {
      const href = a.getAttribute("href");
      if (!href) continue;
      try {
        const u = new URL(href, location.origin);
        const m = u.pathname.match(/^\/beatmapsets\/(\d+)/i);
        if (m) return m[1];
      } catch (_) {
        void 0;
      }
    }
    return null;
  }

  /**
   * @param {string} sourceText  trimmed API source (may be empty)
   * @returns {HTMLElement}
   */
  function buildSourceSlotRow(sourceText) {
    const inner =
      sourceText.length > 0
        ? el(
            "div",
            { class: `u-ellipsis-overflow ${BLOCK_CLASS}__source-slot-line` },
            "from ",
            el("span", { class: `${BLOCK_CLASS}__source-text` }, sourceText),
          )
        : el(
            "div",
            { class: `u-ellipsis-overflow ${BLOCK_CLASS}__source-slot-line` },
            el(
              "span",
              {
                class: `${BLOCK_CLASS}__source-placeholder`,
                "aria-hidden": "true",
              },
              "\u00a0",
            ),
          );

    return el(
      "div",
      {
        class: `beatmapset-panel__info-row ${SOURCE_SLOT_CLASS}`,
        "data-oep-card-extra-slot": "1",
      },
      inner,
    );
  }

  /**
   * Insert between artist row and mapper row (native --source hidden via CSS :has slot).
   * @param {Element} panel
   * @param {string} sourceTrimmed
   * @returns {boolean}
   */
  function mountSourceSlot(panel, sourceTrimmed) {
    const artist = panel.querySelector(
      ".beatmapset-panel__info-row--artist",
    );
    if (!artist) return false;
    artist.insertAdjacentElement(
      "afterend",
      buildSourceSlotRow(sourceTrimmed),
    );
    return true;
  }

  /**
   * BPM / length block after mapper, before stats.
   * @param {Element} panel
   * @returns {{ anchor: Element, mode: "after" | "append" }}
   */
  function insertTargetMeta(panel) {
    const mapperRow = panel.querySelector(
      ".beatmapset-panel__info-row--mapper",
    );
    if (mapperRow) return { anchor: mapperRow, mode: "after" };

    const sourceRow = panel.querySelector(
      ".beatmapset-panel__info-row--source",
    );
    if (sourceRow) return { anchor: sourceRow, mode: "after" };

    const artistRow = panel.querySelector(
      ".beatmapset-panel__info-row--artist",
    );
    if (artistRow) return { anchor: artistRow, mode: "after" };

    const info = panel.querySelector(".beatmapset-panel__info");
    if (info) return { anchor: info, mode: "append" };

    const legacyMapper = panel.querySelector(".beatmapset-panel__mapper");
    if (legacyMapper) return { anchor: legacyMapper, mode: "after" };
    const legacyArtist = panel.querySelector(".beatmapset-panel__artist");
    if (legacyArtist) return { anchor: legacyArtist, mode: "after" };
    const details = panel.querySelector(".beatmapset-panel__details");
    if (details) return { anchor: details, mode: "append" };

    return { anchor: panel, mode: "append" };
  }

  /**
   * @param {object} data
   * @returns {HTMLElement|null}
   */
  function buildMetaBlock(data) {
    const { bpmStr, lengthStr } = bpmLengthFromSet(data);
    const metaBits = [];
    if (bpmStr) metaBits.push(bpmStr);
    if (lengthStr) metaBits.push(lengthStr);
    if (!metaBits.length) return null;
    return el(
      "div",
      { class: BLOCK_CLASS },
      el("div", { class: `${BLOCK_CLASS}__meta` }, metaBits.join(" · ")),
    );
  }

  /**
   * @param {Element} panel
   */
  function stripInjections(panel) {
    panel.querySelectorAll(`.${BLOCK_CLASS}`).forEach((n) => n.remove());
    panel
      .querySelectorAll(`.${SOURCE_SLOT_CLASS}`)
      .forEach((n) => n.remove());
    panel.removeAttribute(PANEL_STATE_ATTR);
  }

  /**
   * @param {Element} panel
   */
  async function processPanel(panel) {
    const id = parseBeatmapsetId(panel);
    if (!id) return;

    const state = panel.getAttribute(PANEL_STATE_ATTR);
    if (state === id && panel.querySelector(`.${SOURCE_SLOT_CLASS}`)) return;
    if (state === id) panel.removeAttribute(PANEL_STATE_ATTR);
    if (panel.getAttribute(PANEL_STATE_ATTR) === "loading") return;

    panel.querySelectorAll(`.${BLOCK_CLASS}`).forEach((n) => n.remove());
    panel
      .querySelectorAll(`.${SOURCE_SLOT_CLASS}`)
      .forEach((n) => n.remove());
    panel.setAttribute(PANEL_STATE_ATTR, "loading");

    let data = cache.get(id);
    if (!data && profileExtraState.waitForExtraPages) {
      data = await waitForCachedBeatmapset(
        id,
        PROFILE_EXTRA_CACHE_WAIT_MS,
        PROFILE_EXTRA_CACHE_POLL_MS,
      );
    }

    if (!data) {
      try {
        data = await fetchBeatmapset(id);
      } catch {
        if (document.body.contains(panel)) panel.removeAttribute(PANEL_STATE_ATTR);
        return;
      }
    }

    if (!document.body.contains(panel)) return;

    const sourceTrimmed = String(data.source ?? "").trim();
    mountSourceSlot(panel, sourceTrimmed);

    const block = buildMetaBlock(data);
    if (block) {
      const { anchor, mode } = insertTargetMeta(panel);
      if (mode === "after") anchor.insertAdjacentElement("afterend", block);
      else anchor.appendChild(block);
    }

    panel.setAttribute(PANEL_STATE_ATTR, id);
  }

  /**
   * @param {ParentNode} root
   * @param {boolean} enabled
   */
  function clearAll(root, enabled) {
    root.querySelectorAll(".beatmapset-panel").forEach((panel) => {
      if (!enabled) stripInjections(panel);
    });
  }

  /**
   * @param {ParentNode} root
   */
  function scheduleAllPanels(root) {
    root.querySelectorAll(".beatmapset-panel").forEach((panel) => {
      void processPanel(panel);
    });
  }

  /**
   * @param {typeof OsuExpertPlus.settings} settings
   * @param {{ hookProfileExtraPages?: boolean }} [options]
   * @returns {() => void}
   */
  function start(settings, options = {}) {
    const FEATURE_ID = settings.IDS.BEATMAP_CARD_EXTRA_INFO;
    let debounceId = 0;

    profileExtraState.waitForExtraPages = options.hookProfileExtraPages === true;

    /** @type {typeof window.fetch | null} */
    let origFetch = null;
    if (profileExtraState.waitForExtraPages && typeof window.fetch === "function") {
      origFetch = window.fetch.bind(window);
      window.fetch = async function oepPatchedFetch(input, init) {
        const res = await origFetch(input, init);
        if (!settings.isEnabled(FEATURE_ID)) return res;
        try {
          const url = typeof input === "string" ? input : input?.url;
          if (url && res.ok && isUsersExtraPagesBeatmapsUrl(url)) {
            void res
              .clone()
              .json()
              .then(ingestExtraPagesBeatmapsPayload)
              .catch(() => {});
          }
        } catch (_) {
          void 0;
        }
        return res;
      };
    }

    const run = () => {
      const on = settings.isEnabled(FEATURE_ID);
      if (on) style.inject();
      else style.remove();
      clearAll(document, on);
      if (on) scheduleAllPanels(document);
    };

    const schedule = () => {
      window.clearTimeout(debounceId);
      debounceId = window.setTimeout(run, 100);
    };

    run();

    const unsub = settings.onChange(FEATURE_ID, run);
    const mo = new MutationObserver(schedule);
    mo.observe(document.documentElement, { childList: true, subtree: true });

    return () => {
      window.clearTimeout(debounceId);
      unsub();
      mo.disconnect();
      profileExtraState.waitForExtraPages = false;
      if (origFetch) window.fetch = origFetch;
      style.remove();
      clearAll(document, false);
    };
  }

  return { start };
})();
