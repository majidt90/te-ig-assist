/**
 * Instagram guest injector.
 * Critical fix: after opening a thread, bootstrap must NOT drop unanswered
 * incoming messages — only messages AFTER our last outgoing are queued.
 */

export const INJECTOR_SOURCE = `
(function () {
  var SEEN = window.__TE_IG_SEEN__ || new Set();
  window.__TE_IG_SEEN__ = SEEN;
  var PENDING = window.__TE_IG_PENDING__ || [];
  window.__TE_IG_PENDING__ = PENDING;
  var lastSendAt = 0;
  var MIN_SEND_GAP_MS = 4500;
  var lastSentText = '';
  var lastScanInfo = { path: '', dmNodes: 0, queued: 0, thread: false };

  function path() { return location.pathname || ''; }
  function isDirectPage() { return /\\/direct\\//i.test(path()); }
  function isPostPage() { return /\\/(p|reel)\\//i.test(path()); }
  function isInbox() { return /\\/direct\\/(inbox)?\\/?$/i.test(path()) || path() === '/direct'; }
  function isThread() { return /\\/direct\\/t\\//i.test(path()); }

  function fingerprint(text, extra) {
    return (String(text).replace(/\\s+/g, ' ').trim().slice(0, 120) + '|' + String(extra || '')).slice(0, 160);
  }

  function markSeen(fp) {
    SEEN.add(fp);
    if (SEEN.size > 1200) SEEN.delete(SEEN.values().next().value);
  }

  /** Outgoing = our bubbles (right side in LTR IG web) */
  function isProbablyOutgoing(el) {
    try {
      var rect = el.getBoundingClientRect();
      var vw = window.innerWidth || 800;
      // Center of bubble in right 40% of viewport
      var mid = rect.left + rect.width / 2;
      if (mid > vw * 0.58) return true;
      if (mid < vw * 0.42) return false;
    } catch (e) {}
    return false;
  }

  function hasBlueUnreadIndicator(root) {
    var nodes = root.querySelectorAll('div, span');
    for (var i = 0; i < Math.min(nodes.length, 40); i++) {
      var el = nodes[i];
      try {
        var st = window.getComputedStyle(el);
        var bg = st.backgroundColor || '';
        var w = parseFloat(st.width) || 0;
        var h = parseFloat(st.height) || 0;
        if (w >= 4 && w <= 14 && h >= 4 && h <= 14) {
          if (/0,?\\s*149,?\\s*246|55,?\\s*151,?\\s*240/.test(bg)) return true;
        }
      } catch (e) {}
    }
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
        if (!text || text.length < 1 || text.length > 1500) continue;
        if (/^(Send|ارسال|Like|Seen|Active now|Active|Message|Enter)/i.test(text)) continue;
        if (/^[0-9]{1,2}:[0-9]{2}/.test(text) && text.length < 14) continue;
        if (lastSentText && text === lastSentText) continue;
        // skip pure username-looking short labels sometimes
        out.push({ el: el, text: text });
      }
    }
    return out;
  }

  /**
   * Core fix:
   * Build ordered list of message-like nodes, find last OUTGOING index,
   * queue every INCOMING message after that (unanswered tail).
   * Older messages only markSeen.
   */
  function scanDms() {
    if (!isDirectPage() || !isThread()) {
      lastScanInfo = { path: path(), dmNodes: 0, queued: 0, thread: false };
      return;
    }

    var nodes = collectDmCandidates();
    lastScanInfo = { path: path(), dmNodes: nodes.length, queued: 0, thread: true };

    if (!nodes.length) return;

    // Determine outgoing/incoming for each
    var classified = [];
    for (var i = 0; i < nodes.length; i++) {
      var outg = isProbablyOutgoing(nodes[i].el);
      classified.push({ text: nodes[i].text, outgoing: outg, el: nodes[i].el });
    }

    // Last outgoing index
    var lastOut = -1;
    for (var j = 0; j < classified.length; j++) {
      if (classified[j].outgoing) lastOut = j;
    }

    // If we never sent in this view, only take the last 1–3 incoming (avoid flooding old history)
    var startIdx = lastOut + 1;
    if (lastOut < 0) {
      // no outgoing visible — only last incoming message
      startIdx = Math.max(0, classified.length - 1);
    }

    for (var k = 0; k < classified.length; k++) {
      var item = classified[k];
      var fp = fingerprint(item.text, 'dm');

      if (k < startIdx || item.outgoing) {
        markSeen(fp);
        continue;
      }

      // incoming after last outgoing
      if (SEEN.has(fp)) continue;
      markSeen(fp);

      // skip if looks like our last sent
      if (lastSentText && item.text.indexOf(lastSentText.slice(0, 30)) !== -1) continue;

      PENDING.push({
        id: fp,
        text: item.text,
        kind: 'dm_incoming',
        channel: 'dm'
      });
      lastScanInfo.queued++;
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
    // unanswered: take last few not yet seen
    for (var i = 0; i < comments.length; i++) {
      var c = comments[i];
      var fp = fingerprint((c.username || '') + ':' + c.text, 'cmt');
      if (SEEN.has(fp)) continue;
      markSeen(fp);
      PENDING.push({
        id: fp, text: c.text, kind: 'comment', channel: 'comment',
        username: c.username || '', isMention: /@/.test(c.text), path: path()
      });
    }
  }

  function scan() {
    try { scanDms(); } catch (e) {}
    try { scanComments(); } catch (e) {}
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
      direct: isDirectPage(),
      inbox: isInbox(),
      thread: isThread(),
      post: isPostPage(),
      lastScan: lastScanInfo
    };
  };

  window.__TE_IG_LIST_UNREAD__ = function () {
    var items = [];
    var seenHref = {};
    var anchors = document.querySelectorAll('a[href*="/direct/t/"]');

    for (var i = 0; i < anchors.length; i++) {
      var a = anchors[i];
      var href = a.getAttribute('href') || '';
      if (!href || seenHref[href]) continue;
      seenHref[href] = true;

      var row = a;
      for (var up = 0; up < 6; up++) {
        if (!row.parentElement) break;
        row = row.parentElement;
        if (row.getAttribute && (row.getAttribute('role') === 'button' || row.getAttribute('role') === 'listitem')) break;
      }

      var text = (row.innerText || a.innerText || '').replace(/\\s+/g, ' ').trim();
      var blue = hasBlueUnreadIndicator(row);
      var bold = false;
      try {
        var spans = row.querySelectorAll('span');
        for (var s = 0; s < Math.min(spans.length, 12); s++) {
          var fw = window.getComputedStyle(spans[s]).fontWeight || '';
          if (parseInt(fw, 10) >= 600 || fw === 'bold') { bold = true; break; }
        }
      } catch (e) {}

      if (blue || bold) {
        items.push({ href: href, preview: text.slice(0, 90), index: items.length, reason: blue ? 'dot' : 'bold' });
      }
    }

    // Always provide top conversations as fallback so walker can open them
    if (items.length === 0) {
      seenHref = {};
      for (var j = 0; j < anchors.length && items.length < 8; j++) {
        var h2 = anchors[j].getAttribute('href') || '';
        if (!h2 || seenHref[h2]) continue;
        seenHref[h2] = true;
        var p2 = (anchors[j].innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 90);
        items.push({ href: h2, preview: p2, index: items.length, reason: 'top' });
      }
    }

    return items;
  };

  window.__TE_IG_OPEN_HREF__ = function (href) {
    if (!href) return false;
    if (href.indexOf('http') === 0) location.href = href;
    else location.href = 'https://www.instagram.com' + (href.charAt(0) === '/' ? href : '/' + href);
    return true;
  };

  window.__TE_IG_GOTO__ = function (urlPath) {
    location.href = 'https://www.instagram.com' + urlPath;
    return true;
  };

  window.__TE_IG_LIST_ACTIVITY__ = function () {
    var out = [];
    var seen = {};
    var links = document.querySelectorAll('a[href*="/p/"], a[href*="/reel/"]');
    for (var i = 0; i < links.length; i++) {
      var link = links[i];
      var href = link.getAttribute('href') || '';
      if (!href || seen[href]) continue;
      seen[href] = true;
      var row = link.closest('div[role="button"]') || link.parentElement;
      var text = '';
      try { text = (row && row.innerText ? row.innerText : link.innerText || '').replace(/\\s+/g, ' ').trim(); } catch (e) {}
      var interesting = /mention|mentioned|comment|replied|tagged|کامنت|منشن|پاسخ|ذکر/i.test(text);
      out.push({ href: href, text: text.slice(0, 140), isComment: true, score: interesting ? 2 : 1 });
    }
    out.sort(function (a, b) { return (b.score || 0) - (a.score || 0); });
    return out.slice(0, 12);
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
    if (lastSentText === text && now - lastSendAt < 15000) return { ok: true, reason: 'already_sent' };
    if (now - lastSendAt < MIN_SEND_GAP_MS) return { ok: true, reason: 'cooldown_ok' };

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
      document.querySelector('[aria-label="ارسال"]');
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
    markSeen(fingerprint(text, 'dm'));
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

  window.__TE_IG_OPEN_ACTIVITY_UI__ = function () {
    var links = document.querySelectorAll('a[href="/accounts/activity/"], a[href*="activity"], a[href="/notifications/"]');
    if (links.length) { links[0].click(); return true; }
    var nav = document.querySelectorAll('a[role="link"], div[role="link"]');
    for (var i = 0; i < nav.length; i++) {
      var al = (nav[i].getAttribute('aria-label') || '') + ' ' + (nav[i].innerText || '');
      if (/notification|activity|فعالیت|اعلان/i.test(al)) {
        nav[i].click();
        return true;
      }
    }
    location.href = 'https://www.instagram.com/accounts/activity/';
    return true;
  };

  // Force re-scan when path changes without full reload (SPA)
  var lastPath = path();
  setInterval(function () {
    if (path() !== lastPath) {
      lastPath = path();
      // allow DOM to settle then scan — unanswered tail logic handles history
      setTimeout(function () { try { scan(); } catch (e) {} }, 1200);
    }
  }, 800);

  try { scan(); } catch (e) {}
  if (!window.__TE_IG_OBSERVER__) {
    var obs = new MutationObserver(function () { try { scan(); } catch (e) {} });
    if (document.body) obs.observe(document.body, { childList: true, subtree: true });
    window.__TE_IG_OBSERVER__ = obs;
  }
  window.__TE_IG_ASSIST_INJECTED__ = true;
})();
`
