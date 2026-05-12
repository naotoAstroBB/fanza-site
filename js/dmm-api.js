// DMM FANZA データ読み込み（GitHub Actions 生成の JSON ファイルを使用）
const DMM = {
    sortFiles: {
        'rank':   'data/rank.json',
        'date':   'data/new.json',
        'review': 'data/review.json',
        'price':  'data/price_asc.json',
        '-price': 'data/price_desc.json',
    },
    floorFiles: {
        'anime': 'data/anime.json',
        'book':  'data/manga.json',
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
        '6006': 'data/genre_debut.json',     // 新人（デビュー作品）
        '1034': 'data/genre_gal.json',       // ギャル
        '4022': 'data/genre_foreign.json',   // 外国人（洋ピン・海外輸入）
    },
    actressFiles: {
        'popular': 'data/actress_popular.json',
        'new':     'data/actress_new.json',
    },

    // ===== 内部キャッシュ =====
    _cache: {},
    _cacheTs: {},

    _empty() {
        return { result: { status: 200, items: [], total_count: 0, result_count: 0 } };
    },

    async _loadFile(file) {
        const key = file.split('?')[0];
        const now = Date.now();
        // 1分以内に読んだファイルはキャッシュから返す
        if (this._cache[key] && (now - (this._cacheTs[key] || 0)) < 60000) {
            return this._cache[key];
        }
        try {
            const res = await fetch(key + '?_=' + Math.floor(now / 60000));
            // 404など失敗時は空データを返す（エラーを表面に出さない）
            if (!res.ok) {
                const empty = this._empty();
                this._cache[key] = empty;
                this._cacheTs[key] = now;
                return empty;
            }
            const data = await res.json();
            // 404ステータスのJSONも空データとして扱う
            if (data?.result?.status === 404) {
                const empty = this._empty();
                this._cache[key] = empty;
                this._cacheTs[key] = now;
                return empty;
            }
            this._cache[key] = data;
            this._cacheTs[key] = now;
            return data;
        } catch(e) {
            // ネットワークエラー等は空データを返す
            return this._empty();
        }
    },

    // ===== 商品IDで全JSONを横断検索 =====
    async fetchByCid(cid, floor) {
        const allFiles = [
            ...Object.values(this.sortFiles),
            ...(floor && this.floorFiles[floor] ? [this.floorFiles[floor]] : []),
            ...Object.values(this.genreFiles),
        ];
        // 並列フェッチ → 最初に見つかった商品を返す
        const results = await Promise.allSettled(
            allFiles.map(f =>
                this._loadFile(f).then(d =>
                    (d?.result?.items || []).find(i => i.content_id === cid) || null
                ).catch(() => null)
            )
        );
        const item = results.map(r => r.value).find(v => v);
        if (item) return { result: { status: 200, items: [item], total_count: 1, result_count: 1 } };
        throw new Error('商品データが見つかりません (cid: ' + cid + ')');
    },

    // ===== 女優データ取得 =====
    async fetchActress(type = 'popular') {
        return this._loadFile(this.actressFiles[type] || this.actressFiles['popular'])
            .then(data => {
                if (data?.result?.status === 404) throw new Error('女優データが準備されていません');
                return data;
            });
    },

    // ===== 商品リスト取得（静的JSONから） =====
    async fetch(params = {}) {
        // cid指定は横断検索へ
        if (params.cid) return this.fetchByCid(params.cid, params.floor);

        let file;
        if (params.article_id && this.genreFiles[params.article_id]) {
            // ジャンル指定：ジャンルJSONを使用
            file = this.genreFiles[params.article_id];
        } else if (params.floor && params.floor !== 'videoa' && this.floorFiles[params.floor]) {
            // videoa以外のフロア（anime/book/goods等）：フロアJSONを使用
            file = this.floorFiles[params.floor];
        } else {
            // videoa or ソート指定：ソートJSONを使用
            file = this.sortFiles[params.sort] || this.sortFiles['rank'];
        }

        return await this._loadFile(file);
    }
};
