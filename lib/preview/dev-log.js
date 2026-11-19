/** The last lines of a dev server's output (both streams), redacted line by line (dev-env.js). */
const { redactLine } = require('./dev-env');

const MAX_LINES = 200;
const MAX_LINE_CHARS = 1000;
const PORT_IN_USE = /EADDRINUSE|address already in use|port \d+ is (already )?in use/i;

/**
 * @param {string[]} secrets values to blank @param {()=>void} onPortInUse called once when the output says the port is taken
 * @returns {{push:(stream:'stdout'|'stderr', chunk:string)=>void, flush:()=>void, note:(text:string)=>void, lines:()=>{stream:string, text:string}[]}}
 */
function createDevLog(secrets, onPortInUse) {
  const lines = [];
  const partial = { stdout: '', stderr: '' };
  let warned = false;
  const add = (stream, raw) => {
    const text = redactLine(raw.replace(/\r$/, ''), secrets).slice(0, MAX_LINE_CHARS);
    if (!warned && PORT_IN_USE.test(text)) { warned = true; onPortInUse(); }
    lines.push({ stream, text });
    if (lines.length > MAX_LINES) lines.splice(0, lines.length - MAX_LINES);
  };
  return {
    push(stream, chunk) {
      const parts = (partial[stream] + chunk).split('\n');
      partial[stream] = parts.pop();
      if (partial[stream].length > MAX_LINE_CHARS * 4) { add(stream, partial[stream]); partial[stream] = ''; } // a very long line without \n
      parts.forEach(part => add(stream, part));
    },
    flush() { for (const stream of ['stdout', 'stderr']) if (partial[stream]) { add(stream, partial[stream]); partial[stream] = ''; } },
    note(text) { add('gui', text); },
    lines: () => lines.slice(),
  };
}

module.exports = { createDevLog, MAX_LINES };
