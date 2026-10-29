/** Which program runs a typed command: the browser sends only a shell name from this table, never a path. */
const SHELLS = process.platform === 'win32' ? ['cmd', 'powershell'] : ['sh'];
const DEFAULT_SHELL = SHELLS[0];

/**
 * @param {string} command the typed command line
 * @param {string} [shell] one of SHELLS (anything else gets the default)
 * @returns {{file:string, args:string[]}} what to spawn (no shell option: the program is the shell)
 */
function shellSpec(command, shell) {
  const name = SHELLS.includes(shell) ? shell : DEFAULT_SHELL;
  if (name === 'powershell') {
    // UTF-8 output; -EncodedCommand (UTF-16LE base64) avoids every quoting rule of cmd.exe
    const script = `[Console]::OutputEncoding=[Text.Encoding]::UTF8; ${command}`;
    return { file: 'powershell.exe', args: ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')] };
  }
  if (name === 'cmd') return { file: process.env.ComSpec || 'cmd.exe', args: ['/d', '/s', '/c', `chcp 65001>nul & ${command}`] };
  return { file: '/bin/sh', args: ['-c', command] };
}

module.exports = { SHELLS, DEFAULT_SHELL, shellSpec };
