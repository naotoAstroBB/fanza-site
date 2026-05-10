// DMM FANZA API クライアント（Cloudflare Worker 経由）
const DMM = {
    // ★ Cloudflare Worker をデプロイしたら URL を更新してください
    WORKER_URL: 'https://fanza-proxy.YOUR_SUBDOMAIN.workers.dev',

    async fetch(params) {
        const qs = new URLSearchParams({
            floor:   'videoa',
            sort:    'rank',
            hits:    24,
            offset:  1,
            ...params,
        });

        const url = `${this.WORKER_URL}?${qs.toString()}`;

        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
    }
};
