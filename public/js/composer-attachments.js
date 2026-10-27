/**
 * The composer's attachments: the strip above the text (images as thumbnails, other files as chips), filled from the
 * + menu's picker, a paste or a drop on the box; each file is read (an image shrunk if needed) before it shows.
 */
import { h } from './dom.js';
import { icon } from './icons.js';
import { prepareAttachment, checkRoom, formatSize } from './attachments.js';
import { toast } from './ui.js';

/**
 * @param {{form:HTMLFormElement, strip:HTMLElement, textarea:HTMLTextAreaElement, onChange:()=>void, onTyping?:()=>void}} parts
 * @returns {{get:()=>object[], set:(list:object[])=>void, add:(files:FileList|File[])=>Promise<void>}}
 */
export function createAttachments({ form, strip, textarea, onChange, onTyping }) {
  let list = []; // { kind: 'image'|'file', data | ref, name, size, preview? } — see attachments.js

  function draw() {
    strip.hidden = !list.length;
    strip.replaceChildren(...list.map(attachment => h('div', {
      class: `attachment ${attachment.kind}`, title: attachment.size ? `${attachment.name} · ${formatSize(attachment.size)}` : attachment.name,
    },
      attachment.kind === 'image' ? h('img', { src: attachment.preview, alt: attachment.name })
        : [icon('file'), h('span', { class: 'attachment-name', dir: 'auto' }, attachment.name)],
      h('button', { type: 'button', class: 'attachment-remove', title: 'הסרה', 'aria-label': `הסרת ${attachment.name}`,
        onClick: () => { list = list.filter(item => item !== attachment); draw(); textarea.focus(); } }, icon('x')))));
    onChange();
  }

  async function add(files) {
    for (const file of [...(files || [])]) {
      try {
        const attachment = await prepareAttachment(file);
        checkRoom(list, attachment);
        list = [...list, attachment];
        draw();
      } catch (error) {
        toast(error.message, 'error');
      }
    }
    if (list.length) onTyping?.();
  }

  // Files on the clipboard (a screenshot, "copy image", files copied in Explorer) are attached; pasted text still goes into the box.
  textarea.addEventListener('paste', event => {
    const files = [...(event.clipboardData?.files || [])];
    if (!files.length) return;
    if (!event.clipboardData.getData('text/plain')) event.preventDefault();
    add(files);
  });
  form.addEventListener('dragover', event => {
    if (![...(event.dataTransfer?.types || [])].includes('Files')) return;
    event.preventDefault();
    form.classList.add('dropping');
  });
  form.addEventListener('dragleave', event => { if (!form.contains(event.relatedTarget)) form.classList.remove('dropping'); });
  form.addEventListener('drop', event => {
    if (!event.dataTransfer?.files.length) return;
    event.preventDefault();
    form.classList.remove('dropping');
    add(event.dataTransfer.files);
  });

  return { get: () => list, set: next => { list = next; draw(); }, add };
}
