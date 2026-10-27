/** A session's project for the user: the folder they opened, also when the session runs in a worktree of it. */

/** @param {{cwd:string, worktree?:{source:string}}} session @returns {string} grouping, search, the folder line and chip use it */
export const projectFolder = session => session.worktree?.source || session.cwd;
