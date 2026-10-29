/** Every panel of the settings modal, in navigation order. Slash commands refer to these ids (commands-data.js). */
import { renderModelPanel } from './panel-model.js';
import { renderPermissionsPanel } from './panel-permissions.js';
import { renderUsagePanel } from './panel-usage.js';
import { renderDiffPanel, renderResumePanel } from './panel-workspace.js';
import { renderSkillsPanel } from './panel-skills.js';
import { renderAgentsPanel } from './panel-agents.js';
import { renderMcpPanel } from './panel-mcp.js';
import { renderPluginsPanel } from './panel-plugins.js';
import { renderHooksPanel, renderMemoryPanel, renderSettingsPanel } from './panel-config.js';
import { renderStatusPanel, renderAppearancePanel } from './panel-status.js';
import { renderHelpPanel } from './panel-help.js';
import { renderNotificationsPanel } from './panel-notifications.js';
import { renderTasksPanel } from './panel-tasks.js';
import { renderTemplatesPanel } from './panel-templates.js';
import { renderSessionOptionsPanel } from './panel-session-options.js';

export const PANELS = [
  { id: 'model', group: 'session', title: 'מודל וסשן', icon: 'cpu', render: renderModelPanel },
  { id: 'session-options', group: 'session', title: 'אפשרויות הסשן', icon: 'sliders', render: renderSessionOptionsPanel },
  { id: 'permissions', group: 'session', title: 'הרשאות', icon: 'shield', render: renderPermissionsPanel },
  { id: 'usage', group: 'session', title: 'הקשר ושימוש', icon: 'gauge', render: renderUsagePanel },
  { id: 'diff', group: 'session', title: 'שינויים (git)', icon: 'diff', render: renderDiffPanel },
  { id: 'tasks', group: 'session', title: 'משימות רקע', icon: 'list', render: renderTasksPanel },
  { id: 'resume', group: 'session', title: 'שיחות קודמות', icon: 'history', render: renderResumePanel },
  { id: 'templates', group: 'session', title: 'תבניות פרומפטים', icon: 'file', render: renderTemplatesPanel },
  { id: 'skills', group: 'extend', title: 'Skills', icon: 'sparkles', render: renderSkillsPanel },
  { id: 'agents', group: 'extend', title: 'סוכנים', icon: 'bot', render: renderAgentsPanel },
  { id: 'mcp', group: 'extend', title: 'שרתי MCP', icon: 'plug', render: renderMcpPanel },
  { id: 'plugins', group: 'extend', title: 'פלאגינים', icon: 'puzzle', render: renderPluginsPanel },
  { id: 'hooks', group: 'extend', title: 'Hooks', icon: 'webhook', render: renderHooksPanel },
  { id: 'memory', group: 'setup', title: 'זיכרון (CLAUDE.md)', icon: 'book', render: renderMemoryPanel },
  { id: 'settings', group: 'setup', title: 'קובצי הגדרות', icon: 'settings', render: renderSettingsPanel },
  { id: 'status', group: 'setup', title: 'סטטוס ואבחון', icon: 'activity', render: renderStatusPanel },
  { id: 'notifications', group: 'setup', title: 'התראות', icon: 'bell', render: renderNotificationsPanel },
  { id: 'appearance', group: 'setup', title: 'מראה', icon: 'sun', render: renderAppearancePanel },
  { id: 'help', group: 'setup', title: 'עזרה ופקודות', icon: 'help', render: renderHelpPanel },
];
