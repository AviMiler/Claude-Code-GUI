/** How a background task is named and measured, shared by the /tasks panel and the Background tasks pane. */

/** status -> [Hebrew label, badge tone] */
export const STATUS = {
  running: ['רץ', 'info'], completed: ['הסתיים', 'success'], failed: ['נכשל', 'danger'], stopped: ['נעצר', 'warning'], killed: ['נעצר', 'warning'],
};
export const TYPE_LABELS = { local_bash: 'פקודה', local_agent: 'סוכן משנה', remote_agent: 'סוכן מרוחק', monitor: 'Monitor', local_workflow: 'תהליך' };

export function duration(task) {
  const ms = task.usage?.durationMs ?? ((task.endedAt || Date.now()) - task.startedAt);
  const seconds = Math.round(ms / 1000);
  return seconds < 60 ? `${seconds} שנ׳` : `${Math.floor(seconds / 60)} דק׳ ${seconds % 60} שנ׳`;
}

/** The CLI returns the output tail; its exact field name is not documented, so read the likely ones. */
export function outputText(response) {
  if (typeof response === 'string') return response;
  const text = response?.output ?? response?.content ?? response?.text ?? response?.tail;
  return typeof text === 'string' ? text : JSON.stringify(response, null, 2);
}
