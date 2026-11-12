/* Age confirmation for crawlable static product pages. Rendered HTML is identical for all clients. */
(() => {
  const layer = document.getElementById('ageLayer');
  if (!layer) return;
  let verified = false;
  try { verified = localStorage.getItem('age_verified') === 'yes'; } catch (_) {}
  // Catalogue filtering is an enhancement only; links remain present in the HTML.
  const search = document.getElementById('worksSearch');
  const grid = document.getElementById('worksGrid');
  const count = document.getElementById('worksCount');
  if (search && grid && count) {
    const cards = Array.from(grid.querySelectorAll('li'));
    search.addEventListener('input', () => {
      const query = search.value.trim().normalize('NFKC').toLocaleLowerCase();
      let visible = 0;
      for (const card of cards) {
        const match = !query || card.textContent.normalize('NFKC').toLocaleLowerCase().includes(query) ||
          (card.querySelector('a')?.getAttribute('href') || '').toLocaleLowerCase().includes(query);
        card.hidden = !match;
        if (match) visible++;
      }
      count.textContent = visible + '作品を表示中';
    });
  }
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
