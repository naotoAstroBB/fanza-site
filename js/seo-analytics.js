/* Same GA4 measurement ID and affiliate_click event as the existing storefront. */
window.dataLayer = window.dataLayer || [];
function gtag(){ window.dataLayer.push(arguments); }
gtag('js', new Date());
gtag('config', 'G-90ZV8JH151');
document.addEventListener('click', event => {
  const link = event.target.closest?.('a[href]');
  if (!link) return;
  let hostname;
  try { hostname = new URL(link.href, location.href).hostname.toLowerCase(); }
  catch (_) { return; }
  const hosts = ['dmm.com', 'dmm.co.jp', 'fanza.com', 'fanza.jp', 'fanza.co.jp'];
  if (!hosts.some(host => hostname === host || hostname.endsWith('.' + host))) return;
  gtag('event', 'affiliate_click', {
    destination_site: 'FANZA',
    page_path: location.pathname,
    source_section: 'seo_works'
  });
});
