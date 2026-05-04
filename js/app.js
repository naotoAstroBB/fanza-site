// ===== FANZA アフィリエイトサイト メインJS =====

// 年齢確認チェック
if (location.pathname.includes('home') || location.pathname.includes('product')) {
    if (localStorage.getItem('age_verified') !== 'yes') {
        location.href = 'index.html';
    }
}

const App = {
    floor:   'videoa',
    sort:    'rank',
    keyword: '',
    genre:   '',
    page:    1,
    hitsPerPage: 24,
    total:   0,

    async init() {
        const p = new URLSearchParams(location.search);
        this.floor   = p.get('floor')   || 'videoa';
        this.sort    = p.get('sort')    || 'rank';
        this.keyword = p.get('keyword') || '';
        this.page    = parseInt(p.get('page') || '1');

        if (document.getElementById('searchInput')) {
            document.getElementById('searchInput').value = this.keyword;
            document.getElementById('searchInput').addEventListener('keydown', e => {
                if (e.key === 'Enter') this.doSearch();
            });
        }
        if (document.getElementById('sortSelect')) {
            document.getElementById('sortSelect').value = this.sort;
        }

        await this.loadHero();
        await this.fetchProducts();
    },

    async loadHero() {
        try {
            const data = await DMM.fetch({ floor: this.floor, sort: 'rank', hits: 1, offset: 1 });
            const item = data?.result?.items?.[0];
            if (!item) return;
            const el = document.getElementById('heroTitle');
            const sub = document.getElementById('heroSub');
            const btn = document.getElementById('heroBtn');
            const cnt = document.getElementById('todayCount');
            if (el) el.textContent = item.title;
            if (sub && item.iteminfo?.actress?.length) sub.textContent = '出演：' + item.iteminfo.actress.slice(0,2).map(a=>a.name).join(' / ');
            if (btn) btn.href = item.affiliateURL || item.URL || '#';
            if (cnt) {
                const total = data.result.total_count;
                cnt.textContent = total.toLocaleString() + '件';
            }
        } catch(e) { /* ヒーロー失敗は無視 */ }
    },

    async fetchProducts() {
        const grid = document.getElementById('productGrid');
        if (!grid) return;
        grid.innerHTML = '<div class="loading"><div class="spinner"></div><p>商品を取得中...</p></div>';

        const offset = (this.page - 1) * this.hitsPerPage + 1;
        const params = { floor: this.floor, sort: this.sort, hits: this.hitsPerPage, offset };
        if (this.keyword) params.keyword = this.keyword;
        if (this.genre)   { params.article = 'genre'; params.article_id = this.genre; }

        try {
            const data  = await DMM.fetch(params);
            const result = data?.result;
            if (!result || result.status !== 200) throw new Error('APIエラー: ' + JSON.stringify(result));

            this.total = result.total_count;
            this.renderGrid(grid, result.items || []);
            this.renderPagination();
            this.updateTitle(result);
        } catch(e) {
            grid.innerHTML = `<div class="loading"><p style="color:#ff6688">⚠️ 商品取得に失敗しました<br><small>${e.message}</small></p></div>`;
        }
    },

    renderGrid(grid, items) {
        if (!items.length) {
            grid.innerHTML = '<div class="loading"><p>該当商品が見つかりませんでした</p></div>';
            return;
        }
        grid.innerHTML = items.map((item, i) => this.cardHTML(item, i)).join('');
    },

    cardHTML(item, i) {
        const img       = item.imageURL?.list || item.imageURL?.small || '';
        const title     = this.esc(item.title || '');
        const price     = item.prices?.price || '';
        const url       = item.affiliateURL || item.URL || '#';
        const review    = item.review;
        const actresses = (item.iteminfo?.actress || []).slice(0,2).map(a => this.esc(a.name)).join(' / ');
        const isNew     = this.isNew(item.date);
        const campaign  = item.campaign?.title || '';
        const avg       = parseFloat(review?.average || 0);
        const stars     = avg ? '★'.repeat(Math.round(avg)) + '☆'.repeat(5 - Math.round(avg)) : '';
        const rankBadge = i < 3
            ? `<div class="rank-badge ${['rank-1','rank-2','rank-3'][i]}">${['🥇','🥈','🥉'][i]}</div>`
            : (i < 10 ? `<div class="rank-badge rank-other">${i+1}</div>` : '');

        return `
        <div class="product-card" onclick="location.href='product.html?cid=${this.esc(item.content_id)}&floor=${this.floor}'">
          <div class="card-img-wrap">
            ${img
                ? `<img src="${this.esc(img)}" alt="${title}" loading="lazy">`
                : `<div style="height:100%;display:flex;align-items:center;justify-content:center;background:#111;color:#333;font-size:2rem">🎬</div>`
            }
            ${rankBadge}
            ${campaign ? `<span class="badge-sale">SALE</span>` : (isNew ? `<span class="badge-new">NEW</span>` : '')}
          </div>
          <div class="card-body">
            <div class="card-title">${title}</div>
            ${actresses ? `<div class="card-actress">${actresses}</div>` : ''}
            <div class="card-bottom">
              ${price ? `<div class="card-price">¥${this.esc(price)}</div>` : '<div></div>'}
              ${stars ? `<div class="card-review"><span class="stars">${stars}</span></div>` : ''}
            </div>
            ${review?.count ? `<div class="card-review" style="margin-bottom:6px">${avg.toFixed(1)} (${review.count}件)</div>` : ''}
            <a class="btn-buy" href="${this.esc(url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">
              FANZAで見る →
            </a>
          </div>
        </div>`;
    },

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
        this.fetchProducts();
    },

    updateTitle(result) {
        const el = document.getElementById('sectionTitle');
        if (!el) return;
        const labels = { videoa:'動画（アダルト）', anime:'アニメ動画', book:'電子書籍', goods:'グッズ', mono:'通販' };
        const kw = this.keyword ? ` "` + this.keyword + `"` : '';
        el.textContent = (labels[this.floor] || '') + kw + ' — ' + result.total_count.toLocaleString() + '件';
    },

    doSearch() {
        const input = document.getElementById('searchInput');
        if (input) this.keyword = input.value.trim();
        this.page = 1;
        this.fetchProducts();
    },

    setFloor(floor, el) {
        this.floor   = floor;
        this.keyword = '';
        this.genre   = '';
        this.page    = 1;
        if (el) {
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            el.classList.add('active');
        }
        this.fetchProducts();
    },

    setSort(sort, el) {
        this.sort = sort;
        this.page = 1;
        if (document.getElementById('sortSelect')) document.getElementById('sortSelect').value = sort;
        this.fetchProducts();
    },

    setGenre(id, el) {
        this.genre = id;
        this.page  = 1;
        if (el) {
            el.closest('.sidebar-section').querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));
            el.classList.add('active');
        }
        this.fetchProducts();
    },

    clearFilter(el) {
        this.genre   = '';
        this.keyword = '';
        this.page    = 1;
        if (el) {
            el.closest('.sidebar-section').querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));
            el.classList.add('active');
        }
        this.fetchProducts();
    },

    isNew(dateStr) {
        if (!dateStr) return false;
        return (Date.now() - new Date(dateStr).getTime()) < 7 * 24 * 60 * 60 * 1000;
    },

    esc(s) {
        return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    },
};

document.addEventListener('DOMContentLoaded', () => App.init());
