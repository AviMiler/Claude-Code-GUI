/** What can be done to a background task: read its output tail, stop it. Both are control requests of the session's CLI. */
import { isUnsupported } from '../panels/kit.js';
import { outputText } from './task-format.js';

/** @typedef {(subtype:string, payload:object)=>Promise<any>} Control the session's control request */

/** @returns {Promise<string>} the output tail, or the reason it is not available (never rejects) */
export async function readTaskOutput(control, task) {
  try {
    return outputText(await control('get_task_output', { task_id: task.id })) || '(אין פלט)';
  } catch (error) {
    return isUnsupported(error) || /refused|not a shell|unknown task/i.test(error.message)
      ? 'הפלט זמין רק לפקודות ול-Monitor, ורק בגרסאות Claude Code שתומכות בכך.' : error.message;
  }
}

/** @param {(message:string, type?:string)=>void} toast */
export async function stopTask(control, task, toast) {
  try {
    await control('stop_task', { task_id: task.id });
    toast('נשלחה בקשת עצירה');
  } catch (error) {
    toast(isUnsupported(error) ? 'עצירת משימה לא זמינה בגרסת Claude Code המותקנת.' : error.message, 'error');
  }
}
