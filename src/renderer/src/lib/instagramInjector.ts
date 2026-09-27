/**
 * Instagram injector — conversation list by row index (not only href).
 */

export const INJECTOR_SOURCE = `
(function () {
  if (window.__TE_IG_ASSIST_INJECTED__ && window.__TE_IG_POLL__) {
    // Already live — just refresh helpers if needed
  }

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
      if (/^(Send|ارسال|Like|Seen|Active|Message|Enter|Online)/i.test(text)) return;
      if (/^[0-9]{1,2}:[0-9]{2}/.test(text) && text.length < 14) return;
      if (lastSentText && text === lastSentText) return;
      out.push({ el: el, text: text });
    }
    var selectors = [
      'div[role="main"] div[dir="auto"]',
      'div[role="list"] div[dir="auto"]',
      'div[role="row"] div[dir="auto"]',
      'main div[dir="auto"]',
      'div[role="main"] span[dir="auto"]',
      'div[role="row"] span[dir="auto"]'
    ];
    for (var s = 0; s < selectors.length; s++) {
      var list = document.querySelectorAll(selectors[s]);
      for (var i = 0; i < list.length; i++) add(list[i]);
    }
    if (out.length < 2) {
      var all = document.querySelectorAll('[dir="auto"]');
      for (var j = 0; j < all.length; j++) {
        try {
          var r = all[j].getBoundingClientRect();
          if (r.width < 20 || r.height < 10 || r.top < 80) continue;
          add(all[j]);
        } catch (e) {}
      }
    }
    return out;
  }

  function scanDms() {
    if (!isDirectPage() && !hasCompose()) {
      lastScanInfo = { path: path(), dmNodes: 0, queued: 0, thread: false, method: 'skip' };
      return;
    }
    if (isInbox() && !hasCompose()) {
      lastScanInfo = { path: path(), dmNodes: 0, queued: 0, thread: false, method: 'inbox_only' };
      return;
    }

    var nodes = collectDmCandidates();
    lastScanInfo = { path: path(), dmNodes: nodes.length, queued: 0, thread: true, method: 'tail' };
    if (!nodes.length) return;

    var classified = nodes.map(function (n) {
      return { text: n.text, outgoing: isProbablyOutgoing(n.el) };
    });

    var lastOut = -1;
    for (var j = 0; j < classified.length; j++) {
      if (classified[j].outgoing) lastOut = j;
    }
    var startIdx = lastOut >= 0 ? lastOut + 1 : Math.max(0, classified.length - 1);
    if (lastOut < 0) lastScanInfo.method = 'last_only';

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

    for (var m = 0; m < startIdx && m < classified.length; m++) {
      markSeen(fingerprint(classified[m].text, 'dm'));
    }
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
      hasCompose: hasCompose(),
      lastScan: lastScanInfo,
      convCount: (window.__TE_IG_LIST_CONVERSATIONS__ && window.__TE_IG_LIST_CONVERSATIONS__().length) || 0
    };
  };

  /**
   * List conversation rows from inbox left panel.
   * Returns { index, preview, href? } — open via __TE_IG_OPEN_CONV_INDEX__
   */
  window.__TE_IG_LIST_CONVERSATIONS__ = function () {
    var items = [];
    var seen = new Set();

    function pushItem(indexKey, preview, href, el) {
      var key = href || indexKey || preview.slice(0, 40);
      if (seen.has(key)) return;
      seen.add(key);
      items.push({
        index: items.length,
        preview: (preview || '').replace(/\\s+/g, ' ').trim().slice(0, 100),
        href: href || '',
        // store nothing DOM-related in JSON; open by re-query index
      });
    }

    // 1) Classic anchors
    var anchors = document.querySelectorAll('a[href*="/direct/t/"]');
    for (var i = 0; i < anchors.length; i++) {
      var a = anchors[i];
      var href = a.getAttribute('href') || '';
      var prev = (a.innerText || '').trim();
      // climb for richer preview
      var row = a.closest('[role="button"]') || a.parentElement;
      if (row && row.innerText) prev = row.innerText.trim();
      pushItem('a-' + i, prev, href, a);
      if (items.length >= 12) break;
    }

    // 2) listbox / list rows
    if (items.length === 0) {
      var rows = document.querySelectorAll(
        '[role="listbox"] [role="button"], [role="list"] [role="button"], div[role="button"]'
      );
      for (var r = 0; r < rows.length && items.length < 12; r++) {
        var el = rows[r];
        var t = (el.innerText || '').replace(/\\s+/g, ' ').trim();
        if (!t || t.length < 2) continue;
        // skip pure UI chrome
        if (/^(Messages|Requests|Primary|General|Search|پیام|درخواست)/i.test(t) && t.length < 20) continue;
        // must look like a conversation: has some text and reasonable height
        try {
          var rect = el.getBoundingClientRect();
          if (rect.height < 40 || rect.height > 120) continue;
          if (rect.width < 120) continue;
          // left half of screen = inbox list
          if (rect.left > (window.innerWidth || 800) * 0.55) continue;
        } catch (e) { continue; }
        var link = el.querySelector('a[href*="/direct/t/"]');
        pushItem('row-' + r, t, link ? (link.getAttribute('href') || '') : '', el);
      }
    }

    // 3) Any element with href-like direct/t in outerHTML near left
    if (items.length === 0) {
      var allBtns = document.querySelectorAll('div[role="button"]');
      for (var b = 0; b < allBtns.length && items.length < 12; b++) {
        var bt = allBtns[b];
        var html = '';
        try { html = bt.innerHTML || ''; } catch (e) {}
        if (html.indexOf('/direct/t/') === -1 && html.indexOf('direct') === -1) {
          // still allow tall left rows
          try {
            var rc = bt.getBoundingClientRect();
            if (rc.left > 400 || rc.height < 48 || rc.height > 100) continue;
          } catch (e2) { continue; }
        }
        var tx = (bt.innerText || '').replace(/\\s+/g, ' ').trim();
        if (tx.length < 3) continue;
        pushItem('b-' + b, tx, '', bt);
      }
    }

    return items;
  };

  // Back-compat alias
  window.__TE_IG_LIST_UNREAD__ = window.__TE_IG_LIST_CONVERSATIONS__;

  window.__TE_IG_OPEN_CONV_INDEX__ = function (index) {
    var items = window.__TE_IG_LIST_CONVERSATIONS__();
    if (!items || !items[index]) return { ok: false, reason: 'bad_index' };

    // Re-find and click
    var anchors = document.querySelectorAll('a[href*="/direct/t/"]');
    if (items[index].href) {
      for (var i = 0; i < anchors.length; i++) {
        var h = anchors[i].getAttribute('href') || '';
        if (h === items[index].href || h.indexOf(items[index].href) !== -1) {
          anchors[i].click();
          return { ok: true, via: 'href_click' };
        }
      }
    }

    // Click Nth left-panel conversation button
    var rows = [];
    var candidates = document.querySelectorAll(
      '[role="listbox"] [role="button"], [role="list"] [role="button"], div[role="button"]'
    );
    for (var r = 0; r < candidates.length; r++) {
      var el = candidates[r];
      try {
        var rect = el.getBoundingClientRect();
        if (rect.height < 40 || rect.height > 120) continue;
        if (rect.left > (window.innerWidth || 800) * 0.55) continue;
        var t = (el.innerText || '').trim();
        if (!t || t.length < 2) continue;
        rows.push(el);
      } catch (e) {}
    }
    if (rows[index]) {
      rows[index].click();
      return { ok: true, via: 'index_click', count: rows.length };
    }

    if (items[index].href) {
      var href = items[index].href;
      location.href = href.indexOf('http') === 0 ? href : ('https://www.instagram.com' + href);
      return { ok: true, via: 'location' };
    }

    return { ok: false, reason: 'not_found', rows: rows.length };
  };

  window.__TE_IG_OPEN_THREAD__ = function (href) {
    return window.__TE_IG_OPEN_CONV_INDEX__(0);
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
