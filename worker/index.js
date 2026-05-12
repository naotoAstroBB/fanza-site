// Cloudflare Worker - DMM API プロキシ
const DMM_API_ID       = 'UXJdpULBN1sPyNKKPPHU';
const DMM_AFFILIATE_ID = 'saaaaaaya-001';
const DMM_API_URL      = 'https://api.dmm.com/affiliate/v3/ItemList';
const ALLOWED_ORIGIN   = 'https://naotoastrobb.github.io';

// 許可するクエリパラメータ
const ALLOWED_PARAMS = ['service','floor','hits','offset','sort','keyword','cid','article','article_id','gte_date','lte_date','mono_stock'];

export default {
  async fetch(request) {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
          'Access-Control-Allow-Methods': 'GET',
          'Access-Control-Max-Age': '86400',
        }
      });
    }

    // GETのみ許可
    if (request.method !== 'GET') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    const incomingUrl = new URL(request.url);

    // DMM API パラメータ構築
    const params = new URLSearchParams({
      api_id:       DMM_API_ID,
      affiliate_id: DMM_AFFILIATE_ID,
      site:         'FANZA',
      service:      incomingUrl.searchParams.get('service') || 'digital',
      output:       'json',
    });

    // 許可パラメータのみ転送
    for (const key of ALLOWED_PARAMS) {
      const val = incomingUrl.searchParams.get(key);
      if (val) params.set(key, val);
    }

    const dmmUrl = `${DMM_API_URL}?${params.toString()}`;

    try {
      const res = await fetch(dmmUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; FANZAAffiliate/1.0)',
          'Referer': ALLOWED_ORIGIN + '/',
        },
        cf: { cacheTtl: 300, cacheEverything: true }, // 5分キャッシュ
      });

      const data = await res.json();

      return new Response(JSON.stringify(data), {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
          'Cache-Control': 'public, max-age=300',
        }
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 502,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
        }
      });
    }
  }
};
