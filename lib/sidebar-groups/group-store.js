/**
 * The sidebar's custom groups: a small list kept in its own file in the GUI's data directory (written through
 * lib/safe-file.js). Names are trimmed and capped, ids are made here. Which session is in which group is a field of the
 * session (`groupId`, lib/sidebar-groups/session-flags.js), so deleting a group never touches a conversation.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { writeFileSafe, readFileSafe } = require('../safe-file');
const { httpError } = require('../http-utils');

const MAX_NAME = 60;
const MAX_GROUPS = 50;

/**
 * @param {{file:string}} options the JSON file of the list
 * @returns {{list:()=>{id:string,name:string}[], has:(id:unknown)=>boolean, create:(name:unknown)=>object,
 *   rename:(id:string, name:unknown)=>object, remove:(id:string)=>boolean, reorder:(ids:unknown)=>object[]}}
 * @example const groups = createGroupStore({ file: path.join(dataDir, 'sidebar-groups.json') }); groups.create(' Work ')
 */
function createGroupStore({ file }) {
  const loaded = readFileSafe(file, text => {
    const value = JSON.parse(text);
    if (!Array.isArray(value)) throw new Error('not a list');
    return value;
  }).value || [];
  let groups = loaded.filter(group => group && typeof group.id === 'string' && typeof group.name === 'string')
    .map(({ id, name }) => ({ id, name: name.slice(0, MAX_NAME) }));

  function save() {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    writeFileSafe(file, JSON.stringify(groups), { backup: 'sibling' });
  }

  function cleanName(name, exceptId) {
    const text = typeof name === 'string' ? name.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME) : '';
    if (!text) throw httpError(400, 'שם הקבוצה ריק');
    if (groups.some(group => group.id !== exceptId && group.name.toLowerCase() === text.toLowerCase())) throw httpError(409, 'כבר יש קבוצה בשם הזה');
    return text;
  }

  function find(id) {
    const group = groups.find(item => item.id === id);
    if (!group) throw httpError(404, 'הקבוצה לא נמצאה');
    return group;
  }

  const api = {
    list: () => groups.map(group => ({ ...group })),
    has: id => typeof id === 'string' && groups.some(group => group.id === id),
    create(name) {
      if (groups.length >= MAX_GROUPS) throw httpError(409, `אפשר עד ${MAX_GROUPS} קבוצות`);
      const group = { id: `g_${crypto.randomBytes(6).toString('hex')}`, name: cleanName(name) };
      groups = [...groups, group];
      save();
      return { ...group };
    },
    rename(id, name) {
      const group = find(id);
      group.name = cleanName(name, id);
      save();
      return { ...group };
    },
    remove(id) {
      find(id);
      groups = groups.filter(group => group.id !== id);
      save();
      return true;
    },
    /** @param {unknown} ids the new order; unknown ids are ignored, groups it leaves out keep their relative order at the end */
    reorder(ids) {
      if (!Array.isArray(ids)) throw httpError(400, 'סדר הקבוצות לא תקין');
      const wanted = [...new Set(ids)].map(id => groups.find(group => group.id === id)).filter(Boolean);
      groups = [...wanted, ...groups.filter(group => !wanted.includes(group))];
      save();
      return api.list();
    },
  };
  return api;
}

module.exports = { createGroupStore, MAX_NAME, MAX_GROUPS };
