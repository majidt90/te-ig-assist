/**
 * Instagram guest injector — DMs, comments, inbox walk, activity, follow requests.
 */

export const INJECTOR_SOURCE = `
(function () {
  var SEEN = window.__TE_IG_SEEN__ || new Set();
  window.__TE_IG_SEEN__ = SEEN;
  var PENDING = window.__TE_IG_PENDING__ || [];
  window.__TE_IG_PENDING__ = PENDING;
  var bootstrapped = window.__TE_IG_BOOTSTRAPPED__ === true;
  var lastSendAt = 0;
  var MIN_SEND_GAP_MS = 4500;
  var lastSentText = '';

  function path() { return location.pathname || ''; }
  function isDirectPage() { return /\\/direct\\//i.test(path()); }
  function isPostPage() { return /\\/(p|reel)\\//i.test(path()); }
  function isInbox() { return /\\/direct\\/inbox/i.test(path()) || path() === '/direct/'; }
  function isThread() { return /\\/direct\\/t\\//i.test(path()); }

  function fingerprint(text, extra) {
    return (String(text).replace(/\\s+/g, ' ').trim().slice(0, 120) + '|' + String(extra || '')).slice(0, 160);
  }

  function markSeen(fp) {
    SEEN.add(fp);
    if (SEEN.size > 1000) SEEN.delete(SEEN.values().next().value);
  }

  function isProbablyOutgoing(el) {
    try {
      var rect = el.getBoundingClientRect();
      var vw = window.innerWidth || 800;
      if (rect.left + rect.width / 2 > vw * 0.52) return true;
    } catch (e) {}
    return false;
  }

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
        if (/^(Send|ارسال|Like|Seen|Active|Message)/i.test(text)) continue;
        // skip our own last sent text fragments
        if (lastSentText && text.indexOf(lastSentText.slice(0, 40)) !== -1) continue;
        out.push({ el: el, text: text });
      }
    }
    return out;
  }

  function scanDms() {
    if (!isDirectPage() || !isThread()) return;
    var nodes = collectDmCandidates().slice(-20);
    for (var i = 0; i < nodes.length; i++) {
      var item = nodes[i];
      var fp = fingerprint(item.text, 'dm');
      if (SEEN.has(fp)) continue;
      markSeen(fp);
      if (!bootstrapped) continue;
      if (isProbablyOutgoing(item.el)) continue;
      PENDING.push({ id: fp, text: item.text, kind: 'dm_incoming', channel: 'dm' });
    }
  }

  function collectComments() {
    var out = [];
    var blocks = document.querySelectorAll('ul ul div, ul li div, section ul div');
    for (var i = 0; i < blocks.length; i++) {
      var root = blocks[i];
      var textEl = root.querySelector('span[dir="auto"]') || root.querySelector('div[dir="auto"]');
      if (!textEl) continue;
      var text = (textEl.innerText || '').trim();
      if (!text || text.length > 800) continue;
      if (/^(Reply|پاسخ|Like|View replies)/i.test(text)) continue;
      var username = '';
      var userLink = root.querySelector('a[href^="/"]');
      if (userLink) {
        var href = userLink.getAttribute('href') || '';
        var m = href.match(/^\\/([A-Za-z0-9._]+)\\/?$/);
        if (m && !/^(p|reel|stories|direct|explore|accounts)$/i.test(m[1])) username = m[1];
      }
      out.push({ root: root, text: text, username: username });
    }
    return out;
  }

  function scanComments() {
    if (!isPostPage()) return;
    var comments = collectComments().slice(-40);
    for (var i = 0; i < comments.length; i++) {
      var c = comments[i];
      var fp = fingerprint((c.username || '') + ':' + c.text, 'cmt');
      if (SEEN.has(fp)) continue;
      markSeen(fp);
      if (!bootstrapped) continue;
      PENDING.push({
        id: fp, text: c.text, kind: 'comment', channel: 'comment',
        username: c.username || '', isMention: /@/.test(c.text), path: path()
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
      inbox: isInbox(),
      thread: isThread(),
      post: isPostPage()
    };
  };

  /** List unread threads in inbox (left column) */
  window.__TE_IG_LIST_UNREAD__ = function () {
    var items = [];
    // Conversation rows in inbox
    var rows = document.querySelectorAll('div[role="listbox"] div[role="button"], a[href*="/direct/t/"], div[role="list"] a[href*="/direct/t/"]');
    if (!rows.length) {
      rows = document.querySelectorAll('a[href*="/direct/t/"]');
    }
    var seenHref = {};
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var href = row.getAttribute('href') || '';
      if (!href) {
        var a = row.querySelector('a[href*="/direct/t/"]');
        if (a) href = a.getAttribute('href') || '';
      }
      if (!href || seenHref[href]) continue;
      seenHref[href] = true;

      // Unread heuristics: bold text, blue dot, aria
      var text = (row.innerText || '').trim();
      var hasUnreadDot = !!row.querySelector('[class*="x1rg5ohu"], span[style*="background"], div[style*="rgb(0, 149, 246)"]');
      var fontWeight = '';
      try {
        var strong = row.querySelector('span, div');
        if (strong) fontWeight = window.getComputedStyle(strong).fontWeight || '';
      } catch (e) {}
      var isBold = parseInt(fontWeight, 10) >= 600 || fontWeight === 'bold';
      var aria = (row.getAttribute('aria-label') || '') + ' ' + text;
      var unreadWord = /unread|خوانده|جدید/i.test(aria);

      // Also treat rows with blue unread indicator children
      var blue = false;
      var dots = row.querySelectorAll('div, span');
      for (var d = 0; d < Math.min(dots.length, 30); d++) {
        try {
          var bg = window.getComputedStyle(dots[d]).backgroundColor || '';
          if (bg.indexOf('0, 149, 246') !== -1 || bg.indexOf('0,149,246') !== -1) { blue = true; break; }
        } catch (e2) {}
      }

      if (hasUnreadDot || isBold || unreadWord || blue) {
        items.push({ href: href, preview: text.slice(0, 80), index: items.length });
      }
    }
    return items;
  };

  window.__TE_IG_OPEN_HREF__ = function (href) {
    if (!href) return false;
    if (href.indexOf('http') === 0) location.href = href;
    else location.href = 'https://www.instagram.com' + href;
    return true;
  };

  window.__TE_IG_GOTO__ = function (urlPath) {
    location.href = 'https://www.instagram.com' + urlPath;
    return true;
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

    // Same text within gap → already sent
    if (lastSentText === text && now - lastSendAt < 15000) {
      return { ok: true, reason: 'already_sent' };
    }
    if (now - lastSendAt < MIN_SEND_GAP_MS) {
      return { ok: true, reason: 'cooldown_ok' }; // treat as success to stop retries
    }

    var box =
      document.querySelector('div[role="textbox"][contenteditable="true"]') ||
      document.querySelector('[contenteditable="true"][role="textbox"]') ||
      document.querySelector('div[contenteditable="true"]') ||
      document.querySelector('textarea');

    if (!box) return { ok: false, reason: 'no_compose' };

    fillAndSend(box, text);
    await new Promise(function (r) { setTimeout(r, 350); });

    var sendBtn =
      document.querySelector('[aria-label="Send"]') ||
      document.querySelector('[aria-label="ارسال"]') ||
      document.querySelector('div[role="button"][aria-label*="Send" i]');

    if (!sendBtn) {
      var buttons = Array.from(document.querySelectorAll('div[role="button"], button'));
      sendBtn = buttons.find(function (b) {
        var t = (b.innerText || b.getAttribute('aria-label') || '').trim();
        return /^(Send|ارسال)$/i.test(t);
      }) || null;
    }

    if (sendBtn) sendBtn.click();
    else {
      try {
        box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
      } catch (e) {}
    }

    lastSendAt = Date.now();
    lastSentText = text;
    // Mark our reply so it is never treated as incoming
    markSeen(fingerprint(text, 'dm'));
    markSeen(fingerprint(text, 'out'));
    return { ok: true };
  };

  window.__TE_IG_REPLY_COMMENT__ = async function (payload) {
    var text = payload && payload.text;
    if (!text) return { ok: false, reason: 'empty' };
    var box =
      document.querySelector('form textarea') ||
      document.querySelector('textarea[placeholder]') ||
      document.querySelector('div[role="textbox"][contenteditable="true"]');
    if (!box) return { ok: false, reason: 'no_comment_box' };
    fillAndSend(box, text);
    await new Promise(function (r) { setTimeout(r, 400); });
    var postBtn = document.querySelector('form button[type="submit"]');
    if (postBtn && !postBtn.disabled) postBtn.click();
    else {
      try {
        box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
      } catch (e) {}
    }
    lastSendAt = Date.now();
    return { ok: true };
  };

  window.__TE_IG_OPEN_DM__ = async function (username) {
    if (!username) return { ok: false };
    location.href = 'https://www.instagram.com/' + encodeURIComponent(username) + '/';
    return { ok: true };
  };

  /** Accept visible follow requests on current page */
  window.__TE_IG_ACCEPT_FOLLOWS__ = async function (followBack) {
    var accepted = 0;
    var buttons = Array.from(document.querySelectorAll('button, div[role="button"]'));
    for (var i = 0; i < buttons.length; i++) {
      var t = (buttons[i].innerText || buttons[i].getAttribute('aria-label') || '').trim();
      if (/^(Confirm|Approve|تأیید|تایید|Accept)$/i.test(t)) {
        buttons[i].click();
        accepted++;
        await new Promise(function (r) { setTimeout(r, 600); });
      }
    }
    if (followBack) {
      // After accept, Follow back buttons may appear
      await new Promise(function (r) { setTimeout(r, 800); });
      buttons = Array.from(document.querySelectorAll('button, div[role="button"]'));
      for (var j = 0; j < buttons.length; j++) {
        var t2 = (buttons[j].innerText || '').trim();
        if (/^(Follow Back|Follow|فالو|دنبال کردن)$/i.test(t2)) {
          buttons[j].click();
          await new Promise(function (r) { setTimeout(r, 500); });
        }
      }
    }
    return { ok: true, accepted: accepted };
  };

  /** Collect notification-like links (comments / mentions) from activity page */
  window.__TE_IG_LIST_ACTIVITY__ = function () {
    var out = [];
    var links = document.querySelectorAll('a[href*="/p/"], a[href*="/reel/"]');
    var seen = {};
    for (var i = 0; i < links.length; i++) {
      var href = links[i].getAttribute('href') || '';
      if (!href || seen[href]) continue;
      seen[href] = true;
      var text = (links[i].innerText || links[i].closest('div') && links[i].closest('div').innerText || '').trim();
      var isComment = /comment|کامنت|ذکر|mention|tagged|تگ/i.test(text);
      out.push({ href: href, text: text.slice(0, 120), isComment: isComment });
    }
    return out.slice(0, 15);
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
