/** The focused pane's composer, actions, session and container: what the page-wide keyboard shortcuts act on (the main pane when there is no split). */

/**
 * @param {{focus:{where:()=>'main'|'split'}, split:{sessionId:()=>string|null, composer:object, actions:object, area:HTMLElement, session:()=>object|null},
 *   main:{composer:object, actions:object, area:HTMLElement, session:()=>object|null}}} panes split-focus.js, split-view.js and the main pane's parts
 * @returns {{composer:()=>object, actions:()=>object, area:()=>HTMLElement, session:()=>object|null}}
 */
export function createFocusedPane({ focus, split, main }) {
  const pick = () => (focus.where() === 'split' && split.sessionId() ? split : main);
  return { composer: () => pick().composer, actions: () => pick().actions, area: () => pick().area, session: () => pick().session() };
}
