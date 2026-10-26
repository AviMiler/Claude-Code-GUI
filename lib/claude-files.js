/**
 * Reads and writes Claude Code's own files: settings, CLAUDE.md memory, agents, skills, commands, output styles.
 * Why kinds instead of paths: the browser can only reach these known locations, never an arbitrary file.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { httpError } = require('./http-utils');

const NAME_PATTERN = /^[\w][\w.-]{0,80}$/;
const NAMED_DIRS = { agent: 'agents', command: 'commands', style: 'output-styles' };

const configHome = config => config.env.CLAUDE_CONFIG_DIR || process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');

/** Base folder of a scope: the user's config folder or the project's .claude folder. */
const scopeRoot = (config, cwd, scope) => (scope === 'user' ? configHome(config) : path.join(cwd, '.claude'));

/**
 * @param {object} config @param {string} cwd
 * @param {string} kind e.g. settings-user | memory-project | agent-user | skill-project | command-user | style-user
 * @param {string} [name] Required for agent/skill/command/style kinds.
 * @returns {string} absolute path
 */
function resolveKind(config, cwd, kind, name) {
  const [type, scope] = String(kind).split('-');
  if (!['user', 'project', 'local'].includes(scope)) throw httpError(400, `סוג קובץ לא מוכר: ${kind}`);
  if (type === 'settings') {
    if (scope === 'user') return path.join(configHome(config), 'settings.json');
    return path.join(cwd, '.claude', scope === 'local' ? 'settings.local.json' : 'settings.json');
  }
  if (type === 'memory') {
    if (scope === 'user') return path.join(configHome(config), 'CLAUDE.md');
    return path.join(cwd, scope === 'local' ? 'CLAUDE.local.md' : 'CLAUDE.md');
  }
  if (scope === 'local' || !NAME_PATTERN.test(name || '')) throw httpError(400, 'שם לא תקין (אותיות, ספרות, - ו-_ בלבד)');
  if (type === 'skill') return path.join(scopeRoot(config, cwd, scope), 'skills', name, 'SKILL.md');
  if (NAMED_DIRS[type]) return path.join(scopeRoot(config, cwd, scope), NAMED_DIRS[type], `${name}.md`);
  throw httpError(400, `סוג קובץ לא מוכר: ${kind}`);
}

function requireCwd(cwd) {
  if (!cwd || !fs.existsSync(cwd) || !fs.statSync(cwd).isDirectory()) throw httpError(400, `התיקייה לא קיימת: ${cwd}`);
  return cwd;
}

/** Simple YAML front matter (key: value lines) used by agents, skills and commands. */
function frontMatter(text) {
  const block = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!block) return {};
  return Object.fromEntries(block[1].split(/\r?\n/).map(line => line.match(/^([\w-]+):\s*(.*)$/))
    .filter(Boolean).map(([, key, value]) => [key, value.replace(/^["']|["']$/g, '')]));
}

function readKind(config, { cwd, kind, name }) {
  const file = resolveKind(config, requireCwd(cwd), kind, name);
  const exists = fs.existsSync(file);
  return { path: file, exists, content: exists ? fs.readFileSync(file, 'utf8') : '' };
}

function writeKind(config, { cwd, kind, name, content }) {
  if (typeof content !== 'string') throw httpError(400, 'תוכן חסר');
  if (kind.startsWith('settings-')) {
    try { JSON.parse(content || '{}'); } catch (error) { throw httpError(400, `JSON לא תקין: ${error.message}`); }
  }
  const file = resolveKind(config, requireCwd(cwd), kind, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf8');
  return { path: file, exists: true };
}

function deleteKind(config, { cwd, kind, name }) {
  if (/^(settings|memory)-/.test(kind)) throw httpError(400, 'אי אפשר למחוק קובצי הגדרות או זיכרון מכאן');
  const file = resolveKind(config, requireCwd(cwd), kind, name);
  if (!fs.existsSync(file)) throw httpError(404, 'הקובץ לא קיים');
  fs.unlinkSync(file);
  if (kind.startsWith('skill-') && !fs.readdirSync(path.dirname(file)).length) fs.rmdirSync(path.dirname(file));
  return { ok: true };
}

function listNamed(config, cwd, type) {
  const entries = [];
  for (const scope of ['project', 'user']) {
    const dir = path.join(scopeRoot(config, cwd, scope), type === 'skill' ? 'skills' : NAMED_DIRS[type]);
    if (!fs.existsSync(dir)) continue;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const name = type === 'skill' ? entry.name : entry.name.replace(/\.md$/, '');
      if ((type === 'skill') !== entry.isDirectory() || (type !== 'skill' && !entry.name.endsWith('.md'))) continue;
      const file = type === 'skill' ? path.join(dir, entry.name, 'SKILL.md') : path.join(dir, entry.name);
      if (!fs.existsSync(file)) continue;
      entries.push({ scope, name, path: file, kind: `${type}-${scope}`, meta: frontMatter(fs.readFileSync(file, 'utf8')) });
    }
  }
  return entries;
}

/** Everything editable for a folder, with existence flags. */
function listAll(config, { cwd }) {
  requireCwd(cwd);
  const fixed = kinds => kinds.map(kind => {
    const file = resolveKind(config, cwd, kind);
    return { kind, path: file, exists: fs.existsSync(file) };
  });
  return {
    configHome: configHome(config),
    settings: fixed(['settings-user', 'settings-project', 'settings-local']),
    memory: fixed(['memory-user', 'memory-project', 'memory-local']),
    agents: listNamed(config, cwd, 'agent'), skills: listNamed(config, cwd, 'skill'),
    commands: listNamed(config, cwd, 'command'), styles: listNamed(config, cwd, 'style'),
  };
}

module.exports = { readKind, writeKind, deleteKind, listAll, configHome, frontMatter };
