/**
 * Settings panel — a floating gear button fixed to the bottom-right corner
 * of the page that opens a modal with a toggle for every registered feature
 * and API credential sections (osu! OAuth, OMDB).
 *
 * Styling intentionally follows osu!'s dark theme by reusing its CSS
 * custom properties (--hsl-b*, --hsl-l*, --hsl-c*) and FontAwesome icons
 * (already loaded on osu.ppy.sh).
 *
 * Call OsuExpertPlus.settingsPanel.init() once on script startup.
 * It is never torn down — the panel persists across SPA navigations.
 */

window.OsuExpertPlus = window.OsuExpertPlus || {};

OsuExpertPlus.settingsPanel = (() => {
  const { el } = OsuExpertPlus.dom;
  const settings = OsuExpertPlus.settings;
  const auth = OsuExpertPlus.auth;
  const omdb = OsuExpertPlus.omdb;

  const ROOT_ID = 'osu-expertplus-settings';
  const OPEN_CLASS = 'osu-expertplus-settings--open';
  const SECTION_COLLAPSED_CLASS = 'osu-expertplus-panel__section--collapsed';

  // ─── Styles ─────────────────────────────────────────────────────────────

  const CSS = `
    #osu-expertplus-fab {
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 9999;
      width: 44px;
      height: 44px;
      border-radius: 50%;
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      background: hsl(var(--hsl-b4, 333 18% 20%));
      color: hsl(var(--hsl-l1, 0 0% 90%));
      box-shadow: 0 2px 12px rgba(0,0,0,.5);
      transition: background 150ms, transform 150ms;
      opacity: 0.75;
    }
    #osu-expertplus-fab:hover {
      background: hsl(var(--hsl-b5, 333 18% 30%));
      opacity: 1;
      transform: rotate(30deg);
    }

    /* Overlay backdrop */
    #osu-expertplus-backdrop {
      display: none;
      position: fixed;
      inset: 0;
      z-index: 9998;
      background: rgba(0,0,0,.5);
    }
    #osu-expertplus-backdrop.${OPEN_CLASS} { display: block; }

    /* Panel */
    #${ROOT_ID} {
      display: none;
      position: fixed;
      bottom: 80px;
      right: 24px;
      z-index: 9999;
      width: 340px;
      max-height: 80vh;
      overflow-y: auto;
      border-radius: 12px;
      background: hsl(var(--hsl-b2, 333 18% 12%));
      box-shadow: 0 8px 32px rgba(0,0,0,.6);
      font-family: inherit;
      color: hsl(var(--hsl-l1, 0 0% 90%));
    }
    #${ROOT_ID}.${OPEN_CLASS} {
      display: block;
      animation: osu-expertplus-slide-in 150ms ease-out;
    }
    @keyframes osu-expertplus-slide-in {
      from { opacity: 0; transform: translateY(10px); }
      to   { opacity: 1; transform: translateY(0); }
    }

    .osu-expertplus-panel__header {
      padding: 14px 16px 10px;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: .05em;
      text-transform: uppercase;
      color: hsl(var(--hsl-c2, 333 60% 70%));
      border-bottom: 1px solid hsl(var(--hsl-b4, 333 18% 20%));
    }

    .osu-expertplus-panel__section {
      border-bottom: 1px solid hsl(var(--hsl-b3, 333 18% 16%));
      background: hsl(var(--hsl-b2, 333 18% 12%));
    }
    .osu-expertplus-panel__section:last-child { border-bottom: none; }

    .osu-expertplus-panel__group-toggle {
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      min-height: 34px;
      padding: 8px 16px;
      border: none;
      border-top: 1px solid hsl(var(--hsl-b4, 333 18% 20%));
      background: hsl(var(--hsl-b3, 333 18% 16%));
      cursor: pointer;
      color: inherit;
    }
    .osu-expertplus-panel__group-toggle:hover {
      background: hsl(var(--hsl-b4, 333 18% 20%));
    }
    .osu-expertplus-panel__group-toggle:focus-visible {
      outline: 1px solid hsl(var(--hsl-pink, 333 100% 65%));
      outline-offset: -1px;
    }

    .osu-expertplus-panel__group-label {
      padding: 0;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: .11em;
      text-transform: uppercase;
      color: hsl(var(--hsl-c2, 333 60% 70%));
      opacity: 0.95;
    }
    .osu-expertplus-panel__group-chevron {
      font-size: 11px;
      opacity: 0.9;
      transform: rotate(0deg);
      transition: transform 120ms ease;
    }
    .osu-expertplus-panel__section.${SECTION_COLLAPSED_CLASS} .osu-expertplus-panel__group-chevron {
      transform: rotate(-90deg);
    }
    .osu-expertplus-panel__section-content { display: block; }
    .osu-expertplus-panel__section-content .osu-expertplus-panel__row:first-child {
      border-top: 1px solid hsl(var(--hsl-b3, 333 18% 16%));
    }
    .osu-expertplus-panel__section.${SECTION_COLLAPSED_CLASS} .osu-expertplus-panel__section-content {
      display: none;
    }

    .osu-expertplus-panel__row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 16px;
      border-bottom: 1px solid hsl(var(--hsl-b3, 333 18% 16%));
    }
    .osu-expertplus-panel__section-content .osu-expertplus-panel__row:last-child { border-bottom: none; }

    .osu-expertplus-panel__text {
      flex: 1;
      min-width: 0;
    }
    .osu-expertplus-panel__label {
      font-size: 12px;
      font-weight: 600;
      line-height: 1.25;
    }

    /* Toggle switch */
    .osu-expertplus-toggle {
      position: relative;
      flex-shrink: 0;
      width: 32px;
      height: 18px;
    }
    .osu-expertplus-toggle input {
      opacity: 0;
      width: 0;
      height: 0;
      position: absolute;
    }
    .osu-expertplus-toggle__track {
      position: absolute;
      inset: 0;
      border-radius: 100px;
      background: hsl(var(--hsl-b5, 333 18% 26%));
      cursor: pointer;
      transition: background 150ms;
    }
    .osu-expertplus-toggle__track::after {
      content: '';
      position: absolute;
      left: 2px;
      top: 2px;
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: hsl(var(--hsl-l1, 0 0% 90%));
      transition: transform 150ms;
    }
    .osu-expertplus-toggle input:checked + .osu-expertplus-toggle__track {
      background: hsl(var(--hsl-pink, 333 100% 65%));
    }
    .osu-expertplus-toggle input:checked + .osu-expertplus-toggle__track::after {
      transform: translateX(14px);
    }

    /* Credentials section */
    .osu-expertplus-panel__creds {
      padding: 8px 16px 10px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .osu-expertplus-panel__creds-field {
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    .osu-expertplus-panel__creds-field label {
      font-size: 11px;
      opacity: 0.6;
      font-weight: 600;
      letter-spacing: .04em;
      text-transform: uppercase;
    }
    .osu-expertplus-panel__creds-field input {
      background: hsl(var(--hsl-b4, 333 18% 20%));
      border: 1px solid hsl(var(--hsl-b5, 333 18% 26%));
      border-radius: 6px;
      color: hsl(var(--hsl-l1, 0 0% 90%));
      font-family: monospace;
      font-size: 12px;
      padding: 5px 8px;
      outline: none;
      transition: border-color 150ms;
    }
    .osu-expertplus-panel__creds-field input:focus {
      border-color: hsl(var(--hsl-pink, 333 100% 65%));
    }
    .osu-expertplus-panel__creds-actions {
      display: flex;
      gap: 6px;
      align-items: center;
      flex-wrap: wrap;
    }
    .osu-expertplus-panel__creds-btn {
      border: none;
      border-radius: 5px;
      cursor: pointer;
      font-size: 11px;
      font-weight: 600;
      padding: 4px 8px;
      transition: opacity 150ms;
    }
    .osu-expertplus-panel__creds-btn:hover { opacity: 0.8; }
    .osu-expertplus-panel__creds-btn--save {
      background: hsl(var(--hsl-pink, 333 100% 65%));
      color: #fff;
    }
    .osu-expertplus-panel__creds-btn--clear {
      background: hsl(var(--hsl-b5, 333 18% 26%));
      color: hsl(var(--hsl-l1, 0 0% 90%));
    }
    .osu-expertplus-panel__creds-status {
      font-size: 11px;
      margin-top: 2px;
      min-height: 1.4em;
      line-height: 1.4;
    }
    .osu-expertplus-panel__creds-status--ok    { color: #84e03a; }
    .osu-expertplus-panel__creds-status--error  { color: #e05c5c; }
    .osu-expertplus-panel__creds-status--info   { opacity: 0.5; }
    .osu-expertplus-panel__creds-hint {
      font-size: 11px;
      opacity: 0.45;
      line-height: 1.4;
    }
    .osu-expertplus-panel__creds-hint a {
      color: hsl(var(--hsl-c2, 333 60% 70%));
      text-decoration: underline;
    }
  `;

  // ─── Toggle row builder ──────────────────────────────────────────────────

  function buildToggle(feature) {
    const input = el('input', { type: 'checkbox' });
    input.checked = settings.isEnabled(feature.id);

    const track = el('div', { class: 'osu-expertplus-toggle__track' });
    const label = el('label', { class: 'osu-expertplus-toggle' }, input, track);

    input.addEventListener('change', () => settings.set(feature.id, input.checked));
    settings.onChange(feature.id, (val) => { input.checked = val; });

    return label;
  }

  // ─── Credentials section builder ─────────────────────────────────────────

  function buildCredentialsSection() {
    const clientIdInput = el('input', {
      type: 'text',
      placeholder: 'Client ID',
      autocomplete: 'off',
      spellcheck: 'false',
    });

    const clientSecretInput = el('input', {
      type: 'password',
      placeholder: 'Client Secret',
      autocomplete: 'new-password',
    });

    // Populate with stored values (secret shown as placeholder dots).
    clientIdInput.value = GM_getValue('oep_client_id', '');
    if (GM_getValue('oep_client_secret', '')) {
      clientSecretInput.placeholder = '(saved — enter to change)';
    }

    const statusEl = el('div', { class: 'osu-expertplus-panel__creds-status osu-expertplus-panel__creds-status--info' });

    function setStatus(msg, type = 'info') {
      statusEl.textContent = msg;
      statusEl.className = `osu-expertplus-panel__creds-status osu-expertplus-panel__creds-status--${type}`;
    }

    // Reflect current configured state on load.
    if (auth.isConfigured()) {
      setStatus('Credentials saved. API v2 active.', 'ok');
    } else {
      setStatus('No credentials — using session fallback.');
    }

    const saveBtn = el('button', { class: 'osu-expertplus-panel__creds-btn osu-expertplus-panel__creds-btn--save' }, 'Save');
    const clearBtn = el('button', { class: 'osu-expertplus-panel__creds-btn osu-expertplus-panel__creds-btn--clear' }, 'Clear');

    saveBtn.addEventListener('click', async () => {
      const id     = clientIdInput.value.trim();
      const secret = clientSecretInput.value.trim() || GM_getValue('oep_client_secret', '');

      if (!id || !secret) {
        setStatus('Both Client ID and Secret are required.', 'error');
        return;
      }

      auth.setCredentials(id, secret);
      clientIdInput.value = id;
      clientSecretInput.value = '';
      clientSecretInput.placeholder = '(saved — enter to change)';
      setStatus('Verifying…', 'info');

      try {
        await auth.getToken();
        setStatus('Credentials saved & verified. API v2 active.', 'ok');
      } catch (e) {
        setStatus(
          `Failed: ${e.message
            .replace('[osu! Expert+] ', '')
            .replace('[osu! Extra+] ', '')}`,
          'error',
        );
      }
    });

    clearBtn.addEventListener('click', () => {
      auth.clearCredentials();
      clientIdInput.value = '';
      clientSecretInput.value = '';
      clientSecretInput.placeholder = 'Client Secret';
      setStatus('Credentials cleared. Using session fallback.');
    });

    const hint = el('div', { class: 'osu-expertplus-panel__creds-hint' });
    hint.innerHTML = 'Create an OAuth app at <a href="https://osu.ppy.sh/home/account/edit#oauth" target="_blank">Account Settings → OAuth</a>, then paste your Client ID and Secret above.';

    return el('div', { class: 'osu-expertplus-panel__creds' },
      el('div', { class: 'osu-expertplus-panel__creds-field' },
        el('label', {}, 'Client ID'),
        clientIdInput,
      ),
      el('div', { class: 'osu-expertplus-panel__creds-field' },
        el('label', {}, 'Client Secret'),
        clientSecretInput,
      ),
      el('div', { class: 'osu-expertplus-panel__creds-actions' }, saveBtn, clearBtn),
      statusEl,
      hint,
    );
  }

  function buildOmdbCredentialsSection() {
    const apiKeyInput = el('input', {
      type: 'password',
      placeholder: 'API Key',
      autocomplete: 'new-password',
      spellcheck: 'false',
    });

    if (omdb.isConfigured()) {
      apiKeyInput.placeholder = '(saved — enter to change)';
    }

    const statusEl = el('div', { class: 'osu-expertplus-panel__creds-status osu-expertplus-panel__creds-status--info' });

    function setStatus(msg, type = 'info') {
      statusEl.textContent = msg;
      statusEl.className = `osu-expertplus-panel__creds-status osu-expertplus-panel__creds-status--${type}`;
    }

    if (omdb.isConfigured()) {
      setStatus('API key saved.', 'ok');
    } else {
      setStatus('No API key configured.');
    }

    const saveBtn = el('button', { class: 'osu-expertplus-panel__creds-btn osu-expertplus-panel__creds-btn--save' }, 'Save');
    const clearBtn = el('button', { class: 'osu-expertplus-panel__creds-btn osu-expertplus-panel__creds-btn--clear' }, 'Clear');

    saveBtn.addEventListener('click', () => {
      const key = apiKeyInput.value.trim() || omdb.getApiKey();

      if (!key) {
        setStatus('API key is required.', 'error');
        return;
      }

      omdb.setApiKey(key);
      apiKeyInput.value = '';
      apiKeyInput.placeholder = '(saved — enter to change)';
      setStatus('API key saved.', 'ok');
    });

    clearBtn.addEventListener('click', () => {
      omdb.clearApiKey();
      apiKeyInput.value = '';
      apiKeyInput.placeholder = 'API Key';
      setStatus('API key cleared.');
    });

    const hint = el('div', { class: 'osu-expertplus-panel__creds-hint' });
    hint.innerHTML = 'Get your API key at <a href="https://omdb.nyahh.net/settings/" target="_blank" rel="noopener noreferrer">omdb.nyahh.net/settings</a> (log in required), then paste it above.';

    return el('div', { class: 'osu-expertplus-panel__creds' },
      el('div', { class: 'osu-expertplus-panel__creds-field' },
        el('label', {}, 'API Key'),
        apiKeyInput,
      ),
      el('div', { class: 'osu-expertplus-panel__creds-actions' }, saveBtn, clearBtn),
      statusEl,
      hint,
    );
  }

  // ─── Panel builder ───────────────────────────────────────────────────────

  function buildSection(title, contentNodes, { collapsedByDefault = false } = {}) {
    const section = el('section', { class: 'osu-expertplus-panel__section' });
    if (collapsedByDefault) section.classList.add(SECTION_COLLAPSED_CLASS);

    const titleId = `oep-settings-section-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    const content = el('div', { class: 'osu-expertplus-panel__section-content' }, ...contentNodes);
    const chevron = el('span', { class: 'osu-expertplus-panel__group-chevron', 'aria-hidden': 'true' }, '▼');
    const label = el('span', { class: 'osu-expertplus-panel__group-label', id: titleId }, title);
    const toggleBtn = el(
      'button',
      {
        type: 'button',
        class: 'osu-expertplus-panel__group-toggle',
        'aria-expanded': collapsedByDefault ? 'false' : 'true',
        'aria-labelledby': titleId,
      },
      label,
      chevron,
    );

    toggleBtn.addEventListener('click', () => {
      const collapsed = section.classList.toggle(SECTION_COLLAPSED_CLASS);
      toggleBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    });

    section.appendChild(toggleBtn);
    section.appendChild(content);
    return section;
  }

  function buildPanel() {
    const features = settings.getFeatures();

    const groups = new Map();
    for (const f of features) {
      if (!groups.has(f.group)) groups.set(f.group, []);
      groups.get(f.group).push(f);
    }

    const header = el('div', { class: 'osu-expertplus-panel__header' }, 'osu! Expert+ Settings');

    const rows = [];
    const hasSavedCreds = auth.isConfigured();
    const hasSavedOmdb = omdb.isConfigured();

    // Credentials section at the top; collapse by default once credentials are saved.
    rows.push(
      buildSection(
        'osu! API Credentials',
        [buildCredentialsSection()],
        { collapsedByDefault: hasSavedCreds },
      ),
    );

    rows.push(
      buildSection(
        'OMDB API Key',
        [buildOmdbCredentialsSection()],
        { collapsedByDefault: hasSavedOmdb },
      ),
    );

    // Feature toggles grouped by page.
    for (const [groupName, groupFeatures] of groups) {
      const groupRows = [];
      for (const feature of groupFeatures) {
        const text = el('div', { class: 'osu-expertplus-panel__text' },
          el('div', { class: 'osu-expertplus-panel__label' }, feature.label),
        );
        groupRows.push(el('div', { class: 'osu-expertplus-panel__row' }, text, buildToggle(feature)));
      }
      rows.push(buildSection(groupName, groupRows));
    }

    return el('div', { id: ROOT_ID }, header, ...rows);
  }

  // ─── Public init ─────────────────────────────────────────────────────────

  function init() {
    if (document.getElementById(ROOT_ID)) return;

    GM_addStyle(CSS);

    const fab = el('button', { id: 'osu-expertplus-fab', title: 'osu! Expert+ Settings' },
      el('i', { class: 'fas fa-cog' }),
    );
    const backdrop = el('div', { id: 'osu-expertplus-backdrop' });
    const panel = buildPanel();

    const open  = () => { panel.classList.add(OPEN_CLASS); backdrop.classList.add(OPEN_CLASS); };
    const close = () => { panel.classList.remove(OPEN_CLASS); backdrop.classList.remove(OPEN_CLASS); };
    const toggle = () => panel.classList.contains(OPEN_CLASS) ? close() : open();

    fab.addEventListener('click', (e) => { e.stopPropagation(); toggle(); });
    backdrop.addEventListener('click', close);

    function attachToBody() {
      document.body.appendChild(backdrop);
      document.body.appendChild(panel);
      document.body.appendChild(fab);
    }

    attachToBody();

    // Inertia replaces document.body on SPA navigation, removing our elements.
    // Watch document.documentElement for body replacements and re-attach.
    new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node === document.body) {
            attachToBody();
            return;
          }
        }
      }
    }).observe(document.documentElement, { childList: true });
  }

  return { init };
})();
