/* Internal return navigation and verified FANZA book preview URLs. */
(function (root) {
  'use strict';

  function previewUrl(item, floor) {
    if (floor !== 'book' || !item || typeof item !== 'object') return '';
    // The API exposes both an affiliate redirect and the actual book.dmm.co.jp
    // reader URL. The former may land on the product page rather than the reader.
    // Prefer the direct official reader for "試し読み"; purchase links stay affiliate.
    const candidate = item.tachiyomi && item.tachiyomi.URL;
    if (typeof candidate !== 'string') return '';
    try {
      const u = new URL(candidate);
      const match = /^\/product\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/tachiyomi\/?$/.test(u.pathname);
      if (u.protocol !== 'https:' || u.hostname !== 'book.dmm.co.jp' || !match) return '';
      const expectedId = String(item.content_id || '');
      const pathId = u.pathname.split('/')[3];
      if (!expectedId || expectedId !== pathId) return '';
      return u.href;
    } catch (_) { return ''; }
  }

  function safeReturn(value, loc) {
    if (!value || typeof value !== 'string') return '';
    try {
      const url = new URL(value, loc.origin);
      if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
      if (url.origin !== loc.origin) return '';
      if (!/^\/(?:home|product|actress|actresses|guide)\.html$/.test(url.pathname) &&
          !/^\/works\/[A-Za-z0-9_-]+\.html$/.test(url.pathname)) return '';
      if (url.pathname + url.search === loc.pathname + loc.search) return '';
      return url.pathname + url.search + url.hash;
    } catch (_) { return ''; }
  }

  function goBack(fallback) {
    const fallbackPath = typeof fallback === 'string' ? fallback : '/home.html';
    const loc = root.location;
    const params = new URLSearchParams(loc.search || '');
    const explicit = safeReturn(params.get('from'), loc);
    const referer = safeReturn(root.document && root.document.referrer, loc);
    const dest = explicit || referer || safeReturn(fallbackPath, loc) || '/home.html';
    // Not history.back(): it can be a no-op on direct visits and reused tabs.
    loc.assign(dest);
  }

  function fromHere() {
    const loc = root.location;
    return loc.pathname + loc.search + (loc.hash || '');
  }

  root.FanzaNavigation = {previewUrl, safeReturn, goBack, fromHere};
  if (typeof module === 'object' && module.exports) module.exports = root.FanzaNavigation;
})(typeof window === 'undefined' ? globalThis : window);
