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
        'vr':    'data/vr.json',
    },
    // フロア×ソート別ファイル（anime/manga/goods/vr の新着・高評価対応）
    floorSortFiles: {
        'anime': { rank: 'data/anime.json',  date: 'data/anime_date.json',  review: 'data/anime_review.json'  },
        'book':  { rank: 'data/manga.json',  date: 'data/manga_date.json',  review: 'data/manga_review.json'  },
        'goods': { rank: 'data/goods.json',  date: 'data/goods_date.json',  review: 'data/goods_review.json'  },
        'mono':  { rank: 'data/goods.json',  date: 'data/goods_date.json',  review: 'data/goods_review.json'  },
        'vr':    { rank: 'data/vr.json',     date: 'data/vr_date.json',     review: 'data/vr_review.json'     },
    },
    genreFiles: {
        '2001': 'data/genre_busty.json',      // 巨乳
        '1027': 'data/genre_bishoujo.json',   // 美少女
        '6533': 'data/genre_hd.json',         // ハイビジョン
        '4025': 'data/genre_single.json',     // 単体作品
        '4024': 'data/genre_amateur.json',    // 素人
        '5001': 'data/genre_creampie.json',   // 中出し
        '1039': 'data/genre_wife.json',       // 人妻・主婦
        '1001': 'data/genre_ol.json',         // OL
        '4031': 'data/genre_cosplay.json',    // コスプレ
        '6006': 'data/genre_debut.json',      // 新人（デビュー作品）
        '1034': 'data/genre_gal.json',        // ギャル
        '4022': 'data/genre_foreign.json',    // 外国人
        '4001': 'data/genre_sm.json',         // SM
        '4006': 'data/genre_nanpa.json',      // ナンパ
        '2005': 'data/genre_hinyu.json',      // 貧乳・微乳
        '1018': 'data/genre_jk.json',         // 女子校生
        '1016': 'data/genre_teacher.json',    // 女教師
        '4002': 'data/genre_kinshin.json',    // 近親相姦
        '1028': 'data/genre_kuro.json',       // 黒人男優
        '4007': 'data/genre_kikaku.json',     // 企画
        '5002': 'data/genre_fella.json',      // フェラ
        '1031': 'data/genre_chijo.json',      // 痴女
        '1014': 'data/genre_milf.json',       // 熟女
        '2006': 'data/genre_slender.json',    // スレンダー
        '4106': 'data/genre_kijo.json',       // 騎乗位
        '4111': 'data/genre_ntr.json',        // NTR・寝取られ
        '4030': 'data/genre_hard.json',       // ハード系
        '5022': 'data/genre_3p4p.json',       // 3P・4P
        '5016': 'data/genre_shio.json',       // 潮吹き
        '5019': 'data/genre_paizuri.json',    // パイズリ
        '102':  'data/genre_binyuu.json',     // 美乳
        '48':   'data/genre_seifuku.json',    // 制服
        '6002': 'data/genre_hamesatsu.json',  // ハメ撮り
        '2024': 'data/genre_ojiri.json',      // お尻
        '1033': 'data/genre_onesan.json',     // お姉さん
        '5023': 'data/genre_gansha.json',     // 顔射
        '4005': 'data/genre_ranko.json',      // 乱交
        '5004': 'data/genre_tekoki.json',     // 手コキ
        '1019': 'data/genre_joshi_daigaku.json', // 女子大生
        '6968': 'data/genre_acme.json',       // アクメ・潮吹き
        '5057': 'data/genre_lotion.json',     // ローション
        '28':   'data/genre_shuchi.json',     // 羞恥
        '4059': 'data/genre_kiss.json',       // キス・接吻
        '1069': 'data/genre_furin.json',      // 不倫
        '5068': 'data/genre_irama.json',      // イラマチオ
        '27':   'data/genre_hazukashime.json',// 恥辱
        '4023': 'data/genre_docu.json',       // ドキュメント
        '5063': 'data/genre_shukan.json',     // 女性向け
        '4114': 'data/genre_drama.json',      // ドラマ
        '4011': 'data/genre_ojiri_feti.json', // 尻フェチ
        '4133': 'data/genre_nurse.json',      // 看護師
        '1013': 'data/genre_lez.json',        // レズ・百合
        '5006': 'data/genre_anal.json',       // アナル
        '4009': 'data/genre_roshutsu.json',   // 露出
        '4008': 'data/genre_ryoujoku.json',   // 陵辱
        '4021': 'data/genre_kousoku.json',    // 拘束
        '4010': 'data/genre_kankin.json',     // 監禁
        '5029': 'data/genre_ashikoki.json',   // 足コキ
        '5059': 'data/genre_denma.json',      // 電マ
        '5025': 'data/genre_bukake.json',     // ぶっかけ
    },
    actressFiles: {
        'popular': 'data/actress_popular.json',
        'monthly': 'data/actress_monthly.json',
        'new':     'data/actress_new.json',
    },
    makerFiles: [
        'data/maker_s1.json',
        'data/maker_moodyz.json',
        'data/maker_madonna.json',
        'data/maker_ideapocket.json',
        'data/maker_faleno.json',
        'data/maker_prestige.json',
        'data/maker_maxing.json',
        'data/maker_dod.json',
        'data/maker_wanz.json',
        'data/maker_das.json',
        'data/maker_sod.json',
        'data/maker_attackers.json',
        'data/maker_deeps.json',
        'data/maker_fitch.json',
        'data/maker_kawaii.json',
        'data/maker_ebody.json',
    ],

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
        // Step1: メインファイルを優先検索（rank/new/review は10000件ずつあるため大半はここでヒット）
        const mainFiles = [
            ...Object.values(this.sortFiles),
            ...Object.values(this.floorSortFiles).flatMap(m => Object.values(m)),
        ];
        for (const f of mainFiles) {
            try {
                const d = await this._loadFile(f);
                const item = (d?.result?.items || []).find(i => i.content_id === cid);
                if (item) return { result: { status: 200, items: [item], total_count: 1, result_count: 1 } };
            } catch(e) {}
        }

        // Step2: メーカーファイルを逐次検索（大半のメーカー作品はここでヒット）
        for (const f of this.makerFiles) {
            try {
                const d = await this._loadFile(f);
                const item = (d?.result?.items || []).find(i => i.content_id === cid);
                if (item) return { result: { status: 200, items: [item], total_count: 1, result_count: 1 } };
            } catch(e) {}
        }

        // Step3: ジャンルファイルを逐次検索（並列ではなく1件ずつ → メモリ節約）
        const genreRankFiles = [...new Set(Object.values(this.genreFiles))];
        for (const f of genreRankFiles) {
            try {
                const d = await this._loadFile(f);
                const item = (d?.result?.items || []).find(i => i.content_id === cid);
                if (item) return { result: { status: 200, items: [item], total_count: 1, result_count: 1 } };
            } catch(e) {}
        }
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
