import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { desktopTarget, makeSource, mergeDictionary } from '../sidecars/interface/source.mjs';

const DICTIONARY = readFileSync(new URL('../sidecars/interface/vendor/zh-CN.json', import.meta.url), 'utf8');
const RUNTIME = readFileSync(new URL('../sidecars/interface/vendor/i18n-runtime.js', import.meta.url), 'utf8');

function createDomSandbox({ url = 'https://127.0.0.1:12718/c/test', lang = 'en' } = {}) {
  const docListeners = new Map();
  let timerId = 1;

  class MockNode {
    constructor(nodeType) {
      this.nodeType = nodeType;
      this.parentElement = null;
      this.parentNode = null;
      this.childNodes = [];
      this.isConnected = true;
    }
    get firstChild() { return this.childNodes[0] || null; }
    get lastChild() { return this.childNodes.at(-1) || null; }
    get previousSibling() {
      if (!this.parentNode) return null;
      const idx = this.parentNode.childNodes.indexOf(this);
      return idx > 0 ? this.parentNode.childNodes[idx - 1] : null;
    }
    get nextSibling() {
      if (!this.parentNode) return null;
      const idx = this.parentNode.childNodes.indexOf(this);
      return idx >= 0 && idx + 1 < this.parentNode.childNodes.length ? this.parentNode.childNodes[idx + 1] : null;
    }
  }

  class MockText extends MockNode {
    constructor(text) {
      super(3);
      this.nodeValue = String(text ?? '');
    }
    get textContent() { return this.nodeValue; }
    set textContent(v) { this.nodeValue = String(v ?? ''); }
  }

  class MockElement extends MockNode {
    constructor(tagName) {
      super(1);
      this.tagName = String(tagName || 'DIV').toUpperCase();
      this.attributes = new Map();
      this._className = '';
      this.isContentEditable = false;
      this.classList = {
        contains: cls => this._className.split(/\s+/).filter(Boolean).includes(cls),
      };
    }
    get className() { return this._className; }
    set className(val) { this._className = String(val); this.attributes.set('class', this._className); }
    get lang() { return this.getAttribute('lang') || ''; }
    set lang(v) { this.setAttribute('lang', v); }
    get children() { return this.childNodes.filter(c => c.nodeType === 1); }
    get firstElementChild() { return this.children[0] || null; }
    get textContent() { return this.childNodes.map(c => c.textContent).join(''); }
    setAttribute(name, value) {
      const str = String(value);
      this.attributes.set(name, str);
      if (name === 'class') this._className = str;
      if (name === 'contenteditable') this.isContentEditable = str === '' || str === 'true' || str === 'plaintext-only';
    }
    removeAttribute(name) {
      this.attributes.delete(name);
      if (name === 'class') this._className = '';
      if (name === 'contenteditable') this.isContentEditable = false;
    }
    getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
    hasAttribute(name) { return this.attributes.has(name); }
    appendChild(child) {
      child.parentNode = this;
      child.parentElement = this;
      this.childNodes.push(child);
      return child;
    }
    append(...nodes) { for (const n of nodes) this.appendChild(n); return this; }
    matchesSimple(part) {
      const tagMatch = part.match(/^([a-zA-Z0-9-]+)?(.*)$/);
      let rest = part;
      if (tagMatch && tagMatch[1]) {
        if (this.tagName !== tagMatch[1].toUpperCase()) return false;
        rest = tagMatch[2];
      }
      const tokens = rest.match(/\.[^.\[]+|\[[^\]]+\]/g) || [];
      if (tokens.join('') !== rest) return false;
      for (const tok of tokens) {
        if (tok.startsWith('.')) {
          if (!this.classList.contains(tok.slice(1))) return false;
        } else {
          const m = tok.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);
          if (!m) return false;
          const actual = this.getAttribute(m[1]);
          if (m[2] === undefined ? actual === null : actual !== m[2]) return false;
        }
      }
      return true;
    }
    matches(selector) {
      return selector.split(',').some(sel => {
        const parts = sel.trim().split(/\s*>\s*/);
        let cur = this;
        for (let i = parts.length - 1; i >= 0; i--) {
          if (!cur || !cur.matchesSimple(parts[i])) return false;
          cur = cur.parentElement;
        }
        return true;
      });
    }
    closest(selector) {
      let cur = this;
      while (cur) {
        if (cur.nodeType === 1 && cur.matches(selector)) return cur;
        cur = cur.parentElement;
      }
      return null;
    }
    querySelectorAll(selector) {
      const out = [];
      const walk = n => {
        for (const c of n.children) {
          if (c.matches(selector)) out.push(c);
          walk(c);
        }
      };
      walk(this);
      return out;
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  }

  const documentElement = new MockElement('HTML');
  documentElement.setAttribute('lang', lang);
  const body = new MockElement('BODY');
  documentElement.appendChild(body);

  const el = (tag, attrs = {}, children = []) => {
    const node = new MockElement(tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    for (const c of children) node.appendChild(typeof c === 'string' ? new MockText(c) : c);
    return node;
  };

  const parsedUrl = new URL(url);
  const document = {
    documentElement,
    body,
    readyState: 'complete',
    location: { pathname: parsedUrl.pathname, origin: parsedUrl.origin },
    createTreeWalker(root, mask) {
      const nodes = [];
      const walk = n => {
        for (const c of n.childNodes) {
          if ((c.nodeType === 1 && (mask & 1)) || (c.nodeType === 3 && (mask & 4))) nodes.push(c);
          if (c.nodeType === 1) walk(c);
        }
      };
      walk(root);
      let idx = -1;
      return { nextNode: () => (++idx < nodes.length ? nodes[idx] : null) };
    },
    querySelectorAll: s => documentElement.querySelectorAll(s),
    querySelector: s => documentElement.querySelector(s),
    addEventListener(type, fn) {
      if (!docListeners.has(type)) docListeners.set(type, new Set());
      docListeners.get(type).add(fn);
    },
    removeEventListener(type, fn) { docListeners.get(type)?.delete(fn); },
  };

  const sandbox = {
    document,
    location: { origin: parsedUrl.origin, pathname: parsedUrl.pathname },
    NodeFilter: { SHOW_ELEMENT: 1, SHOW_TEXT: 4 },
    setInterval: () => timerId++,
    clearInterval: () => {},
    setTimeout: () => timerId++,
    clearTimeout: () => {},
    requestAnimationFrame: () => timerId++,
    cancelAnimationFrame: () => {},
    docListeners,
    el,
  };
  sandbox.window = sandbox;
  sandbox.top = sandbox;
  sandbox.globalThis = sandbox;
  return sandbox;
}

test('desktopTarget accepts loopback http/https pages and rejects iframes or wrong ports', () => {
  const id = 'a'.repeat(32);
  assert.deepEqual(desktopTarget({
    id,
    type: 'page',
    url: 'https://127.0.0.1:12718/c/abc',
    webSocketDebuggerUrl: `ws://127.0.0.1:12681/devtools/page/${id}`,
  }, 12681), {
    origin: 'https://127.0.0.1:12718',
    endpoint: `ws://127.0.0.1:12681/devtools/page/${id}`,
  });

  assert.deepEqual(desktopTarget({
    id,
    type: 'page',
    url: 'http://127.0.0.1:8080/',
    webSocketDebuggerUrl: `ws://127.0.0.1:12681/devtools/page/${id}`,
  }, 12681), {
    origin: 'http://127.0.0.1:8080',
    endpoint: `ws://127.0.0.1:12681/devtools/page/${id}`,
  });

  assert.equal(desktopTarget({
    id,
    type: 'iframe',
    url: 'plugin://agy-capsule--1/',
    webSocketDebuggerUrl: `ws://127.0.0.1:12681/devtools/page/${id}`,
  }, 12681), null);
});

test('mergeDictionary augments 2.33.1 UI strings without dropping base entries', () => {
  const merged = JSON.parse(mergeDictionary(DICTIONARY));
  assert.equal(merged.exact['You said'], '您说');
  assert.equal(merged.exact['Settings'], '设置');
  assert.ok(merged.patterns.some(p => p.regex === '^Turn\\s+(\\d+)\\s+of\\s+(\\d+)$'));
});

test('runtime translates 2.33.1 controls, protects user/model content, and restores English on dispose', () => {
  const sandbox = createDomSandbox();
  const { el, document } = sandbox;

  const workedSpan = el('span', {}, ['Worked for 13m']);
  const reviewSpan = el('span', {}, ['Review']);
  const changedCount = el('span', {}, ['3 files changed']);
  const fileBtn = el('button', {}, ['main.mjs']);
  const prosePara = el('div', { 'data-testid': 'planner-response-text' }, ['Review Settings Copy']);
  const agentHeading = el('h6', { class: 'sr-only' }, ['Agent said']);
  const userHeading = el('h5', { class: 'sr-only' }, ['You said']);
  const userPrompt = el('div', { 'data-testid': 'user-message-content' }, ['Settings Review Copy']);
  const copyBtn = el('button', { 'aria-label': 'Copy' }, []);
  const undoBtn = el('button', { 'data-testid': 'revert-button', 'aria-label': 'Undo to this point' }, []);
  const inputBox = el('div', { contenteditable: 'true', 'aria-label': 'Message input' }, ['Settings']);
  const modelBtn = el('button', { 'data-testid': 'model-selector-trigger', 'aria-label': 'Select model, current: Gemini 4' }, ['Gemini 4']);
  const nav = el('nav', { 'aria-label': 'File path breadcrumbs' }, [el('span', {}, ['Settings'])]);
  const turnBtn = el('button', { 'data-testid': 'conversation-navigator-turn', 'aria-label': 'Turn 1 of 3' }, []);
  const closeTabBtn = el('button', { 'aria-label': 'Close agy-capsule' }, []);

  document.body.append(
    el('div', { 'data-testid': 'user-message' }, [
      userHeading,
      el('div', { 'data-testid': 'user-input-step' }, [
        el('div', {}, [userPrompt]),
        el('div', { 'data-testid': 'user-message-actions' }, [copyBtn, undoBtn]),
      ]),
    ]),
    el('div', { 'data-testid': 'agent-response' }, [
      agentHeading,
      el('div', {}, [el('button', { 'data-testid': 'worked-for-collapsible' }, [workedSpan])]),
      prosePara,
      fileBtn,
      el('div', { 'data-testid': 'turn-cards-container' }, [
        el('div', { 'data-testid': 'changed-files-card' }, [
          el('div', { 'data-testid': 'changed-files-card-header' }, [
            changedCount,
            el('button', { 'data-testid': 'changed-files-card-review' }, [reviewSpan]),
          ]),
        ]),
      ]),
    ]),
    inputBox,
    modelBtn,
    nav,
    turnBtn,
    closeTabBtn
  );

  const status = vm.runInNewContext(makeSource('https://127.0.0.1:12718', DICTIONARY, RUNTIME, 200), sandbox);
  assert.equal(status, 'active');
  assert.equal(document.documentElement.getAttribute('lang'), 'zh-CN');

  // Translated UI controls and attributes
  assert.equal(workedSpan.textContent, '已运行 13 分钟');
  assert.equal(changedCount.textContent, '3 个文件已修改');
  assert.equal(reviewSpan.textContent, '审查');
  assert.equal(userHeading.textContent, '您说');
  assert.equal(agentHeading.textContent, '智能体回复');
  assert.equal(copyBtn.getAttribute('aria-label'), '复制');
  assert.equal(undoBtn.getAttribute('aria-label'), '撤销到此节点');
  assert.equal(inputBox.getAttribute('aria-label'), '消息输入');
  assert.equal(modelBtn.getAttribute('aria-label'), '选择模型，当前：Gemini 4');
  assert.equal(nav.getAttribute('aria-label'), '文件路径导航');
  assert.equal(turnBtn.getAttribute('aria-label'), '第 1 轮，共 3 轮');
  assert.equal(closeTabBtn.getAttribute('aria-label'), '关闭 agy-capsule');

  // Protected user/AI/file/model content untouched
  assert.equal(userPrompt.textContent, 'Settings Review Copy');
  assert.equal(prosePara.textContent, 'Review Settings Copy');
  assert.equal(fileBtn.textContent, 'main.mjs');
  assert.equal(inputBox.textContent, 'Settings');
  assert.equal(modelBtn.textContent, 'Gemini 4');
  assert.equal(nav.textContent, 'Settings');

  // Older owner cannot supersede newer owner
  const staleStatus = vm.runInNewContext(makeSource('https://127.0.0.1:12718', DICTIONARY, RUNTIME, 100), sandbox);
  assert.equal(staleStatus, 'superseded');
  assert.equal(sandbox.__AGY_I18N_OWNER__, 200);

  // Disposing restores original English UI and lang cleanly
  sandbox.__AGY_I18N_DISPOSE__();
  assert.equal(document.documentElement.getAttribute('lang'), 'en');
  assert.equal(workedSpan.textContent, 'Worked for 13m');
  assert.equal(changedCount.textContent, '3 files changed');
  assert.equal(reviewSpan.textContent, 'Review');
  assert.equal(userHeading.textContent, 'You said');
  assert.equal(agentHeading.textContent, 'Agent said');
  assert.equal(copyBtn.getAttribute('aria-label'), 'Copy');
  assert.equal(undoBtn.getAttribute('aria-label'), 'Undo to this point');
  assert.equal(inputBox.getAttribute('aria-label'), 'Message input');
  assert.equal(modelBtn.getAttribute('aria-label'), 'Select model, current: Gemini 4');
  assert.equal(nav.getAttribute('aria-label'), 'File path breadcrumbs');
  assert.equal(turnBtn.getAttribute('aria-label'), 'Turn 1 of 3');
  assert.equal(closeTabBtn.getAttribute('aria-label'), 'Close agy-capsule');
  assert.equal(sandbox.__AGY_I18N_INITIALIZED__, undefined);
  assert.equal(sandbox.docListeners.get('pointerenter').size, 0);
  assert.equal(sandbox.docListeners.get('contextmenu').size, 0);
});

test('runtime localizes 2.34.0 settings, history, model help, and plugin controls', () => {
  const sandbox = createDomSandbox();
  const { el, document } = sandbox;
  const retryText = "Couldn't load older messages · Retry";
  const effortHint = 'Controls how much time and quota the model spends reasoning before responding. Higher effort improves accuracy on hard problems, at the cost of slower responses and higher quota use.';
  const inputBoxHeading = el('h3', {}, ['Input Box']);
  const sendOption = el('button', { title: 'Press Ctrl+Enter to send, Enter for a new line.' }, ['Ctrl+Enter']);
  const effortHeading = el('span', {}, ['Thinking effort']);
  const effortInfo = el('span', { 'data-testid': 'model-selector-effort-info', 'aria-label': effortHint });
  const modelName = el('button', { 'data-testid': 'model-selector-trigger' }, ['Gemini 4 Neon']);
  const moreBundles = el('button', { 'aria-label': 'See 2 more bundles' }, ['See 2 more']);
  const signOut = el('button', { 'aria-busy': 'true' }, ['Signing out…']);
  const appPanel = el('section', { 'aria-label': 'MCP App' });
  const pagination = el('button', { 'aria-label': 'No messages in last 12 steps, load older' }, [retryText]);
  const notice = el('span', { role: 'status' }, ['No visible messages in last 12 steps. Activate Load older messages to continue.']);
  const cookies = el('h2', {}, ['Cookies by Site']);
  const userMessage = el('div', { 'data-testid': 'user-message-content' }, ['Thinking effort']);

  document.body.append(
    inputBoxHeading, sendOption,
    el('div', { 'data-testid': 'model-selector-effort-header' }, [effortHeading, effortInfo]),
    modelName, moreBundles, signOut, appPanel, pagination, notice, cookies, userMessage,
  );

  assert.equal(vm.runInNewContext(makeSource('https://127.0.0.1:12718', DICTIONARY, RUNTIME), sandbox), 'active');
  assert.equal(inputBoxHeading.textContent, '输入框');
  assert.equal(sendOption.getAttribute('title'), '按 Ctrl+Enter 发送，按 Enter 换行。');
  assert.equal(sendOption.textContent, 'Ctrl+Enter');
  assert.equal(effortHeading.textContent, '思考强度');
  assert.match(effortInfo.getAttribute('aria-label'), /控制模型在回复前用于推理的时间和额度/);
  assert.equal(modelName.textContent, 'Gemini 4 Neon');
  assert.equal(moreBundles.getAttribute('aria-label'), '再查看 2 个组合包');
  assert.equal(signOut.textContent, '正在退出登录…');
  assert.equal(appPanel.getAttribute('aria-label'), 'MCP 应用');
  assert.equal(pagination.textContent, '无法加载更早的消息 · 重试');
  assert.equal(pagination.getAttribute('aria-label'), '最近 12 步没有消息，加载更早的消息');
  assert.equal(notice.textContent, '最近 12 步没有可显示的消息。选择“加载更早的消息”继续。');
  assert.equal(cookies.textContent, '按站点管理 Cookie');
  assert.equal(userMessage.textContent, 'Thinking effort');

  sandbox.__AGY_I18N_DISPOSE__();
  assert.equal(effortInfo.getAttribute('aria-label'), effortHint);
  assert.equal(pagination.textContent, retryText);
});
