# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build

```bash
npm run build   # or: node build.js
```

Output is written to `dist/osu-expertplus.user.js`. The build script (`build.js`) is a simple file concatenator — it prepends the userscript metadata block, concatenates source files in a fixed order, and wraps everything in an IIFE. No transpilation or bundling framework is used.

File load order matters (defined in `build.js`):
1. `src/utils/dom.js`
2. `src/utils/auth.js`
3. `src/utils/api.js`
4. `src/utils/settings.js`
5. `src/utils/mod-icons-as-acronyms.js`
6. `src/pages/beatmapsets-listing.js`
7. `src/pages/beatmap-detail.js`
8. `src/pages/user-profile.js`
9. `src/pages/account-edit.js`
10. `src/router.js`
11. `src/ui/settings-panel.js`

## Architecture

This is a Tampermonkey userscript that enhances `osu.ppy.sh`. All modules attach to the global `OsuExpertPlus` namespace.

### Module Overview

- **`OsuExpertPlus.dom`** — DOM helpers: `qs()`, `qsa()`, `el()`, `waitForElement()` (MutationObserver-based), `manageStyle(id, css)` (idempotent style element lifecycle), `createCleanupBag()` (LIFO cleanup collector with try/catch per entry)
- **`OsuExpertPlus.auth`** — OAuth 2.0 client credentials flow; caches bearer tokens in GM storage; deduplicates concurrent refresh requests
- **`OsuExpertPlus.api`** — osu! API v2 client; injects OAuth token if configured, falls back to session cookie; `getFriends()` always uses cookie (client-credentials flow lacks `friends.read` scope)
- **`OsuExpertPlus.settings`** — Feature toggle registry backed by GM storage; `settings.IDS` exports all feature ID constants (e.g. `IDS.ALWAYS_SHOW_STATS`); listeners notify subscribers on change via `onChange()` (returns unsubscribe fn); handles legacy migration
- **`OsuExpertPlus.modIconsAsAcronyms`** — Replaces mod sprite icons with text acronyms (e.g., "HD"); used globally across pages
- **`OsuExpertPlus.Router`** — Intercepts `history.pushState`/`replaceState` and `popstate` for SPA navigation; matches URL patterns to page modules; stores and calls cleanup functions returned by page `init()`
- **`OsuExpertPlus.settingsPanel`** — Floating gear button + modal UI for toggling features

### Page Modules (`src/pages/`)

Each page module exposes an `init()` function (optionally returning a cleanup function) and is called by the Router when the URL matches:

| Page Module | URL Pattern |
|---|---|
| `beatmapsets-listing` | `/beatmapsets` (no ID) |
| `beatmap-detail` | `/beatmapsets/\d+` |
| `user-profile` | `/users/` |
| `account-edit` | `/home/account/edit` |

### Data Flow

1. User navigates → Router detects URL change
2. Router calls previous page's cleanup function, then new page's `init()`
3. `init()` reads settings, makes DOM changes, starts MutationObservers
4. On settings change → `settings.onChange` listeners update the DOM
5. On navigation away → cleanup function tears down observers and DOM changes

### Settings Features

Eight toggleable features are defined in `src/utils/settings.js`:
- `userProfile.alwaysShowStats`, `userProfile.fullBeatmapStatNumbers`, `userProfile.scoreListDetails`, `userProfile.moddedStarRating`, `userProfile.modIconsAsAcronyms`, `userProfile.hideClMod`, `userProfile.scoreCardBackgrounds`
- `beatmapDetail.discussionDefaultToTotal`

All feature IDs are exported as `settings.IDS.*` constants (e.g. `settings.IDS.ALWAYS_SHOW_STATS`). Page modules should use these instead of string literals.

### GM APIs Used

`GM_addStyle`, `GM_getValue`, `GM_setValue`, `GM_deleteValue` — all persistent state lives in GM storage, no external backends.
