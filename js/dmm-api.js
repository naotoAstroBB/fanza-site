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
        '2001': 'data/genre_busty.json',     // 巨乳
        '1027': 'data/genre_bishoujo.json',  // 美少女
        '6533': 'data/genre_hd.json',        // ハイビジョン
        '4025': 'data/genre_single.json',    // 単体作品
        '4024': 'data/genre_amateur.json',   // 素人
        '5001': 'data/genre_creampie.json',  // 中出し
        '1039': 'data/genre_wife.json',      // 人妻・主婦
        '1008': 'data/genre_ol.json',        // OL
        '4031': 'data/genre_cosplay.json',   // コスプレ
    },

    actressFiles: {
        'popular': 'data/actress_popular.json',
        'new':     'data/actress_new.json',
    },

    async fetchActress(type = 'popular') {
        const file = this.actressFiles[type] || this.actressFiles['popular'];
        const res = await fetch(file + '?_=' + Math.floor(Date.now() / 60000));
        if (!res.ok) throw new Error(`女優データ取得失敗 (${res.status}): ${file}`);
        const data = await res.json();
        if (data?.result?.status === 404) throw new Error('女優データが準備されていません');
        return data;
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
