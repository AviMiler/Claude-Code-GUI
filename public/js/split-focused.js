/** The focused pane's composer, actions, session and container: what the page-wide keyboard shortcuts act on (the main pane when there is no split). */

/**
 * @param {{focus:{where:()=>'main'|'split'}, split:{sessionId:()=>string|null, composer:object, actions:object, area:HTMLElement, session:()=>object|null, messages:HTMLElement},
 *   main:{composer:object, actions:object, area:HTMLElement, session:()=>object|null, messages:HTMLElement}}} panes split-focus.js, split-view.js and the main pane's parts
 * @returns {{composer:()=>object, actions:()=>object, area:()=>HTMLElement, session:()=>object|null, where:()=>'main'|'split',
 *   of:(where:'main'|'split')=>{messages:HTMLElement, composer:object, session:()=>object|null}}} where: the focused pane;
 *   of: one pane's transcript, composer and session (the split's session is null while the split is closed)
 */
export function createFocusedPane({ focus, split, main }) {
  const pick = () => (focus.where() === 'split' && split.sessionId() ? split : main);
  const splitPart = { messages: split.messages, composer: split.composer, session: () => (split.sessionId() ? split.session() : null) };
  return { composer: () => pick().composer, actions: () => pick().actions, area: () => pick().area, session: () => pick().session(),
    where: () => (pick() === split ? 'split' : 'main'), of: where => (where === 'split' ? splitPart : main) };
}
