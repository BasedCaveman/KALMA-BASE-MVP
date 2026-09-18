// kalma/frontend/lib/growth/x-cdp.ts
//
// Minimal Chrome DevTools Protocol client — zero npm dependencies (Golden
// Rule 2). Node 24 ships a global WebSocket, so driving a real Chrome needs
// nothing but this file.
//
// Why CDP and not the X API: X moved the API to pay-per-use on 2026-02-06
// (~$0.015 per post, ~$0.20 for any post carrying a link, ~$0.005 per read).
// A browser already signed in to the account posts for free, and can also
// READ search results — which the paid API charges for and which the reply
// engine depends on.
//
// The browser is launched separately (scripts/growth/x-login.ts) with:
//   --remote-debugging-port=9222 --user-data-dir=<dedicated profile>
// A dedicated profile keeps this session isolated from the operator's own
// Chrome: nothing here can read personal cookies or history.

const DEFAULT_PORT = Number(process.env.X_CDP_PORT || 9222);
const DEFAULT_HOST = process.env.X_CDP_HOST || '127.0.0.1';

interface PendingCall {
  resolve: (value: Record<string, unknown>) => void;
  reject: (err: Error) => void;
}

export interface CdpTarget {
  targetId: string;
  sessionId: string;
}

export class CdpError extends Error {}

/**
 * One connection to the browser-level endpoint. Every page runs as a flat
 * session over the same socket (`flatten: true`), so there is a single
 * WebSocket to open, drain and close.
 */
export class Cdp {
  private ws: WebSocket | null = null;
  private nextId = 1;
  private pending = new Map<number, PendingCall>();
  private listeners: Array<(method: string, params: Record<string, unknown>, sessionId?: string) => void> = [];
  private readonly wsUrl: string;

  // Node's strip-only TypeScript mode has no parameter properties, so every
  // field in this file is assigned explicitly.
  private constructor(wsUrl: string) {
    this.wsUrl = wsUrl;
  }

  /** Discover the browser websocket URL and connect. */
  static async connect(
    host = DEFAULT_HOST,
    port = DEFAULT_PORT,
  ): Promise<Cdp> {
    let wsUrl: string;
    try {
      const res = await fetch(`http://${host}:${port}/json/version`, {
        signal: AbortSignal.timeout(5000),
      });
      const json = (await res.json()) as { webSocketDebuggerUrl?: string };
      if (!json.webSocketDebuggerUrl) {
        throw new CdpError('no webSocketDebuggerUrl in /json/version');
      }
      wsUrl = json.webSocketDebuggerUrl;
    } catch (err) {
      throw new CdpError(
        `cannot reach Chrome on ${host}:${port} — start it with scripts/growth/x-login.ts first (${
          err instanceof Error ? err.message : String(err)
        })`,
      );
    }

    const cdp = new Cdp(wsUrl);
    await cdp.open();
    return cdp;
  }

