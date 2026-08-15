// ==UserScript==
// @name         Kick Ad Blocker
// @namespace    kick-adblock
// @version      1.0.0
// @description  Blocks video ads on Kick.com live streams. No tracking, no data collection.
// @match        *://kick.com/*
// @match        *://*.kick.com/*
// @run-at       document-start
// @grant        unsafeWindow
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_notification
// ==/UserScript==

(() => {
  'use strict';

  const W = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;

  const PLAYBACK_RE = /\/playback/i;
  const SEGMENT_RE  = /\/v1\/segment\/.*\.ts(\?|$)/i;
  const DNA_MIN     = 1200;

  let enabled = GM_getValue('enabled', true);

  GM_registerMenuCommand(`Kick Ad Blocker: ${enabled ? 'ON' : 'OFF'} (click to toggle)`, () => {
    enabled = !enabled;
    GM_setValue('enabled', enabled);
    try {
      GM_notification({
        text: `Kick Ad Blocker is now ${enabled ? 'ON' : 'OFF'}. Reload the page.`,
        title: 'Kick Ad Blocker',
        timeout: 3000
      });
    } catch (_) {
      console.log(`[Kick Ad Blocker] now ${enabled ? 'ON' : 'OFF'} — reload the page.`);
    }
  });

  // ---- ad-segment detection -------------------------------------------------
  // Real stream segments carry a short `dna` token; ad-stitched segments carry
  // a very long one. 1200 chars is the extension's original threshold.
  const dnaLength = (rawUrl) => {
    try {
      return (new W.URL(rawUrl, location.origin).searchParams.get('dna') || '').length;
    } catch (_) {
      return 0;
    }
  };

  const isAdSegment = (url) => SEGMENT_RE.test(url || '') && dnaLength(url) >= DNA_MIN;

  // ---- playback JSON rewriting ----------------------------------------------
  const removePath = (obj, path) => {
    const parts = path.split('.').filter(Boolean);
    let cur = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!cur || typeof cur !== 'object' || !(parts[i] in cur)) return;
      cur = cur[parts[i]];
    }
    if (cur && typeof cur === 'object') delete cur[parts[parts.length - 1]];
  };

  const setPath = (obj, path, value) => {
    const parts = path.split('.').filter(Boolean);
    let cur = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!cur[parts[i]] || typeof cur[parts[i]] !== 'object') cur[parts[i]] = {};
      cur = cur[parts[i]];
    }
    cur[parts[parts.length - 1]] = value;
  };

  const stripAds = (json) => {
    if (!json || typeof json !== 'object') return json;
    removePath(json, 'video_player.datazoom_sdk');
    removePath(json, 'video_player.google_ads_sdk');
    removePath(json, 'video_player.pal_sdk');
    setPath(json, 'auto_ads_enabled', false);
    setPath(json, 'playback_url.live', null);
    setPath(json, 'video_session.auto_ads_enabled', false);
    return json;
  };

  const modifyText = (url, text) => {
    if (!PLAYBACK_RE.test(url || '')) return null;
    try {
      return JSON.stringify(stripAds(JSON.parse(text)));
    } catch (_) {
      return null;
    }
  };

  // ---- fetch hook -----------------------------------------------------------
  const originalFetch = W.fetch;
  W.fetch = async function (...args) {
    const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url || '');

    if (enabled && isAdSegment(url)) {
      return new W.Response(new W.Uint8Array(0), { status: 204, statusText: 'No Content' });
    }

    const res = await originalFetch.apply(this, args);

    if (!enabled || !PLAYBACK_RE.test(url)) return res;

    try {
      const clone = res.clone();
      const ct = clone.headers.get('content-type') || '';
      if (!/application\/json|text\/json/i.test(ct)) return res;
      const modified = JSON.stringify(stripAds(await clone.json()));
      return new W.Response(modified, {
        status: res.status,
        statusText: res.statusText,
        headers: res.headers
      });
    } catch (_) {
      return res;
    }
  };

  // ---- XHR hook -------------------------------------------------------------
  const XHR = W.XMLHttpRequest.prototype;
  const origOpen = XHR.open;
  const origSend = XHR.send;

  XHR.open = function (method, url, ...rest) {
    this.__kickUrl = typeof url === 'string' ? url : '';
    return origOpen.call(this, method, url, ...rest);
  };

  XHR.send = function (...sendArgs) {
    const url = this.__kickUrl || '';

    if (enabled && isAdSegment(url)) {
      this.abort();
      return;
    }

    if (!enabled || !PLAYBACK_RE.test(url)) {
      return origSend.apply(this, sendArgs);
    }

    let modified = null;
    const xhr = this;
    const textDesc = Object.getOwnPropertyDescriptor(XHR, 'responseText');
    const respDesc = Object.getOwnPropertyDescriptor(XHR, 'response');

    this.addEventListener('readystatechange', () => {
      try {
        if (xhr.readyState !== 4) return;
        const src = textDesc?.get ? textDesc.get.call(xhr) : '';
        if (typeof src !== 'string' || !src.length) return;
        modified = modifyText(url, src);
      } catch (_) {
        modified = null;
      }
    });

    Object.defineProperty(this, 'responseText', {
      configurable: true,
      get() {
        if (modified !== null) return modified;
        return textDesc?.get ? textDesc.get.call(xhr) : '';
      }
    });

    Object.defineProperty(this, 'response', {
      configurable: true,
      get() {
        if (modified !== null) {
          if (xhr.responseType === '' || xhr.responseType === 'text') return modified;
          if (xhr.responseType === 'json') {
            try { return JSON.parse(modified); } catch (_) { return null; }
          }
        }
        return respDesc?.get ? respDesc.get.call(xhr) : null;
      }
    });

    return origSend.apply(this, sendArgs);
  };
})();
