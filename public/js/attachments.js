/**
 * Attachments of the composer, in two kinds:
 * - image: sent to the model as an image (lib/images.js). Shrunk here first: the Messages API takes at most 5 MB per
 *   image and models see ~1568 px at most on the long edge, so a bigger photo only costs upload time and tokens.
 * - file: any other file, stored by the server and given to Claude as a path it reads itself (lib/uploads.js).
 */
const TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
const MAX_EDGE = 1568;
const MAX_BYTES = 3.75 * 1024 * 1024; // leaves room under the 5 MB limit after base64 overhead on the server side
export const MAX_IMAGES = 10;
export const MAX_FILES = 10;
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_MESSAGE_BYTES = 60 * 1024 * 1024; // all attachments of one message (the server takes 90 MB of base64)

const readAsDataUrl = blob => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(blob);
});

const loadImage = url => new Promise((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error('לא ניתן לקרוא את התמונה'));
  image.src = url;
});

/** Redraws the image no larger than MAX_EDGE; PNG stays PNG (sharp text in screenshots) unless it is still too big. */
async function shrink(file) {
  const url = URL.createObjectURL(file);
  try {
    const image = await loadImage(url);
    const scale = Math.min(1, MAX_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    const asPng = file.type === 'image/png';
    if (!asPng) { context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height); } // JPEG has no transparency
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    let blob = await new Promise(resolve => canvas.toBlob(resolve, asPng ? 'image/png' : 'image/jpeg', 0.88));
    if (asPng && blob.size > MAX_BYTES) blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.88));
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * @param {File} file An image from paste, drop or the file picker.
 * @returns {Promise<{data:string, mediaType:string, name:string, preview:string}>} data is base64 without the prefix
 * @example const attachment = await prepareImage(event.clipboardData.files[0]);
 */
export async function prepareImage(file) {
  if (!file.type.startsWith('image/')) throw new Error(`${file.name || 'הקובץ'} אינו תמונה`);
  let blob = file;
  const needsShrink = !TYPES.includes(file.type) || file.size > MAX_BYTES
    || await createImageBitmap(file).then(bitmap => { const big = Math.max(bitmap.width, bitmap.height) > MAX_EDGE; bitmap.close(); return big; })
      .catch(() => false);
  // An animated GIF would become a single frame, so a small GIF is sent as it is.
  if (needsShrink && !(file.type === 'image/gif' && file.size <= MAX_BYTES)) blob = await shrink(file);
  if (blob.size > MAX_BYTES) throw new Error(`${file.name || 'התמונה'} גדולה מדי גם אחרי הקטנה`);
  const preview = await readAsDataUrl(blob);
  return { kind: 'image', data: preview.slice(preview.indexOf(',') + 1), mediaType: blob.type, name: file.name || 'image', size: blob.size, preview };
}

/** Any file that is not sent as an image. @returns {Promise<{kind:'file', data:string, name:string, size:number}>} */
export async function prepareFile(file) {
  if (file.size > MAX_FILE_BYTES) throw new Error(`${file.name} גדול מ-25MB`);
  const url = await readAsDataUrl(file);
  return { kind: 'file', data: url.slice(url.indexOf(',') + 1), name: file.name || 'file', size: file.size };
}

/** Image types the model gets as images; other images (BMP, TIFF, HEIC, SVG) go as files. */
export const isModelImage = file => TYPES.includes(file.type) || file.type === 'image/bmp';

/** An attachment for any file: an image when the model can see it, otherwise a file. */
export const prepareAttachment = file => (isModelImage(file) ? prepareImage(file) : prepareFile(file));

/** Throws when one more attachment would pass the limits of a message. */
export function checkRoom(attachments, next) {
  const count = attachments.filter(item => item.kind === next.kind).length;
  if (count >= (next.kind === 'image' ? MAX_IMAGES : MAX_FILES)) throw new Error(`אפשר לצרף עד ${next.kind === 'image' ? MAX_IMAGES : MAX_FILES} ${next.kind === 'image' ? 'תמונות' : 'קבצים'} להודעה`);
  const total = attachments.reduce((sum, item) => sum + (item.size || 0), next.size || 0);
  if (total > MAX_MESSAGE_BYTES) throw new Error('הקבצים המצורפים גדולים מדי יחד (עד 60MB להודעה)');
}

export function formatSize(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  return `${Math.max(1, Math.round(bytes / 1024))}KB`;
}

/** What the server needs: new bytes, or a reference to an attachment it already stores. */
const toServer = attachment => (attachment.ref
  ? { ref: attachment.ref, name: attachment.name }
  : { data: attachment.data, mediaType: attachment.mediaType, name: attachment.name });

/** Splits composer attachments into the message's { images, files } for api.sendMessage. */
export const forServer = attachments => ({
  images: attachments.filter(item => item.kind === 'image').map(toServer),
  files: attachments.filter(item => item.kind === 'file').map(toServer),
});

/** Stored attachments of a message (from the queue) back as composer attachments, sent again by reference. */
export const fromStored = entry => [
  ...(entry.images || []).map(image => ({ kind: 'image', ref: image.id, mediaType: image.mediaType, name: image.name, preview: imageUrl(image) })),
  ...(entry.files || []).map(file => ({ kind: 'file', ref: file.id, name: file.name, size: file.size })),
];

export const imageUrl = image => `/api/images/${encodeURIComponent(image.id)}`;
export const fileUrl = file => `/api/uploads/${encodeURIComponent(file.id)}/${encodeURIComponent(file.name)}`;
