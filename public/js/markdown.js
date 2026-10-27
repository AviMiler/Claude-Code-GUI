/**
 * Small, dependency-free Markdown renderer: fenced code (with copy), headings, lists, quotes, tables, rules,
 * **bold**, *italic*, `code`, [links](https://...). Input is always escaped first, so the output is safe HTML.
 */
const escapeHtml = text => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function renderInline(text) {
  const codeSpans = [];
  const withoutCode = escapeHtml(text).replace(/`([^`]+)`/g, (_, code) => `\u0000${codeSpans.push(code) - 1}\u0000`);
  return withoutCode
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\w)/g, '$1<em>$2</em>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>')
    .replace(/\u0000(\d+)\u0000/g, (_, index) => `<code>${codeSpans[index]}</code>`);
}

const LIST_ITEM = /^\s*([-*+]|\d+[.)])\s+/;

function renderList(lines) {
  const ordered = /^\s*\d/.test(lines[0]);
  const items = [];
  for (const line of lines) {
    if (LIST_ITEM.test(line)) items.push(line.replace(LIST_ITEM, ''));
    else if (items.length) items[items.length - 1] += ` ${line.trim()}`; // wrapped continuation line
  }
  const body = items.map(item => {
    const task = item.match(/^\[( |x|X)\]\s+(.*)$/);
    return task ? `<li dir="auto">${task[1] === ' ' ? '☐' : '☑'} ${renderInline(task[2])}</li>` : `<li dir="auto">${renderInline(item)}</li>`;
  });
  return ordered ? `<ol>${body.join('')}</ol>` : `<ul>${body.join('')}</ul>`;
}

function renderTable(lines) {
  const cells = line => line.trim().replace(/^\||\|$/g, '').split('|').map(cell => renderInline(cell.trim()));
  const [head, , ...rows] = lines;
  const headHtml = cells(head).map(cell => `<th dir="auto">${cell}</th>`).join('');
  const rowsHtml = rows.map(row => `<tr>${cells(row).map(cell => `<td dir="auto">${cell}</td>`).join('')}</tr>`).join('');
  return `<table><thead><tr>${headHtml}</tr></thead><tbody>${rowsHtml}</tbody></table>`;
}

function renderBlock(block) {
  const lines = block.split('\n');
  if (/^(-{3,}|\*{3,}|_{3,})$/.test(block.trim())) return '<hr>';
  if (lines.length >= 2 && /^\s*\|.*\|\s*$/.test(lines[0]) && /^\s*\|?\s*:?-{2,}/.test(lines[1])) return renderTable(lines);
  if (LIST_ITEM.test(lines[0])) return renderList(lines);
  if (lines.every(line => /^>\s?/.test(line))) {
    return `<blockquote dir="auto">${lines.map(line => renderInline(line.replace(/^>\s?/, ''))).join('<br>')}</blockquote>`;
  }
  const heading = lines[0].match(/^(#{1,6})\s+(.*)$/);
  if (heading) {
    const level = Math.min(heading[1].length + 1, 5);
    const rest = lines.slice(1).join('\n');
    return `<h${level} dir="auto">${renderInline(heading[2])}</h${level}>${rest.trim() ? renderBlock(rest) : ''}`;
  }
  return `<p dir="auto">${lines.map(renderInline).join('<br>')}</p>`;
}

function renderCode(part) {
  const language = (part.match(/^([^\n]*)\n/) || [, ''])[1].trim();
  const code = part.replace(/^[^\n]*\n/, '').replace(/\n$/, '');
  return `<div class="code-block"><div class="code-head"><span>${escapeHtml(language || 'code')}</span>`
    + '<button class="btn ghost small" type="button" data-copy-code>העתקה</button></div>'
    + `<pre dir="ltr"><code>${escapeHtml(code)}</code></pre></div>`;
}

/**
 * @param {string} source Markdown text from the model.
 * @returns {string} Safe HTML.
 * @example renderMarkdown('**שלום** `x`') // '<p dir="auto"><strong>שלום</strong> <code>x</code></p>'
 */
export function renderMarkdown(source) {
  // Odd parts are code; an unterminated fence (while streaming) still renders as code.
  return String(source).split('```').map((part, index) => {
    if (index % 2 === 1) return renderCode(part);
    return part.split(/\n{2,}/).filter(block => block.trim()).map(renderBlock).join('');
  }).join('');
}

/** One delegated listener for every "copy" button inside rendered Markdown. */
export function enableCodeCopy(root, copy) {
  root.addEventListener('click', event => {
    const button = event.target.closest('[data-copy-code]');
    if (!button) return;
    copy(button.closest('.code-block').querySelector('code').textContent);
    button.textContent = 'הועתק ✓';
    setTimeout(() => { button.textContent = 'העתקה'; }, 1400);
  });
}
