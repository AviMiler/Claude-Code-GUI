/**
 * Images attached to messages (pasted, dropped or picked in the composer).
 * Why on disk and not in sessions.json: base64 images would make the session file huge and slow to save.
 * A message keeps only references ({ id, mediaType, name }); the bytes are read again when the turn is sent.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { httpError } = require('./http-utils');

const IMAGES_DIR = path.join(process.env.CLAUDE_GUI_DATA || path.join(__dirname, '..', 'data'), 'images');
const MAX_IMAGES = 10;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // the Messages API limit per image
const TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' };
const EXTENSION_TYPES = Object.fromEntries(Object.entries(TYPES).map(([type, extension]) => [extension, type]));
const ID_PATTERN = /^[0-9a-f-]{36}\.(png|jpg|gif|webp)$/;

/** First bytes of each format: the declared type must match the content (no SVG or HTML under an image name). */
function matchesType(buffer, mediaType) {
  const hex = buffer.subarray(0, 12).toString('hex');
  if (mediaType === 'image/png') return hex.startsWith('89504e470d0a1a0a');
  if (mediaType === 'image/jpeg') return hex.startsWith('ffd8ff');
  if (mediaType === 'image/gif') return hex.startsWith('47494638');
  return hex.startsWith('52494646') && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
}

/**
 * Stores new images and checks references to stored ones (a message taken back from the queue keeps its images).
 * @param {Array<{data?:string, ref?:string, mediaType?:string, name?:string}>} images data = base64 without the data: prefix
 * @returns {{id:string, mediaType:string, name:string}[]}
 * @example saveImages([{ data: 'iVBORw0...', mediaType: 'image/png', name: 'screenshot.png' }])
 */
function saveImages(images) {
  if (images === undefined || images === null) return [];
  if (!Array.isArray(images) || images.length > MAX_IMAGES) throw httpError(400, `אפשר לצרף עד ${MAX_IMAGES} תמונות להודעה`);
  return images.map(image => {
    const name = String(image?.name || 'image').slice(0, 120);
    if (image?.ref) {
      if (!ID_PATTERN.test(image.ref) || !fs.existsSync(path.join(IMAGES_DIR, image.ref))) throw httpError(400, 'התמונה כבר לא קיימת');
      return { id: image.ref, mediaType: EXTENSION_TYPES[image.ref.split('.').pop()], name };
    }
    const extension = TYPES[image?.mediaType];
    if (!extension || typeof image.data !== 'string') throw httpError(400, 'סוג תמונה לא נתמך (PNG, JPEG, GIF, WebP)');
    const buffer = Buffer.from(image.data, 'base64');
    if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) throw httpError(413, `התמונה ${name} גדולה מ-5MB`);
    if (!matchesType(buffer, image.mediaType)) throw httpError(400, `הקובץ ${name} אינו ${image.mediaType}`);
    const id = `${crypto.randomUUID()}.${extension}`;
    fs.mkdirSync(IMAGES_DIR, { recursive: true });
    fs.writeFileSync(path.join(IMAGES_DIR, id), buffer);
    return { id, mediaType: image.mediaType, name };
  });
}

/**
 * The user turn for the CLI: image blocks first, then the text (the order the Messages API recommends).
 * Plain text stays a string, so slash commands keep working.
 * @returns {string|object[]}
 */
function userContent(text, images = []) {
  if (!images.length) return text;
  const blocks = images.map(image => ({
    type: 'image',
    source: { type: 'base64', media_type: image.mediaType, data: fs.readFileSync(path.join(IMAGES_DIR, image.id)).toString('base64') },
  }));
  return text ? [...blocks, { type: 'text', text }] : blocks;
}

/** Deletes stored images no message refers to anymore. @param {string[]} ids @param {Set<string>} stillUsed */
function removeImages(ids, stillUsed) {
  for (const id of ids) {
    if (stillUsed.has(id) || !ID_PATTERN.test(id)) continue;
    fs.rm(path.join(IMAGES_DIR, id), { force: true }, () => {});
  }
}

/**
 * At startup: deletes stored images no message refers to (removed from the queue and never sent again).
 * Only files older than a day, so an attachment sent a moment before a restart is never lost.
 */
function sweep(stillUsed) {
  let files = [];
  try { files = fs.readdirSync(IMAGES_DIR); } catch { return; }
  const dayAgo = Date.now() - 86400000;
  for (const id of files) {
    if (stillUsed.has(id) || !ID_PATTERN.test(id)) continue;
    const file = path.join(IMAGES_DIR, id);
    try { if (fs.statSync(file).mtimeMs < dayAgo) fs.rmSync(file, { force: true }); } catch { /* already gone */ }
  }
}

/** GET /api/images/:id — the stored bytes with their own type; nosniff so a browser never reads them as anything else. */
function serveImage(response, id) {
  if (!ID_PATTERN.test(id)) throw httpError(404, 'תמונה לא קיימת');
  fs.readFile(path.join(IMAGES_DIR, id), (error, data) => {
    if (error) { response.writeHead(404); response.end(); return; }
    response.writeHead(200, {
      'Content-Type': EXTENSION_TYPES[id.split('.').pop()], 'Cache-Control': 'private, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    });
    response.end(data);
  });
}

module.exports = { saveImages, userContent, removeImages, sweep, serveImage, MAX_IMAGES };
