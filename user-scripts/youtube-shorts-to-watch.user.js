// ==UserScript==
// @name         YouTube Shorts -> Normal Player
// @namespace    local.shorts-to-watch
// @version      2.2
// @description  Opens YouTube Shorts in the regular desktop watch page (volume slider, seek bar, etc.). In embeds (e.g. CyTube), uses the normal player for Shorts and replaces the mobile-style embed controls with a desktop-style bar.
// @match        https://www.youtube.com/*
// @match        https://m.youtube.com/*
// @match        https://www.youtube-nocookie.com/embed/*
// @run-at       document-start
// @grant        none
// @author       Bruno
// ==/UserScript==

(function () {
  'use strict';

  // Embedded players (CyTube or any other site): YouTube shows Shorts in a
  // stripped-down Shorts UI (no volume slider) when the video data says
  // `isShortsExperienceEligible: true`. That data arrives as JSON (the embed
  // page's config and the /youtubei/v1/player response on each video change),
  // so flip the flag as it's parsed and the player falls back to the normal UI.
  if (location.pathname.startsWith('/embed/')) {
    const FLAG_RE = /"isShortsExperienceEligible"\s*:\s*true/g;
    const origParse = JSON.parse;
    JSON.parse = function (text, reviver) {
      if (typeof text === 'string' && text.includes('isShortsExperienceEligible')) {
        text = text.replace(FLAG_RE, '"isShortsExperienceEligible":false');
      }
      return origParse.call(this, text, reviver);
    };
    // Sites that embed with controls=0 want no controls at all
    if (new URLSearchParams(location.search).get('controls') !== '0') installDesktopBar();
    return;
  }

  const SHORTS_RE = /^\/shorts\/([A-Za-z0-9_-]{6,})/;

  function toWatchUrl(url) {
    const u = new URL(url, location.origin);
    const m = u.pathname.match(SHORTS_RE);
    if (!m) return null;
    const out = new URL('/watch', u.origin);
    out.searchParams.set('v', m[1]);
    // carry over any other params (e.g. t=)
    u.searchParams.forEach((val, key) => out.searchParams.set(key, val));
    return out.href;
  }

  function redirectIfShorts() {
    const target = toWatchUrl(location.href);
    if (target) location.replace(target);
  }

  // 1. Direct loads of /shorts/ID
  redirectIfShorts();

  // 2. Clicks on Shorts links: YouTube routes these internally, ignoring href,
  //    so intercept in the capture phase before its handlers run.
  document.addEventListener('click', (e) => {
    if (e.button !== 0 || e.defaultPrevented) return;
    const a = e.target.closest && e.target.closest('a[href*="/shorts/"]');
    if (!a) return;
    const target = toWatchUrl(a.href);
    if (!target) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.ctrlKey || e.metaKey || e.shiftKey) {
      window.open(target, '_blank');
    } else {
      location.href = target;
    }
  }, true);

  // 3. Rewrite hrefs so middle-click / "open in new tab" / hover URLs are correct
  function rewriteLink(a) {
    if (a.tagName !== 'A' || !a.href.includes('/shorts/')) return;
    const target = toWatchUrl(a.href);
    if (target) a.href = target;
  }
  new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === 'attributes') {
        rewriteLink(m.target);
      } else {
        m.addedNodes.forEach((n) => {
          if (n.nodeType !== 1) return;
          rewriteLink(n);
          n.querySelectorAll('a[href*="/shorts/"]').forEach(rewriteLink);
        });
      }
    }
  }).observe(document.documentElement, {
    childList: true, subtree: true, attributes: true, attributeFilter: ['href'],
  });

  // 4. Fallback for any SPA navigation that still lands on /shorts/
  //    (swiping, keyboard nav, history back/forward, etc.)
  window.addEventListener('yt-navigate-start', (e) => {
    const url = e.detail?.url;
    const target = url && toWatchUrl(url);
    if (target) location.replace(target);
  });
  window.addEventListener('yt-navigate-finish', redirectIfShorts);
  window.addEventListener('popstate', redirectIfShorts);

  // Embeds now use YouTube's mobile-style controls (big centre play button,
  // vertical volume pop-up, buttons scattered top and bottom). Hide them and
  // draw a desktop-style bar driven by the player API.
  function installDesktopBar() {
    const ICONS = {
      play: 'M8 5v14l11-7z',
      pause: 'M6 19h4V5H6v14zm8-14v14h4V5h-4z',
      vol: 'M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z',
      mute: 'M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z',
      cc: 'M19 4H5c-1.11 0-2 .9-2 2v12c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm-8 7H9.5v-.5h-2v3h2V13H11v1c0 .55-.45 1-1 1H7c-.55 0-1-.45-1-1v-4c0-.55.45-1 1-1h3c.55 0 1 .45 1 1v1zm7 0h-1.5v-.5h-2v3h2V13H18v1c0 .55-.45 1-1 1h-3c-.55 0-1-.45-1-1v-4c0-.55.45-1 1-1h3c.55 0 1 .45 1 1v1z',
      gear: 'M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.48.48 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.49.49 0 0 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z',
      fs: 'M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z',
      fsExit: 'M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z',
    };
    const CSS = `
      #player-controls { opacity: 0 !important; }
      #player-controls, #player-controls * { pointer-events: none !important; }
      #dsk-bar { position: absolute; left: 0; right: 0; bottom: 0; z-index: 60; padding: 0 12px 4px;
        background: linear-gradient(transparent, rgba(0,0,0,.7)); color: #fff; font: 13px Roboto, Arial, sans-serif;
        transition: opacity .25s; user-select: none; }
      #dsk-bar.dsk-hidden { opacity: 0; pointer-events: none; }
      #movie_player.dsk-idle { cursor: none; }
      /* Custom-drawn sliders: 4px track, 12px thumb raised by half the difference so
         it sits centred. --pct (played/level) and --buf (buffered) are set from JS. */
      #dsk-bar input[type=range] { -webkit-appearance: none; appearance: none; background: none;
        cursor: pointer; margin: 0; height: 14px; --pct: 0%; --buf: 0%; --fill: #f00; }
      #dsk-bar input[type=range]::-webkit-slider-runnable-track { height: 4px; border-radius: 2px;
        background: linear-gradient(to right, var(--fill) var(--pct), rgba(255,255,255,.5) var(--pct) var(--buf), rgba(255,255,255,.2) var(--buf)); }
      #dsk-bar input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 12px; height: 12px;
        margin-top: -4px; border: 0; border-radius: 50%; background: var(--fill); }
      #dsk-bar input[type=range]::-moz-range-track { height: 4px; border-radius: 2px;
        background: linear-gradient(to right, var(--fill) var(--pct), rgba(255,255,255,.5) var(--pct) var(--buf), rgba(255,255,255,.2) var(--buf)); }
      #dsk-bar input[type=range]::-moz-range-thumb { width: 12px; height: 12px; border: 0; border-radius: 50%; background: var(--fill); }
      #dsk-seek { display: block; width: 100%; }
      #dsk-bar #dsk-vol { --fill: #fff; }
      #dsk-row { display: flex; align-items: center; height: 40px; gap: 4px; }
      #dsk-row button { background: none; border: 0; padding: 0; width: 40px; height: 40px; color: #fff;
        cursor: pointer; opacity: .9; display: flex; align-items: center; justify-content: center; }
      #dsk-row button:hover { opacity: 1; }
      #dsk-row button svg { width: 26px; height: 26px; fill: currentColor; }
      #dsk-vol { width: 0; opacity: 0; transition: width .2s, opacity .2s; }
      #dsk-volwrap:hover #dsk-vol, #dsk-vol:focus { width: 70px; opacity: 1; margin-right: 8px; }
      #dsk-volwrap { display: flex; align-items: center; }
      #dsk-time { padding: 0 8px; white-space: nowrap; }
      #dsk-spacer { flex: 1; }
      #dsk-cc.dsk-on { box-shadow: inset 0 -3px 0 -1px #f00; }
      #dsk-menu { position: absolute; right: 12px; bottom: 62px; z-index: 61; background: rgba(28,28,28,.9);
        border-radius: 12px; padding: 8px 0; color: #eee; font: 13px Roboto, Arial, sans-serif; min-width: 240px; }
      #dsk-menu[hidden] { display: none; }
      #dsk-menu label { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 6px 16px; }
      #dsk-menu select { background: #333; color: #eee; border: 0; border-radius: 4px; padding: 3px 6px; font: inherit; }
    `;

    const svgNS = 'http://www.w3.org/2000/svg';
    const mkBtn = (id, title) => {
      const b = document.createElement('button');
      b.id = id;
      b.title = title;
      const svg = document.createElementNS(svgNS, 'svg');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.appendChild(document.createElementNS(svgNS, 'path'));
      b.appendChild(svg);
      return b;
    };
    const setIcon = (b, name) => b.querySelector('path').setAttribute('d', ICONS[name]);
    const mkRange = (id, max) => {
      const r = document.createElement('input');
      r.type = 'range'; r.id = id; r.min = 0; r.max = max; r.step = 'any';
      return r;
    };
    const paint = (r, buf = 0) => {
      r.style.setProperty('--pct', `${(r.value / r.max) * 100}%`);
      r.style.setProperty('--buf', `${Math.max(buf, r.value / r.max) * 100}%`);
    };
    const fmt = (t) => {
      t = Math.max(0, Math.floor(t || 0));
      const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = String(t % 60).padStart(2, '0');
      return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
    };

    const wait = setInterval(() => {
      const mp = document.getElementById('movie_player');
      if (!mp || typeof mp.getPlayerState !== 'function' || !document.head) return;
      clearInterval(wait);
      build(mp);
    }, 200);

    function build(mp) {
      const style = document.createElement('style');
      style.textContent = CSS;
      document.head.appendChild(style);

      const bar = document.createElement('div');
      bar.id = 'dsk-bar';
      const seek = mkRange('dsk-seek', 1000);
      const row = document.createElement('div');
      row.id = 'dsk-row';
      const play = mkBtn('dsk-play', 'Play (k)');
      const volWrap = document.createElement('div');
      volWrap.id = 'dsk-volwrap';
      const muteBtn = mkBtn('dsk-mute', 'Mute (m)');
      const vol = mkRange('dsk-vol', 100);
      volWrap.append(muteBtn, vol);
      const time = document.createElement('span');
      time.id = 'dsk-time';
      const spacer = document.createElement('div');
      spacer.id = 'dsk-spacer';
      const cc = mkBtn('dsk-cc', 'Subtitles/CC (c)');
      const gear = mkBtn('dsk-gear', 'Settings');
      const fs = mkBtn('dsk-fs', 'Full screen (f)');
      setIcon(cc, 'cc');
      setIcon(gear, 'gear');
      row.append(play, volWrap, time, spacer, cc, gear, fs);
      bar.append(seek, row);
      const menu = document.createElement('div');
      menu.id = 'dsk-menu';
      menu.hidden = true;
      const mkSelect = (text) => {
        const label = document.createElement('label');
        const sel = document.createElement('select');
        label.append(text, sel);
        menu.appendChild(label);
        return sel;
      };
      const qualSel = mkSelect('Quality');
      const speedSel = mkSelect('Speed');
      const subSel = mkSelect('Subtitles');
      bar.appendChild(menu);
      mp.appendChild(bar);

      const playing = () => mp.getPlayerState() === 1 || mp.getPlayerState() === 3;
      const togglePlay = () => (playing() ? mp.pauseVideo() : mp.playVideo());
      const toggleMute = () => (mp.isMuted() ? mp.unMute() : mp.mute());
      const setVol = (v) => {
        v = Math.min(100, Math.max(0, v));
        mp.setVolume(v);
        if (v > 0 && mp.isMuted()) mp.unMute();
      };
      const seekBy = (d) => mp.seekTo(mp.getCurrentTime() + d, true);
      const ccTrack = () => { try { return mp.getOption('captions', 'track')?.languageCode || ''; } catch { return ''; } };
      const toggleCC = () => mp.toggleSubtitles();

      const QUALITY = { hd2160: '2160p', hd1440: '1440p', hd1080: '1080p', hd720: '720p', large: '480p',
        medium: '360p', small: '240p', tiny: '144p', auto: 'Auto' };
      const fill = (sel, items, current) => {
        sel.replaceChildren(...items.map(([value, text]) => new Option(text, value, false, value === current)));
      };
      const openMenu = () => {
        fill(qualSel, mp.getAvailableQualityLevels().map((q) => [q, QUALITY[q] || q]), mp.getPlaybackQuality());
        fill(speedSel, mp.getAvailablePlaybackRates().map((r) => [String(r), r === 1 ? 'Normal' : String(r)]),
          String(mp.getPlaybackRate()));
        let tracks = [];
        try { tracks = mp.getOption('captions', 'tracklist') || []; } catch {}
        fill(subSel, [['', 'Off'], ...tracks.map((t) => [t.languageCode, t.displayName])], ccTrack());
        menu.hidden = false;
      };
      // Also drop focus from the dropdowns, or keyboard shortcuts stay ignored
      const closeMenu = () => { menu.hidden = true; if (menu.contains(document.activeElement)) document.activeElement.blur(); };
      qualSel.onchange = () => mp.setPlaybackQualityRange(qualSel.value, qualSel.value);
      speedSel.onchange = () => mp.setPlaybackRate(+speedSel.value);
      subSel.onchange = () => {
        if (!subSel.value) {
          mp.unloadModule('captions');
        } else {
          mp.loadModule('captions');
          mp.setOption('captions', 'track', { languageCode: subSel.value });
        }
      };
      // Clicking outside the menu closes it (and doesn't also play/pause)
      document.addEventListener('click', (e) => {
        if (menu.hidden || e.target.closest('#dsk-menu, #dsk-gear')) return;
        closeMenu();
        if (!e.target.closest('#dsk-bar')) e.stopPropagation();
      }, true);

      // Clicking a button shouldn't leave focus on it, or Space would re-press it
      bar.addEventListener('click', (e) => { e.stopPropagation(); e.target.closest('button')?.blur(); });
      play.onclick = togglePlay;
      muteBtn.onclick = toggleMute;
      cc.onclick = toggleCC;
      gear.onclick = () => (menu.hidden ? openMenu() : closeMenu());
      fs.onclick = () => mp.toggleFullscreen();
      vol.oninput = () => { setVol(+vol.value); paint(vol); };
      let seeking = false;
      seek.oninput = () => { seeking = true; paint(seek, mp.getVideoLoadedFraction()); time.textContent = `${fmt(seek.value / 1000 * mp.getDuration())} / ${fmt(mp.getDuration())}`; };
      seek.onchange = () => { mp.seekTo(seek.value / 1000 * mp.getDuration(), true); seeking = false; seek.blur(); };
      vol.onchange = () => vol.blur();

      // Click video to play/pause, double-click for full screen. YouTube handles
      // presses on the video itself, so take them first (capture phase) and stop
      // them; real buttons/links (e.g. an ad's skip button) are left alone.
      const onVideo = (e) => !e.target.closest('#dsk-bar, button, a, [role=button]');
      for (const t of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend']) {
        mp.addEventListener(t, (e) => { if (onVideo(e)) e.stopPropagation(); }, true);
      }
      mp.addEventListener('click', (e) => {
        if (!onVideo(e)) return;
        e.stopPropagation();
        togglePlay();
      }, true);
      mp.addEventListener('dblclick', (e) => {
        if (!onVideo(e)) return;
        e.stopPropagation();
        mp.toggleFullscreen();
      }, true);

      // Desktop keyboard shortcuts
      document.addEventListener('keydown', (e) => {
        if (e.ctrlKey || e.altKey || e.metaKey || e.target.closest?.('#dsk-menu')) return;
        const acts = {
          ' ': togglePlay, k: togglePlay, m: toggleMute, f: () => mp.toggleFullscreen(), c: toggleCC,
          ArrowLeft: () => seekBy(-5), ArrowRight: () => seekBy(5), j: () => seekBy(-10), l: () => seekBy(10),
          ArrowUp: () => setVol(mp.getVolume() + 5), ArrowDown: () => setVol(mp.getVolume() - 5),
        };
        const act = acts[e.key];
        if (!act) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        act();
        wake();
      }, true);

      // Auto-hide the bar while playing and the mouse is idle
      let idleTimer;
      const wake = () => {
        bar.classList.remove('dsk-hidden');
        mp.classList.remove('dsk-idle');
        clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
          if (playing() && menu.hidden && !bar.matches(':hover')) {
            bar.classList.add('dsk-hidden');
            mp.classList.add('dsk-idle');
          }
        }, 2500);
      };
      // YouTube stops mousemove from bubbling, so listen at the document in the capture phase
      document.addEventListener('mousemove', wake, true);
      document.documentElement.addEventListener('mouseleave', () => { if (playing() && menu.hidden) bar.classList.add('dsk-hidden'); });

      let wasPlaying = null;
      setInterval(() => {
        const p = playing();
        if (p !== wasPlaying) { wasPlaying = p; wake(); }
        setIcon(play, p ? 'pause' : 'play');
        play.title = p ? 'Pause (k)' : 'Play (k)';
        const muted = mp.isMuted() || mp.getVolume() === 0;
        setIcon(muteBtn, muted ? 'mute' : 'vol');
        if (document.activeElement !== vol) { vol.value = muted ? 0 : mp.getVolume(); paint(vol); }
        const fsOn = !!document.fullscreenElement;
        setIcon(fs, fsOn ? 'fsExit' : 'fs');
        fs.title = fsOn ? 'Exit full screen (f)' : 'Full screen (f)';
        cc.classList.toggle('dsk-on', !!ccTrack());
        const dur = mp.getDuration();
        if (!seeking) {
          seek.value = dur ? (mp.getCurrentTime() / dur) * 1000 : 0;
          paint(seek, mp.getVideoLoadedFraction());
          time.textContent = `${fmt(mp.getCurrentTime())} / ${fmt(dur)}`;
        }
      }, 250);
    }
  }
})();
