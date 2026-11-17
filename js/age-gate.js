/* Same-page age confirmation for public, indexable HTML. No crawler-specific behavior. */
(function () {
  'use strict';
  const KEY = 'age_verified';
  let verified = false;
  try { verified = localStorage.getItem(KEY) === 'yes'; } catch (_) {}
  window.AgeGate = {
    isVerified: function () { return verified; }
  };
  if (verified) return;
  // Apply the lock before the page body is rendered to avoid a visible flash.
  document.documentElement.classList.add('age-check-required');

  function mountAgeGate() {
    if (verified || document.getElementById('siteAgeGate')) return;
    const overlay = document.createElement('div');
    overlay.id = 'siteAgeGate';
    overlay.className = 'site-age-gate';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'siteAgeGateTitle');
    overlay.setAttribute('aria-describedby', 'siteAgeGateDesc');
    overlay.innerHTML =
      '<div class="site-age-dialog">' +
      '<div class="site-age-logo">AV動画ランキング</div>' +
      '<h2 id="siteAgeGateTitle">年齢確認</h2>' +
      '<p id="siteAgeGateDesc">このサイトは成人向けコンテンツを含みます。18歳以上（高校生を除く）ですか？</p>' +
      '<button type="button" id="siteAgeAccept">18歳以上です・サイトを見る</button>' +
      '<a href="https://www.google.co.jp/" id="siteAgeDecline" rel="nofollow noopener noreferrer">18歳未満・退出する</a>' +
      '<p class="site-age-footnote">年齢確認後は、このページをそのまま閲覧できます。</p>' +
      '</div>';
    document.body.appendChild(overlay);
    const accept = overlay.querySelector('#siteAgeAccept');
    const decline = overlay.querySelector('#siteAgeDecline');
    accept.addEventListener('click', function () {
      try { localStorage.setItem(KEY, 'yes'); } catch (_) {}
      verified = true;
      document.documentElement.classList.remove('age-check-required');
      overlay.remove();
      document.dispatchEvent(new Event('age-verified'));
    });
    // Do not allow keyboard focus to escape the mandatory dialog.
    overlay.addEventListener('keydown', function (event) {
      if (event.key === 'Tab') {
        const target = document.activeElement;
        if (event.shiftKey && target === accept) {
          event.preventDefault();
          decline.focus();
        } else if (!event.shiftKey && target === decline) {
          event.preventDefault();
          accept.focus();
        }
      }
    });
    accept.focus();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountAgeGate, {once:true});
  } else {
    mountAgeGate();
  }
})();
