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
    // フロア×ソート別ファイル（anime/manga/goods の新着・高評価対応）
    floorSortFiles: {
        'anime': { rank: 'data/anime.json',  date: 'data/anime_date.json',  review: 'data/anime_review.json'  },
        'book':  { rank: 'data/manga.json',  date: 'data/manga_date.json',  review: 'data/manga_review.json'  },
        'goods': { rank: 'data/goods.json',  date: 'data/goods_date.json',  review: 'data/goods_review.json'  },
        'mono':  { rank: 'data/goods.json',  date: 'data/goods_date.json',  review: 'data/goods_review.json'  },
    },
    genreFiles: {
        '2001': 'data/genre_busty.json',     // 巨乳
        '1027': 'data/genre_bishoujo.json',  // 美少女
        '6533': 'data/genre_hd.json',        // ハイビジョン
        '4025': 'data/genre_single.json',    // 単体作品
        '4024': 'data/genre_amateur.json',   // 素人
        '5001': 'data/genre_creampie.json',  // 中出し
        '1039': 'data/genre_wife.json',      // 人妻・主婦
        '1001': 'data/genre_ol.json',        // OL
        '4031': 'data/genre_cosplay.json',   // コスプレ
        '6006': 'data/genre_debut.json',     // 新人（デビュー作品）
        '1034': 'data/genre_gal.json',       // ギャル
        '4022': 'data/genre_foreign.json',   // 外国人（洋ピン・海外輸入）
        '4001': 'data/genre_sm.json',        // SM
        '4006': 'data/genre_nanpa.json',    // ナンパ
        '2005': 'data/genre_hinyu.json',    // 貧乳・微乳
        '1018': 'data/genre_jk.json',       // 女子校生（ロリ）
        '1016': 'data/genre_teacher.json',  // 女教師
        '4002': 'data/genre_kinshin.json',  // 近親相姦
        '1028': 'data/genre_kuro.json',     // 黒人男優
        '4007': 'data/genre_kikaku.json',   // 企画
        '5002': 'data/genre_fella.json',    // フェラ
    },
    actressFiles: {
        'popular': 'data/actress_popular.json',
        'monthly': 'data/actress_monthly.json',
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
        // 検索対象ファイルを全パターン網羅
        // 1) sortFiles：videoa の rank/date/review/price
        // 2) floorSortFiles：anime/manga/goods の rank/date/review 全variants
        // 3) genreFiles + 派生 (_date/_review)
        const floorSortVariants = [];
        Object.values(this.floorSortFiles).forEach(map => {
            Object.values(map).forEach(f => floorSortVariants.push(f));
        });
        const genreVariants = [];
        Object.values(this.genreFiles).forEach(f => {
            genreVariants.push(f);
            genreVariants.push(f.replace('.json', '_date.json'));
            genreVariants.push(f.replace('.json', '_review.json'));
        });
        const allFiles = [
            ...new Set([
                ...Object.values(this.sortFiles),
                ...floorSortVariants,
                ...genreVariants,
            ])
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

    // ===== ジャンル×ソートのファイルパスを解決 =====
    _getGenreFile(genreId, sort) {
        const rankFile = this.genreFiles[genreId]; // e.g. 'data/genre_ol.json'
        if (!rankFile) return null;
        if (!sort || sort === 'rank') return rankFile;
        // sort='-price' → suffix='pricelow'、それ以外はsort名そのまま
        const suffix = sort === '-price' ? 'pricelow' : sort;
        return rankFile.replace('.json', `_${suffix}.json`);
    },

    // ===== 商品リスト取得（静的JSONから） =====
    async fetch(params = {}) {
        // cid指定は横断検索へ
        if (params.cid) return this.fetchByCid(params.cid, params.floor);

        let file;
        if (params.article_id && this.genreFiles[params.article_id]) {
            // ジャンル指定：ソート別ファイルを使用（なければrankにフォールバック）
            const sortFile = this._getGenreFile(params.article_id, params.sort);
            const data = await this._loadFile(sortFile);
            if (data?.result?.items?.length > 0) return data;
            // ソート別ファイル未生成の場合はrankファイルで代替
            file = this.genreFiles[params.article_id];
        } else if (params.floor && params.floor !== 'videoa' && this.floorSortFiles[params.floor]) {
            // videoa以外のフロア（anime/book/goods等）：ソート別ファイルを使用
            const sort = params.sort || 'rank';
            const sortMap = this.floorSortFiles[params.floor];
            file = sortMap[sort] || sortMap['rank'];
        } else {
            // videoa or ソート指定：ソートJSONを使用
            file = this.sortFiles[params.sort] || this.sortFiles['rank'];
        }

        return await this._loadFile(file);
    }
};
