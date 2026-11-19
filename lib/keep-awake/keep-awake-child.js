/**
 * The process that keeps Windows awake: ONE hidden PowerShell that P/Invokes kernel32 SetThreadExecutionState with
 * ES_CONTINUOUS | ES_SYSTEM_REQUIRED (the display may still turn off) and then sleeps in a loop. The state lives as long
 * as that thread, so killing the process releases it. The loop polls the server's pid and ends when the server is gone,
 * so a crashed server never leaves the machine awake. -EncodedCommand (UTF-16LE base64) as in terminal/shell-spec.js.
 */
// 0x80000001 as a decimal: a PowerShell hex literal is a signed Int32 and does not convert to UInt32.
const ES_CONTINUOUS_SYSTEM_REQUIRED = '2147483649';

/**
 * @param {number} parentPid the server's pid, which the script polls every few seconds
 * @returns {string} the PowerShell script text
 */
function keepAwakeScript(parentPid) {
  const pid = Number(parentPid);
  if (!Number.isInteger(pid) || pid <= 0) throw new Error('bad pid');
  return [
    "$ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue'",
    "Add-Type -Namespace ClaudeGui -Name Power -MemberDefinition '[DllImport(\"kernel32.dll\")] public static extern uint SetThreadExecutionState(uint flags);'",
    `if ([ClaudeGui.Power]::SetThreadExecutionState([uint32]${ES_CONTINUOUS_SYSTEM_REQUIRED}) -eq 0) { throw 'SetThreadExecutionState failed' }`,
    `while ($true) { if (-not (Get-Process -Id ${pid} -ErrorAction SilentlyContinue)) { break }; Start-Sleep -Seconds 5 }`,
  ].join('; ');
}

/** @returns {{file:string, args:string[]}} what to spawn (windowsHide is a spawn option, see index.js) */
function keepAwakeCommand(parentPid) {
  const script = keepAwakeScript(parentPid);
  return { file: 'powershell.exe', args: ['-NoProfile', '-NonInteractive', '-OutputFormat', 'Text', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')] };
}

module.exports = { keepAwakeScript, keepAwakeCommand };
