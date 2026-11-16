/** Per project folder memory of the permission mode, model and effort last chosen there (localStorage, capped, least recent dropped). */
import { state } from './state.js';
import { availableModes } from './modes.js';
import { isLocalModelKnown, onLocalModelAnswer } from './local-model.js';

const KEY = 'claude-gui.folder-settings';
const MAX_FOLDERS = 40;
const FIELDS = ['mode', 'model', 'effort'];
const DEFAULTS = { mode: 'acceptEdits', model: '', effort: '' };

function load() {
  try {
    const map = JSON.parse(localStorage.getItem(KEY) || '{}');
    return map && typeof map === 'object' && !Array.isArray(map) ? map : {};
  } catch { return {}; }
}

/** Remembers what was chosen for a folder (only mode, model and effort of the patch). */
export function rememberFolderSettings(cwd, patch) {
  const picked = Object.fromEntries(FIELDS.filter(field => typeof patch[field] === 'string').map(field => [field, patch[field]]));
  if (!cwd || !Object.keys(picked).length) return;
  const map = load();
  const entry = { ...map[cwd], ...picked };
  delete map[cwd]; // re-insert last: the newest folders are at the end
  map[cwd] = entry;
  const keys = Object.keys(map);
  for (const key of keys.slice(0, Math.max(0, keys.length - MAX_FOLDERS))) delete map[key];
  try { localStorage.setItem(KEY, JSON.stringify(map)); } catch { /* storage may be blocked */ }
}

let applied = null; // what chooseDraftFolder last put in the draft: a field that differs was changed by hand since

/**
 * Points the draft of the next new session at a folder: the settings last chosen there, else today's defaults. A field the
 * user changed by hand in this draft is left alone. A remembered "auto" is not applied while it is unknown whether the
 * model is local (it needs an Anthropic model); it is re-checked when the health answer arrives.
 */
export function chooseDraftFolder(cwd) {
  const saved = load()[cwd] || {};
  const allowed = (saved.mode !== 'auto' || isLocalModelKnown()) && availableModes(state.capabilities.permissionModes).some(mode => mode.value === saved.mode);
  const next = {
    mode: allowed ? saved.mode : DEFAULTS.mode,
    model: typeof saved.model === 'string' ? saved.model : DEFAULTS.model,
    effort: typeof saved.effort === 'string' ? saved.effort : DEFAULTS.effort,
  };
  state.draft.cwd = cwd;
  for (const field of FIELDS) if (!applied || state.draft[field] === applied[field]) state.draft[field] = next[field];
  applied = { ...next };
}

onLocalModelAnswer(() => { if (state.draft.cwd) chooseDraftFolder(state.draft.cwd); });
