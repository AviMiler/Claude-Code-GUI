/** The wired sidebar pieces: the group store on the GUI's data directory, and the checks for a session's sidebar fields. */
const path = require('path');
const store = require('../session-store');
const { createGroupStore } = require('./group-store');
const { sidebarChanges: check, completionReset } = require('./session-flags');

const groups = createGroupStore({ file: path.join(store.DATA_DIR, 'sidebar-groups.json') });
const nextPinOrder = () => Math.max(0, ...store.list().map(session => (typeof session.pinOrder === 'number' ? session.pinOrder : 0))) + 1;

/** @param {object} patch a PATCH body @param {object} current the session @returns {object} the sidebar fields to store */
const sidebarChanges = (patch, current) => check(patch, current, { hasGroup: groups.has, nextPinOrder });

module.exports = { groups, sidebarChanges, completionReset };
