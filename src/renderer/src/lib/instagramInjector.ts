/**
 * Instagram injector — robust unread DM scan for current IG web DOM.
 */

export const INJECTOR_SOURCE = `
(function () {
  var SEEN = window.__TE_IG_SEEN__ || new Set();
  window.__TE_IG_SEEN__ = SEEN;
  var PENDING = window.__TE_IG_PENDING__ || [];
  window.__TE_IG_PENDING__ = PENDING;
  var lastSendAt = 0;
  var MIN_SEND_GAP_MS = 3500;
  var lastSentText = '';
  var lastScanInfo = { path: '', dmNodes: 0, queued: 0, thread: false, method: '', peer: '', hasAttachment: false, listDebug: '' };

  function path() { return location.pathname || ''; }
  function isDirectPage() { return /\\/direct\\//i.test(path()); }
  function isPostPage() { return /\\/(p|reel)\\//i.test(path()); }
  function isInbox() {
    var p = path();
    return p === '/direct/inbox/' || p === '/direct/inbox' || p === '/direct/' || p === '/direct' ||
      (p.indexOf('/direct/') === 0 && p.indexOf('/direct/t/') !== 0);
  }
  function hasCompose() { return !!findComposeBox(); }
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
    return '';
  }

  function usernameFromPreview(preview) {
    var t = (preview || '').replace(/\\s+/g, ' ').trim();
    var at = t.match(/@([A-Za-z0-9._]{2,30})/);
    if (at) return at[1];
    var eng = t.match(/\\b([A-Za-z][A-Za-z0-9._]{1,28})\\b/g) || [];
    for (var i = 0; i < eng.length; i++) {
      var w = eng[i];
      if (/^(Unread|Reacted|You|Sent|Messages?|Active|Online|Attachment|Liked|Message|New|Requests)$/i.test(w)) continue;
      return w;
    }
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
    var imgs = main.querySelectorAll('img');
    for (var i = 0; i < Math.min(imgs.length, 40); i++) {
      try {
        var r = imgs[i].getBoundingClientRect();
        if (r.width > 120 && r.height > 120 && r.top > 80) return true;
      } catch (e) {}
    }
    var t = (main.innerText || '');
    if (/sent an attachment|shared a post|shared a reel|یک پست|پیوست/i.test(t)) return true;
    return false;
  }

  function hasBlueUnreadIndicator(root) {
    if (!root) return false;
    var nodes = root.querySelectorAll('div, span, i, canvas');
    for (var i = 0; i < Math.min(nodes.length, 80); i++) {
      var el = nodes[i];
      try {
        var st = window.getComputedStyle(el);
        var bg = (st.backgroundColor || '').replace(/\\s/g, '');
        var w = parseFloat(st.width) || el.offsetWidth || 0;
        var h = parseFloat(st.height) || el.offsetHeight || 0;
        if (w < 3 || w > 22 || h < 3 || h > 22) continue;
        var m = bg.match(/rgba?\\((\\d+),(\\d+),(\\d+)/);
        if (!m) continue;
        var r = +m[1], g = +m[2], b = +m[3];
        if (b > 180 && g > 100 && g < 200 && r < 100) return true;
        if (r < 80 && g > 120 && g < 190 && b > 220) return true;
      } catch (e) {}
    }
    return false;
  }

  function isYouSentPreview(text) {
    var t = (text || '').replace(/\\s+/g, ' ');
    if (/\\bYou:\\s/i.test(t)) return true;
    if (/\\bYou sent\\b/i.test(t)) return true;
    if (/شما:\\s/.test(t)) return true;
    if (/شما ارسال|شما فرستاد|شما ارسال کردید/.test(t)) return true;
    return false;
  }

  function rowLooksLikeConversation(el) {
    try {
      var r = el.getBoundingClientRect();
      if (r.height < 48 || r.height > 160) return false;
      if (r.width < 120) return false;
      if (r.left > (window.innerWidth || 900) * 0.55) return false;
      if (r.top < 40) return false;
      return true;
    } catch (e) { return false; }
  }

  function scoreUnreadRow(row, preview) {
    var score = 0;
    var p = (preview || '').replace(/\\s+/g, ' ').trim();
    if (!p || p.length < 2) return 0;
    if (isYouSentPreview(p)) return 0;
    var hard = 0;
    if (hasBlueUnreadIndicator(row)) hard += 6;
    if (/\\d+\\s*new message/i.test(p)) hard += 5;
    if (/\\bUnread\\b|خوانده\\s*نشده|نخوانده/i.test(p)) hard += 5;
    var aria = row.getAttribute('aria-label') || '';
    if (/unread|خوانده|نخوانده|new message/i.test(aria)) hard += 5;
    score += hard;
    try {
      var spans = row.querySelectorAll('span');
      var bold = 0;
      for (var s = 0; s < Math.min(spans.length, 20); s++) {
        var fw = window.getComputedStyle(spans[s]).fontWeight || '';
        if (parseInt(fw, 10) >= 600 || fw === 'bold') bold++;
      }
      if (bold >= 1) score += 1;
    } catch (e) {}
    if (hard === 0) return 0;
    return score;
  }

  function collectUnreadRows() {
    var rows = [];
    var seenKey = {};
    var debugCounts = { anchors: 0, buttons: 0, scored: 0 };
    function pushRow(clickEl, href, preview, score) {
      var key = (href || '') + '|' + (preview || '').slice(0, 40);
      if (seenKey[key]) return;
      seenKey[key] = true;
      rows.push({ el: clickEl, href: href || '', preview: (preview || '').slice(0, 140), username: usernameFromPreview(preview || ''), score: score });
      debugCounts.scored++;
    }
    var anchors = document.querySelectorAll('a[href*="/direct/t/"]');
    debugCounts.anchors = anchors.length;
    for (var i = 0; i < anchors.length; i++) {
      var a = anchors[i];
      var href = a.getAttribute('href') || '';
      if (!href) continue;
      var row = a.closest('[role="button"]') || a.closest('[role="listitem"]') || a.closest('div[tabindex]') || a.parentElement || a;
      if (!rowLooksLikeConversation(row) && !rowLooksLikeConversation(a)) continue;
      var preview = (row.innerText || a.innerText || '').replace(/\\s+/g, ' ').trim();
      var score = scoreUnreadRow(row, preview);
      if (score >= 4) pushRow(a, href, preview, score);
    }
    if (rows.length === 0) {
      var candidates = document.querySelectorAll('[role="listbox"] [role="button"], [role="list"] [role="button"], div[role="button"], div[role="listitem"]');
      debugCounts.buttons = candidates.length;
      for (var r = 0; r < candidates.length; r++) {
        var el = candidates[r];
        if (!rowLooksLikeConversation(el)) continue;
        var prev = (el.innerText || '').replace(/\\s+/g, ' ').trim();
        if (!prev || prev.length < 3) continue;
        if (/^(Messages|Requests|Primary|General|پیام|درخواست)/i.test(prev) && prev.length < 24) continue;
        var sc = scoreUnreadRow(el, prev);
        if (sc >= 4) {
          var link = el.querySelector('a[href*="/direct/t/"]');
          pushRow(link || el, link ? (link.getAttribute('href') || '') : '', prev, sc);
        }
      }
    }
    rows.sort(function (a, b) { return (b.score || 0) - (a.score || 0); });
    lastScanInfo.listDebug = 'a=' + debugCounts.anchors + ' b=' + debugCounts.buttons + ' hit=' + rows.length;
    return rows;
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
      out.push({ el: el, text: text });
    }
    var selectors = ['div[role="main"] div[dir="auto"]','div[role="main"] span[dir="auto"]','div[role="list"] div[dir="auto"]','div[role="row"] div[dir="auto"]','main div[dir="auto"]'];
    for (var s = 0; s < selectors.length; s++) {
      var list = document.querySelectorAll(selectors[s]);
      for (var i = 0; i < list.length; i++) add(list[i]);
    }
    return out;
  }

  function queueIncomingFromNodes(nodes, forceLast) {
    var peer = getThreadUsername();
    var classified = nodes.map(function (n) { return { text: n.text, outgoing: isProbablyOutgoing(n.el) }; });
    var lastOut = -1;
    for (var j = 0; j < classified.length; j++) { if (classified[j].outgoing) lastOut = j; }
    var startIdx = lastOut >= 0 ? lastOut + 1 : Math.max(0, classified.length - 1);
    var queued = 0;
    for (var k = startIdx; k < classified.length; k++) {
      var item = classified[k];
      if (item.outgoing) continue;
      var fp = fingerprint(item.text, 'dm');
      if (!forceLast && SEEN.has(fp)) continue;
      markSeen(fp);
      PENDING.push({ id: fp + (forceLast ? '|f' : ''), text: item.text, kind: 'dm_incoming', channel: 'dm', username: peer });
      queued++;
    }
    if (forceLast && queued === 0 && classified.length) {
      for (var i = classified.length - 1; i >= 0; i--) {
        if (classified[i].outgoing) continue;
        var fp2 = fingerprint(classified[i].text, 'dm');
        markSeen(fp2);
        PENDING.push({ id: fp2 + '|force', text: classified[i].text, kind: 'dm_incoming', channel: 'dm', username: peer });
        queued++;
        break;
      }
    }
    lastScanInfo.peer = peer;
    return queued;
  }

  function scanDms(force) {
    if (!isDirectPage() && !hasCompose()) {
      lastScanInfo = { path: path(), dmNodes: 0, queued: 0, thread: false, method: 'skip', peer: '', hasAttachment: false, listDebug: lastScanInfo.listDebug || '' };
      return;
    }
    if (isInbox() && !hasCompose()) {
      lastScanInfo = { path: path(), dmNodes: 0, queued: 0, thread: false, method: 'inbox_only', peer: '', hasAttachment: false, listDebug: lastScanInfo.listDebug || '' };
      return;
    }
    var nodes = collectDmCandidates();
    var hasAtt = detectAttachmentInThread();
    lastScanInfo = { path: path(), dmNodes: nodes.length, queued: 0, thread: true, method: force ? 'force' : 'tail', peer: '', hasAttachment: hasAtt, listDebug: lastScanInfo.listDebug || '' };
    if (!nodes.length) {
      if (force && hasAtt) {
        var peer0 = getThreadUsername();
        var fpA = fingerprint('shared_post_attachment', 'att');
        markSeen(fpA);
        PENDING.push({ id: fpA + '|att', text: 'shared_post attachment', kind: 'dm_incoming', channel: 'dm', username: peer0 });
        lastScanInfo.queued = 1;
        lastScanInfo.peer = peer0;
      }
      return;
    }
    lastScanInfo.queued = queueIncomingFromNodes(nodes, !!force);
    if (force && hasAtt && lastScanInfo.queued === 0) {
      var peer1 = getThreadUsername();
      var fpB = fingerprint('shared_post_attachment', 'att2');
      markSeen(fpB);
      PENDING.push({ id: fpB + '|att', text: 'shared_post attachment', kind: 'dm_incoming', channel: 'dm', username: peer1 });
      lastScanInfo.queued = 1;
    }
  }

  function scan() { try { scanDms(false); } catch (e) {} }

  window.__TE_IG_FORCE_SCAN_THREAD__ = function () { try { scanDms(true); } catch (e) {} return lastScanInfo; };
  window.__TE_IG_POLL__ = function () {
    try { scan(); } catch (e) {}
    var out = PENDING.slice(); PENDING.length = 0; window.__TE_IG_PENDING__ = PENDING; return out;
  };
  window.__TE_IG_STATUS__ = function () {
    return { ready: true, path: path(), seen: SEEN.size, direct: isDirectPage(), inbox: isInbox(), thread: isThread(), post: isPostPage(), hasCompose: hasCompose(), peer: getThreadUsername(), lastScan: lastScanInfo };
  };
  window.__TE_IG_LIST_CONVERSATIONS__ = function () {
    return collectUnreadRows().map(function (r, idx) {
      return { index: idx, preview: r.preview, href: r.href, unread: true, username: r.username || '', score: r.score || 0, debug: lastScanInfo.listDebug || '' };
    });
  };
  window.__TE_IG_LIST_UNREAD__ = window.__TE_IG_LIST_CONVERSATIONS__;
  window.__TE_IG_OPEN_FIRST_UNREAD__ = function () {
    var rows = collectUnreadRows();
    if (!rows.length) return { ok: false, reason: 'no_unread', total: 0, debug: lastScanInfo.listDebug || '' };
    try { rows[0].el.click(); } catch (e) { return { ok: false, reason: 'click_fail', total: rows.length, debug: lastScanInfo.listDebug || '' }; }
    return { ok: true, via: 'first_unread', total: rows.length, preview: rows[0].preview, username: rows[0].username || '', score: rows[0].score || 0, debug: lastScanInfo.listDebug || '' };
  };
  window.__TE_IG_OPEN_CONV_INDEX__ = function (index) {
    var rows = collectUnreadRows();
    if (!rows[index]) return { ok: false, reason: 'no_unread', total: rows.length, debug: lastScanInfo.listDebug || '' };
    try { rows[index].el.click(); } catch (e) { return { ok: false, reason: 'click_fail', total: rows.length }; }
    return { ok: true, via: 'index', total: rows.length, preview: rows[index].preview, username: rows[index].username || '', score: rows[index].score || 0 };
  };
  window.__TE_IG_GOTO_INBOX__ = function () {
    try {
      var selectors = ['a[href="/direct/inbox/"]','a[href*="/direct/inbox"]','svg[aria-label="Messenger"]','a[aria-label*="Direct"]','a[aria-label*="Messenger"]','a[aria-label*="پیام"]'];
      for (var i = 0; i < selectors.length; i++) {
        var el = document.querySelector(selectors[i]);
        if (!el) continue;
        var clickable = el.closest('a') || el.closest('[role="link"]') || el.closest('[role="button"]') || el;
        try { clickable.click(); return { ok: true, via: 'click' }; } catch (e) {}
      }
      location.href = 'https://www.instagram.com/direct/inbox/';
      return { ok: true, via: 'location' };
    } catch (e) { return { ok: false }; }
  };
  window.__TE_IG_GOTO__ = function (urlPath) { location.href = 'https://www.instagram.com' + urlPath; return true; };
  window.__TE_IG_OPEN_ACTIVITY_UI__ = function () {
    var links = document.querySelectorAll('a[href="/accounts/activity/"], a[href*="activity"]');
    if (links.length) { links[0].click(); return true; }
    location.href = 'https://www.instagram.com/accounts/activity/';
    return true;
  };
  window.__TE_IG_LIKE_SHARED__ = function () {
    var buttons = document.querySelectorAll('[aria-label="Like"], [aria-label*="Like"]');
    for (var i = 0; i < buttons.length; i++) { try { buttons[i].click(); return { ok: true }; } catch (e) {} }
    return { ok: false };
  };
  window.__TE_IG_REACT_HEART__ = async function () {
    var main = document.querySelector('div[role="main"]') || document.body;
    var targets = main.querySelectorAll('img, div[dir="auto"]');
    var best = null, bestArea = 0, vw = window.innerWidth || 800;
    for (var t = 0; t < targets.length; t++) {
      try {
        var el = targets[t]; var r = el.getBoundingClientRect();
        if (r.width < 80 || r.height < 40 || r.top < 100) continue;
        if (r.left + r.width / 2 > vw * 0.55) continue;
        var area = r.width * r.height;
        if (area > bestArea) { bestArea = area; best = el; }
      } catch (e) {}
    }
    if (best) {
      try { best.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, view: window })); return { ok: true, via: 'dblclick' }; } catch (e2) {}
    }
    return window.__TE_IG_LIKE_SHARED__();
  };
  function fillAndSend(box, text) {
    box.focus();
    try { document.execCommand('selectAll', false, undefined); document.execCommand('delete', false, undefined); } catch (e) {}
    var ok = false;
    try { ok = document.execCommand('insertText', false, text); } catch (e2) { ok = false; }
    if (!ok) {
      if (box.tagName === 'TEXTAREA' || box.tagName === 'INPUT') { box.value = text; box.dispatchEvent(new Event('input', { bubbles: true })); }
      else {
        box.textContent = text;
        try { box.dispatchEvent(new InputEvent('input', { bubbles: true, data: text, inputType: 'insertText' })); }
        catch (e3) { box.dispatchEvent(new Event('input', { bubbles: true })); }
      }
    }
  }
  function findComposeBox() {
    var sels = ['div[role="textbox"][contenteditable="true"]','[contenteditable="true"][role="textbox"]','div[aria-label="Message"][contenteditable="true"]','div[aria-label*="Message"][contenteditable="true"]','div[aria-placeholder*="Message"][contenteditable="true"]','div[contenteditable="true"][data-lexical-editor="true"]','p[contenteditable="true"]','div[contenteditable="true"]','textarea'];
    var vh = window.innerHeight || 600;
    for (var i = 0; i < sels.length; i++) {
      var nodes = document.querySelectorAll(sels[i]);
      for (var j = 0; j < nodes.length; j++) {
        var el = nodes[j];
        try {
          var r = el.getBoundingClientRect();
          if (r.width < 40 || r.height < 14) continue;
          if (r.top < vh * 0.35) continue;
          return el;
        } catch (e) {}
      }
    }
    var all = document.querySelectorAll('[contenteditable="true"]');
    for (var k = all.length - 1; k >= 0; k--) {
      try {
        var rr = all[k].getBoundingClientRect();
        if (rr.width > 80 && rr.top > vh * 0.5) return all[k];
      } catch (e2) {}
    }
    return null;
  }
  window.__TE_IG_SEND_REPLY__ = async function (text) {
    if (!text) return { ok: false, reason: 'empty' };
    var now = Date.now();
    if (lastSentText === text && now - lastSendAt < 15000) return { ok: true, reason: 'already_sent' };
    if (now - lastSendAt < MIN_SEND_GAP_MS) return { ok: true, reason: 'cooldown_ok' };
    var box = null;
    for (var attempt = 0; attempt < 8; attempt++) {
      box = findComposeBox();
      if (box) break;
      await new Promise(function (r) { setTimeout(r, 350); });
    }
    if (!box) return { ok: false, reason: 'no_box' };
    try { box.click(); } catch (e0) {}
    box.focus();
    await new Promise(function (r) { setTimeout(r, 150); });
    fillAndSend(box, text);
    await new Promise(function (r) { setTimeout(r, 300); });
    var sendBtn = null;
    var buttons = document.querySelectorAll('div[role="button"], button, [aria-label]');
    for (var i = 0; i < buttons.length; i++) {
      var t = (buttons[i].innerText || buttons[i].getAttribute('aria-label') || '').trim();
      if (/^(Send|ارسال|Post)$/i.test(t)) { sendBtn = buttons[i]; break; }
    }
    if (sendBtn) { try { sendBtn.click(); } catch (e) {} }
    else {
      try { box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true })); } catch (e3) {}
    }
    lastSendAt = Date.now();
    lastSentText = text;
    return { ok: true, via: sendBtn ? 'button' : 'enter' };
  };
  window.__TE_IG_SEND_COMMENT_REPLY__ = window.__TE_IG_SEND_REPLY__;
  try { scan(); } catch (e) {}
  window.__TE_IG_ASSIST_INJECTED__ = true;
})();
`
