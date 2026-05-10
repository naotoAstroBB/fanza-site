// DMM FANZA API クライアント（JSONP方式）
const DMM = {
    API_ID:       'UXJdpULBN1sPyNKKPPHU',
    AFFILIATE_ID: 'saaaaaaya-990',   // API専用ID（末尾990〜999）
    BASE_URL:     'https://api.dmm.com/affiliate/v3/ItemList',
    _cbIndex: 0,

    fetch(params) {
        return new Promise((resolve, reject) => {
            const cbName = `_dmmCb${this._cbIndex++}`;

            const timeout = setTimeout(() => {
                delete window[cbName];
                if (script.parentNode) script.remove();
                reject(new Error('タイムアウト'));
            }, 12000);

            window[cbName] = (data) => {
                clearTimeout(timeout);
                delete window[cbName];
                if (script.parentNode) script.remove();
                resolve(data);
            };

            const qs = new URLSearchParams({
                api_id:       this.API_ID,
                affiliate_id: this.AFFILIATE_ID,
                site:         'FANZA',
                service:      'digital',
                output:       'json',
                callback:     cbName,
                floor:        'videoa',
                sort:         'rank',
                hits:         24,
                offset:       1,
                ...params,
            });

            const script = document.createElement('script');
            script.src = `${this.BASE_URL}?${qs.toString()}`;
            script.onerror = () => {
                clearTimeout(timeout);
                delete window[cbName];
                reject(new Error('API読み込みエラー'));
            };
            document.head.appendChild(script);
        });
    },
};
