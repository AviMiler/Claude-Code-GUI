/**
 * Client of the preview pane's dev servers (lib/preview/dev-server-routes.js), mounted as `api.devServers`.
 * A start sends only the configuration's name and the hash of what the confirmation showed, never a command.
 * @param {(method:string, url:string, body?:object)=>Promise<any>} request api.js's request
 */
export const devServerApi = request => ({
  /** { file, exists, error, configurations: [{ name, executable, args, cwd, port, url, envKeys, hash }], servers: [{ name, status, ready, url, error, log }] } */
  list: sessionId => request('GET', `/api/sessions/${sessionId}/dev-servers`),
  /** @returns {Promise<{server:object}>} 409 when the file changed since it was shown, it already runs or its port is taken */
  start: (sessionId, name, hash) => request('POST', `/api/sessions/${sessionId}/dev-servers/start`, { name, hash }),
  stop: (sessionId, name) => request('POST', `/api/sessions/${sessionId}/dev-servers/stop`, { name }),
});
