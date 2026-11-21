export const EXTRA_EXACT = {
  'You said': '您说',
  'Sidebar': '侧边栏',
  'Response actions': '回复操作',
  'File Viewer header': '文件查看器标题栏',
  'File path breadcrumbs': '文件路径导航',
  'Typeahead menu': '自动补全菜单',

  'Input Box': '输入框',
  'Enter to send': '按 Enter 发送',
  'Choose which key sends a message in the chat composer.': '设置聊天输入框中发送消息的快捷键。',
  'Press Enter to send, Shift+Enter for a new line.': '按 Enter 发送，按 Shift+Enter 换行。',
  'Press Ctrl+Enter to send, Enter for a new line.': '按 Ctrl+Enter 发送，按 Enter 换行。',
  'Press Cmd+Enter to send, Enter for a new line.': '按 Cmd+Enter 发送，按 Enter 换行。',
  'Thinking effort': '思考强度',
  'Controls how much time and quota the model spends reasoning before responding. Higher effort improves accuracy on hard problems, at the cost of slower responses and higher quota use.': '控制模型在回复前用于推理的时间和额度。提高思考强度可提升复杂问题的回答准确性，但响应会变慢，消耗的额度也会增加。',
  "The Orchestrator's own planner": '编排器自带的规划模型',
  'Offloads routine steps to a faster executor. Same quality, fewer tokens used.': '将常规步骤交给速度更快的执行模型，在保持质量的同时减少 Token 消耗。',

  'Open Tabs': '已打开的标签页',
  'Searching older messages…': '正在查找更早的消息…',
  'Loading older messages…': '正在加载更早的消息…',
  'Loaded older messages': '已加载更早的消息',
  "Couldn't load older messages — retry": '无法加载更早的消息，重试',
  "Couldn't load older messages, retry": '无法加载更早的消息，重试',
  "Couldn't load older messages · Retry": '无法加载更早的消息 · 重试',
  "Couldn't load older messages. Try again.": '无法加载更早的消息，请重试。',

  'MCP App': 'MCP 应用',
  'Signing out…': '正在退出登录…',
  'Loading bundles...': '正在加载组合包…',
  'No bundles available.': '暂无可用的组合包。',
  'Failed to load marketplace bundles. Please try again.': '无法加载市场中的组合包，请重试。',
  'Failed to load bundle. Please try again.': '无法加载组合包，请重试。',
  'A customization failed to load': '有 1 项自定义扩展加载失败',

  'Browsing Data': '浏览数据',
  'Clear history, cookies and site data from the built-in browser, or manage cookies for each site.': '清除内置浏览器的历史记录、Cookie 和站点数据，或按站点管理 Cookie。',
  'Cookies by Site': '按站点管理 Cookie',
  'Clear Browsing Data?': '清除浏览数据？',
  "Choose what to clear from the built-in browser. It can't be undone.": '选择要从内置浏览器中清除的数据。此操作无法撤销。',
  'Browsing history': '浏览历史记录',
  'Visited URLs and autocomplete suggestions.': '访问过的网址和自动补全建议。',
  'Cookies and other site data': 'Cookie 和其他站点数据',
  'Cookies, site storage and cache. Signs you out of all sites in the built-in browser and reloads its open tabs.': '清除 Cookie、站点存储和缓存。此操作会退出内置浏览器中所有站点的登录，并重新加载所有打开的标签页。',
  'An agent is using the built-in browser. Clearing its data signs the agent out of sites and may interrupt its task.': '有智能体正在使用内置浏览器。清除数据会让智能体退出站点登录，可能中断正在进行的任务。',
  "Couldn't clear browsing data. Try again.": '无法清除浏览数据，请重试。',
  'Cleared built-in browser data': '已清除内置浏览器的数据',
  'Cleared built-in browser history': '已清除内置浏览器的历史记录',
  'Loading cookies…': '正在加载 Cookie…',
  "Couldn't load cookies.": '无法加载 Cookie。',
  'No sites have cookies in the built-in browser.': '内置浏览器中没有站点保存 Cookie。',
  "Cookies the built-in browser stores for each site. Deleting a site's cookies usually signs you out of it. Other site data (local storage, IndexedDB, cache) is cleared only by Browsing Data → Clear.": '内置浏览器为各站点保存的 Cookie。删除某个站点的 Cookie 通常会退出该站点的登录。其他站点数据（本地存储、IndexedDB 和缓存）只能通过“浏览数据 → 清除”删除。',
  'Sites with cookies': '保存了 Cookie 的站点',
  'Search sites...': '搜索站点…',
  'Search sites': '搜索站点',
};

