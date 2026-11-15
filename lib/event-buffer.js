/**
 * Ring buffer of the last events with ids `<epoch>-<n>`, so a browser that reconnects with `Last-Event-ID` can be
 * sent what it missed. The epoch changes with every server start, so ids from an older process never match.
 */

/**
 * @param {{size?:number, epoch?:string}} [options]
 * @returns {{push:(event:object)=>{id:string, event:object}, since:(lastId:string|undefined)=>{gap:boolean, entries:Array<{id:string, event:object}>}, latestId:()=>string}}
 * @example const buffer = createEventBuffer({ size: 3 }); const { id } = buffer.push({ type: 'x' }); buffer.since(id) // { gap: false, entries: [] }
 */
function createEventBuffer({ size = 300, epoch = Date.now().toString(36) } = {}) {
  const entries = []; // oldest first
  let counter = 0;
  const idOf = n => `${epoch}-${n}`;

  return {
    push(event) {
      const entry = { id: idOf(++counter), event, n: counter };
      entries.push(entry);
      if (entries.length > size) entries.shift();
      return entry;
    },
    /** gap: the events after `lastId` are not all in the buffer (too old, unknown, or from another server run). */
    since(lastId) {
      const match = /^(.+)-(\d+)$/.exec(lastId || '');
      if (!match || match[1] !== epoch) return { gap: true, entries: [] };
      const n = Number(match[2]);
      if (n > counter) return { gap: true, entries: [] };
      if (n === counter) return { gap: false, entries: [] };
      if (!entries.length || entries[0].n > n + 1) return { gap: true, entries: [] };
      return { gap: false, entries: entries.filter(entry => entry.n > n) };
    },
    latestId: () => idOf(counter),
  };
}

module.exports = { createEventBuffer };
