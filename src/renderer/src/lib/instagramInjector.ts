/**
 * Injected into Instagram webview.
 * Host polls window.__TE_IG_POLL__() every ~1.5s (reliable).
 * On first run, existing bubbles are marked seen (bootstrap) — only NEW messages are returned.
 */

export const INJECTOR_SOURCE = `
(function () {
  // Allow re-install of functions even if already injected
  var SEEN = window.__TE_IG_SEEN__ || new Set();
  window.__TE_IG_SEEN__ = SEEN;

  var PENDING = window.__TE_IG_PENDING__ || [];
  window.__TE_IG_PENDING__ = PENDING;

  var bootstrapped = window.__TE_IG_BOOTSTRAPPED__ === true;
  var lastSendAt = 0;
  var MIN_SEND_GAP_MS = 3500;

  function isDirectPage() {
    return /\\/direct\\//i.test(location.pathname || '');
  }

  function fingerprint(text, el) {
    var top = 0, h = 0;
    try {
      var r = el.getBoundingClientRect();
      top = Math.round(r.top);
      h = Math.round(r.height);
    } catch (e) {}
    return (String(text).slice(0, 100) + '|' + top + '|' + h).slice(0, 140);
  }

  function isProbablyOutgoing(el) {
    try {
      var rect = el.getBoundingClientRect();
      var vw = window.innerWidth || document.documentElement.clientWidth || 800;
      // Messages on the right side are usually mine (LTR Instagram web)
      if (rect.left + rect.width / 2 > vw * 0.55) return true;
    } catch (e) {}
    return false;
  }

  function collectCandidates() {
    var set = [];
    var selectors = [
      'div[role="main"] div[dir="auto"]',
      'div[role="list"] div[dir="auto"]',
      'div[role="row"] div[dir="auto"]',
      'div[role="grid"] div[dir="auto"]',
      // broader fallback
      'main div[dir="auto"]',
      '[aria-label] div[dir="auto"]'
    ];
    var seenEl = new WeakSet();
    for (var s = 0; s < selectors.length; s++) {
      var list = document.querySelectorAll(selectors[s]);
      for (var i = 0; i < list.length; i++) {
        var el = list[i];
        if (seenEl.has(el)) continue;
        seenEl.add(el);
        var text = (el.innerText || el.textContent || '').trim();
        if (!text || text.length > 1500) continue;
        // skip obvious chrome
        if (/^(Send|ارسال|Like|View profile|Seen|Active)/i.test(text)) continue;
        if (/^[0-9]{1,2}:[0-9]{2}/.test(text) && text.length < 12) continue;
        set.push({ el: el, text: text });
      }
    }
    return set;
  }

  function scan() {
    if (!isDirectPage()) return;

    var nodes = collectCandidates();
    // newest-ish at the end
    var tail = nodes.slice(-20);

    for (var i = 0; i < tail.length; i++) {
      var item = tail[i];
      var fp = fingerprint(item.text, item.el);
      if (SEEN.has(fp)) continue;
      SEEN.add(fp);

      if (SEEN.size > 500) {
        // drop oldest-ish
        var it = SEEN.values();
        SEEN.delete(it.next().value);
      }

      // Bootstrap: mark history, do not queue
      if (!bootstrapped) continue;

      if (isProbablyOutgoing(item.el)) continue;

      PENDING.push({ id: fp, text: item.text, kind: 'incoming' });
    }

    if (!bootstrapped) {
      bootstrapped = true;
      window.__TE_IG_BOOTSTRAPPED__ = true;
    }
  }

  window.__TE_IG_POLL__ = function () {
    try { scan(); } catch (e) {}
    var out = PENDING.slice();
    PENDING.length = 0;
    window.__TE_IG_PENDING__ = PENDING;
    return out;
  };

  window.__TE_IG_STATUS__ = function () {
    return {
      ready: true,
      path: location.pathname,
      seen: SEEN.size,
      bootstrapped: bootstrapped,
      direct: isDirectPage()
    };
  };

  window.__TE_IG_SEND_REPLY__ = async function (text) {
    if (!text || typeof text !== 'string') return { ok: false, reason: 'empty' };
    var now = Date.now();
    if (now - lastSendAt < MIN_SEND_GAP_MS) return { ok: false, reason: 'cooldown' };

    var box =
      document.querySelector('div[role="textbox"][contenteditable="true"]') ||
      document.querySelector('[contenteditable="true"][role="textbox"]') ||
      document.querySelector('div[contenteditable="true"]') ||
      document.querySelector('textarea');

    if (!box) return { ok: false, reason: 'no_compose' };

    box.focus();
    await new Promise(function (r) { setTimeout(r, 80); });

    try {
      document.execCommand('selectAll', false, undefined);
      document.execCommand('delete', false, undefined);
    } catch (e) {}

    var inserted = false;
    try {
      inserted = document.execCommand('insertText', false, text);
    } catch (e) {
      inserted = false;
    }

    if (!inserted) {
      if (box.tagName === 'TEXTAREA' || box.tagName === 'INPUT') {
        box.value = text;
        box.dispatchEvent(new Event('input', { bubbles: true }));
      } else {
        box.textContent = text;
        try {
          box.dispatchEvent(new InputEvent('input', { bubbles: true, data: text, inputType: 'insertText' }));
        } catch (e2) {
          box.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }
    }

    await new Promise(function (r) { setTimeout(r, 400); });

    var sendBtn =
      document.querySelector('[aria-label="Send"]') ||
      document.querySelector('[aria-label="ارسال"]') ||
      document.querySelector('div[role="button"][aria-label*="Send" i]') ||
      document.querySelector('div[role="button"][aria-label*="ارسال"]');

    if (!sendBtn) {
      var buttons = Array.from(document.querySelectorAll('div[role="button"], button'));
      sendBtn = buttons.find(function (b) {
        var t = (b.innerText || b.getAttribute('aria-label') || '').trim();
        return /^(Send|ارسال)$/i.test(t);
      }) || null;
    }

    if (sendBtn) {
      sendBtn.click();
      lastSendAt = Date.now();
      return { ok: true };
    }

    // Enter fallback
    try {
      box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
      box.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
    } catch (e) {}
    lastSendAt = Date.now();
    return { ok: true, via: 'enter' };
  };

  // initial scan for bootstrap
  try { scan(); } catch (e) {}

  if (!window.__TE_IG_OBSERVER__) {
    var obs = new MutationObserver(function () {
      try { scan(); } catch (e) {}
    });
    if (document.body) {
      obs.observe(document.body, { childList: true, subtree: true });
    }
    window.__TE_IG_OBSERVER__ = obs;
  }

  window.__TE_IG_ASSIST_INJECTED__ = true;
})();
`
