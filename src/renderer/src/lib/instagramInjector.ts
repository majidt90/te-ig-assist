/**
 * Script injected into Instagram webview guest page.
 * Communicates via console.log prefix TE_IG| (picked up by host console-message).
 *
 * Note: Instagram DOM changes often — selectors are intentionally resilient
 * (roles, contenteditable, structural heuristics).
 */

export const INJECTOR_SOURCE = `
(function () {
  if (window.__TE_IG_ASSIST_INJECTED__) return;
  window.__TE_IG_ASSIST_INJECTED__ = true;

  const SEEN = new Set();
  const PREFIX = 'TE_IG|';
  let lastSendAt = 0;
  const MIN_SEND_GAP_MS = 4000;

  function emit(type, payload) {
    try {
      console.log(PREFIX + JSON.stringify({ type: type, payload: payload, t: Date.now() }));
    } catch (e) {}
  }

  function isDirectPage() {
    return /\\/direct\\//.test(location.pathname);
  }

  function fingerprint(text, el) {
    const rect = el.getBoundingClientRect();
    return (text.slice(0, 120) + '|' + Math.round(rect.top) + '|' + Math.round(rect.height)).slice(0, 160);
  }

  /** Heuristic: outgoing (mine) messages tend to sit on the right in LTR layout */
  function isProbablyOutgoing(el) {
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth || document.documentElement.clientWidth;
    // Right half → likely mine
    if (rect.left > vw * 0.42) return true;

    // Class / attr hints
    const root = el.closest('[class]') || el;
    const cls = (root.className && String(root.className)) || '';
    if (/x1n2onr6|outgoing|sent/i.test(cls)) return true;

    return false;
  }

  function extractMessageNodes() {
    const nodes = [];
    // Prefer role-based rows inside main
    const candidates = document.querySelectorAll(
      'div[role="main"] div[dir="auto"], div[role="list"] div[dir="auto"], div[role="row"] div[dir="auto"]'
    );
    candidates.forEach(function (el) {
      const text = (el.innerText || '').trim();
      if (!text || text.length < 1 || text.length > 2000) return;
      // Skip pure timestamps / single emoji-only noise lightly
      if (/^[0-9:\\sAPMapm]+$/.test(text)) return;
      nodes.push({ el: el, text: text });
    });
    return nodes;
  }

  function scanNewMessages() {
    if (!isDirectPage()) return;

    const nodes = extractMessageNodes();
    // Focus on the last few nodes (newest)
    const tail = nodes.slice(-12);

    for (let i = 0; i < tail.length; i++) {
      const item = tail[i];
      const fp = fingerprint(item.text, item.el);
      if (SEEN.has(fp)) continue;
      SEEN.add(fp);

      // Cap memory
      if (SEEN.size > 400) {
        const first = SEEN.values().next().value;
        SEEN.delete(first);
      }

      if (isProbablyOutgoing(item.el)) {
        emit('outgoing', { text: item.text, id: fp });
        continue;
      }

      emit('incoming', { text: item.text, id: fp });
    }
  }

  // ── Send reply into compose box ───────────────────────────
  window.__TE_IG_SEND_REPLY__ = async function (text) {
    if (!text || typeof text !== 'string') return { ok: false, reason: 'empty' };
    const now = Date.now();
    if (now - lastSendAt < MIN_SEND_GAP_MS) {
      return { ok: false, reason: 'cooldown' };
    }

    const box =
      document.querySelector('div[role="textbox"][contenteditable="true"]') ||
      document.querySelector('[contenteditable="true"][role="textbox"]') ||
      document.querySelector('textarea');

    if (!box) return { ok: false, reason: 'no_compose' };

    box.focus();

    // Clear existing
    try {
      document.execCommand('selectAll', false, undefined);
      document.execCommand('delete', false, undefined);
    } catch (e) {}

    // Insert text (InputEvent for React-controlled fields)
    try {
      const dt = new DataTransfer();
      dt.setData('text/plain', text);
      box.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    } catch (e) {}

    if (!(box.innerText || box.textContent || '').trim()) {
      try {
        document.execCommand('insertText', false, text);
      } catch (e2) {
        if (box.tagName === 'TEXTAREA') {
          box.value = text;
          box.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
          box.textContent = text;
          box.dispatchEvent(new InputEvent('input', { bubbles: true, data: text, inputType: 'insertText' }));
        }
      }
    }

    await new Promise(function (r) { setTimeout(r, 350); });

    // Find Send button
    var sendBtn =
      document.querySelector('div[role="button"][aria-label="Send"]') ||
      document.querySelector('div[role="button"][aria-label="ارسال"]') ||
      document.querySelector('button[type="submit"]');

    if (!sendBtn) {
      // Fallback: look for button with Send text near compose
      var buttons = Array.from(document.querySelectorAll('div[role="button"], button'));
      sendBtn = buttons.find(function (b) {
        var t = (b.innerText || b.getAttribute('aria-label') || '').trim();
        return /^(Send|ارسال|Post)$/i.test(t);
      });
    }

    if (sendBtn) {
      sendBtn.click();
      lastSendAt = Date.now();
      emit('sent', { text: text });
      return { ok: true };
    }

    // Last resort: Enter key
    box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
    lastSendAt = Date.now();
    emit('sent', { text: text, via: 'enter' });
    return { ok: true, via: 'enter' };
  };

  // Observe DOM
  var observer = new MutationObserver(function () {
    try { scanNewMessages(); } catch (e) {}
  });

  function start() {
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    scanNewMessages();
    emit('ready', { path: location.pathname });
  }

  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start);

  // SPA navigations
  var lastPath = location.pathname;
  setInterval(function () {
    if (location.pathname !== lastPath) {
      lastPath = location.pathname;
      emit('navigate', { path: lastPath });
      setTimeout(scanNewMessages, 800);
    }
  }, 1000);

  // Periodic safety scan
  setInterval(function () {
    try { scanNewMessages(); } catch (e) {}
  }, 2500);
})();
`