  private open(): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.wsUrl);
      this.ws = ws;
      const onError = () => reject(new CdpError('websocket failed to open'));
      ws.addEventListener('open', () => {
        ws.removeEventListener('error', onError);
        resolve();
      }, { once: true });
      ws.addEventListener('error', onError, { once: true });
      ws.addEventListener('message', (ev) => this.onMessage(String(ev.data)));
      ws.addEventListener('close', () => {
        for (const { reject: rej } of this.pending.values()) {
          rej(new CdpError('connection closed'));
        }
        this.pending.clear();
      });
    });
  }

  private onMessage(raw: string): void {
    let msg: {
      id?: number;
      result?: Record<string, unknown>;
      error?: { message?: string };
      method?: string;
      params?: Record<string, unknown>;
      sessionId?: string;
    };
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (typeof msg.id === 'number') {
      const call = this.pending.get(msg.id);
      if (!call) return;
      this.pending.delete(msg.id);
      if (msg.error) call.reject(new CdpError(msg.error.message || 'cdp error'));
      else call.resolve(msg.result ?? {});
      return;
    }
    if (msg.method) {
      for (const fn of this.listeners) {
        fn(msg.method, msg.params ?? {}, msg.sessionId);
      }
    }
  }

  /** Subscribe to protocol events. Returns an unsubscribe function. */
  on(
    fn: (method: string, params: Record<string, unknown>, sessionId?: string) => void,
  ): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((f) => f !== fn);
    };
  }

  send(
    method: string,
    params: Record<string, unknown> = {},
    sessionId?: string,
    timeoutMs = 30000,
  ): Promise<Record<string, unknown>> {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new CdpError('not connected'));
    }
    const id = this.nextId++;
    const payload: Record<string, unknown> = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new CdpError(`${method} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
      ws.send(JSON.stringify(payload));
    });
  }

  /**
   * Open a new tab and attach to it. The tab is created blank and navigated
   * afterwards: a URL passed to Target.createTarget starts loading before the
   * session is attached, so the first commands can land on the wrong document.
   */
  async newPage(url = 'about:blank'): Promise<Page> {
    const created = (await this.send('Target.createTarget', {
      url: 'about:blank',
    })) as { targetId: string };
    const attached = (await this.send('Target.attachToTarget', {
      targetId: created.targetId,
      flatten: true,
    })) as { sessionId: string };
    const page = new Page(this, {
      targetId: created.targetId,
      sessionId: attached.sessionId,
    });
    await page.init();
    if (url && url !== 'about:blank') await page.navigate(url);
    return page;
  }

  async close(): Promise<void> {
    this.ws?.close();
    this.ws = null;
  }
}

/** A single tab. */
export class Page {
  private readonly cdp: Cdp;
  readonly target: CdpTarget;

  constructor(cdp: Cdp, target: CdpTarget) {
    this.cdp = cdp;
    this.target = target;
  }

  async init(): Promise<void> {
    await this.cdp.send('Page.enable', {}, this.target.sessionId);
    await this.cdp.send('Runtime.enable', {}, this.target.sessionId);
    await this.cdp.send('DOM.enable', {}, this.target.sessionId);
    await this.cdp.send('Network.enable', {}, this.target.sessionId);
  }

  /**
   * Wait for a network response whose URL contains `urlSubstring`, then
   * return its parsed JSON body.
   *
   * Built for one reason: `page.currentUrl()` after a publish click is not
   * trustworthy. X sometimes lands on the new tweet's own page and
   * sometimes redirects to /home, so reading it as "the tweet's URL" is a
   * coin flip. The response to X's own CreateTweet GraphQL call carries the
   * real tweet id no matter where the UI ends up, so that is the source of
   * truth this reads instead.
   */
  async waitForResponseJson<T>(
    urlSubstring: string,
    timeoutMs = 15000,
  ): Promise<T | null> {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (value: T | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        unsubscribe();
        resolve(value);
      };
      const timer = setTimeout(() => finish(null), timeoutMs);
      const unsubscribe = this.cdp.on(async (method, params, sessionId) => {
        if (sessionId !== this.target.sessionId) return;
        if (method !== 'Network.responseReceived') return;
        const response = params.response as { url?: string } | undefined;
        const requestId = params.requestId as string | undefined;
        if (!response?.url || !requestId || !response.url.includes(urlSubstring)) return;
        try {
          const body = (await this.call('Network.getResponseBody', {
            requestId,
          })) as { body?: string; base64Encoded?: boolean };
          if (!body.body) return finish(null);
          const text = body.base64Encoded
            ? Buffer.from(body.body, 'base64').toString('utf8')
            : body.body;
          finish(JSON.parse(text) as T);
        } catch {
          finish(null);
        }
      });
    });
  }

  private call(
    method: string,
    params: Record<string, unknown> = {},
    timeoutMs?: number,
  ): Promise<Record<string, unknown>> {
    return this.cdp.send(method, params, this.target.sessionId, timeoutMs);
  }

  async navigate(url: string): Promise<void> {
    await this.call('Page.navigate', { url });
    await this.waitForLoad();
  }

  /** Resolve once the document reaches `complete` (or the timeout elapses). */
  async waitForLoad(timeoutMs = 20000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const state = await this.evaluate<string>('document.readyState');
      if (state === 'complete') return;
      await sleep(250);
    }
  }

  /**
   * Pin the page's viewport to an exact size, independent of the OS window.
   *
   * `--window-size` is not the viewport: measured on this Mac, asking for
   * 1080x1920 yields a 1080x1833 page, because the window includes chrome even
   * in headless. That silently produced an ODD height, which libx264 with
   * yuv420p refuses outright, so a frame renderer looked fine right up to
   * encoding. Set the metrics explicitly instead of guessing an offset.
   */
  async setViewport(width: number, height: number, deviceScaleFactor = 1): Promise<void> {
    await this.call('Emulation.setDeviceMetricsOverride', {
      width, height, deviceScaleFactor, mobile: false,
    });
  }

  /**
   * Evaluate an expression in the page and return its JSON value.
   * Promises are awaited; exceptions surface as CdpError.
   */
  async evaluate<T>(expression: string, timeoutMs = 20000): Promise<T> {
    const res = (await this.call(
      'Runtime.evaluate',
      {
        expression,
        returnByValue: true,
        awaitPromise: true,
        userGesture: true,
      },
      timeoutMs,
    )) as {
      result?: { value?: T };
      exceptionDetails?: { text?: string; exception?: { description?: string } };
    };
    if (res.exceptionDetails) {
      throw new CdpError(
        res.exceptionDetails.exception?.description ||
          res.exceptionDetails.text ||
          'evaluate failed',
      );
    }
    return res.result?.value as T;
  }

  /** Poll until `selector` exists in the DOM. Returns false on timeout. */
  async waitForSelector(selector: string, timeoutMs = 15000): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    const expr = `!!document.querySelector(${JSON.stringify(selector)})`;
    while (Date.now() < deadline) {
      if (await this.evaluate<boolean>(expr)) return true;
      await sleep(300);
    }
    return false;
  }

  /** Poll until `selector` disappears. Returns false on timeout. */
  async waitForSelectorGone(
    selector: string,
    timeoutMs = 15000,
  ): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    const expr = `!document.querySelector(${JSON.stringify(selector)})`;
    while (Date.now() < deadline) {
      if (await this.evaluate<boolean>(expr)) return true;
      await sleep(300);
    }
    return false;
  }

  /**
   * Click an element by dispatching real mouse events at its centre — X's
   * React handlers ignore some synthetic .click() calls, and a trusted input
   * event is also what a human produces.
   */
  async click(selector: string): Promise<boolean> {
    const box = await this.evaluate<{ x: number; y: number } | null>(
      `(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return null;
        el.scrollIntoView({ block: 'center' });
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return null;
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      })()`,
    );
    if (!box) return false;
    const base = { x: box.x, y: box.y, button: 'left', clickCount: 1 };
    await this.call('Input.dispatchMouseEvent', { type: 'mouseMoved', ...base });
    await sleep(40 + Math.random() * 80);
    await this.call('Input.dispatchMouseEvent', { type: 'mousePressed', ...base });
    await sleep(30 + Math.random() * 60);
    await this.call('Input.dispatchMouseEvent', { type: 'mouseReleased', ...base });
    return true;
  }

  /**
   * Type text into the focused element. `Input.insertText` produces the
   * beforeinput/input pair React's contenteditable composer listens for, and
   * unlike per-key dispatch it never mangles emoji or accented characters.
   */
  async insertText(text: string): Promise<void> {
    await this.call('Input.insertText', { text });
  }

  /** Press a key with optional modifiers (1=Alt 2=Ctrl 4=Meta 8=Shift). */
  async pressKey(
    key: string,
    code: string,
    windowsVirtualKeyCode: number,
    modifiers = 0,
  ): Promise<void> {
    const base = { key, code, windowsVirtualKeyCode, modifiers };
    await this.call('Input.dispatchKeyEvent', { type: 'keyDown', ...base });
    await this.call('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
  }

  /** Attach local files to a file input (used for the place card image). */
  async setFileInput(selector: string, files: string[]): Promise<boolean> {
    const doc = (await this.call('DOM.getDocument', { depth: 1 })) as {
      root?: { nodeId?: number };
    };
    const rootId = doc.root?.nodeId;
    if (!rootId) return false;
    const found = (await this.call('DOM.querySelector', {
      nodeId: rootId,
      selector,
    })) as { nodeId?: number };
    if (!found.nodeId) return false;
    await this.call('DOM.setFileInputFiles', { files, nodeId: found.nodeId });
    return true;
  }

  /** Base64 PNG of the viewport — used to record what the bot actually saw. */
  async screenshot(): Promise<string | null> {
    try {
      const res = (await this.call('Page.captureScreenshot', {
        format: 'png',
      })) as { data?: string };
      return res.data ?? null;
    } catch {
      return null;
    }
  }

  async currentUrl(): Promise<string> {
    return this.evaluate<string>('location.href');
  }

  async close(): Promise<void> {
    try {
      await this.cdp.send('Target.closeTarget', {
        targetId: this.target.targetId,
      });
    } catch {
      // tab already gone
    }
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Human-ish pause: a random duration in [min, max]. */
export function humanPause(minMs: number, maxMs: number): Promise<void> {
  return sleep(minMs + Math.random() * (maxMs - minMs));
}
