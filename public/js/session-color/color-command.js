/** /color: `/color blue` (or the Hebrew name) sets the session's color, `/color default` clears it, `/color` opens the options panel. */
import { toast } from '../ui.js';
import { COLORS, findColor } from './palette.js';

/**
 * @param {object|null} session @param {string} args what was typed after /color
 * @param {(patch:object)=>Promise<any>} update saves the session's settings @param {(panelId:string)=>void} openPanel
 */
export function setSessionColor(session, args, update, openPanel) {
  if (!session) { toast('צבע שייך לסשן – פתח או צור סשן קודם'); return undefined; }
  const name = args.trim();
  if (!name) return openPanel('session-options');
  if (['default', 'none', 'ללא'].includes(name.toLowerCase())) return update({ color: '' });
  const color = findColor(name);
  if (!color) { toast(`צבע לא מוכר. אפשר: ${COLORS.map(item => item.label).join(', ')}`, 'error'); return undefined; }
  return update({ color: color.key });
}
