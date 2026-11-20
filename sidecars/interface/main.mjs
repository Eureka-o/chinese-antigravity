import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { desktopTarget, makeSource } from './source.mjs';

const OWNER = Date.now() * 1000 + (process.pid % 1000);
const PROFILE = process.env.AG_PULSE_PROFILE
  || process.env.ANTIGRAVITY_PROFILE
  || join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'Antigravity');
const PORT_FILE = join(PROFILE, 'DevToolsActivePort');

const SHORTCUT_REPAIR_PS = `
$ErrorActionPreference = 'SilentlyContinue'
$dirs = @(
  [Environment]::GetFolderPath('Desktop'),
  [Environment]::GetFolderPath('CommonDesktopDirectory'),
  [Environment]::GetFolderPath('StartMenu'),
  [Environment]::GetFolderPath('CommonStartMenu'),
  (Join-Path $env:APPDATA 'Microsoft\\Internet Explorer\\Quick Launch\\User Pinned\\TaskBar')
) | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -Unique
$shell = New-Object -ComObject WScript.Shell
$total = 0; $updated = 0; $failed = 0
foreach ($d in $dirs) {
  foreach ($f in Get-ChildItem -LiteralPath $d -Recurse -Filter *.lnk) {
    $l = $shell.CreateShortcut($f.FullName)
    if ($l.TargetPath -and (Split-Path -Leaf $l.TargetPath) -eq 'Antigravity.exe') {
      $total++
      $args = [string]$l.Arguments
      $hasPort = $args -match '(^|\\s)--remote-debugging-port(=\\S*)?(?=\\s|$)'
      $hasAddr = $args -match '(^|\\s)--remote-debugging-address=127\\.0\\.0\\.1(?=\\s|$)'
      if ($hasPort -and $hasAddr) { continue }
      if (-not $hasPort) { $args = "$args --remote-debugging-port=0".Trim() }
      if (-not $hasAddr) { $args = "$args --remote-debugging-address=127.0.0.1".Trim() }
      try {
        $l.Arguments = $args
        $l.Save()
        $updated++
      } catch {
        $failed++
      }
    }
  }
}
Write-Output "$updated,$failed,$total"
`;

