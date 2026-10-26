/** Merges the built-in command list with the live catalog from the CLI, and filters it for the slash menu. */
import { BUILTIN_COMMANDS } from './commands-data.js';

export const GROUPS = [
  { id: 'builtin', label: 'פקודות' },
  { id: 'skill', label: 'Skills ופקודות מותאמות' },
  { id: 'plugin', label: 'פלאגינים' },
  { id: 'mcp', label: 'MCP' },
  { id: 'terminal', label: 'בטרמינל בלבד' },
];
const GROUP_ORDER = Object.fromEntries(GROUPS.map((group, index) => [group.id, index]));
const SOURCE_SUFFIX = /\s*\(([^()]+)\)\s*$/;

function classify(command) {
  if (command.name.startsWith('mcp__') || /\(MCP\)$/.test(command.description || '')) return 'mcp';
  if (command.name.includes(':')) return 'plugin';
  return 'skill';
}

/**
 * @param {{commands:object[], skills:object[]}|null} catalog From /api/.../catalog (null when unavailable).
 * @returns {object[]} entries { name, aliases, description, argHint, group, icon, run, source }
 * @example buildCommands(null).find(command => command.name === 'mcp').run // 'action:mcp'
 */
export function buildCommands(catalog) {
  const cliByName = new Map((catalog?.commands || []).map(command => [command.name, command]));
  const skillSources = new Map((catalog?.skills || []).map(skill => [skill.name, skill.source]));
  const entries = BUILTIN_COMMANDS.map(builtin => {
    const cli = cliByName.get(builtin.name);
    cliByName.delete(builtin.name);
    const run = builtin.run === 'terminal' && cli ? 'send' : builtin.run;
    return {
      name: builtin.name, aliases: builtin.aliases || [], description: builtin.he, cliDescription: cli?.description || '',
      argHint: builtin.args || cli?.argumentHint || '', group: run === 'terminal' ? 'terminal' : 'builtin',
      icon: builtin.icon || 'slash', run, source: 'builtin',
    };
  });
  for (const command of cliByName.values()) {
    if (command.name.startsWith('__') || command.name === 'workflow-launch-exec') continue; // internal
    const sourceMatch = (command.description || '').match(SOURCE_SUFFIX);
    const group = classify(command);
    entries.push({
      name: command.name, aliases: [], description: (command.description || '').replace(SOURCE_SUFFIX, '') || command.name,
      cliDescription: '', argHint: command.argumentHint || '', group, run: 'send',
      icon: group === 'mcp' ? 'plug' : group === 'plugin' ? 'puzzle' : 'sparkles',
      // Project/user/plugin commands end with "(source)"; older CLIs (2.1.246) send no builtin flag at all.
      source: skillSources.get(command.name) || sourceMatch?.[1] || 'bundled',
    });
  }
  return entries;
}

/**
 * @param {object[]} entries From buildCommands.
 * @param {string} query Text after the slash.
 * @returns {object[]} sorted matches
 */
export function filterCommands(entries, query) {
  const needle = query.toLowerCase();
  const scored = entries.map(entry => {
    const names = [entry.name, ...entry.aliases].map(name => name.toLowerCase());
    let score = -1;
    if (!needle) score = 0;
    else if (names[0].startsWith(needle)) score = 0;
    else if (names.some(name => name.startsWith(needle))) score = 1;
    else if (names.some(name => name.includes(needle))) score = 2;
    else if (`${entry.description} ${entry.cliDescription}`.toLowerCase().includes(needle)) score = 3;
    return { entry, score };
  }).filter(({ score }) => score >= 0);
  scored.sort((a, b) => a.score - b.score || GROUP_ORDER[a.entry.group] - GROUP_ORDER[b.entry.group]
    || a.entry.name.localeCompare(b.entry.name));
  return scored.map(({ entry }) => entry);
}

/** Finds a command by name or alias. */
export function findCommand(entries, name) {
  const lower = name.toLowerCase();
  return entries.find(entry => entry.name === lower || entry.aliases.includes(lower)) || null;
}

/** Splits "/name args" into its parts, or null when the text is not a slash command. */
export function parseSlash(text) {
  const match = text.trim().match(/^\/([^\s/]+)(?:\s+([\s\S]*))?$/);
  return match ? { name: match[1], args: (match[2] || '').trim() } : null;
}
