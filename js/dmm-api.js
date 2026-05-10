// DMM FANZA データ読み込み（GitHub Actions 生成の JSON ファイルを使用）
const DMM = {
    sortFiles: {
        'rank':   'data/rank.json',
        'date':   'data/new.json',
        'review': 'data/review.json',
    },
    floorFiles: {
        'anime': 'data/anime.json',
        'goods': 'data/goods.json',
        'mono':  'data/goods.json',
    },
    genreFiles: {
        '4002': 'data/genre_busty.json',
        '4007': 'data/genre_bishoujo.json',
        '4049': 'data/genre_hd.json',
        '4013': 'data/genre_single.json',
        '4017': 'data/genre_amateur.json',
        '4028': 'data/genre_creampie.json',
        '4065': 'data/genre_wife.json',
        '4051': 'data/genre_ol.json',
        '4061': 'data/genre_cosplay.json',
    },

    async fetch(params = {}) {
        let file;

        // ジャンル指定
        if (params.article_id && this.genreFiles[params.article_id]) {
            file = this.genreFiles[params.article_id];
        }
        // フロア指定（アニメ・グッズ）
        else if (params.floor && this.floorFiles[params.floor]) {
            file = this.floorFiles[params.floor];
        }
        // ソート指定
        else {
            file = this.sortFiles[params.sort] || this.sortFiles['rank'];
        }

        const res = await fetch(file + '?_=' + Math.floor(Date.now() / 60000)); // 1分キャッシュ
        if (!res.ok) throw new Error(`データ取得失敗 (${res.status}): ${file}`);
        const data = await res.json();
        if (data?.result?.status === 404) throw new Error('データが準備されていません');
        return data;
    }
};
