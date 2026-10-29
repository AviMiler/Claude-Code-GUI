/**
 * Cards above the composer for requests that wait on the user: tool permissions, AskUserQuestion, plan approval and
 * MCP elicitations. Each answer goes back to the CLI as the reply to its control request.
 */
import { h } from './dom.js';
import { icon } from './icons.js';
import { renderMarkdown } from './markdown.js';
import { diffLines, renderDiff } from './render-tools.js';
import { elicitationCard } from './elicitation/elicitation-card.js';

function describeRule(suggestions) {
  const rules = suggestions.flatMap(suggestion => suggestion.rules || [])
    .map(rule => (rule.ruleContent ? `${rule.toolName}(${rule.ruleContent})` : rule.toolName));
  const dirs = suggestions.flatMap(suggestion => suggestion.directories || []);
  return [...rules, ...dirs].join(', ');
}

function preview(prompt) {
  const input = prompt.input || {};
  if (input.command) return h('pre', { class: 'tool-pre terminal' }, h('span', { class: 'prompt' }, '$ '), input.command);
  if (input.old_string !== undefined) return h('div', null, h('p', null, input.file_path), renderDiff(diffLines(input.old_string, input.new_string)));
  if (input.content !== undefined && input.file_path) {
    return h('div', null, h('p', { dir: 'ltr' }, input.file_path), renderDiff(String(input.content).split('\n').slice(0, 60).map(text => ({ type: 'add', text }))));
  }
  return h('pre', { class: 'tool-pre' }, JSON.stringify(input, null, 2));
}

function permissionCard(prompt, answer) {
  const feedback = h('input', { placeholder: 'או אמור ל-Claude מה לעשות אחרת…', dir: 'auto' });
  const rule = describeRule(prompt.suggestions);
  return h('div', { class: 'prompt-card attention' },
    h('h3', null, icon('shield'), prompt.title || `Claude מבקש להשתמש ב-${prompt.displayName}`),
    prompt.description || prompt.reason ? h('p', { dir: 'auto' }, prompt.description || prompt.reason) : null,
    preview(prompt),
    h('div', { class: 'card-actions' },
      h('button', { type: 'button', class: 'btn primary', onClick: () => answer({ behavior: 'allow' }) }, icon('check'), 'אפשר'),
      rule ? h('button', { type: 'button', class: 'btn', title: rule, onClick: () => answer({ behavior: 'allow', alwaysAllow: true }) },
        `אפשר תמיד: ${rule.length > 48 ? `${rule.slice(0, 48)}…` : rule}`) : null,
      feedback,
      h('button', { type: 'button', class: 'btn danger', onClick: () => answer({ behavior: 'deny', message: feedback.value.trim() || undefined }) }, 'דחה')));
}

function questionCard(prompt, answer) {
  const questions = prompt.input?.questions || [];
  const chosen = questions.map(() => new Set());
  const others = questions.map(() => h('input', { placeholder: 'תשובה אחרת…', dir: 'auto' }));
  const blocks = questions.map((question, index) => h('div', { class: 'question' },
    h('div', { class: 'q-head', dir: 'auto' }, question.header ? h('span', { class: 'tag' }, question.header) : null, question.question),
    h('div', { class: 'options' }, (question.options || []).map(option => {
      const button = h('button', { type: 'button', class: 'option', dir: 'auto' }, h('b', null, option.label), option.description ? h('span', null, option.description) : null);
      button.addEventListener('click', () => {
        if (!question.multiSelect) { chosen[index].clear(); button.parentElement.querySelectorAll('.option').forEach(node => node.classList.remove('on')); }
        if (chosen[index].has(option.label)) chosen[index].delete(option.label); else chosen[index].add(option.label);
        button.classList.toggle('on', chosen[index].has(option.label));
      });
      return button;
    }), others[index])));
  const submit = () => {
    const answers = Object.fromEntries(questions.map((question, index) => [question.question,
      [...chosen[index], others[index].value.trim()].filter(Boolean).join(', ')]));
    answer({ behavior: 'allow', updatedInput: { ...prompt.input, answers } });
  };
  return h('div', { class: 'prompt-card attention' }, h('h3', null, icon('help'), 'Claude שואל'), blocks,
    h('div', { class: 'card-actions' },
      h('button', { type: 'button', class: 'btn primary', onClick: submit }, icon('check'), 'שליחת תשובה'),
      h('button', { type: 'button', class: 'btn ghost', onClick: () => answer({ behavior: 'deny', message: 'The user skipped the question.' }) }, 'דלג')));
}

function planCard(prompt, answer) {
  const feedback = h('input', { placeholder: 'מה לשנות בתוכנית?', dir: 'auto' });
  return h('div', { class: 'prompt-card attention' }, h('h3', null, icon('map'), 'Claude מציע תוכנית'),
    h('div', { class: 'plan markdown', html: renderMarkdown(prompt.input?.plan || '') }),
    h('div', { class: 'card-actions' },
      h('button', { type: 'button', class: 'btn primary', onClick: () => answer({ behavior: 'allow', setMode: 'acceptEdits' }) }, icon('check'), 'אשר ובצע (עריכות אוטומטיות)'),
      h('button', { type: 'button', class: 'btn', onClick: () => answer({ behavior: 'allow', setMode: 'default' }) }, 'אשר, ושאל לפני כל עריכה'),
      feedback,
      h('button', { type: 'button', class: 'btn ghost', onClick: () => answer({ behavior: 'deny', message: feedback.value.trim() || 'Keep planning. The user did not approve this plan yet.' }) }, 'המשך לתכנן')));
}

/**
 * Re-renders the cards for the active session.
 * @param {HTMLElement} container
 * @param {object[]} prompts session.pendingPermissions
 * @param {(prompt:object, answer:object)=>void} onAnswer
 */
export function renderPromptCards(container, prompts, onAnswer) {
  const existing = new Set([...container.children].map(child => child.dataset.requestId));
  const wanted = new Set(prompts.map(prompt => prompt.requestId));
  [...container.children].forEach(child => { if (!wanted.has(child.dataset.requestId)) child.remove(); });
  for (const prompt of prompts) {
    if (existing.has(prompt.requestId)) continue; // keep typed feedback and selections
    const answer = response => onAnswer(prompt, response);
    const card = prompt.kind === 'elicitation' ? elicitationCard(prompt, answer) : prompt.toolName === 'AskUserQuestion' ? questionCard(prompt, answer)
      : prompt.toolName === 'ExitPlanMode' ? planCard(prompt, answer) : permissionCard(prompt, answer);
    card.dataset.requestId = prompt.requestId;
    container.append(card);
  }
}
