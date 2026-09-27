/**
 * Instagram guest injector: DMs + post comments.
 * Host polls __TE_IG_POLL__().
 */

export const INJECTOR_SOURCE = `
(function () {
  var SEEN = window.__TE_IG_SEEN__ || new Set();
  window.__TE_IG_SEEN__ = SEEN;

  var PENDING = window.__TE_IG_PENDING__ || [];
  window.__TE_IG_PENDING__ = PENDING;

  var bootstrapped = window.__TE_IG_BOOTSTRAPPED__ === true;
  var lastSendAt = 0;
  var MIN_SEND_GAP_MS = 3200;

  function path() { return location.pathname || ''; }
  function isDirectPage() { return /\\/direct\\//i.test(path()); }
  function isPostPage() { return /\\/(p|reel)\\//i.test(path()); }

  function fingerprint(text, extra) {
    return (String(text).slice(0, 100) + '|' + String(extra || '')).slice(0, 160);
  }

  function isProbablyOutgoing(el) {
    try {
      var rect = el.getBoundingClientRect();
      var vw = window.innerWidth || 800;
      if (rect.left + rect.width / 2 > vw * 0.55) return true;
    } catch (e) {}
    return false;
  }

  // ─── DM scan ───────────────────────────────────────────
  function collectDmCandidates() {
    var out = [];
    var selectors = [
      'div[role="main"] div[dir="auto"]',
      'div[role="list"] div[dir="auto"]',
      'div[role="row"] div[dir="auto"]',
      'main div[dir="auto"]'
    ];
    var seenEl = new WeakSet();
    for (var s = 0; s < selectors.length; s++) {
      var list = document.querySelectorAll(selectors[s]);
      for (var i = 0; i < list.length; i++) {
        var el = list[i];
        if (seenEl.has(el)) continue;
        seenEl.add(el);
        var text = (el.innerText || '').trim();
        if (!text || text.length > 1500) continue;
        if (/^(Send|ارسال|Like|Seen|Active)/i.test(text)) continue;
        out.push({ el: el, text: text });
      }
    }
    return out;
  }

  function scanDms() {
    if (!isDirectPage()) return;
    var nodes = collectDmCandidates().slice(-25);
    // chronological: older first in DOM often — we queue in order found
    for (var i = 0; i < nodes.length; i++) {
      var item = nodes[i];
      var fp = fingerprint(item.text, 'dm');
      if (SEEN.has(fp)) continue;
      SEEN.add(fp);
      if (SEEN.size > 800) SEEN.delete(SEEN.values().next().value);
      if (!bootstrapped) continue;
      if (isProbablyOutgoing(item.el)) continue;
      PENDING.push({
        id: fp,
        text: item.text,
        kind: 'dm_incoming',
        channel: 'dm'
      });
    }
  }

  // ─── Comments scan ─────────────────────────────────────
  function collectComments() {
    var out = [];
    // Comment blocks: list items / articles with username links
    var articles = document.querySelectorAll('ul li, div[role="button"] span, article ul > div');
    // More reliable: spans inside comment sections with dir=auto near links
    var blocks = document.querySelectorAll('ul ul div, ul li div, section ul div');
    var candidates = blocks.length ? blocks : articles;

    for (var i = 0; i < candidates.length; i++) {
      var root = candidates[i];
      var textEl = root.querySelector('span[dir="auto"]') || root.querySelector('div[dir="auto"]');
      if (!textEl) continue;
      var text = (textEl.innerText || '').trim();
      if (!text || text.length < 1 || text.length > 800) continue;

      var userLink = root.querySelector('a[href^="/"]');
      var username = '';
      if (userLink) {
        var href = userLink.getAttribute('href') || '';
        var m = href.match(/^\\/([A-Za-z0-9._]+)\\/?$/);
        if (m && !/^(p|reel|stories|direct|explore|accounts)$/i.test(m[1])) {
          username = m[1];
        }
      }

      // skip pure UI labels
      if (/^(Reply|پاسخ|Like|View replies)/i.test(text)) continue;

      out.push({ root: root, text: text, username: username, textEl: textEl });
    }
    return out;
  }

  function scanComments() {
    if (!isPostPage()) return;
    var comments = collectComments().slice(-40);
    for (var i = 0; i < comments.length; i++) {
      var c = comments[i];
      var fp = fingerprint(c.username + ':' + c.text, 'cmt');
      if (SEEN.has(fp)) continue;
      SEEN.add(fp);
      if (!bootstrapped) continue;

      var isMention = /@/.test(c.text);
      PENDING.push({
        id: fp,
        text: c.text,
        kind: 'comment',
        channel: 'comment',
        username: c.username || '',
        isMention: isMention,
        path: path()
      });
    }
  }

  function scan() {
    try { scanDms(); } catch (e) {}
    try { scanComments(); } catch (e) {}
    if (!bootstrapped) {
      bootstrapped = true;
      window.__TE_IG_BOOTSTRAPPED__ = true;
    }
  }

  window.__TE_IG_POLL__ = function () {
    try { scan(); } catch (e) {}
    var out = PENDING.slice();
    // Sort: older pending first (FIFO as discovered)
    PENDING.length = 0;
    window.__TE_IG_PENDING__ = PENDING;
    return out;
  };

  window.__TE_IG_STATUS__ = function () {
    return {
      ready: true,
      path: path(),
      seen: SEEN.size,
      bootstrapped: bootstrapped,
      direct: isDirectPage(),
      post: isPostPage()
    };
  };

  function fillAndSend(box, text) {
    box.focus();
    try {
      document.execCommand('selectAll', false, undefined);
      document.execCommand('delete', false, undefined);
    } catch (e) {}
    var ok = false;
    try { ok = document.execCommand('insertText', false, text); } catch (e) { ok = false; }
    if (!ok) {
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
  }

  window.__TE_IG_SEND_REPLY__ = async function (text) {
    if (!text) return { ok: false, reason: 'empty' };
    var now = Date.now();
    if (now - lastSendAt < MIN_SEND_GAP_MS) return { ok: false, reason: 'cooldown' };

    var box =
      document.querySelector('div[role="textbox"][contenteditable="true"]') ||
      document.querySelector('[contenteditable="true"][role="textbox"]') ||
      document.querySelector('div[contenteditable="true"]') ||
      document.querySelector('textarea');

    if (!box) return { ok: false, reason: 'no_compose' };

    fillAndSend(box, text);
    await new Promise(function (r) { setTimeout(r, 400); });

    var sendBtn =
      document.querySelector('[aria-label="Send"]') ||
      document.querySelector('[aria-label="ارسال"]') ||
      document.querySelector('div[role="button"][aria-label*="Send" i]');

    if (!sendBtn) {
      var buttons = Array.from(document.querySelectorAll('div[role="button"], button'));
      sendBtn = buttons.find(function (b) {
        var t = (b.innerText || b.getAttribute('aria-label') || '').trim();
        return /^(Send|ارسال|Post|نشر)$/i.test(t);
      }) || null;
    }

    if (sendBtn) {
      sendBtn.click();
      lastSendAt = Date.now();
      return { ok: true };
    }

    try {
      box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
    } catch (e) {}
    lastSendAt = Date.now();
    return { ok: true, via: 'enter' };
  };

  /** Reply to a comment by matching text, or use main comment box */
  window.__TE_IG_REPLY_COMMENT__ = async function (payload) {
    var text = payload && payload.text;
    var targetComment = (payload && payload.targetText) || '';
    if (!text) return { ok: false, reason: 'empty' };

    // Try click Reply near matching comment
    if (targetComment) {
      var comments = collectComments();
      for (var i = 0; i < comments.length; i++) {
        if (comments[i].text.indexOf(targetComment.slice(0, 40)) !== -1) {
          var replyBtn = null;
          var root = comments[i].root;
          var btns = root.querySelectorAll('button, div[role="button"], span');
          for (var j = 0; j < btns.length; j++) {
            var lab = (btns[j].innerText || btns[j].getAttribute('aria-label') || '').trim();
            if (/^(Reply|پاسخ)$/i.test(lab)) { replyBtn = btns[j]; break; }
          }
          if (replyBtn) {
            replyBtn.click();
            await new Promise(function (r) { setTimeout(r, 500); });
          }
          break;
        }
      }
    }

    // Main comment composer at bottom of post
    var box =
      document.querySelector('form textarea') ||
      document.querySelector('textarea[placeholder]') ||
      document.querySelector('div[role="textbox"][contenteditable="true"]') ||
      document.querySelector('[contenteditable="true"]');

    if (!box) return { ok: false, reason: 'no_comment_box' };

    fillAndSend(box, text);
    await new Promise(function (r) { setTimeout(r, 400); });

    var postBtn =
      document.querySelector('form button[type="submit"]') ||
      Array.from(document.querySelectorAll('form button, div[role="button"]')).find(function (b) {
        var t = (b.innerText || '').trim();
        return /^(Post|نشر|ارسال)$/i.test(t);
      });

    if (postBtn && !postBtn.disabled) {
      postBtn.click();
      lastSendAt = Date.now();
      return { ok: true };
    }

    try {
      box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
    } catch (e) {}
    lastSendAt = Date.now();
    return { ok: true, via: 'enter' };
  };

  /** Navigate to user and open Message if possible */
  window.__TE_IG_OPEN_DM__ = async function (username) {
    if (!username) return { ok: false, reason: 'no_user' };
    // Best-effort: go to profile
    location.href = 'https://www.instagram.com/' + encodeURIComponent(username) + '/';
    return { ok: true, navigated: true };
  };

  try { scan(); } catch (e) {}

  if (!window.__TE_IG_OBSERVER__) {
    var obs = new MutationObserver(function () { try { scan(); } catch (e) {} });
    if (document.body) obs.observe(document.body, { childList: true, subtree: true });
    window.__TE_IG_OBSERVER__ = obs;
  }

  window.__TE_IG_ASSIST_INJECTED__ = true;
})();
`
