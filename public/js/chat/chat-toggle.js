/**
 * The welcome page's "צ'אט בלי פרויקט" switch (Claude Desktop's "no folder"): the next session answers general questions and
 * gets no project folder or worktree. The choice is remembered in this browser, like the worktree switch.
 */
import { h } from '../dom.js';
import { icon } from '../icons.js';
import { CHAT_LABEL } from './chat-session.js';

const WANT_KEY = 'claude-gui.chat';
const TITLE = 'שיחה כללית בלי פרויקט: Claude עונה על שאלות ומשתמש בכלים כרגיל, בתיקייה פנימית של הממשק ולא בתיקייה שלך.';

/** Whether the user chose a chat without a project for the next new session (remembered in this browser). */
export function chatWanted() {
  try { return localStorage.getItem(WANT_KEY) === '1'; } catch { return false; }
}

/**
 * @param {(on:boolean)=>void} onChange called after the choice changed (the page re-renders)
 * @returns {HTMLElement} the switch
 */
export function createChatToggle(onChange) {
  const input = h('input', { type: 'checkbox', checked: chatWanted() });
  input.addEventListener('change', () => {
    try { localStorage.setItem(WANT_KEY, input.checked ? '1' : '0'); } catch { /* storage may be blocked */ }
    onChange(input.checked);
  });
  return h('label', { class: 'worktree-toggle chat-toggle', title: TITLE }, input, icon('message'), h('span', null, `${CHAT_LABEL} בלי פרויקט`));
}
