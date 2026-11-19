/** A "chat without a project": a normal session that runs in a folder the server owns, so it has no project of its own. */

/** The name of a chat wherever a project folder would be shown (chip, sidebar line, details). */
export const CHAT_LABEL = 'צ\'אט';
/** The sidebar group that holds every chat in the "by project" view. */
export const CHAT_GROUP_TITLE = 'שיחות כלליות';

/** @param {{chat?:boolean}|null|undefined} session @returns {boolean} the session is a chat without a project */
export const isChat = session => Boolean(session?.chat);
