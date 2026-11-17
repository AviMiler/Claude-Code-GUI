/**
 * How the server learns where a shell ended up. After the typed command the shell prints a line made of a random
 * marker (new for every command, so output cannot spoof it), the command's exit code and the working directory.
 * The filter holds that line back from the live output and hands it over at the end.
 */
const crypto = require('crypto');

/** @returns {string} a fresh marker for one command */
const makeMarker = () => `@@gui-${crypto.randomBytes(12).toString('hex')}@@`;

/**
 * The text appended after the user's command; a failing command still reaches it (cmd `&`, PowerShell and sh: a new line).
 * In cmd the folder is printed through a `for` variable (not through a second parse of the line), so a folder named `a&b` is
 * only text; a command that exits the shell never prints the line.
 * @param {string} command @param {'cmd'|'powershell'|'sh'} shell @param {string} marker
 * @returns {string} the whole command line to run
 */
function withSentinel(command, shell, marker) {
  if (shell === 'cmd') return `${command} & call echo ${marker}%^errorlevel% & for %I in (.) do @echo ${marker}%~fI${marker}`;
  if (shell === 'powershell') {
    const code = '$__ok=$?; $__x=if($__ok){0}elseif($LASTEXITCODE){$LASTEXITCODE}else{1}';
    return `${command}\n${code}; [Console]::Out.Write("${marker}$($__x)${marker}$((Get-Location).ProviderPath)${marker}")`;
  }
  return `${command}\n__x=$?; printf '%s%s%s%s%s' '${marker}' "$__x" '${marker}' "$PWD" '${marker}'`;
}

/** Parses what followed the first marker; null when the line is not complete. @returns {{exitCode:number, cwd:string}|null} */
function parseSentinel(tail, marker) {
  const parts = tail.split(marker); // '', code, cwd, what follows the last marker
  if (parts.length < 4) return null;
  const code = parts[1].trim() === '' ? NaN : Number(parts[1]);
  const cwd = parts[2].trim().replace(/^"(.*)"$/, '$1');
  return Number.isInteger(code) && cwd ? { exitCode: code, cwd } : null;
}

/**
 * Splits a stdout stream into the text to show and the sentinel. A piece that could be the start of the marker is held
 * until the next chunk shows what it is.
 * @param {string} marker
 * @returns {{push:(chunk:string)=>string, finish:()=>{rest:string, sentinel:{exitCode:number,cwd:string}|null}}}
 */
function createFilter(marker) {
  let held = '';
  let tail = null; // set from the first marker on: everything after it belongs to the sentinel
  return {
    push(chunk) {
      if (tail !== null) { if (tail.length < 8192) tail += chunk; return ''; }
      held += chunk;
      const at = held.indexOf(marker);
      if (at >= 0) { const shown = held.slice(0, at); tail = held.slice(at); held = ''; return shown; }
      let keep = 0; // the longest end of `held` that starts the marker
      for (let n = Math.min(marker.length - 1, held.length); n > 0 && !keep; n--) if (marker.startsWith(held.slice(-n))) keep = n;
      const shown = held.slice(0, held.length - keep);
      held = held.slice(held.length - keep);
      return shown;
    },
    finish() {
      const rest = tail === null ? held : '';
      held = '';
      return { rest, sentinel: tail === null ? null : parseSentinel(tail, marker) };
    },
  };
}

module.exports = { makeMarker, withSentinel, parseSentinel, createFilter };
