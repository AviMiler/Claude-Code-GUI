/** The colors a session can be given. The keys are the server's whitelist (lib/session-color.js); only the key is stored. */
export const COLORS = [
  { key: 'red', label: 'אדום', hex: '#D8453A' }, { key: 'orange', label: 'כתום', hex: '#E07B39' },
  { key: 'yellow', label: 'צהוב', hex: '#D6A21E' }, { key: 'green', label: 'ירוק', hex: '#3F9B5A' },
  { key: 'teal', label: 'טורקיז', hex: '#2A9D9D' }, { key: 'blue', label: 'כחול', hex: '#3B82C4' },
  { key: 'purple', label: 'סגול', hex: '#8B5CC9' }, { key: 'pink', label: 'ורוד', hex: '#D45B97' },
];

/** @returns {{key:string, label:string, hex:string}|null} the color for a key, or for a name typed by the user (key or Hebrew label) */
export const findColor = name => COLORS.find(color => color.key === String(name).trim().toLowerCase() || color.label === String(name).trim()) || null;
