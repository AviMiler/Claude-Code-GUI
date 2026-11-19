// Chat without a project: the shared chats folder and the session paths that use it (lib/chat-folder.js,
// session-service.js). Temporary data and Claude config folders are set BEFORE requiring the store.
const { describe, test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-chat-'));
const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-chat-proj-'));
process.env.CLAUDE_GUI_DATA = dataDir;
process.env.CLAUDE_CONFIG_DIR = path.join(dataDir, 'claude-config');
const chatFolder = require('../lib/chat-folder');
const service = require('../lib/session-service');
const runtime = require('../lib/session-runtime');
const store = require('../lib/session-store');
const { toMeta } = require('../lib/session-common');
const { knownFolder } = require('../lib/known-folders');

const config = { defaultCwd: projectDir };
const chats = path.join(dataDir, 'chats');
const cleanup = () => { fs.rmSync(dataDir, { recursive: true, force: true }); fs.rmSync(projectDir, { recursive: true, force: true }); };
after(cleanup);
process.on('exit', cleanup);

describe('chat folder', () => {
  test('is created on demand with .claude and a seed CLAUDE.md', () => {
    assert.equal(fs.existsSync(chats), false);
    assert.equal(chatFolder.ensureChatFolder(), chats);
    assert.ok(fs.statSync(path.join(chats, '.claude')).isDirectory());
    assert.match(fs.readFileSync(path.join(chats, 'CLAUDE.md'), 'utf8'), /General chat/);
  });

  test('never overwrites an edited CLAUDE.md', () => {
    fs.writeFileSync(path.join(chats, 'CLAUDE.md'), 'mine');
    chatFolder.ensureChatFolder();
    assert.equal(fs.readFileSync(path.join(chats, 'CLAUDE.md'), 'utf8'), 'mine');
  });

  test('passes the known-folders guard', () => {
    assert.equal(knownFolder(config, chats), chats);
  });
});

describe('chat sessions', () => {
  test('startSession chat:true uses the chats folder, ignores cwd, default name not named', async () => {
    const session = await service.startSession({ chat: true, cwd: projectDir }, config);
    assert.equal(session.cwd, chats);
    assert.equal(session.chat, true);
    assert.equal(session.name, "צ'אט חדש");
    assert.equal(session.named, false);
    assert.equal(session.worktree, null);
  });

  test('chat with worktree is refused with 400', async () => {
    await assert.rejects(service.startSession({ chat: true, worktree: true }, config), { status: 400 });
  });

  test('a non-boolean chat is not a chat', async () => {
    for (const chat of ['true', 1, {}]) {
      const session = await service.startSession({ chat, cwd: projectDir }, config);
      assert.equal(session.cwd, projectDir);
      assert.equal(session.chat, false);
    }
  });

  test('toMeta exposes chat', async () => {
    const session = await service.startSession({ chat: true }, config);
    assert.equal(toMeta(store.get(session.id)).chat, true);
  });

  test('PATCH cannot move a chat to another folder', async () => {
    const session = await service.startSession({ chat: true }, config);
    await service.updateSession(session.id, { cwd: projectDir }, config);
    assert.equal(store.get(session.id).cwd, chats);
  });

  test('a fork keeps chat and the folder', async () => {
    const session = await service.startSession({ chat: true }, config);
    store.update(session.id, { claudeSessionId: 'abc' });
    const fork = service.forkSession(session.id, config);
    assert.equal(fork.chat, true);
    assert.equal(fork.cwd, chats);
  });

  test('warm chat:true warms the chats folder; the spare key matches the session', () => {
    const seen = [];
    const original = runtime.prewarmNew;
    runtime.prewarmNew = async settings => { seen.push(settings); };
    try { service.warm({ chat: true, cwd: projectDir }, config); } finally { runtime.prewarmNew = original; }
    assert.equal(seen[0].cwd, chats);
  });
});
