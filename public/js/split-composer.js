/** The split pane's composer: the same box as the main one (createComposer), acting only on the pane's session. */
import { createComposer } from './composer.js';
import { createChipMenus } from './chip-menus.js';
import { createSplitActions } from './split-actions.js';
import { routeCommand, routeSplitInput } from './split-route.js';
import { getCommands, modelLabel, peekModels } from './state.js';
import { contextInfo } from './context/context-info.js';
import { toast } from './ui.js';

const blocked = name => toast(`/${name} פועלת בחלון הראשי`);

/**
 * @param {HTMLElement} area the pane's composer container
 * @param {Parameters<typeof createSplitActions>[0]} deps see split-actions.js (restore is filled in here)
 * @returns {{composer:object, actions:object, update:(session:object|null)=>void}} update: redraws the box for the pane's session
 */
export function createSplitComposer(area, deps) {
  const scope = () => ({ sessionId: deps.session()?.id });
  const actions = createSplitActions({ ...deps, restore: entries => composer.restore(entries) });
  const composer = createComposer(area, {
    label: 'הודעה לסשן בחלון המפוצל', getScope: scope,
    async onSubmit(text, attachments = [], { delivery } = {}) {
      const route = attachments.length ? { kind: 'send' } : routeSplitInput(text, await getCommands(scope()));
      if (route.kind === 'side') { actions.sideQuestion(route.question); return true; }
      if (route.kind === 'blocked') { blocked(route.name); return false; }
      return actions.send(text, attachments, delivery);
    },
    onCommand(command) { // picked from the "/" menu
      const route = routeCommand(command);
      if (route.kind === 'side') actions.sideQuestion('');
      else if (route.kind === 'blocked') blocked(route.name);
      else if (/^</.test(command.argHint)) composer.insert(`/${command.name} `, { replace: true });
      else actions.send(`/${command.name}`);
    },
    onStop: () => actions.stop(), onQueueRemove: actions.removeQueued, onQueueEdit: actions.editQueued, onQueueResume: actions.resumeQueue,
    onCycleMode: actions.cycleMode, onContext: () => actions.openPanel('usage'),
    getHistory: () => (deps.session()?.items || []).filter(item => item.kind === 'user').map(item => item.text),
    ...createChipMenus({ actions, getComposer: () => composer, getSession: deps.session, getScope: scope }),
  });
  return {
    composer, actions,
    update(session) {
      area.hidden = !session;
      if (!session) { composer.update({ mode: 'default', modelLabel: '', isRunning: false, hasSession: false, draftKey: null }); return; }
      composer.update({ mode: session.mode, modelLabel: modelLabel(session), fallbackModel: session.fallbackModel, modelSwitchable: peekModels()?.switchable ?? true,
        isRunning: session.status === 'running', contextPercent: contextInfo(session, deps.refresh), hasSession: true, queue: session.queue || [], draftKey: session.id });
    },
  };
}
