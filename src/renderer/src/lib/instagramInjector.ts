/**
 * Instagram injector — robust unread detection for current IG web DOM.
 * Fix: text unreads (چی؟), empty thread scan 0/0, multi-hit inbox.
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
    var scopes = [document.querySelector('div[role="main"] header'), document.querySelector('section header'), document.querySelector('header')];
    for (var s = 0; s < scopes.length; s++) {
      var root = scopes[s]; if (!root) continue;
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
    var t = (main.innerText || '');
    if (/sent an attachment|shared a post|shared a reel|یک پست|پیوست/i.test(t)) return true;
    return false;
  }
  function isBlueish(bg) {
    var m = (bg || '').replace(/\\s/g, '').match(/rgba?\\((\\d+),(\\d+),(\\d+)/);
    if (!m) return false;
    var r = +m[1], g = +m[2], b = +m[3];
    if (b >= 180 && r <= 120 && g >= 80 && g <= 220) return true;
    if (r < 100 && g > 100 && g < 200 && b > 200) return true;
    if (r < 60 && g > 140 && b > 230) return true;
    return false;
  }
  function hasBlueUnreadIndicator(root) {
    if (!root) return false;
    var scopes = [root];
    try {
      if (root.parentElement) scopes.push(root.parentElement);
      if (root.parentElement && root.parentElement.parentElement) scopes.push(root.parentElement.parentElement);
    } catch (e) {}
    for (var s = 0; s < scopes.length; s++) {
      var scope = scopes[s];
      var nodes = scope.querySelectorAll('div, span, i, canvas');
      for (var i = 0; i < Math.min(nodes.length, 100); i++) {
        var el = nodes[i];
        try {
          var st = window.getComputedStyle(el);
          var w = parseFloat(st.width) || el.offsetWidth || 0;
          var h = parseFloat(st.height) || el.offsetHeight || 0;
          if (w < 3 || w > 28 || h < 3 || h > 28) continue;
          if (isBlueish(st.backgroundColor || '')) return true;
          var br = st.borderRadius || '';
          if ((br.indexOf('50%') >= 0 || parseFloat(br) >= 8) && isBlueish(st.borderColor || st.borderTopColor || '')) return true;
        } catch (e2) {}
      }
    }
    return false;
  }
  function isYouSentPreview(text) {
    var t = (text || '').replace(/\\s+/g, ' ');
    if (/\\bYou:\\s/i.test(t)) return true;
    if (/\\bYou sent\\b/i.test(t)) return true;
    if (/شما:\\s/.test(t)) return true;
    if (/شما ارسال|شما فرستاد/.test(t)) return true;
    return false;
  }
  function isReactionOnlyPreview(text) {
    var t = (text || '').replace(/\\s+/g, ' ');
    if (/Reacted\\s+/i.test(t) && /to your message/i.test(t)) return true;
    if (/Liked a message/i.test(t)) return true;
    if (/liked your message/i.test(t)) return true;
    if (/واکنش.*پیام/i.test(t)) return true;
    return false;
  }
  function isReactionMessageText(text) {
    var t = (text || '').trim();
    if (/^reacted\\s+/i.test(t)) return true;
    if (/reacted .* to your message/i.test(t)) return true;
    if (/^liked a message$/i.test(t)) return true;
    if (/liked your message/i.test(t)) return true;
    return false;
  }
  function isIncomingAttachmentPreview(text) {
    var t = (text || '').replace(/\\s+/g, ' ');
    if (isYouSentPreview(t)) return false;
    if (/sent an attachment|shared a post|shared a reel|فرستاد.*پیوست|یک پست فرستاد/i.test(t)) return true;
    return false;
  }
  function rowLooksLikeConversation(el) {
    try {
      var r = el.getBoundingClientRect();
      if (r.height < 40 || r.height > 180) return false;
      if (r.width < 100) return false;
      if (r.left > (window.innerWidth || 900) * 0.55) return false;
      if (r.top < 40) return false;
      return true;
    } catch (e) { return false; }
  }
  function scoreUnreadRow(row, preview) {
    var p = (preview || '').replace(/\\s+/g, ' ').trim();
    if (!p || p.length < 2) return 0;
    if (isYouSentPreview(p)) return 0;
    if (isReactionOnlyPreview(p)) return 0;
    var hard = 0;
    if (hasBlueUnreadIndicator(row)) hard += 6;
    if (/\\d+\\s*new message/i.test(p)) hard += 5;
    if (/\\bUnread\\b|خوانده\\s*نشده|نخوانده/i.test(p)) hard += 5;
    var aria = (row.getAttribute('aria-label') || '') + ' ' + (row.getAttribute('title') || '');
    if (/unread|خوانده|نخوانده|new message/i.test(aria)) hard += 5;
    if (isIncomingAttachmentPreview(p)) hard += 5;
    if (/\\b\\d+\\s*m\\b|\\b\\d+\\s*h\\b|\\b\\d+\\s*d\\b|همین حالا|just now|Active now/i.test(p)) hard += 3;
    var stripped = p.replace(/\\b\\d+\\s*[mhd]\\b/gi, '').replace(/Active now/gi, '').trim();
    if (stripped.length >= 4) hard += 2;
    try {
      var spans = row.querySelectorAll('span');
      var bold = 0;
      for (var s = 0; s < Math.min(spans.length, 16); s++) {
        var fw = window.getComputedStyle(spans[s]).fontWeight || '';
        if (parseInt(fw, 10) >= 600 || fw === 'bold') bold++;
      }
      if (bold >= 1) hard += 1;
    } catch (e) {}
    return hard;
  }
  function collectUnreadRows() {
    var rows = [];
    var seenKey = {};
    var debugCounts = { anchors: 0, buttons: 0, scored: 0, sample: '' };
    function pushRow(clickEl, href, preview, score) {
      var key = (href || '') + '|' + (preview || '').slice(0, 48);
      if (seenKey[key]) return;
      seenKey[key] = true;
      rows.push({ el: clickEl, href: href || '', preview: (preview || '').slice(0, 140), username: usernameFromPreview(preview || ''), score: score });
      debugCounts.scored++;
      if (!debugCounts.sample) debugCounts.sample = (preview || '').slice(0, 28);
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
      if (score >= 2) pushRow(a, href, preview, score);
    }
    var candidates = document.querySelectorAll('[role="listbox"] [role="button"], [role="list"] [role="button"], div[role="button"], div[role="listitem"]');
    debugCounts.buttons = candidates.length;
    for (var r = 0; r < candidates.length; r++) {
      var el = candidates[r];
      if (!rowLooksLikeConversation(el)) continue;
      var prev = (el.innerText || '').replace(/\\s+/g, ' ').trim();
      if (!prev || prev.length < 3) continue;
      if (/^(Messages|Requests|Primary|General|پیام|درخواست|Your note)/i.test(prev) && prev.length < 28) continue;
      var sc = scoreUnreadRow(el, prev);
      if (sc >= 2) {
        var link = el.querySelector('a[href*="/direct/t/"]');
        pushRow(link || el, link ? (link.getAttribute('href') || '') : '', prev, sc);
      }
    }
    rows.sort(function (a, b) { return (b.score || 0) - (a.score || 0); });
    lastScanInfo.listDebug = 'a=' + debugCounts.anchors + ' b=' + debugCounts.buttons + ' hit=' + rows.length + (debugCounts.sample ? ' · ' + debugCounts.sample : '');
    return rows;
  }
  function findInboxScrollContainer() {
    var nodes = document.querySelectorAll('div');
    var best = null, bestScore = 0, vw = window.innerWidth || 900;
    for (var i = 0; i < Math.min(nodes.length, 400); i++) {
      var el = nodes[i];
      try {
        var st = window.getComputedStyle(el);
        var oy = st.overflowY || '';
        if (oy !== 'auto' && oy !== 'scroll' && oy !== 'overlay') continue;
        if (el.scrollHeight < el.clientHeight + 40) continue;
        var r = el.getBoundingClientRect();
        if (r.width < 180 || r.height < 200) continue;
        if (r.left > vw * 0.55) continue;
        var score = el.scrollHeight - el.clientHeight;
        if (score > bestScore) { bestScore = score; best = el; }
      } catch (e) {}
    }
    return best;
  }
  window.__TE_IG_SCROLL_INBOX__ = async function () {
    var box = findInboxScrollContainer();
    if (!box) return { ok: false, reason: 'no_scroll_box', steps: 0 };
    var steps = 0, lastH = -1;
    for (var i = 0; i < 12; i++) {
      box.scrollTop = box.scrollHeight;
      steps++;
      await new Promise(function (r) { setTimeout(r, 280); });
      if (box.scrollHeight === lastH) break;
      lastH = box.scrollHeight;
    }
    box.scrollTop = 0;
    await new Promise(function (r) { setTimeout(r, 200); });
    box.scrollTop = Math.min(400, box.scrollHeight);
    await new Promise(function (r) { setTimeout(r, 250); });
    return { ok: true, steps: steps, height: box.scrollHeight };
  };
  function collectDmCandidates() {
    var out = [], seenEl = new WeakSet();
    function add(el) {
      if (!el || seenEl.has(el)) return;
      seenEl.add(el);
      var text = (el.innerText || el.textContent || '').trim();
      if (!text || text.length < 1 || text.length > 2000) return;
      if (/^(Send|ارسال|Like|Seen|Active now|Message)$/i.test(text)) return;
      if (lastSentText && text === lastSentText) return;
      out.push({ el: el, text: text });
    }
    var selectors = ['div[role="main"] div[dir="auto"]','div[role="main"] span[dir="auto"]','div[role="list"] div[dir="auto"]','main div[dir="auto"]','div[role="main"] div[role="row"]','div[role="grid"] div[dir="auto"]','div[role="main"] [data-scope] div','div[role="main"] div > span'];
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
      if (isReactionMessageText(item.text)) { markSeen(fingerprint(item.text, 'dm')); continue; }
      var fp = fingerprint(item.text, 'dm');
      if (!forceLast && SEEN.has(fp)) continue;
      markSeen(fp);
      PENDING.push({ id: fp + (forceLast ? '|f' : ''), text: item.text, kind: 'dm_incoming', channel: 'dm', username: peer });
      queued++;
    }
    if (forceLast && queued === 0 && classified.length) {
      for (var i = classified.length - 1; i >= 0; i--) {
        if (classified[i].outgoing || isReactionMessageText(classified[i].text)) continue;
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
      if (force) {
        var peer0 = getThreadUsername();
        var attText = hasAtt ? 'shared_post attachment' : 'unread_thread_open';
        var fpA = fingerprint(attText + '|' + peer0 + '|' + path(), 'att');
        markSeen(fpA);
        PENDING.push({ id: fpA + '|att', text: attText, kind: 'dm_incoming', channel: 'dm', username: peer0 });
        lastScanInfo.queued = 1;
        lastScanInfo.peer = peer0;
      }
      return;
    }
    lastScanInfo.queued = queueIncomingFromNodes(nodes, !!force);
    if (force && lastScanInfo.queued === 0) {
      var peer1 = getThreadUsername();
      var att2 = hasAtt ? 'shared_post attachment' : 'unread_thread_open';
      var fpB = fingerprint(att2 + '|' + peer1 + '|f2', 'att2');
      markSeen(fpB);
      PENDING.push({ id: fpB + '|att', text: att2, kind: 'dm_incoming', channel: 'dm', username: peer1 });
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
    try { rows[0].el.click(); } catch (e) { return { ok: false, reason: 'click_fail', total: rows.length }; }
    return { ok: true, via: 'first_unread', total: rows.length, preview: rows[0].preview, username: rows[0].username || '', score: rows[0].score || 0, debug: lastScanInfo.listDebug || '' };
  };
  window.__TE_IG_OPEN_CONV_INDEX__ = function (index) {
    var rows = collectUnreadRows();
    if (!rows[index]) return { ok: false, reason: 'no_unread', total: rows.length };
    try { rows[index].el.click(); } catch (e) { return { ok: false, reason: 'click_fail' }; }
    return { ok: true, via: 'index', total: rows.length, preview: rows[index].preview, username: rows[index].username || '' };
  };
  window.__TE_IG_GOTO_INBOX__ = function () {
    try {
      var selectors = ['a[href="/direct/inbox/"]','a[href*="/direct/inbox"]','svg[aria-label="Messenger"]','a[aria-label*="Direct"]'];
      for (var i = 0; i < selectors.length; i++) {
        var el = document.querySelector(selectors[i]);
        if (!el) continue;
        var clickable = el.closest('a') || el.closest('[role="button"]') || el;
        try { clickable.click(); return { ok: true }; } catch (e) {}
      }
      location.href = 'https://www.instagram.com/direct/inbox/';
      return { ok: true };
    } catch (e) { return { ok: false }; }
  };
  window.__TE_IG_GOTO__ = function (urlPath) { location.href = 'https://www.instagram.com' + urlPath; return true; };
  window.__TE_IG_OPEN_ACTIVITY_UI__ = function () {
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
      try { best.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, view: window })); return { ok: true }; } catch (e2) {}
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
    var sels = ['div[role="textbox"][contenteditable="true"]','[contenteditable="true"][role="textbox"]','div[aria-label*="Message"][contenteditable="true"]','div[contenteditable="true"][data-lexical-editor="true"]','div[contenteditable="true"]','textarea'];
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
      try { box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true })); } catch (e3) {}
    }
    lastSendAt = Date.now();
    lastSentText = text;
    return { ok: true };
  };
  window.__TE_IG_SEND_COMMENT_REPLY__ = window.__TE_IG_SEND_REPLY__;
  try { scan(); } catch (e) {}
  window.__TE_IG_ASSIST_INJECTED__ = true;
})();
`