export const EXTRA_PATTERNS = [
  { regex: '^Turn\\s+(\\d+)\\s+of\\s+(\\d+)$', replacement: '第 $1 轮，共 $2 轮' },
  { regex: '^No more older messages,\\s*showing\\s+(\\d+)\\s+of\\s+(\\d+)$', replacement: '没有更多历史消息，当前显示 $1 / $2 条' },
  { regex: '^Fold lines\\s+(\\d+-\\d+)$', replacement: '折叠第 $1 行' },
  { regex: '^No messages in last (\\d+) steps(?: — load older|, load older| · Load more)$', replacement: '最近 $1 步没有消息，加载更早的消息' },
  { regex: '^No visible messages in last (\\d+) steps\\. Activate Load older messages to continue\\.$', replacement: '最近 $1 步没有可显示的消息。选择“加载更早的消息”继续。' },
  { regex: '^See (\\d+) more bundles?$', replacement: '再查看 $1 个组合包' },
  { regex: '^(\\d+) customizations failed to load$', replacement: '有 $1 项自定义扩展加载失败' },
];

export function mergeDictionary(rawJson) {
  const data = typeof rawJson === 'string' ? JSON.parse(rawJson) : { ...(rawJson || {}) };
  const exact = { ...(data.exact || {}) };
  for (const [key, value] of Object.entries(EXTRA_EXACT)) {
    if (!Object.prototype.hasOwnProperty.call(exact, key)) exact[key] = value;
  }
  const existingPatterns = Array.isArray(data.patterns) ? data.patterns : [];
  const seen = new Set(existingPatterns.map(p => p?.regex).filter(Boolean));
  const patterns = [...existingPatterns];
  for (const entry of EXTRA_PATTERNS) {
    if (!seen.has(entry.regex)) {
      patterns.push(entry);
      seen.add(entry.regex);
    }
  }
  return JSON.stringify({ ...data, exact, patterns });
}

export function makeSource(origin, dictionary, runtime, owner = 0) {
  const merged = mergeDictionary(dictionary);
  return `(() => {
    if (window.top !== window || location.origin !== ${JSON.stringify(origin)}) return 'outside-desktop';
    const nextOwner = ${Number(owner) || 0};
    if (nextOwner && Number(window.__AGY_I18N_OWNER__ || 0) > nextOwner) return 'superseded';
    if (window.__AGY_I18N_INITIALIZED__) {
      if (nextOwner && window.__AGY_I18N_OWNER__ !== nextOwner && typeof window.__AGY_I18N_DISPOSE__ === 'function') {
        window.__AGY_I18N_DISPOSE__();
      } else {
        return 'already-localized';
      }
    }
    if (nextOwner) window.__AGY_I18N_OWNER__ = nextOwner;
    window.__AGY_I18N_DATA__ = JSON.parse(${JSON.stringify(merged)});
    ${runtime}
    return typeof window.__AGY_TRANSLATE_UNIT__ === 'function' ? 'active' : 'failed';
  })()`;
}

export function desktopTarget(target, debugPort) {
  if (target?.type !== 'page' || !/^[a-f0-9]{32}$/i.test(target.id)) return null;
  try {
    const page = new URL(target.url);
    const socket = new URL(target.webSocketDebuggerUrl);
    const loopback = new Set(['127.0.0.1', 'localhost', '[::1]']);
    if (!['http:', 'https:'].includes(page.protocol) || !loopback.has(page.hostname) || !page.port ||
        page.username || page.password || Number(page.port) === debugPort ||
        socket.protocol !== 'ws:' || !loopback.has(socket.hostname) ||
        socket.port !== String(debugPort) || socket.username || socket.password ||
        socket.pathname !== `/devtools/page/${target.id}` || socket.search || socket.hash) return null;
    return {
      origin: page.origin,
      endpoint: `ws://127.0.0.1:${debugPort}${socket.pathname}`,
    };
  } catch {
    return null;
  }
}
