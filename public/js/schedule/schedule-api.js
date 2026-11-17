/**
 * Client of the local scheduled tasks (lib/schedule/schedule-routes.js), mounted as `api.schedule`.
 * @param {(method:string, url:string, body?:object)=>Promise<any>} request api.js's request
 */
export const scheduleApi = request => ({
  /** { tasks: [{ id, name, prompt, folder, mode, model, effort, active, schedule, scheduleText, nextRunAt, lastRun, running }], approvalMinutes } */
  list: () => request('GET', '/api/schedules'),
  create: task => request('POST', '/api/schedules', task),
  update: (id, task) => request('PUT', `/api/schedules/${id}`, task),
  remove: id => request('DELETE', `/api/schedules/${id}`),
  runNow: id => request('POST', `/api/schedules/${id}/run`),
  setActive: (id, active) => request('POST', `/api/schedules/${id}/active`, { active }),
  /** { runs: [{ id, startedAt, endedAt, durationMs, outcome, reason, sessionId, catchUp, manual, stalled }] } newest first */
  runs: id => request('GET', `/api/schedules/${id}/runs`),
  /** { text, next: [ms, ms, ms] }, or an error with what is wrong in the schedule */
  preview: schedule => request('POST', '/api/schedules/preview', { schedule }),
});
