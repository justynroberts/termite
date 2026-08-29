/* MIT License - Copyright (c) fintonlabs.com */
(function () {
  'use strict';

  var REPO = 'justynroberts/termite';
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- theme: light / dark / system ---------- */
  var root = document.documentElement;
  var toggle = document.getElementById('theme');

  function systemIsDark() {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
  function currentIsDark() {
    var t = root.getAttribute('data-theme');
    return t ? t === 'dark' : systemIsDark();
  }
  toggle.addEventListener('click', function () {
    var next = currentIsDark() ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem('termite-theme', next); } catch (e) {}
  });

  /* ---------- wipe-reveal (the motion signature) ----------
     .rv only hides once html.js-anim is set, so a failure anywhere below
     leaves a fully readable page rather than a blank one. A watchdog reveals
     anything the observer has not reached within 2.5s. */
  var targets = document.querySelectorAll('.rv');

  function revealAll() {
    Array.prototype.forEach.call(targets, function (el) { el.classList.add('in'); });
  }

  if (!reduced && 'IntersectionObserver' in window) {
    root.classList.add('js-anim');
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add('in');
        io.unobserve(e.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });

    // Anything already in the first viewport plays straight away — the hero must
    // never sit blank waiting for an observer callback. The rest wait for scroll.
    Array.prototype.forEach.call(targets, function (el) {
      if (el.getBoundingClientRect().top < window.innerHeight) el.classList.add('in');
      else io.observe(el);
    });
    setTimeout(revealAll, 2000);
  } else {
    revealAll();
  }

  /* ---------- hero terminal ---------- */
  var SCRIPT = [
    ['pr', '~ ', 'us', 'ssh web-01'],
    ['cm', 'Last login: Sat Aug 29 09:14:02 2026 from 10.0.4.19'],
    [''],
    ['pr', 'web-01 ', 'us', 'systemctl restart nginx'],
    ['wn', 'Job for nginx.service failed. See "systemctl status nginx".'],
    [''],
    ['cm', '── Ctrl+K ─ explain last error ───────'],
    ['ai', '  nginx failed its config test: duplicate listen 443'],
    ['ai', '  in sites-enabled/api.conf and sites-enabled/web.conf.'],
    ['ai', '  Suggested:'],
    ['ok', '  nginx -t && sudo rm /etc/nginx/sites-enabled/api.conf'],
    ['cm', '  [ Run ]  [ Insert ]  [ Copy ]'],
    ['cm', '───────────────────────────────────────'],
    [''],
    ['pr', 'web-01 ', 'us', 'nginx -t'],
    ['ok', 'configuration file /etc/nginx/nginx.conf test is successful'],
    [''],
    ['pr', 'web-01 ', 'us', '']
  ];

  var body = document.getElementById('term-body');

  function esc(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function renderLine(parts) {
    var line = document.createElement('span');
    line.className = 'tline';
    var html = '';
    for (var i = 0; i < parts.length; i += 2) {
      var cls = parts[i];
      var txt = parts[i + 1];
      if (txt === undefined) { html += cls ? '' : ''; continue; }
      html += '<span class="' + cls + '">' + esc(txt) + '</span>';
    }
    if (html === '') html = '&nbsp;';
    line.innerHTML = html;
    return line;
  }

  function playTerminal() {
    body.innerHTML = '';
    if (reduced) {
      SCRIPT.forEach(function (p) {
        var l = renderLine(p);
        l.style.clipPath = 'none';
        body.appendChild(l);
      });
      body.lastChild.innerHTML += '<span class="caret"></span>';
      return;
    }
    var i = 0;
    (function step() {
      if (i >= SCRIPT.length) {
        body.lastChild.innerHTML += '<span class="caret"></span>';
        return;
      }
      var parts = SCRIPT[i];
      var line = renderLine(parts);
      body.appendChild(line);
      // force style flush so the animation restarts cleanly
      void line.offsetWidth;
      line.classList.add('in');
      var pause = parts[1] === undefined || parts[1] === '' ? 90 : 190;
      if (parts[0] === 'ai' || parts[0] === 'ok') pause = 240;
      i++;
      setTimeout(step, pause);
    })();
  }

  var term = document.getElementById('term');
  var played = false;
  function startTerminal() {
    if (played) return;
    played = true;
    playTerminal();
  }
  if ('IntersectionObserver' in window) {
    var tio = new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting) { tio.disconnect(); startTerminal(); }
    }, { threshold: 0.25 });
    tio.observe(term);
    setTimeout(startTerminal, 1200);   // watchdog: never leave the frame empty
  } else {
    startTerminal();
  }

  /* ---------- OS detection: lead with the right download ---------- */
  var isWin = /Win/i.test(navigator.platform || navigator.userAgent);
  if (isWin) {
    var mac = document.getElementById('dl-mac');
    var win = document.getElementById('dl-win');
    mac.classList.add('btn--ghost');
    win.classList.remove('btn--ghost');
    win.parentNode.insertBefore(win, mac);
  }

  /* ---------- live release info, best effort ---------- */
  fetch('https://api.github.com/repos/' + REPO + '/releases/latest', {
    headers: { Accept: 'application/vnd.github+json' }
  })
    .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
    .then(function (rel) {
      var tag = (rel.tag_name || '').trim();
      if (!tag) return;
      var bare = tag.replace(/^v/, '');
      document.getElementById('ver').textContent = tag;
      document.getElementById('about-ver').textContent = bare;

      var assets = rel.assets || [];
      function find(re) {
        for (var i = 0; i < assets.length; i++) {
          if (re.test(assets[i].name)) return assets[i];
        }
        return null;
      }
      var dmg = find(/\.dmg$/i);
      var setup = find(/Setup.*\.exe$/i);
      var portable = find(/Portable.*\.exe$/i);

      if (dmg) {
        document.getElementById('dl-mac').href = dmg.browser_download_url;
        document.getElementById('f-mac').textContent = dmg.name;
        document.querySelector('#download .dl:nth-child(1) .btn').href = dmg.browser_download_url;
      }
      if (setup) {
        document.getElementById('dl-win').href = setup.browser_download_url;
        document.getElementById('f-win').textContent =
          setup.name + (portable ? ' · ' + portable.name : '');
        document.querySelector('#download .dl:nth-child(2) .btn').href = setup.browser_download_url;
      }
    })
    .catch(function () { /* keep the static /releases/latest links */ });

  /* ---------- FintonLabs info dialog ---------- */
  var about = document.getElementById('about');
  var infoBtn = document.getElementById('info-btn');

  infoBtn.addEventListener('click', function () {
    if (typeof about.showModal === 'function') about.showModal();
    else about.setAttribute('open', '');
  });
  document.getElementById('about-close').addEventListener('click', function () {
    about.close();
  });
  // backdrop click
  about.addEventListener('click', function (e) {
    var r = about.getBoundingClientRect();
    var inside = e.clientX >= r.left && e.clientX <= r.right &&
                 e.clientY >= r.top && e.clientY <= r.bottom;
    if (!inside) about.close();
  });
  // Escape is native on <dialog>; restore focus on close
  about.addEventListener('close', function () { infoBtn.focus(); });
})();
