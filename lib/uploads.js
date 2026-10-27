/**
 * Files of any type attached to messages (+ menu, drop, paste) that are not sent as images.
 * Why as paths and not content: Claude reads them with its own tools (Read handles text, code, PDF, notebooks...),
 * which works with any model, while a local model may not accept document blocks at all.
 * Every session gets this folder with --add-dir (lib/cli-args.js), so reading an attachment needs no permission prompt.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { httpError } = require('./http-utils');

const UPLOADS_DIR = path.join(process.env.CLAUDE_GUI_DATA || path.join(__dirname, '..', 'data'), 'uploads');
const MAX_FILES = 10;
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const ID_PATTERN = /^[0-9a-f-]{36}$/;
// Windows refuses these characters and names; the original name is kept for display.
const safeName = name => (String(name || 'file').replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').replace(/^\.+/, '_').trim().slice(0, 120) || 'file')
  .replace(/^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i, '_$1$2');

/** The folder every session may read (created on demand). */
function uploadsDir() {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  return UPLOADS_DIR;
}

/**
 * Stores new files and checks references to stored ones (a message taken back from the queue keeps its files).
 * Each file gets its own folder, so its name stays as the user knows it.
 * @param {Array<{data?:string, ref?:string, name:string}>} files data = base64
 * @returns {{id:string, name:string, size:number, path:string}[]}
 */
function saveFiles(files) {
  if (files === undefined || files === null) return [];
  if (!Array.isArray(files) || files.length > MAX_FILES) throw httpError(400, `אפשר לצרף עד ${MAX_FILES} קבצים להודעה`);
  return files.map(file => {
    const name = safeName(file?.name);
    if (file?.ref) {
      const stored = ID_PATTERN.test(file.ref) && path.join(UPLOADS_DIR, file.ref, name);
      if (!stored || !fs.existsSync(stored)) throw httpError(400, `הקובץ ${name} כבר לא קיים`);
      return { id: file.ref, name, size: fs.statSync(stored).size, path: stored };
    }
    if (typeof file?.data !== 'string') throw httpError(400, 'קובץ לא תקין');
    const buffer = Buffer.from(file.data, 'base64');
    if (buffer.length > MAX_FILE_BYTES) throw httpError(413, `הקובץ ${name} גדול מ-25MB`);
    const id = crypto.randomUUID();
    const folder = path.join(uploadsDir(), id);
    fs.mkdirSync(folder);
    fs.writeFileSync(path.join(folder, name), buffer);
    return { id, name, size: buffer.length, path: path.join(folder, name) };
  });
}

/**
 * The text Claude gets: what the user wrote, then the attached files by full path.
 * @example messageText('summarize', [{ path: 'C:\\gui\\data\\uploads\\…\\report.pdf' }])
 */
function messageText(text, files = []) {
  if (!files.length) return text;
  const list = files.map(file => `- ${file.path}`).join('\n');
  return `${text ? `${text}\n\n` : ''}[Attached files – read them with the Read tool]\n${list}`;
}

/** Deletes stored files no message refers to anymore. @param {string[]} ids @param {Set<string>} stillUsed */
function removeFiles(ids, stillUsed) {
  for (const id of ids) {
    if (stillUsed.has(id) || !ID_PATTERN.test(id)) continue;
    fs.rm(path.join(UPLOADS_DIR, id), { recursive: true, force: true }, () => {});
  }
}

/** At startup: deletes uploads no message refers to, older than a day (see images.sweep). */
function sweep(stillUsed) {
  let folders = [];
  try { folders = fs.readdirSync(UPLOADS_DIR); } catch { return; }
  const dayAgo = Date.now() - 86400000;
  for (const id of folders) {
    if (stillUsed.has(id) || !ID_PATTERN.test(id)) continue;
    const folder = path.join(UPLOADS_DIR, id);
    try { if (fs.statSync(folder).mtimeMs < dayAgo) fs.rmSync(folder, { recursive: true, force: true }); } catch { /* already gone */ }
  }
}

/** GET /api/uploads/:id/:name — always a download, never shown inline, so an HTML file cannot run in the GUI's origin. */
function serveUpload(response, id, name) {
  const file = ID_PATTERN.test(id) && path.join(UPLOADS_DIR, id, safeName(name));
  if (!file || path.basename(file) !== safeName(name)) throw httpError(404, 'הקובץ לא קיים');
  fs.readFile(file, (error, data) => {
    if (error) { response.writeHead(404); response.end(); return; }
    response.writeHead(200, {
      'Content-Type': 'application/octet-stream', 'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(path.basename(file))}`,
    });
    response.end(data);
  });
}

module.exports = { saveFiles, messageText, removeFiles, sweep, serveUpload, uploadsDir, MAX_FILES };
