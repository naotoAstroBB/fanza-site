// ===== FANZA アフィリエイトサイト メインJS =====

// 年齢確認チェック
if (location.pathname.includes('home') || location.pathname.includes('product')) {
    if (localStorage.getItem('age_verified') !== 'yes') {
        location.href = 'index.html';
    }
}

const App = {
    floor:        'videoa',
    sort:         'rank',
    keyword:      '',
    genre:        '',
    page:         1,
    hitsPerPage:  24,
    total:        0,
    showSale:     false,
    _saleItems:   [],
    _currentItems:[],

    // ===== 初期化 =====
    async init() {
        const p = new URLSearchParams(location.search);
        this.floor   = p.get('floor')   || 'videoa';
        this.sort    = p.get('sort')    || 'rank';
        this.keyword = p.get('keyword') || '';
        this.page    = parseInt(p.get('page') || '1');

        const searchEl = document.getElementById('searchInput');
        if (searchEl) {
            searchEl.value = this.keyword;
            searchEl.addEventListener('keydown', e => {
                if (e.key === 'Enter') { this.closeSuggest(); this.doSearch(); }
                if (e.key === 'Escape') this.closeSuggest();
            });
            searchEl.addEventListener('input', () => this.onSuggestInput());
            searchEl.addEventListener('focus', () => this.onSuggestInput());
            document.addEventListener('click', e => {
                if (!e.target.closest('.suggest-wrap')) this.closeSuggest();
            });
        }
        if (document.getElementById('sortSelect')) {
            document.getElementById('sortSelect').value = this.sort;
        }

        document.addEventListener('keydown', e => { if (e.key === 'Escape') this.closeSample(); });
        this.initSwipe();
        this.loadStorageSections();
        this.updateRankTabs();

        await this.loadHero();
        this.loadActressRanking();
        this.loadNewActresses();
        await this.fetchProducts();
        this.checkSaleToast();  // お気に入りセール通知
    },

    // ===== 検索サジェスト =====
    _suggestActresses: [],
    async loadSuggestData() {
        if (this._suggestActresses.length) return;
        try {
            const [pop, newA] = await Promise.allSettled([
                DMM.fetchActress('popular'),
                DMM.fetchActress('new'),
            ]);
            const all = [
                ...(pop.value?.result?.actress || []),
                ...(newA.value?.result?.actress || []),
            ];
            const seen = new Set();
            this._suggestActresses = all.filter(a => {
                if (seen.has(a.id)) return false;
                seen.add(a.id); return true;
            });
        } catch(e) {}
    },

    async onSuggestInput() {
        await this.loadSuggestData();
        const q   = (document.getElementById('searchInput')?.value || '').trim();
        const box = document.getElementById('suggestDropdown');
        if (!box) return;
        if (!q) { this.closeSuggest(); return; }

        const matches = this._suggestActresses.filter(a =>
            (a.name || '').includes(q) || (a.ruby || '').includes(q)
        ).slice(0, 8);

        if (!matches.length) { this.closeSuggest(); return; }

        box.innerHTML = matches.map(a => {
            const img  = a.imageURL?.small || '';
            const name = this.esc(a.name || '');
            const ruby = this.esc(a.ruby || '');
            return `<div class="suggest-item" onclick="App.selectSuggest('${this.esc(a.name)}','${a.id}')">
                ${img ? `<img src="${this.esc(img)}" alt="${name}">` : '<div style="width:32px;height:32px;border-radius:50%;background:#222;display:flex;align-items:center;justify-content:center">👩</div>'}
                <div><div class="suggest-item-name">${name}</div>${ruby ? `<div class="suggest-item-sub">${ruby}</div>` : ''}</div>
            </div>`;
        }).join('');
        box.classList.add('open');
    },

    selectSuggest(name, id) {
        this.closeSuggest();
        // 女優個別ページへ
        location.href = `actress.html?id=${encodeURIComponent(id)}&name=${encodeURIComponent(name)}`;
    },

    closeSuggest() {
        const box = document.getElementById('suggestDropdown');
        if (box) box.classList.remove('open');
    },

    // ===== ランキングタブ表示制御 =====
    updateRankTabs() {
        const tabs = document.getElementById('rankTabs');
        if (!tabs) return;
        // videoa（ジャンル選択中も含む）で表示
        tabs.style.display = (this.floor === 'videoa') ? 'flex' : 'none';
        // アクティブ状態を同期
        tabs.querySelectorAll('.rank-tab').forEach(btn => {
            const s = btn.getAttribute('onclick')?.match(/'([^']+)'/)?.[1];
            btn.classList.toggle('active', s === this.sort);
        });
    },

    // ===== クライアント側ソート（ジャンルデータ用）=====
    _sortItems(items, sort) {
        const arr = [...items];
        switch (sort) {
            case 'rank':   return arr; // 取得順（rank順）そのまま
            case 'date':   return arr.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
            case 'review': return arr.sort((a, b) =>
                parseFloat(b.review?.average || 0) - parseFloat(a.review?.average || 0));
            case 'price':  return arr.sort((a, b) =>  // 高い順
                parseFloat(b.prices?.price || 0) - parseFloat(a.prices?.price || 0));
            case '-price': return arr.sort((a, b) =>  // 安い順
                parseFloat(a.prices?.price || 0) - parseFloat(b.prices?.price || 0));
            default:       return arr;
        }
    },

    // ===== セールお気に入りトースト =====
    async checkSaleToast() {
        const favs = Fav.get();
        if (!favs.length) return;
        try {
            const data = await DMM._loadFile('data/rank.json');
            const items = data?.result?.items || [];
            const saleData = await DMM._loadFile('data/new.json').catch(() => null);
            const allItems = [...items, ...(saleData?.result?.items || [])];
            const cidSet = new Set(favs.map(f => f.cid));
            const onSale = allItems.filter(i => i.campaign && cidSet.has(i.content_id));
            if (onSale.length) {
                this.showToast(`🔥 お気に入りの${onSale.length}件がセール中！`, 'sale', () => {
                    document.getElementById('favoritesSection')?.scrollIntoView({ behavior: 'smooth' });
                });
            }
        } catch(e) {}
    },

    // ===== トースト表示 =====
    showToast(msg, type = '', onClick = null) {
        const wrap = document.getElementById('toastWrap');
        if (!wrap) return;
        const el = document.createElement('div');
        el.className = 'toast' + (type ? ' ' + type : '');
        el.textContent = msg;
        if (onClick) el.addEventListener('click', () => { onClick(); el.remove(); });
        else el.addEventListener('click', () => el.remove());
        wrap.appendChild(el);
        setTimeout(() => {
            el.style.animation = 'toastOut .3s ease forwards';
            setTimeout(() => el.remove(), 300);
        }, 5000);
    },

    // ===== スワイプ操作 =====
    initSwipe() {
        let startX = 0, startY = 0;
        document.addEventListener('touchstart', e => {
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
        }, { passive: true });
        document.addEventListener('touchend', e => {
            const dx = e.changedTouches[0].clientX - startX;
            const dy = e.changedTouches[0].clientY - startY;
            // 横スワイプ判定（横移動 > 80px かつ縦より横が大きい）
            if (Math.abs(dx) > 80 && Math.abs(dx) > Math.abs(dy) * 2) {
                const totalPages = Math.ceil(this.total / this.hitsPerPage);
                if (dx < 0 && this.page < totalPages) this.goPage(this.page + 1);
                else if (dx > 0 && this.page > 1)     this.goPage(this.page - 1);
            }
        }, { passive: true });
    },

    // ===== 履歴・お気に入りセクション =====
    loadStorageSections() {
        // 履歴
        const hist = Hist.get();
        const histSection = document.getElementById('historySection');
        if (histSection) {
            if (hist.length) {
                histSection.style.display = '';
                this.renderMiniCards('historyList', hist, 'hist');
            } else {
                histSection.style.display = 'none';
            }
        }
        // お気に入り（ヘッダーパネル + バッジ更新）
        const favs = Fav.get();
        this._updateFavBadge(favs.length);
        const favPanelList = document.getElementById('favPanelList');
        if (favPanelList) {
            if (favs.length) {
                this.renderMiniCards('favPanelList', favs, 'fav');
            } else {
                favPanelList.innerHTML = '<span style="color:#555;font-size:.85rem;padding:16px 0">お気に入りはまだありません</span>';
                // パネルも閉じる
                const panel = document.getElementById('favPanel');
                if (panel) panel.style.display = 'none';
            }
        }
    },

    _updateFavBadge(count) {
        const badge = document.getElementById('favBadge');
        if (!badge) return;
        if (count > 0) {
            badge.textContent = count > 99 ? '99+' : count;
            badge.style.display = '';
        } else {
            badge.style.display = 'none';
        }
    },

    toggleFavPanel() {
        const panel = document.getElementById('favPanel');
        if (!panel) return;
        const isOpen = panel.style.display !== 'none';
        if (isOpen) {
            panel.style.display = 'none';
        } else {
            panel.style.display = '';
            const favs = Fav.get();
            if (favs.length) {
                this.renderMiniCards('favPanelList', favs, 'fav');
            } else {
                const list = document.getElementById('favPanelList');
                if (list) list.innerHTML = '<span style="color:#555;font-size:.85rem;padding:16px 0">お気に入りはまだありません</span>';
            }
        }
    },

    removeFavItem(cid) {
        Fav.remove(cid);
        const favs = Fav.get();
        this._updateFavBadge(favs.length);
        if (favs.length) {
            this.renderMiniCards('favPanelList', favs, 'fav');
        } else {
            const list = document.getElementById('favPanelList');
            if (list) list.innerHTML = '<span style="color:#555;font-size:.85rem;padding:16px 0">お気に入りはまだありません</span>';
            const panel = document.getElementById('favPanel');
            if (panel) panel.style.display = 'none';
        }
        // メイン画面のカードのハートボタンも更新
        document.querySelectorAll('.fav-btn').forEach(btn => {
            if (btn.dataset.cid === cid) {
                btn.classList.remove('active');
                btn.textContent = '🤍';
            }
        });
    },

    removeHistItem(cid) {
        Hist.remove(cid);
        const hist = Hist.get();
        const histSection = document.getElementById('historySection');
        if (hist.length) {
            this.renderMiniCards('historyList', hist, 'hist');
        } else {
            if (histSection) histSection.style.display = 'none';
        }
    },

    renderMiniCards(containerId, items, type = 'fav') {
        const el = document.getElementById(containerId);
        if (!el) return;
        const removeFn = type === 'fav' ? 'App.removeFavItem' : 'App.removeHistItem';
        el.innerHTML = items.slice(0, 30).map(item => `
            <div class="mini-card-wrap">
                <a class="mini-card" href="product.html?cid=${this.esc(item.cid)}&floor=${this.esc(item.floor)}">
                    ${item.img ? `<img src="${this.esc(item.img)}" alt="${this.esc(item.title)}" loading="lazy">` : '<div class="mini-card-no-img">🎬</div>'}
                    <div class="mini-card-title">${this.esc(item.title)}</div>
                </a>
                <button class="mini-card-remove" onclick="${removeFn}('${this.esc(item.cid)}')" title="削除">✕</button>
            </div>`).join('');
    },

    // ===== ヒーローバナー =====
    async loadHero() {
        try {
            const data = await DMM.fetch({ sort: 'rank' });
            const items = data?.result?.items;
            if (!items?.length) return;

            const total = data.result.total_count;
            const cnt = document.getElementById('todayCount');
            if (cnt) cnt.textContent = total.toLocaleString() + '件';

            const top = items[0];
            const heroMain = document.querySelector('.hero-main');
            const imgLarge = top.imageURL?.large || top.imageURL?.list || '';
            if (heroMain && imgLarge) {
                heroMain.style.backgroundImage =
                    `linear-gradient(to right, rgba(10,0,5,0.92) 40%, rgba(10,0,5,0.5) 100%), url('${imgLarge}')`;
                heroMain.style.backgroundSize = 'cover';
                heroMain.style.backgroundPosition = 'center top';
            }
            document.getElementById('heroTitle').textContent = top.title;

            const subEl = document.getElementById('heroSub');
            if (subEl) {
                const actresses = (top.iteminfo?.actress || []).slice(0,2).map(a=>a.name).join(' / ');
                subEl.textContent = actresses ? '出演：' + actresses : '';
            }
            const btnEl = document.getElementById('heroBtn');
            if (btnEl) btnEl.href = top.affiliateURL || top.URL || '#';

            const priceEl = document.getElementById('heroPrice');
            if (priceEl) priceEl.textContent = top.prices?.price ? '¥' + top.prices.price + '〜' : '';

            const subGrid = document.getElementById('heroSubGrid');
            if (subGrid && items.length >= 4) {
                subGrid.innerHTML = items.slice(1, 4).map((item, i) => {
                    const img = item.imageURL?.list || item.imageURL?.small || '';
                    const url = item.affiliateURL || item.URL || '#';
                    return `
                    <a href="${this.esc(url)}" target="_blank" rel="noopener" class="hero-sub-card">
                        ${img ? `<img src="${this.esc(img)}" alt="${this.esc(item.title)}" loading="lazy">` : ''}
                        <div class="hero-sub-rank">${i + 2}位</div>
                        <div class="hero-sub-title">${this.esc(item.title)}</div>
                    </a>`;
                }).join('');
            }
        } catch(e) { /* ヒーロー失敗は無視 */ }
    },

    // ===== 商品一覧取得（クライアント側ページネーション）=====
    _prevRankMap: {},  // content_id → 前回の順位

    _floorLabels: { videoa:'動画（アダルト）', anime:'アニメ動画', book:'マンガ・電子書籍', goods:'グッズ・通販', mono:'グッズ・通販' },

    async fetchProducts() {
        const grid = document.getElementById('productGrid');
        if (!grid) return;
        grid.innerHTML = '<div class="loading"><div class="spinner"></div><p>商品を取得中...</p></div>';

        // タイトルをすぐ更新（エラー時でも正しいフロア名が出るように）
        const titleEl = document.getElementById('sectionTitle');
        if (titleEl) titleEl.textContent = (this._floorLabels[this.floor] || this.floor) + ' — 読み込み中...';

        const params = { floor: this.floor, sort: this.sort };
        if (this.genre) { params.article = 'genre'; params.article_id = this.genre; }

        // ランキングタブ状態を更新
        this.updateRankTabs();

        // 順位変動データ（rank表示時のみ）
        if (this.sort === 'rank' && this.floor === 'videoa' && !this.genre) {
            try {
                const prev = await DMM._loadFile('data/rank_prev.json');
                this._prevRankMap = {};
                (prev?.result?.items || []).forEach((item, i) => {
                    this._prevRankMap[item.content_id] = i + 1;
                });
            } catch(e) { this._prevRankMap = {}; }
        } else {
            this._prevRankMap = {};
        }

        try {
            const data   = await DMM.fetch(params);
            const result = data?.result;
            if (!result || result.status !== 200) throw new Error('APIエラー: ' + JSON.stringify(result));

            let items = result.items || [];

            // ジャンル選択中：サーバーソート済みファイルを優先
            // ファイル未生成の場合はdmm-api側でrankファイルにフォールバックしているため
            // クライアント側ソートで補完（移行期間のみ）
            if (this.genre && this.sort !== 'rank') {
                const hasProperSort = result.total_count > 0;
                if (!hasProperSort) items = this._sortItems(items, this.sort);
            }

            // キーワードフィルタ（クライアント側）
            if (this.keyword) {
                const kw = this.keyword.toLowerCase();
                items = items.filter(item =>
                    (item.title || '').toLowerCase().includes(kw) ||
                    (item.iteminfo?.actress || []).some(a => a.name.includes(this.keyword))
                );
            }

            this._currentItems = items;
            this.total = items.length;
            const start = (this.page - 1) * this.hitsPerPage;
            this.renderGrid(grid, items.slice(start, start + this.hitsPerPage));
            this.renderPagination();
            this.updateTitle({ ...result, total_count: this.total });
        } catch(e) {
            if (titleEl) titleEl.textContent = (this._floorLabels[this.floor] || this.floor);
            const msg = this._emptyMsg();
            grid.innerHTML = `<div class="loading"><p style="font-size:1.5rem;margin-bottom:12px">${msg.icon}</p><p>${msg.text}</p><p style="font-size:.8rem;color:var(--mute);margin-top:8px">${msg.sub}</p></div>`;
        }
    },

    // ===== セールフィルタ =====
    async setSale(el) {
        this.showSale = true;
        this.genre    = '';
        this.keyword  = '';
        this.page     = 1;
        if (el) {
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            el.classList.add('active');
        }
        const grid = document.getElementById('productGrid');
        if (!grid) return;
        grid.innerHTML = '<div class="loading"><div class="spinner"></div><p>セール商品を取得中...</p></div>';

        // 全JSONから campaign 付きアイテムを収集
        const files = [...Object.values(DMM.sortFiles), ...Object.values(DMM.genreFiles)];
        const results = await Promise.allSettled(files.map(f => DMM._loadFile(f)));
        const seen = new Set();
        const saleItems = [];
        for (const r of results) {
            if (r.status !== 'fulfilled') continue;
            for (const item of (r.value?.result?.items || [])) {
                if (item.campaign && !seen.has(item.content_id)) {
                    seen.add(item.content_id);
                    saleItems.push(item);
                }
            }
        }
        this._saleItems   = saleItems;
        this._currentItems = saleItems;
        this.total = saleItems.length;
        this.renderGrid(grid, saleItems.slice(0, this.hitsPerPage));
        this.renderPagination();
        const title = document.getElementById('sectionTitle');
        if (title) title.textContent = `🔥 セール中 — ${saleItems.length}件`;
    },

    renderGrid(grid, items, emptyMsg) {
        if (!items.length) {
            const msg = emptyMsg || this._emptyMsg();
            grid.innerHTML = `<div class="loading"><p style="font-size:1.5rem;margin-bottom:12px">${msg.icon}</p><p>${msg.text}</p><p style="font-size:.8rem;color:var(--mute);margin-top:8px">${msg.sub}</p></div>`;
            return;
        }
        grid.innerHTML = items.map((item, i) => this.cardHTML(item, i)).join('');
    },

    // 空データ時のメッセージをフロア・状況で切り替え
    _emptyMsg() {
        const msgs = {
            book:   { icon:'📚', text:'マンガデータを準備中です',       sub:'次回の自動更新（30分以内）で表示されます' },
            anime:  { icon:'🎌', text:'アニメデータを準備中です',       sub:'次回の自動更新（30分以内）で表示されます' },
            goods:  { icon:'🛍️', text:'グッズデータを準備中です',       sub:'次回の自動更新（30分以内）で表示されます' },
            genre:  { icon:'🔍', text:'このジャンルのデータを準備中です', sub:'次回の自動更新（30分以内）で表示されます' },
            search: { icon:'🔍', text:'該当する作品が見つかりませんでした', sub:'別のキーワードや女優名で検索してみてください' },
            sale:   { icon:'🔥', text:'現在セール中の作品はありません',   sub:'セール情報は随時更新されます' },
        };
        if (this.keyword)           return msgs.search;
        if (this.showSale)          return msgs.sale;
        if (this.genre)             return msgs.genre;
        return msgs[this.floor]    || { icon:'📭', text:'データを準備中です', sub:'次回の自動更新（30分以内）で表示されます' };
    },

    // ===== 商品カード =====
    cardHTML(item, i) {
        const img       = item.imageURL?.list || item.imageURL?.small || '';
        const title     = this.esc(item.title || '');
        const price     = item.prices?.price || '';
        const url       = item.affiliateURL || item.URL || '#';
        const review    = item.review;
        const actressObjs = (item.iteminfo?.actress || []).slice(0,2);
        const actresses = actressObjs.map(a => this.esc(a.name)).join(' / ');
        const isNew     = this.isNew(item.date);
        const campaign  = item.campaign?.title || '';
        const avg       = parseFloat(review?.average || 0);
        const stars     = avg ? '★'.repeat(Math.round(avg)) + '☆'.repeat(5 - Math.round(avg)) : '';
        const rankBadge = i < 3
            ? `<div class="rank-badge ${['rank-1','rank-2','rank-3'][i]}">${['🥇','🥈','🥉'][i]}</div>`
            : (i < 10 ? `<div class="rank-badge rank-other">${i+1}</div>` : '');
        const mv        = item.sampleMovieURL;
        const sampleUrl = mv ? (mv.size_560_360 || mv.size_476_306 || mv.size_644_414 || '') : '';
        const isFav     = Fav.has(item.content_id);

        // 順位変動バッジ
        const curRank  = i + 1;
        const prevRank = this._prevRankMap[item.content_id];
        let changeBadge = '';
        if (prevRank === undefined) {
            changeBadge = `<div class="rank-change rank-new">NEW</div>`;
        } else {
            const diff = prevRank - curRank;
            if (diff > 0)      changeBadge = `<div class="rank-change rank-up">▲${diff}</div>`;
            else if (diff < 0) changeBadge = `<div class="rank-change rank-down">▼${Math.abs(diff)}</div>`;
        }
        const showChange = Object.keys(this._prevRankMap).length > 0;

        // 女優リンク（女優名クリックで女優ページへ）
        const actressLinks = actressObjs.map(a =>
            `<a href="actress.html?id=${this.esc(String(a.id))}&name=${encodeURIComponent(a.name)}"
               class="card-actress-link" onclick="event.stopPropagation()">${this.esc(a.name)}</a>`
        ).join(' / ');

        return `
        <div class="product-card" onclick="location.href='product.html?cid=${this.esc(item.content_id)}&floor=${this.floor}'">
          <div class="card-img-wrap">
            ${img
                ? `<img src="${this.esc(img)}" alt="${title}" loading="lazy">`
                : `<div style="height:100%;display:flex;align-items:center;justify-content:center;background:#111;color:#333;font-size:2rem">🎬</div>`
            }
            ${rankBadge}
            ${showChange ? changeBadge : ''}
            ${campaign ? `<span class="badge-sale">SALE</span>` : (isNew ? `<span class="badge-new">NEW</span>` : '')}
            ${sampleUrl ? `<button class="card-sample-btn" onclick="event.stopPropagation();App.openSample('${this.esc(sampleUrl)}','${title}')" title="サンプル再生">▶</button>` : ''}
            <button class="fav-btn ${isFav ? 'active' : ''}" title="${isFav ? 'お気に入り解除' : 'お気に入りに追加'}"
              onclick="event.stopPropagation();App.toggleFav(this,'${this.esc(item.content_id)}')">${isFav ? '❤️' : '🤍'}</button>
          </div>
          <div class="card-body">
            <div class="card-title">${title}</div>
            ${actressLinks ? `<div class="card-actress">${actressLinks}</div>` : ''}
            <div class="card-bottom">
              ${price ? `<div class="card-price">¥${this.esc(price)}</div>` : '<div></div>'}
              ${stars ? `<div class="card-review"><span class="stars">${stars}</span></div>` : ''}
            </div>
            ${review?.count ? `<div class="card-review" style="margin-bottom:6px">${avg.toFixed(1)} (${review.count}件)</div>` : ''}
            <a class="btn-buy" href="${this.esc(url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">
              動画を見る →
            </a>
          </div>
        </div>`;
    },

    // ===== お気に入りトグル =====
    toggleFav(btn, cid) {
        const item = this._currentItems.find(i => i.content_id === cid)
                  || this._saleItems.find(i => i.content_id === cid);
        if (!item) return;
        const isNow = Fav.toggle(item, this.floor);
        btn.classList.toggle('active', isNow);
        btn.textContent = isNow ? '❤️' : '🤍';
        btn.title = isNow ? 'お気に入り解除' : 'お気に入りに追加';
        // お気に入りセクションを更新
        this.loadStorageSections();
    },

    // ===== サンプル動画モーダル =====
    openSample(url, title) {
        const modal  = document.getElementById('sampleModal');
        const iframe = document.getElementById('sampleIframe');
        const label  = document.getElementById('sampleModalTitle');
        if (!modal || !iframe) return;
        if (label) label.textContent = title || 'サンプル動画';
        iframe.src = url;
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    },

    closeSample() {
        const modal  = document.getElementById('sampleModal');
        const iframe = document.getElementById('sampleIframe');
        if (modal)  modal.classList.remove('active');
        if (iframe) iframe.src = '';
        document.body.style.overflow = '';
    },

    // ===== ページネーション =====
    renderPagination() {
        const el = document.getElementById('pagination');
        if (!el) return;
        const total = Math.ceil(this.total / this.hitsPerPage);
        if (total <= 1) { el.innerHTML = ''; return; }

        const p = this.page;
        let html = `<button class="page-btn" ${p===1?'disabled':''} onclick="App.goPage(${p-1})">‹ 前へ</button>`;
        this.pageRange(p, total).forEach(n => {
            html += n === '...'
                ? `<span class="page-btn" style="cursor:default">…</span>`
                : `<button class="page-btn ${n===p?'active':''}" onclick="App.goPage(${n})">${n}</button>`;
        });
        html += `<button class="page-btn" ${p===total?'disabled':''} onclick="App.goPage(${p+1})">次へ ›</button>`;
        el.innerHTML = html;
    },

    pageRange(cur, total) {
        if (total <= 7) return Array.from({length:total}, (_,i)=>i+1);
        const r = [1];
        if (cur > 3) r.push('...');
        for (let i = Math.max(2, cur-1); i <= Math.min(total-1, cur+1); i++) r.push(i);
        if (cur < total-2) r.push('...');
        r.push(total);
        return r;
    },

    goPage(n) {
        this.page = n;
        window.scrollTo({ top: 0, behavior: 'smooth' });
        if (this.showSale) {
            // セールページネーションはメモリ上のデータを使う
            const grid  = document.getElementById('productGrid');
            const start = (n - 1) * this.hitsPerPage;
            this.renderGrid(grid, this._saleItems.slice(start, start + this.hitsPerPage));
            this.renderPagination();
        } else {
            this.fetchProducts();
        }
    },

    updateTitle(result) {
        const el = document.getElementById('sectionTitle');
        if (!el) return;
        const labels = this._floorLabels;
        const kw = this.keyword ? ` "` + this.keyword + `"` : '';
        el.textContent = (labels[this.floor] || '') + kw + ' — ' + result.total_count.toLocaleString() + '件';
    },

    doSearch() {
        const input = document.getElementById('searchInput');
        if (input) this.keyword = input.value.trim();
        this.page     = 1;
        this.showSale = false;
        this.fetchProducts();
    },

    setFloor(floor, el) {
        this.floor    = floor;
        this.keyword  = '';
        this.genre    = '';
        this.page     = 1;
        this.showSale = false;
        if (el) {
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            el.classList.add('active');
        }
        this.updateRankTabs();
        this.fetchProducts();
    },

    setSort(sort, el) {
        this.sort     = sort;
        this.page     = 1;
        this.showSale = false;
        // ジャンル選択中はgenre/floorを維持しsorトのみ変更（ジャンル固定）
        // ジャンル未選択時のみ floor を videoa にセット
        if (!this.genre) this.floor = 'videoa';

        if (document.getElementById('sortSelect')) document.getElementById('sortSelect').value = sort;
        // ナビバーボタン（.nav-btn）のアクティブ更新（rank-tabは対象外）
        if (el?.classList.contains('nav-btn')) {
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            el.classList.add('active');
        }
        this.updateRankTabs();
        this.fetchProducts();
    },

    setGenre(id, el) {
        this.genre    = id;
        this.floor    = 'videoa';
        this.page     = 1;
        this.showSale = false;
        // サイドバーのアクティブ更新
        if (el) {
            el.closest('.sidebar-section').querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));
            el.classList.add('active');
        }
        // ジャンルドロワーのチップも更新
        document.querySelectorAll('.genre-chip').forEach(c => {
            c.classList.toggle('active', c.dataset.genre === id);
        });
        this.updateRankTabs();
        this.fetchProducts();
    },

    clearFilter(el) {
        this.genre    = '';
        this.keyword  = '';
        this.page     = 1;
        this.showSale = false;
        if (el) {
            el.closest('.sidebar-section').querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));
            el.classList.add('active');
        }
        document.querySelectorAll('.genre-chip').forEach(c => {
            c.classList.toggle('active', c.dataset.genre === '');
        });
        this.updateRankTabs();
        this.fetchProducts();
    },

    // ===== ジャンルドロワー（スマホ用）=====
    openGenreDrawer() {
        document.getElementById('genreDrawer')?.classList.add('open');
        document.getElementById('genreOverlay')?.classList.add('open');
        document.body.style.overflow = 'hidden';
    },

    closeGenreDrawer() {
        document.getElementById('genreDrawer')?.classList.remove('open');
        document.getElementById('genreOverlay')?.classList.remove('open');
        document.body.style.overflow = '';
    },

    setGenreFromDrawer(id) {
        this.closeGenreDrawer();
        if (id) {
            this.setGenre(id);
            // サイドバー側も同期
            document.querySelectorAll('.sidebar-link').forEach(l => {
                const onclick = l.getAttribute('onclick') || '';
                const match = onclick.match(/'(\d+)'/);
                l.classList.toggle('active', match && match[1] === id);
            });
        } else {
            this.clearFilter();
            document.querySelectorAll('.sidebar-link').forEach((l, i) => l.classList.toggle('active', i === 0));
        }
    },

    // ===== 女優セクション =====
    async loadActressRanking() {
        await this._renderActresses('actressRankList', 'popular', true);
    },

    async loadNewActresses() {
        await this._renderActresses('actressNewList', 'new', false);
    },

    async _renderActresses(containerId, type, showRank) {
        const el = document.getElementById(containerId);
        if (!el) return;
        try {
            const data     = await DMM.fetchActress(type);
            const actresses = data?.result?.actress || [];
            if (!actresses.length) { el.innerHTML = '<span class="actress-empty">データ準備中</span>'; return; }

            // 年齢計算
            const calcAge = (bday) => {
                if (!bday) return null;
                const d = new Date(bday);
                const today = new Date();
                let age = today.getFullYear() - d.getFullYear();
                const m = today.getMonth() - d.getMonth();
                if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age--;
                return (age > 0 && age < 70) ? age : null;
            };

            el.innerHTML = actresses.map((a, i) => {
                const img  = a.imageURL?.small || '';
                const name = this.esc(a.name || '');
                const href = `actress.html?id=${this.esc(String(a.id))}&name=${encodeURIComponent(a.name || '')}`;
                const badge = showRank
                    ? `<div class="actress-rank-badge">${i + 1}位</div>`
                    : `<div class="actress-new-badge">NEW</div>`;

                // スペック情報
                const age   = calcAge(a.birthday);
                const bust  = a.bust  ? `B${a.bust}` + (a.cup ? `(${a.cup})` : '') : '';
                const waist = a.waist ? `W${a.waist}` : '';
                const hip   = a.hip   ? `H${a.hip}`   : '';
                const measurements = [bust, waist, hip].filter(Boolean).join(' ');
                const height = a.height ? `${a.height}cm` : '';
                const blood  = a.blood_type && a.blood_type !== '他' ? `${a.blood_type}型` : '';
                const pref   = a.prefectures ? this.esc(a.prefectures) : '';

                return `
                <a class="actress-card" href="${href}">
                    <div class="actress-photo">
                        ${img ? `<img src="${this.esc(img)}" alt="${name}" loading="lazy">` : `<div class="actress-no-img">👩</div>`}
                        ${badge}
                    </div>
                    <div class="actress-name">${name}</div>
                    ${age || blood ? `<div class="actress-meta">${[age ? age + '歳' : '', blood].filter(Boolean).join(' · ')}</div>` : ''}
                    ${height || measurements ? `<div class="actress-stats">${[height, measurements].filter(Boolean).join(' ')}</div>` : ''}
                    ${pref ? `<div class="actress-pref">📍${pref}</div>` : ''}
                </a>`;
            }).join('');
        } catch(e) {
            if (el) el.innerHTML = '<span class="actress-empty">準備中</span>';
        }
    },

    // ===== ユーティリティ =====
    isNew(dateStr) {
        if (!dateStr) return false;
        return (Date.now() - new Date(dateStr).getTime()) < 7 * 24 * 60 * 60 * 1000;
    },

    esc(s) {
        return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    },
};

document.addEventListener('DOMContentLoaded', () => App.init());
