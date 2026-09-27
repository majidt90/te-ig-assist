/**
 * Instagram injector — unread DM scan, attachment detect, heart react.
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
  var lastScanInfo = { path: '', dmNodes: 0, queued: 0, thread: false, method: '', peer: '', hasAttachment: false };

  function path() { return location.pathname || ''; }
  function isDirectPage() { return /\\/direct\\//i.test(path()); }
  function isPostPage() { return /\\/(p|reel)\\//i.test(path()); }
  function isInbox() {
    var p = path();
    return p === '/direct/inbox/' || p === '/direct/inbox' || p === '/direct/' || p === '/direct';
  }
  function hasCompose() {
    return !!document.querySelector('div[role="textbox"][contenteditable="true"], [contenteditable="true"][role="textbox"], textarea');
  }
  function isThread() {
    return /\\/direct\\/t\\//i.test(path()) || (isDirectPage() && hasCompose() && !isInbox());
  }

  function fingerprint(text, extra) {
    return (String(text).replace(/\\s+/g, ' ').trim().slice(0, 120) + '|' + String(extra || '')).slice(0, 160);
  }
  function markSeen(fp) {
    SEEN.add(fp);
    if (SEEN.size > 1500) SEEN.delete(SEEN.values().next().value);
  }

  function getThreadUsername() {
    var blocked = /^(p|reel|stories|direct|explore|accounts|inbox|t|reels|about|legal)$/i;
    var scopes = [
      document.querySelector('div[role="main"] header'),
      document.querySelector('section header'),
      document.querySelector('header')
    ];
    for (var s = 0; s < scopes.length; s++) {
      var root = scopes[s];
      if (!root) continue;
      var links = root.querySelectorAll('a[href^="/"]');
      for (var i = 0; i < links.length; i++) {
        var href = links[i].getAttribute('href') || '';
        var m = href.match(/^\\/([A-Za-z0-9._]+)\\/?$/);
        if (m && !blocked.test(m[1])) return m[1];
      }
    }
    var all = document.querySelectorAll('div[role="main"] a[href^="/"]');
    for (var j = 0; j < Math.min(all.length, 20); j++) {
      try {
        var r = all[j].getBoundingClientRect();
        if (r.top > 140) continue;
        var h = all[j].getAttribute('href') || '';
        var m2 = h.match(/^\\/([A-Za-z0-9._]+)\\/?$/);
        if (m2 && !blocked.test(m2[1])) return m2[1];
      } catch (e) {}
    }
    return '';
  }

  function usernameFromPreview(preview) {
    var t = (preview || '').trim();
    var first = (t.split(/\\s+/)[0] || '').replace(/^@/, '');
    if (/^[A-Za-z0-9._]{2,30}$/.test(first)) return first;
    return '';
  }

  function isProbablyOutgoing(el) {
    try {
      var rect = el.getBoundingClientRect();
      var vw = window.innerWidth || 800;
      var mid = rect.left + rect.width / 2;
      if (mid > vw * 0.55) return true;
      if (mid < vw * 0.45) return false;
    } catch (e) {}
    return false;
  }

  function detectAttachmentInThread() {
    var main = document.querySelector('div[role="main"]') || document.body;
    if (!main) return false;
    if (main.querySelector('a[href*="/p/"], a[href*="/reel/"]')) return true;
    if (main.querySelector('img[src*="instagram"], img[src*="cdninstagram"]')) {
      var imgs = main.querySelectorAll('img');
      for (var i = 0; i < Math.min(imgs.length, 40); i++) {
        try {
          var r = imgs[i].getBoundingClientRect();
          if (r.width > 120 && r.height > 120 && r.top > 80) return true;
        } catch (e) {}
      }
    }
    var t = (main.innerText || '');
    if (/sent an attachment|shared a post|shared a reel|یک پست|پیوست/i.test(t)) return true;
    return false;
  }

  function hasBlueUnreadIndicator(root) {
    var nodes = root.querySelectorAll('div, span');
    for (var i = 0; i < Math.min(nodes.length, 50); i++) {
      var el = nodes[i];
      try {
        var st = window.getComputedStyle(el);
        var bg = st.backgroundColor || '';
        var w = parseFloat(st.width) || 0;
        var h = parseFloat(st.height) || 0;
        if (w >= 4 && w <= 16 && h >= 4 && h <= 16) {
          if (/0,?\\s*149,?\\s*246|55,?\\s*151,?\\s*240/.test(bg)) return true;
        }
      } catch (e) {}
    }
    return false;
  }

  function isYouSentPreview(text) {
    return /you sent|شما ارسال|شما فرستاد/i.test(text || '');
  }

  function isUnreadRow(row) {
    if (!row) return false;
    var preview = (row.innerText || '').replace(/\\s+/g, ' ');
    if (isYouSentPreview(preview) && !/\\d+\\s*new message/i.test(preview) && !/Unread/i.test(preview)) {
      return false;
    }
    if (hasBlueUnreadIndicator(row)) return true;
    if (/\\d+\\s*new message|Unread|خوانده\\s*نشده|نخوانده/i.test(preview)) return true;
    var aria = row.getAttribute('aria-label') || '';
    if (/unread|خوانده|نخوانده|new message/i.test(aria)) return true;
    try {
      var spans = row.querySelectorAll('span');
      var boldCount = 0;
      for (var s = 0; s < Math.min(spans.length, 15); s++) {
        var fw = window.getComputedStyle(spans[s]).fontWeight || '';
        if (parseInt(fw, 10) >= 600 || fw === 'bold') boldCount++;
      }
      if (boldCount >= 2 && !isYouSentPreview(preview)) return true;
    } catch (e) {}
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
      if (/^(Send|ارسال|Like|Seen|Active now|Message|Enter|Online|View profile)/i.test(text)) return;
      if (/^[0-9]{1,2}:[0-9]{2}/.test(text) && text.length < 14) return;
      if (lastSentText && text === lastSentText) return;
      if (text.length > 400 && /instagram|meta/i.test(text)) return;
      out.push({ el: el, text: text });
    }
    var selectors = [
      'div[role="main"] div[dir="auto"]',
      'div[role="main"] span[dir="auto"]',
      'div[role="list"] div[dir="auto"]',
      'div[role="row"] div[dir="auto"]',
      'main div[dir="auto"]',
      'div[role="main"] div[role="button"] div',
      'div[role="main"] li div'
    ];
    for (var s = 0; s < selectors.length; s++) {
      var list = document.querySelectorAll(selectors[s]);
      for (var i = 0; i < list.length; i++) add(list[i]);
    }
    return out;
  }

  function queueIncomingFromNodes(nodes, forceLast) {
    var peer = getThreadUsername();
    var classified = nodes.map(function (n) {
      return { text: n.text, outgoing: isProbablyOutgoing(n.el) };
    });
    var lastOut = -1;
    for (var j = 0; j < classified.length; j++) {
      if (classified[j].outgoing) lastOut = j;
    }
    var startIdx = lastOut >= 0 ? lastOut + 1 : Math.max(0, classified.length - 1);
    var queued = 0;

    for (var k = startIdx; k < classified.length; k++) {
      var item = classified[k];
      if (item.outgoing) continue;
      var fp = fingerprint(item.text, 'dm');
      if (!forceLast && SEEN.has(fp)) continue;
      markSeen(fp);
      if (lastSentText && item.text.indexOf(lastSentText.slice(0, 24)) !== -1) continue;
      PENDING.push({
        id: fp + (forceLast ? '|f' : ''),
        text: item.text,
        kind: 'dm_incoming',
        channel: 'dm',
        username: peer
      });
      queued++;
    }

    if (forceLast && queued === 0 && classified.length) {
      for (var i = classified.length - 1; i >= 0; i--) {
        if (classified[i].outgoing) continue;
        var fp2 = fingerprint(classified[i].text, 'dm');
        markSeen(fp2);
        PENDING.push({
          id: fp2 + '|force',
          text: classified[i].text,
          kind: 'dm_incoming',
          channel: 'dm',
          username: peer
        });
        queued++;
        break;
      }
    }

    for (var m = 0; m < startIdx && m < classified.length; m++) {
      markSeen(fingerprint(classified[m].text, 'dm'));
    }
    lastScanInfo.peer = peer;
    return queued;
  }

  function scanDms(force) {
    if (!isDirectPage() && !hasCompose()) {
      lastScanInfo = { path: path(), dmNodes: 0, queued: 0, thread: false, method: 'skip', peer: '', hasAttachment: false };
      return;
    }
    if (isInbox() && !hasCompose()) {
      lastScanInfo = { path: path(), dmNodes: 0, queued: 0, thread: false, method: 'inbox_only', peer: '', hasAttachment: false };
      return;
    }
    var nodes = collectDmCandidates();
    var hasAtt = detectAttachmentInThread();
    lastScanInfo = {
      path: path(),
      dmNodes: nodes.length,
      queued: 0,
      thread: true,
      method: force ? 'force' : 'tail',
      peer: '',
      hasAttachment: hasAtt
    };
    if (!nodes.length) return;
    lastScanInfo.queued = queueIncomingFromNodes(nodes, !!force);
  }

  function scanComments() {
    if (!isPostPage()) return;
    var blocks = document.querySelectorAll('ul ul div, ul li div, section ul div');
    for (var i = 0; i < Math.min(blocks.length, 50); i++) {
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
      var fp = fingerprint((username || '') + ':' + text, 'cmt');
      if (SEEN.has(fp)) continue;
      markSeen(fp);
      PENDING.push({
        id: fp, text: text, kind: 'comment', channel: 'comment',
        username: username, isMention: /@/.test(text), path: path()
      });
    }
  }

  function scan() {
    try { scanDms(false); } catch (e) {}
    try { scanComments(); } catch (e) {}
  }

  window.__TE_IG_FORCE_SCAN_THREAD__ = function () {
    try { scanDms(true); } catch (e) {}
    return lastScanInfo;
  };

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
      hasCompose: hasCompose(),
      peer: getThreadUsername(),
      lastScan: lastScanInfo
    };
  };

  function collectUnreadRows() {
    var rows = [];
    var anchors = document.querySelectorAll('a[href*="/direct/t/"]');
    var seenHref = {};
    for (var i = 0; i < anchors.length; i++) {
      var a = anchors[i];
      var href = a.getAttribute('href') || '';
      if (!href || seenHref[href]) continue;
      var row = a.closest('[role="button"]') || a.parentElement || a;
      if (!isUnreadRow(row)) continue;
      var preview = (row.innerText || '').replace(/\\s+/g, ' ').trim();
      if (isYouSentPreview(preview) && !/\\d+\\s*new message/i.test(preview) && !hasBlueUnreadIndicator(row)) continue;
      seenHref[href] = true;
      rows.push({
        el: a,
        href: href,
        preview: preview.slice(0, 120),
        username: usernameFromPreview(preview)
      });
    }
    if (!rows.length) {
      var candidates = document.querySelectorAll(
        '[role="listbox"] [role="button"], [role="list"] [role="button"], div[role="button"]'
      );
      for (var r = 0; r < candidates.length; r++) {
        var el = candidates[r];
        try {
          var rect = el.getBoundingClientRect();
          if (rect.height < 40 || rect.height > 140) continue;
          if (rect.left > (window.innerWidth || 800) * 0.55) continue;
        } catch (e) { continue; }
        if (!isUnreadRow(el)) continue;
        var prev = (el.innerText || '').replace(/\\s+/g, ' ').trim();
        if (isYouSentPreview(prev) && !/\\d+\\s*new message/i.test(prev)) continue;
        rows.push({ el: el, href: '', preview: prev.slice(0, 120), username: usernameFromPreview(prev) });
      }
    }
    return rows;
  }

  window.__TE_IG_LIST_CONVERSATIONS__ = function () {
    var rows = collectUnreadRows();
    return rows.map(function (r, idx) {
      return { index: idx, preview: r.preview, href: r.href, unread: true, username: r.username || '' };
    });
  };

  window.__TE_IG_LIST_UNREAD__ = window.__TE_IG_LIST_CONVERSATIONS__;

  window.__TE_IG_OPEN_FIRST_UNREAD__ = function () {
    var rows = collectUnreadRows();
    if (!rows.length) return { ok: false, reason: 'no_unread', total: 0 };
    rows[0].el.click();
    return {
      ok: true,
      via: 'first_unread',
      total: rows.length,
      preview: rows[0].preview,
      username: rows[0].username || ''
    };
  };

  window.__TE_IG_OPEN_CONV_INDEX__ = function (index) {
    var rows = collectUnreadRows();
    if (!rows[index]) return { ok: false, reason: 'no_unread', total: rows.length };
    rows[index].el.click();
    return {
      ok: true,
      via: 'index',
      total: rows.length,
      preview: rows[index].preview,
      username: rows[index].username || ''
    };
  };

  window.__TE_IG_OPEN_HREF__ = function (href) {
    if (!href) return false;
    if (href.indexOf('http') === 0) location.href = href;
    else location.href = 'https://www.instagram.com' + (href.charAt(0) === '/' ? href : '/' + href);
    return true;
  };

  window.__TE_IG_GOTO_INBOX__ = function () {
    try {
      var selectors = [
        'a[href="/direct/inbox/"]',
        'a[href="/direct/inbox"]',
        'a[href*="/direct/inbox"]',
        'a[href="/direct/"]',
        'svg[aria-label="Messenger"]',
        'svg[aria-label="Direct"]',
        'a[aria-label*="Direct"]',
        'a[aria-label*="Messenger"]',
        'a[aria-label*="پیام"]'
      ];
      for (var i = 0; i < selectors.length; i++) {
        var el = document.querySelector(selectors[i]);
        if (!el) continue;
        var clickable = el.closest('a') || el.closest('[role="link"]') || el.closest('[role="button"]') || el;
        try { clickable.click(); return { ok: true, via: 'click:' + selectors[i] }; } catch (e) {}
      }
      try {
        history.pushState({}, '', '/direct/inbox/');
        window.dispatchEvent(new PopStateEvent('popstate'));
        return { ok: true, via: 'pushState' };
      } catch (e2) {}
      location.href = 'https://www.instagram.com/direct/inbox/';
      return { ok: true, via: 'location' };
    } catch (e) {
      return { ok: false, reason: String(e) };
    }
  };

  window.__TE_IG_GOTO_ACTIVITY__ = function () {
    try {
      var links = document.querySelectorAll('a[href="/accounts/activity/"], a[href*="activity"], a[href="/notifications/"]');
      if (links.length) { links[0].click(); return { ok: true, via: 'click' }; }
      location.href = 'https://www.instagram.com/accounts/activity/';
      return { ok: true, via: 'location' };
    } catch (e) {
      return { ok: false };
    }
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

  window.__TE_IG_LIKE_SHARED__ = function () {
    var buttons = document.querySelectorAll('[aria-label="Like"], [aria-label="پسندیدن"], [aria-label*="Like"]');
    for (var i = 0; i < buttons.length; i++) {
      try { buttons[i].click(); return { ok: true, via: 'like' }; } catch (e) {}
    }
    return { ok: false, reason: 'no_like_btn' };
  };

  window.__TE_IG_REACT_HEART__ = async function () {
    var main = document.querySelector('div[role="main"]') || document.body;
    var labels = main.querySelectorAll('[aria-label], div[role="button"], button');
    for (var i = 0; i < labels.length; i++) {
      var al = (labels[i].getAttribute('aria-label') || labels[i].innerText || '').trim();
      if (/^(Love|Heart|❤️|❤|قلب|واکنش|React)$/i.test(al) || /React with love/i.test(al)) {
        try { labels[i].click(); return { ok: true, via: 'aria' }; } catch (e) {}
      }
    }
    var targets = main.querySelectorAll('img, div[dir="auto"], div[role="button"]');
    var best = null;
    var bestArea = 0;
    var vw = window.innerWidth || 800;
    for (var t = 0; t < targets.length; t++) {
      try {
        var el = targets[t];
        var r = el.getBoundingClientRect();
        if (r.width < 80 || r.height < 40) continue;
        if (r.top < 100) continue;
        var mid = r.left + r.width / 2;
        if (mid > vw * 0.55) continue;
        var area = r.width * r.height;
        if (area > bestArea) { bestArea = area; best = el; }
      } catch (e) {}
    }
    if (best) {
      try {
        best.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, view: window }));
        await new Promise(function (r) { setTimeout(r, 400); });
        var tray = document.querySelectorAll('[aria-label], span, div[role="button"]');
        for (var k = 0; k < tray.length; k++) {
          var tx = (tray[k].getAttribute('aria-label') || tray[k].textContent || '').trim();
          if (/❤|❤️|Love|Heart|قلب/.test(tx)) {
            tray[k].click();
            return { ok: true, via: 'dblclick_tray' };
          }
        }
        return { ok: true, via: 'dblclick' };
      } catch (e) {}
    }
    var like = window.__TE_IG_LIKE_SHARED__();
    if (like && like.ok) return { ok: true, via: 'like_fallback' };
    return { ok: false, reason: 'no_react_target' };
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
      document.querySelector('textarea');
    if (!box) return { ok: false, reason: 'no_box' };
    fillAndSend(box, text);
    await new Promise(function (r) { setTimeout(r, 200); });
    var sendBtn = null;
    var buttons = document.querySelectorAll('div[role="button"], button');
    for (var i = 0; i < buttons.length; i++) {
      var t = (buttons[i].innerText || buttons[i].getAttribute('aria-label') || '').trim();
      if (/^(Send|ارسال)$/i.test(t)) { sendBtn = buttons[i]; break; }
    }
    if (sendBtn) {
      try { sendBtn.click(); } catch (e) {}
    } else {
      box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
    }
    lastSendAt = Date.now();
    lastSentText = text;
    return { ok: true };
  };

  window.__TE_IG_SEND_COMMENT_REPLY__ = window.__TE_IG_SEND_REPLY__;

  window.__TE_IG_OPEN_ACTIVITY_UI__ = function () {
    var links = document.querySelectorAll('a[href="/accounts/activity/"], a[href*="activity"], a[href="/notifications/"]');
    if (links.length) { links[0].click(); return true; }
    location.href = 'https://www.instagram.com/accounts/activity/';
    return true;
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
