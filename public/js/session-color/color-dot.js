/** A session's color as a small dot with a text tooltip (so the color is never the only signal). */
import { h } from '../dom.js';
import { findColor } from './palette.js';

/** @returns {HTMLElement|null} null when the session has no color */
export function colorDot(session) {
  const color = session.color && findColor(session.color);
  return color ? h('span', { class: 'color-dot', style: `background:${color.hex}`, title: `צבע הסשן: ${color.label}`, role: 'img', 'aria-label': `צבע הסשן: ${color.label}` }) : null;
}
