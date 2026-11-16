/** Digits 1-9 pick the Nth choice of an open menu or popover, when no text field is focused. */

const TEXT_FIELD = 'input, textarea, select, [contenteditable="true"]';

/** @returns {boolean} true when the key was a digit that picked an item (the caller stops handling it) */
export function pickByDigit(event) {
  if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || event.repeat) return false;
  const digit = /^(?:Digit|Numpad)([1-9])$/.exec(event.code)?.[1]; // the physical key: the same on a Hebrew layout
  if (!digit || document.activeElement?.matches(TEXT_FIELD)) return false;
  const popover = [...document.querySelectorAll('.popover')].pop();
  const item = popover?.querySelectorAll('.menu-item:not([disabled])')[Number(digit) - 1];
  if (!item) return false;
  event.preventDefault();
  item.click();
  return true;
}
