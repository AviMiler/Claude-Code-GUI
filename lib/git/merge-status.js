/**
 * Whether a worktree session's branch can be merged into the project's branch (the offline replacement for a PR), and
 * if not, why (in Hebrew). The same answer guards merge.js on the server. Folders come from the session, never a request.
 */
const fs = require('fs');
const { git } = require('./run');
const { commitStatus } = require('./commit-status');

/** @param {string} root @param {string} branch @returns {Promise<number|null>} commits of `branch` the current HEAD lacks, or null when git cannot tell */
async function commitsAhead(root, branch) {
  const counted = await git(root, ['rev-list', '--count', `HEAD..refs/heads/${branch}`]);
  return counted.ok ? Number(counted.stdout.trim()) : null;
}

/**
 * @param {{archived?:boolean, worktree?:{path:string, branch:string, root:string}|null}} session
 * @returns {Promise<{isWorktree:boolean, branch?:string, target?:string|null, project?:string, ahead:number, canMerge:boolean, reason:string, upToDate?:boolean}>}
 * @example await mergeStatus(session) // { isWorktree: true, branch: 'worktree-a', target: 'main', ahead: 2, canMerge: true, reason: '' }
 */
async function mergeStatus(session) {
  const tree = session.worktree;
  if (!tree) return { isWorktree: false, ahead: 0, canMerge: false, reason: 'הסשן אינו רץ ב-worktree, ואין ענף למזג.' };
  const base = { isWorktree: true, branch: tree.branch, project: tree.root, ahead: 0, canMerge: false };
  const refuse = (reason, extra = {}) => ({ ...base, target: null, ...extra, reason });
  if (session.archived) return refuse('הסשן בארכיון. שחזר אותו כדי למזג.');
  if (!fs.existsSync(tree.path)) return refuse(`תיקיית ה-worktree לא קיימת: ${tree.path}`);
  const [work, project] = await Promise.all([commitStatus({ cwd: tree.path }), commitStatus({ cwd: tree.root })]);
  if (!work.isRepo || !project.isRepo) return refuse('אחת התיקיות אינה מאגר git.');
  if (work.inProgress || work.files.length) return refuse('ב-worktree יש שינויים שלא נשמרו ב-commit. שמור אותם קודם בחלונית השינויים (Commit) ואז מזג.');
  if (project.inProgress) return refuse(`בתיקיית הפרויקט מתבצע ${project.inProgress}. סיים או בטל אותו קודם.`);
  if (project.detached) return refuse('בתיקיית הפרויקט HEAD מנותק (אין ענף יעד). עבור לענף בטרמינל.');
  if (project.files.some(file => !file.untracked)) return refuse('בתיקיית הפרויקט יש שינויים שלא נשמרו ב-commit. שמור או הסתר אותם קודם.', { target: project.branch });
  if (project.branch === tree.branch) return refuse('ענף היעד זהה לענף הסשן.', { target: project.branch });
  const ahead = await commitsAhead(tree.root, tree.branch);
  if (ahead === null) return refuse(`הענף ${tree.branch} לא נמצא במאגר.`, { target: project.branch });
  if (!ahead) return { ...base, target: project.branch, upToDate: true, reason: `הענף ${project.branch} כבר מעודכן: אין מה למזג.` };
  return { ...base, target: project.branch, ahead, canMerge: true, reason: '' };
}

module.exports = { mergeStatus };
