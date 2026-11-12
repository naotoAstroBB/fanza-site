/* Age confirmation for crawlable static product pages. Rendered HTML is identical for all clients. */
(() => {
  const layer = document.getElementById('ageLayer');
  if (!layer) return;
  let verified = false;
  try { verified = localStorage.getItem('age_verified') === 'yes'; } catch (_) {}
  if (verified) return;
  layer.hidden = false;
  document.body.classList.add('seo-age-locked');
  const button = document.getElementById('ageYes');
  if (button) button.addEventListener('click', () => {
    try { localStorage.setItem('age_verified', 'yes'); } catch (_) {}
    layer.hidden = true;
    document.body.classList.remove('seo-age-locked');
  });
})();
