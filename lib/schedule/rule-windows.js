/**
 * Hours of the day a `rule` schedule may (mode 'only') or may not (mode 'except') run in. Ranges are half-open
 * [from, to) in local wall time and may cross midnight (22:00–06:00). Whether a minute is allowed changes only at a
 * range edge, so the next allowed minute is always one of the edges: no minute-by-minute search.
 */
const toMinute = text => { const [h, m] = text.split(':').map(Number); return h * 60 + m; };

const inRange = (minute, range) => (range.from < range.to
  ? minute >= range.from && minute < range.to
  : minute >= range.from || minute < range.to);

/**
 * @param {{mode:'only'|'except', ranges:{from:string, to:string}[], onExcluded:'skip'|'delay'}|undefined} windows
 * @returns {{allowed:(minute:number)=>boolean, nextAllowed:(minute:number)=>({dayOffset:number, minute:number}|null),
 *   delay:boolean}|null} null when the schedule has no windows
 * @example compileWindows({ mode: 'except', ranges: [{ from: '22:00', to: '06:00' }] }).allowed(23 * 60) // false
 */
function compileWindows(windows) {
  if (!windows?.ranges?.length) return null;
  const ranges = windows.ranges.map(range => ({ from: toMinute(range.from), to: toMinute(range.to) }));
  const only = windows.mode === 'only';
  const allowed = minute => ranges.some(range => inRange(minute, range)) === only;
  const edges = [...new Set(ranges.flatMap(range => [range.from, range.to]))].sort((a, b) => a - b);

  /** The first allowed minute strictly after `minute` (today or on a later day). */
  function nextAllowed(minute) {
    for (let dayOffset = 0; dayOffset <= 2; dayOffset++) {
      const edge = edges.find(value => (dayOffset > 0 || value > minute) && allowed(value));
      if (edge !== undefined) return { dayOffset, minute: edge };
    }
    return null;
  }
  return { allowed, nextAllowed, delay: windows.onExcluded === 'delay' };
}

module.exports = { compileWindows, toMinute };
