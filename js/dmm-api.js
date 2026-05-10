// DMM FANZA データ読み込み（GitHub Actions が生成した JSON ファイルを使用）
const DMM = {
    // ソート・フロアに対応するデータファイルマップ
    files: {
        'rank':    'data/rank.json',
        'date':    'data/new.json',
        'review':  'data/review.json',
        'anime':   'data/anime.json',
    },
    genreFiles: {
        '4002': 'data/genre_busty.json',    // 巨乳
        '4017': 'data/genre_amateur.json',  // 素人
        '4065': 'data/genre_wife.json',     // 人妻
    },

    async fetch(params) {
        // ジャンル指定あり
        if (params.article_id && this.genreFiles[params.article_id]) {
            const res = await window.fetch(this.genreFiles[params.article_id]);
            if (!res.ok) throw new Error(`データ取得失敗: ${res.status}`);
            return await res.json();
        }

        // ソート・フロア指定
        const key = params.floor === 'anime' ? 'anime' : (params.sort || 'rank');
        const file = this.files[key] || this.files['rank'];

        const res = await window.fetch(file);
        if (!res.ok) throw new Error(`データ取得失敗: ${res.status}`);
        return await res.json();
    }
};
