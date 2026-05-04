// DMM FANZA API JSONP クライアント
const DMM = {
    API_ID:       'UXJdpULBN1sPyNKKPPHU',
    AFFILIATE_ID: 'saaaaaaya-001',
    BASE_URL:     'https://api.dmm.com/affiliate/v3/ItemList',
    _cbIndex: 0,

    fetch(params) {
        return new Promise((resolve, reject) => {
            const cbName = `_dmmCb${this._cbIndex++}`;
            const timeout = setTimeout(() => {
                delete window[cbName];
                script.remove();
                reject(new Error('タイムアウト'));
            }, 10000);

            window[cbName] = (data) => {
                clearTimeout(timeout);
                delete window[cbName];
                script.remove();
                resolve(data);
            };

            const qs = new URLSearchParams({
                api_id:       this.API_ID,
                affiliate_id: this.AFFILIATE_ID,
                site:         'FANZA',
                service:      'digital',
                output:       'json',
                callback:     cbName,
                ...params,
            });

            const script = document.createElement('script');
            script.src = `${this.BASE_URL}?${qs}`;
            script.onerror = () => {
                clearTimeout(timeout);
                delete window[cbName];
                reject(new Error('API読み込みエラー'));
            };
            document.head.appendChild(script);
        });
    },
};