const WIN_NOTIFY_PS = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$n = New-Object System.Windows.Forms.NotifyIcon
$n.Icon = [System.Drawing.SystemIcons]::Information
$n.BalloonTipIcon = [System.Windows.Forms.ToolTipIcon]::Info
$n.BalloonTipTitle = $env:AGY_LOC_TITLE
$n.BalloonTipText = $env:AGY_LOC_BODY
$n.Visible = $true
$n.ShowBalloonTip(8000)
Start-Sleep -Milliseconds 6000
$n.Dispose()
`;

function runPowerShell(script, envExtra = {}) {
  if (process.platform !== 'win32') return Promise.resolve({ ok: false, stdout: '' });
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  return new Promise(resolve => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded],
      { encoding: 'utf8', windowsHide: true, timeout: 12000, env: { ...process.env, ...envExtra } },
      (err, stdout) => resolve({ ok: !err, stdout: String(stdout || '').trim() })
    );
  });
}

async function repairWindowsShortcuts() {
  const res = await runPowerShell(SHORTCUT_REPAIR_PS);
  const line = res.stdout.split(/\r?\n/).map(s => s.trim()).filter(Boolean).at(-1) || '';
  const [updated = 0, failed = 0, total = 0] = line.split(',').map(n => Number(n) || 0);
  return { ok: res.ok, updated, failed, total };
}

class CdpConnection {
  constructor(url) {
    this.url = url;
    this.pending = new Map();
    this.nextId = 0;
    this.closed = false;
  }

  async open() {
    this.socket = new WebSocket(this.url);
    this.socket.addEventListener('message', event => {
      try {
        const message = JSON.parse(event.data);
        if (!message.id) return;
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        clearTimeout(pending.timer);
        if (message.error) pending.reject(new Error('CDP command failed'));
        else pending.resolve(message.result || {});
      } catch {}
    });
    this.socket.addEventListener('close', () => this.close());
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('CDP connection timeout')), 5000);
      this.socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
      this.socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('CDP connection failed')); }, { once: true });
    });
    return this;
  }

  command(method, params = {}) {
    if (this.closed) return Promise.reject(new Error('CDP connection closed'));
    return new Promise((resolve, reject) => {
      const id = ++this.nextId;
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('CDP command timeout')); }, 5000);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error('CDP connection closed'));
    }
    this.pending.clear();
    try { this.socket?.close(); } catch {}
  }
}

async function localJson(port, path) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    redirect: 'error',
    signal: AbortSignal.timeout(2500),
  });
  if (!response.ok) throw new Error(`Local debugger returned HTTP ${response.status}`);
  return response.json();
}

export async function startService() {
  const [dictionary, runtime] = await Promise.all([
    readFile(new URL('./vendor/zh-CN.json', import.meta.url), 'utf8'),
    readFile(new URL('./vendor/i18n-runtime.js', import.meta.url), 'utf8'),
  ]);

  const sessions = new Map();
  let verifiedPort = null;
  let status = '';
  let stopping = false;
  let ticking = false;
  let repairedOnOutage = false;
  let notifiedRestart = false;

  const log = next => {
    if (status !== next) console.log(`[localization] ${next}`);
    status = next;
  };

  async function discoverTargets() {
    const port = Number((await readFile(PORT_FILE, 'utf8')).split(/\r?\n/, 1)[0]);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid local debugger port');
    if (port !== verifiedPort) {
      const identity = await localJson(port, '/json/version');
      if (!/\bAntigravity\b/i.test(identity['User-Agent'] || '')) {
        throw new Error('Local debugger does not identify itself as Antigravity');
      }
      verifiedPort = port;
    }
    const list = await localJson(port, '/json/list');
    return Array.isArray(list) ? list.map(t => desktopTarget(t, port)).filter(Boolean) : [];
  }

  async function attach(target) {
    const connection = new CdpConnection(target.endpoint);
    try {
      await connection.open();
      await connection.command('Page.enable');
      await connection.command('Runtime.enable');
      const existing = await connection.command('Runtime.evaluate', {
        expression: 'Number(window.__AGY_I18N_OWNER__ || 0)',
        returnByValue: true,
      });
      if ((existing.result?.value || 0) > OWNER) {
        connection.close();
        return 'superseded';
      }
      const source = makeSource(target.origin, dictionary, runtime, OWNER);
      const script = await connection.command('Page.addScriptToEvaluateOnNewDocument', { source });
      connection.scriptId = script.identifier;
      connection.source = source;
      const result = await connection.command('Runtime.evaluate', { expression: source, returnByValue: true });
      if (result.exceptionDetails || result.result?.value === 'failed') {
        throw new Error('Desktop translation runtime did not initialize');
      }
      return connection;
    } catch (error) {
      try { if (connection.scriptId) await connection.command('Page.removeScriptToEvaluateOnNewDocument', { identifier: connection.scriptId }); } catch {}
      connection.close();
      throw error;
    }
  }

  async function ensureLocalized(connection) {
    const probe = await connection.command('Runtime.evaluate', {
      expression: '({ initialized: !!window.__AGY_I18N_INITIALIZED__, owner: Number(window.__AGY_I18N_OWNER__ || 0) })',
      returnByValue: true,
    });
    const state = probe.result?.value;
    if ((state?.owner || 0) > OWNER) return 'superseded';
    if (state?.initialized && state?.owner === OWNER) return 'ok';
    const result = await connection.command('Runtime.evaluate', { expression: connection.source, returnByValue: true });
    if (result.exceptionDetails || result.result?.value === 'failed') {
      throw new Error('Desktop translation recovery failed');
    }
    return 'ok';
  }

  async function detach(connection) {
    try {
      await connection.command('Runtime.evaluate', {
        expression: `if (Number(window.__AGY_I18N_OWNER__ || 0) === ${OWNER}) window.__AGY_I18N_DISPOSE__?.()`,
      });
    } catch {}
    try { if (connection.scriptId) await connection.command('Page.removeScriptToEvaluateOnNewDocument', { identifier: connection.scriptId }); } catch {}
    connection.close();
  }

  async function tick() {
    if (stopping || ticking) return;
    ticking = true;
    let superseded = false;
    try {
      const targets = await discoverTargets();
      repairedOnOutage = false;
      const active = new Set(targets.map(t => t.endpoint));
      for (const [endpoint, connection] of sessions) {
        if (!active.has(endpoint) || connection.closed) {
          await detach(connection);
          sessions.delete(endpoint);
        }
      }
      for (const target of targets) {
        if (!sessions.has(target.endpoint)) {
          try {
            const attached = await attach(target);
            if (attached === 'superseded') {
              superseded = true;
              break;
            }
            sessions.set(target.endpoint, attached);
          } catch {}
        }
      }
      if (!superseded) {
        for (const [endpoint, connection] of sessions) {
          try {
            if ((await ensureLocalized(connection)) === 'superseded') {
              superseded = true;
              break;
            }
          } catch {
            await detach(connection);
            sessions.delete(endpoint);
          }
        }
      }
      if (sessions.size > 0) log('Chinese interface active in Antigravity');
      else log('Waiting for the Antigravity desktop window');
    } catch (error) {
      verifiedPort = null;
      if (error?.code === 'ENOENT') {
        if (process.platform === 'win32' && !repairedOnOutage) {
          repairedOnOutage = true;
          const repaired = await repairWindowsShortcuts();
          if (repaired.updated > 0 && !notifiedRestart) {
            notifiedRestart = true;
            void runPowerShell(WIN_NOTIFY_PS, {
              AGY_LOC_TITLE: 'Antigravity 简体中文',
              AGY_LOC_BODY: '已自动补齐桌面/菜单快捷方式调试参数，重启一次 Antigravity 即可启用中文界面。',
            });
            log(`Repaired ${repaired.updated} Antigravity shortcut(s); restart Antigravity once to activate`);
          } else {
            log('Waiting for DevToolsActivePort (restart Antigravity from a shortcut to activate)');
          }
        } else {
          log('Waiting for the local Antigravity debugger');
        }
      } else {
        log(`Waiting to reconnect: ${error.message}`);
      }
    } finally {
      ticking = false;
      if (superseded) void shutdown();
    }
  }

  // Proactively keep existing Windows shortcuts healed even when CDP is already active
  // (e.g., if an Antigravity update reset another shortcut while running).
  if (process.platform === 'win32') void repairWindowsShortcuts();

  const timer = setInterval(() => void tick(), 3000);
  void tick();

  async function shutdown() {
    if (stopping) return;
    stopping = true;
    clearInterval(timer);
    for (const connection of sessions.values()) await detach(connection);
    sessions.clear();
    process.exit(0);
  }

  process.once('SIGTERM', () => void shutdown());
  process.once('SIGINT', () => void shutdown());
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void startService();
}
