/* Stateless, testable catalogue filters. Missing metadata does not match numeric filters. */
(function (root) {
  'use strict';
  const normal = value => String(value == null ? '' : value).normalize('NFKC').trim().toLocaleLowerCase('ja');
  const parseAmount = value => {
    if (value === undefined || value === null || value === '') return null;
    const text = normal(value).replace(/,/g, '');
    const match = text.match(/(?:^|[^\d])([0-9]+)(?:\s*(?:円|～|~|から|$))/);
    if (!match) return null;
    const num = Number(match[1]);
    return Number.isFinite(num) ? num : null;
  };
  const parseDuration = value => {
    if (value === null || value === undefined || value === '') return null;
    const text = normal(value);
    const match = text.match(/^(\d+(?:\.\d+)?)/);
    if (!match) return null;
    const number = Number(match[1]);
    return Number.isFinite(number) ? number : null;
  };
  const hasActive = filters => Boolean(
    filters && (filters.year || filters.minPrice || filters.maxPrice || filters.minMinutes || filters.maker)
  );
  const filter = (items, filters, floor) => {
    if (!Array.isArray(items) || !hasActive(filters)) return items || [];
    const selectedYear = normal(filters.year);
    const makerQuery = normal(filters.maker);
    const minPrice = parseAmount(filters.minPrice);
    const maxPrice = parseAmount(filters.maxPrice);
    const minMinutes = parseDuration(filters.minMinutes);
    return items.filter(item => {
      if (!item || typeof item !== 'object') return false;
      if (selectedYear && !String(item.date || '').startsWith(selectedYear)) return false;
      const price = parseAmount(item.prices && item.prices.price);
      if (minPrice !== null && (price === null || price < minPrice)) return false;
      if (maxPrice !== null && (price === null || price > maxPrice)) return false;
      if (minMinutes !== null && (floor !== 'videoa' && floor !== 'anime' && floor !== 'vr')) return false;
      if (minMinutes !== null) {
        const duration = parseDuration(item.volume);
        if (duration === null || duration < minMinutes) return false;
      }
      if (makerQuery) {
        const makers = (item.iteminfo && item.iteminfo.maker) || [];
        if (!Array.isArray(makers) || !makers.some(m => normal(m && m.name).includes(makerQuery))) return false;
      }
      return true;
    });
  };
  root.CatalogueFilters = {filter, hasActive, parseAmount, parseDuration};
  if (typeof module === 'object' && module.exports) module.exports = root.CatalogueFilters;
})(typeof window === 'undefined' ? globalThis : window);
