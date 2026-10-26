/**
 * The "/" command menu and the "@" mention menu (files, folders, agents) of the composer.
 * Typing "/" at the start lists every command; typing "@" anywhere lists files and agents.
 */
import { h } from './dom.js';
import { api } from './api.js';
import { createListMenu } from './popover.js';
import { GROUPS, filterCommands } from './command-catalog.js';
import { currentScope, getCatalog, getCommands } from './state.js';

const SLASH_TOKEN = /^\/([^\s]*)$/;
const MENTION_TOKEN = /(^|\s)@([^\s@]*)$/;
const MAX_PER_GROUP = 40;

const footer = () => h('div', { class: 'menu-footer' }, h('span', null, '↑↓ ניווט'), h('span', null, 'Enter / Tab בחירה'), h('span', null, 'Esc סגירה'));

function commandEntries(commands, onPick) {
  const entries = [];
  for (const group of GROUPS) {
    const inGroup = commands.filter(command => command.group === group.id).slice(0, MAX_PER_GROUP);
    if (!inGroup.length) continue;
    entries.push({ section: group.label });
    for (const command of inGroup) {
      entries.push({
        icon: command.icon, titleNode: h('span', null, h('code', null, `/${command.name}`)),
        hint: command.argHint, tag: command.run === 'terminal' ? 'טרמינל' : command.source !== 'builtin' && command.source !== 'bundled' ? command.source : '',
        desc: command.description, disabled: false, onSelect: () => onPick(command),
      });
    }
  }
  return entries;
}

/**
 * @param {HTMLTextAreaElement} textarea
 * @param {HTMLElement} anchor Element the menus attach to (the composer box).
 * @param {{onCommand:(command:object)=>void, onChange:()=>void}} handlers
 * @returns {{handleKey:(event:KeyboardEvent)=>boolean, refresh:()=>void, close:()=>void}}
 */
export function attachComposerMenus(textarea, anchor, { onCommand, onChange }) {
  const menu = createListMenu(anchor);
  let requestId = 0;
  let mentionTimer = null;

  const beforeCaret = () => textarea.value.slice(0, textarea.selectionStart);

  function replaceToken(pattern, replacement) {
    const head = beforeCaret();
    const tail = textarea.value.slice(textarea.selectionStart);
    const newHead = head.replace(pattern, (match, space) => `${space ?? ''}${replacement}`);
    textarea.value = newHead + tail;
    textarea.selectionStart = textarea.selectionEnd = newHead.length;
    textarea.focus();
    onChange();
  }

  async function showCommands(query) {
    const id = ++requestId;
    const commands = filterCommands(await getCommands(), query);
    if (id !== requestId) return;
    menu.update(commandEntries(commands, command => { menu.close(); onCommand(command); }), footer());
  }

  async function showMentions(query) {
    const id = ++requestId;
    const scope = currentScope();
    const [files, catalog] = await Promise.all([api.files(scope, query).catch(() => []), getCatalog(scope)]);
    if (id !== requestId) return;
    const agents = (catalog?.agents || []).filter(agent => `agent-${agent.name}`.toLowerCase().includes(query.toLowerCase()));
    const entries = [];
    if (agents.length) {
      entries.push({ section: 'סוכנים' }, ...agents.slice(0, 8).map(agent => ({
        icon: 'bot', titleNode: h('code', null, `@agent-${agent.name}`), desc: agent.description,
        onSelect: () => { menu.close(); replaceToken(MENTION_TOKEN, `@agent-${agent.name} `); },
      })));
    }
    if (files.length) {
      entries.push({ section: 'קבצים ותיקיות' }, ...files.map(file => ({
        icon: file.endsWith('/') ? 'folder' : 'file', titleNode: h('code', { dir: 'ltr' }, file),
        onSelect: () => { menu.close(); replaceToken(MENTION_TOKEN, `@${file}${file.endsWith('/') ? '' : ' '}`); },
      })));
    }
    menu.update(entries, footer());
  }

  function refresh() {
    const head = beforeCaret();
    const slash = textarea.value.match(SLASH_TOKEN) && head === textarea.value ? head.match(SLASH_TOKEN) : null;
    const mention = head.match(MENTION_TOKEN);
    clearTimeout(mentionTimer);
    if (slash) return showCommands(slash[1]);
    if (mention) { mentionTimer = setTimeout(() => showMentions(mention[2]), 120); return undefined; }
    requestId++;
    menu.close();
    return undefined;
  }

  textarea.addEventListener('input', refresh);
  textarea.addEventListener('click', refresh);
  textarea.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== textarea) menu.close(); }, 150));
  window.addEventListener('resize', () => menu.close());

  return { handleKey: event => menu.handleKey(event), refresh, close: () => { requestId++; menu.close(); } };
}
