/** Is something listening on a local port? Used before a dev server starts (port taken) and while it starts (ready). */
const net = require('net');

const PROBE_MS = 400;

/** @param {number} port @param {string} host @returns {Promise<boolean>} a TCP connection was accepted */
function answers(port, host) {
  return new Promise(resolve => {
    const socket = net.connect({ port, host });
    const done = result => { socket.destroy(); resolve(result); };
    socket.setTimeout(PROBE_MS, () => done(false));
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });
}

/**
 * Localhost only: IPv4 first, then IPv6 (some dev servers bind "localhost" as ::1 only).
 * @param {number} port @returns {Promise<boolean>}
 */
async function portAnswers(port) {
  return (await answers(port, '127.0.0.1')) || answers(port, '::1');
}

module.exports = { portAnswers };
