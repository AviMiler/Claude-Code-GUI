/** Dropdowns of the composer's chips: permission mode, model + effort, and the "+" menu. */
import { h } from './dom.js';
import { state, activeSession, getModels, peekModels } from './state.js';
import { showDropdown } from './popover.js';
import { availableModes, EFFORT_LEVELS } from './modes.js';
import { ask } from './ui.js';
import { showTemplateMenu } from './templates.js';

/**
 * @param {{actions:object, getComposer:()=>object}} deps actions from actions.js; the composer (created after the menus)
 * @returns {{onModeMenu:(anchor:HTMLElement)=>void, onModelMenu:(anchor:HTMLElement)=>Promise<void>, onPlusMenu:(anchor:HTMLElement)=>void}}
 *   handlers in the shape createComposer expects
 */
export function createChipMenus({ actions, getComposer }) {
  return {
    onModeMenu(anchor) {
      const current = activeSession()?.mode || state.draft.mode;
      showDropdown(anchor, [{ section: 'מצב הרשאות · Shift+Tab' }, ...availableModes(state.capabilities.permissionModes).map(mode => ({
        icon: mode.icon, title: mode.label, desc: mode.description, checked: mode.value === current, onSelect: () => actions.setMode(mode.value),
      })), { icon: 'shield', title: 'כללי הרשאה…', hint: '/permissions', onSelect: () => actions.openPanel('permissions') }]);
    },

    async onModelMenu(anchor) {
      const settings = activeSession() || state.draft;
      const { models, current: systemCurrent } = peekModels() || await getModels();
      const current = settings.model || state.config.model || systemCurrent || 'default';
      const effort = h('div', { class: 'segmented' }, EFFORT_LEVELS.slice(0, 5).map(level => h('button', {
        type: 'button', class: (settings.effort || '') === level.value ? 'on' : '',
        onClick: () => { actions.updateSettings({ effort: level.value }); document.querySelector('.popover')?.remove(); },
      }, level.label)));
      showDropdown(anchor, [{ section: 'מודל' }, ...models.map(model => ({
        icon: 'cpu', title: model.displayName || model.value, desc: model.description, checked: model.value === current,
        onSelect: () => actions.updateSettings({ model: model.value === 'default' ? '' : model.value }),
      })), { icon: 'pencil', title: 'מודל מותאם…', onSelect: async () => {
        const value = await ask({ title: 'שם מודל', value: settings.model || '', placeholder: 'qwen3.8:27b / claude-sonnet-5-5', confirmLabel: 'שימוש' });
        if (value !== null) actions.updateSettings({ model: value });
      } }, { section: 'מאמץ (effort)' }, { node: effort },
      { icon: 'sliders', title: 'סגנון, סוכן ותיקיות…', hint: '/model', onSelect: () => actions.openPanel('model') }]);
    },

    onPlusMenu(anchor) {
      const composer = getComposer();
      showDropdown(anchor, [
        { icon: 'paperclip', title: 'העלאת קבצים ותמונות', desc: 'כל סוג קובץ. אפשר גם לגרור לתיבה או להדביק (Ctrl+V)', onSelect: () => composer.pickFiles() },
        { icon: 'at', title: 'הפניה לקובץ או תיקייה מהפרויקט', hint: '@', onSelect: () => composer.insert('@') },
        { icon: 'bot', title: 'הזמנת סוכן', hint: '@agent-', onSelect: () => composer.insert('@agent-') },
        { icon: 'slash', title: 'פקודות', hint: '/', onSelect: () => composer.insert('/', { replace: !composer.textarea.value }) },
        { icon: 'file', title: 'תבניות פרומפטים', desc: 'הודעות שמורות עם {{משתנים}}', onSelect: () => showTemplateMenu(anchor, {
          insert: text => composer.insert(text, { replace: !composer.textarea.value.trim() }), openPanel: () => actions.openPanel('templates') }) },
        { icon: 'sparkles', title: 'Skills', hint: '/skills', onSelect: () => actions.openPanel('skills') },
        { icon: 'plug', title: 'שרתי MCP', hint: '/mcp', onSelect: () => actions.openPanel('mcp') },
        { icon: 'folder', title: 'תיקיית עבודה נוספת', hint: '/add-dir', onSelect: () => actions.openPanel('model') },
        { icon: 'history', title: 'שיחות קודמות', hint: '/resume', onSelect: () => actions.openPanel('resume') },
      ]);
    },
  };
}
