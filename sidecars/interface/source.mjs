export const EXTRA_EXACT = {
  'You said': '您说',
  'Sidebar': '侧边栏',
  'Response actions': '回复操作',
  'File Viewer header': '文件查看器标题栏',
  'File path breadcrumbs': '文件路径导航',
  'Typeahead menu': '自动补全菜单',
};

export const EXTRA_PATTERNS = [
  { regex: '^Turn\\s+(\\d+)\\s+of\\s+(\\d+)$', replacement: '第 $1 轮，共 $2 轮' },
  { regex: '^No more older messages,\\s*showing\\s+(\\d+)\\s+of\\s+(\\d+)$', replacement: '没有更多历史消息，当前显示 $1 / $2 条' },
  { regex: '^Fold lines\\s+(\\d+-\\d+)$', replacement: '折叠第 $1 行' },
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
