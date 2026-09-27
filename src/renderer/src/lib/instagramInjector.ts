/**
 * Instagram guest injector — resilient DM detection.
 */

export const INJECTOR_SOURCE = `
(function () {
  var SEEN = window.__TE_IG_SEEN__ || new Set();
  window.__TE_IG_SEEN__ = SEEN;
  var PENDING = window.__TE_IG_PENDING__ || [];
  window.__TE_IG_PENDING__ = PENDING;
  var lastSendAt = 0;
  var MIN_SEND_GAP_MS = 4000;
  var lastSentText = '';
  var lastScanInfo = { path: '', dmNodes: 0, queued: 0, thread: false, method: '' };

  function path() { return location.pathname || ''; }
  function isDirectPage() { return /\\/direct\\//i.test(path()); }
  function isPostPage() { return /\\/(p|reel)\\//i.test(path()); }
  function isInbox() { return /\\/direct\\/(inbox)?\\/?$/i.test(path()) || path() === '/direct'; }
  function isThread() {
    return /\\/direct\\/t\\//i.test(path()) ||
      !!document.querySelector('div[role="textbox"][contenteditable="true"]');
  }

  function fingerprint(text, extra) {
    return (String(text).replace(/\\s+/g, ' ').trim().slice(0, 120) + '|' + String(extra || '')).slice(0, 160);
  }

  function markSeen(fp) {
    SEEN.add(fp);
    if (SEEN.size > 1200) SEEN.delete(SEEN.values().next().value);
  }

  function isProbablyOutgoing(el) {
    try {
      var rect = el.getBoundingClientRect();
      var vw = window.innerWidth || 800;
      var mid = rect.left + rect.width / 2;
      if (mid > vw * 0.56) return true;
      if (mid < vw * 0.44) return false;
    } catch (e) {}

    // Background bubble color (sent often has solid tint)
    var node = el;
    for (var i = 0; i < 6 && node; i++) {
      try {
        var bg = window.getComputedStyle(node).backgroundColor || '';
        var m = bg.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/);
        if (m) {
          var r = +m[1], g = +m[2], b = +m[3];
          // skip pure white/black/transparent-ish
          if (r + g + b > 30 && r + g + b < 720) {
            // Instagram sent: often gray-blue / purple-ish on dark theme
            if (Math.abs(r - g) < 40 && Math.abs(g - b) < 40 && r > 40) {
              // neutral gray bubble — could be either; don't decide
            } else if (b > r && b > 100) {
              return true;
            }
          }
        }
      } catch (e2) {}
      node = node.parentElement;
    }
    return false;
  }

  function collectDmCandidates() {
    var out = [];
    var seenEl = new WeakSet();

    function add(el) {
      if (!el || seenEl.has(el)) return;
      seenEl.add(el);
      var text = (el.innerText || el.textContent || '').trim();
      if (!text || text.length < 1 || text.length > 2000) return;
      if (/^(Send|ارسال|Like|Seen|Active|Message|Enter|Online|Offline)/i.test(text)) return;
      if (/^[0-9]{1,2}:[0-9]{2}\\s*(AM|PM)?$/i.test(text)) return;
      if (lastSentText && text === lastSentText) return;
      // skip very short single tokens that are just names? keep them for safety
      out.push({ el: el, text: text });
    }

    var selectors = [
      'div[role="main"] div[dir="auto"]',
      'div[role="list"] div[dir="auto"]',
      'div[role="row"] div[dir="auto"]',
      'div[role="grid"] div[dir="auto"]',
      'main div[dir="auto"]',
      // broader
      'div[role="main"] span[dir="auto"]',
      'div[role="row"] span[dir="auto"]'
    ];

    for (var s = 0; s < selectors.length; s++) {
      var list = document.querySelectorAll(selectors[s]);
      for (var i = 0; i < list.length; i++) add(list[i]);
    }

    // Last resort: any dir=auto inside main that looks like a message bubble
    if (out.length < 2) {
      var all = document.querySelectorAll('[dir="auto"]');
      for (var j = 0; j < all.length; j++) {
        var el = all[j];
        try {
          var r = el.getBoundingClientRect();
          if (r.width < 20 || r.height < 10) continue;
          if (r.top < 80) continue; // header
          add(el);
        } catch (e) {}
      }
    }

    return out;
  }

  function scanDms() {
    // Treat as thread if URL matches OR compose box is visible (open conversation)
    var threadLike = isThread();
    if (!isDirectPage() && !threadLike) {
      lastScanInfo = { path: path(), dmNodes: 0, queued: 0, thread: false, method: 'skip' };
      return;
    }
    if (isInbox() && !document.querySelector('div[role="textbox"][contenteditable="true"]')) {
      lastScanInfo = { path: path(), dmNodes: 0, queued: 0, thread: false, method: 'inbox_only' };
      return;
    }

    var nodes = collectDmCandidates();
    lastScanInfo = { path: path(), dmNodes: nodes.length, queued: 0, thread: true, method: 'tail' };

    if (!nodes.length) return;

    var classified = [];
    for (var i = 0; i < nodes.length; i++) {
      classified.push({
        text: nodes[i].text,
        outgoing: isProbablyOutgoing(nodes[i].el),
        el: nodes[i].el
      });
    }

    var lastOut = -1;
    for (var j = 0; j < classified.length; j++) {
      if (classified[j].outgoing) lastOut = j;
    }

    var startIdx;
    if (lastOut >= 0) {
      startIdx = lastOut + 1;
    } else {
      // no outgoing detected — only the last bubble if not our sent text
      startIdx = Math.max(0, classified.length - 1);
      lastScanInfo.method = 'last_only';
    }

    // If everything after lastOut is empty but we have nodes, force last incoming-looking
    var queuedAny = false;
    for (var k = startIdx; k < classified.length; k++) {
      var item = classified[k];
      if (item.outgoing) continue;
      var fp = fingerprint(item.text, 'dm');
      if (SEEN.has(fp)) continue;
      markSeen(fp);
      if (lastSentText && item.text.indexOf(lastSentText.slice(0, 24)) !== -1) continue;
      PENDING.push({ id: fp, text: item.text, kind: 'dm_incoming', channel: 'dm' });
      lastScanInfo.queued++;
      queuedAny = true;
    }

    // Absolute fallback: last node not equal to lastSentText
    if (!queuedAny && classified.length) {
      var last = classified[classified.length - 1];
      var fp2 = fingerprint(last.text, 'dm');
      if (!SEEN.has(fp2) && !(lastSentText && last.text.indexOf(lastSentText.slice(0, 24)) !== -1)) {
        markSeen(fp2);
        if (!last.outgoing || lastOut < 0) {
          PENDING.push({ id: fp2, text: last.text, kind: 'dm_incoming', channel: 'dm' });
          lastScanInfo.queued++;
          lastScanInfo.method = 'force_last';
        }
      }
    }

    // Mark older as seen
    for (var m = 0; m < startIdx && m < classified.length; m++) {
      markSeen(fingerprint(classified[m].text, 'dm'));
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
      lastScan: lastScanInfo,
      hasCompose: !!document.querySelector('div[role="textbox"][contenteditable="true"], textarea')
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
      var text = (a.innerText || '').replace(/\\s+/g, ' ').trim();
      items.push({ href: href, preview: text.slice(0, 90), index: items.length, reason: 'link' });
      if (items.length >= 10) break;
    }

    // Also collect role=button rows that contain thread links
    if (items.length === 0) {
      var rows = document.querySelectorAll('div[role="button"]');
      for (var r = 0; r < rows.length && items.length < 10; r++) {
        var link = rows[r].querySelector('a[href*="/direct/t/"]');
        if (!link) continue;
        var h = link.getAttribute('href') || '';
        if (!h || seenHref[h]) continue;
        seenHref[h] = true;
        items.push({
          href: h,
          preview: (rows[r].innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 90),
          index: items.length,
          reason: 'row'
        });
      }
    }

    return items;
  };

  /** Prefer click to keep SPA / session; fallback href */
  window.__TE_IG_OPEN_THREAD__ = function (href) {
    if (!href) return { ok: false };
    var anchors = document.querySelectorAll('a[href*="/direct/t/"]');
    for (var i = 0; i < anchors.length; i++) {
      var a = anchors[i];
      var h = a.getAttribute('href') || '';
      if (h === href || h.indexOf(href) !== -1 || href.indexOf(h) !== -1) {
        a.click();
        return { ok: true, via: 'click' };
      }
    }
    if (href.indexOf('http') === 0) location.href = href;
    else location.href = 'https://www.instagram.com' + (href.charAt(0) === '/' ? href : '/' + href);
    return { ok: true, via: 'href' };
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
      var interesting = /mention|mentioned|comment|replied|tagged|کامنت|منشن|پاسخ/i.test(text);
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

  var lastPath = path();
  setInterval(function () {
    if (path() !== lastPath) {
      lastPath = path();
      setTimeout(function () { try { scan(); } catch (e) {} }, 1000);
    }
  }, 700);

  try { scan(); } catch (e) {}
  if (!window.__TE_IG_OBSERVER__) {
    var obs = new MutationObserver(function () { try { scan(); } catch (e) {} });
    if (document.body) obs.observe(document.body, { childList: true, subtree: true });
    window.__TE_IG_OBSERVER__ = obs;
  }
  window.__TE_IG_ASSIST_INJECTED__ = true;
})();
`
