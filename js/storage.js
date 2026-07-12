// ===== FANZA ローカルストレージ管理 =====

const Fav = {
    KEY: 'fanza_favorites',

    get() {
        try { return JSON.parse(localStorage.getItem(this.KEY) || '[]'); }
        catch(e) { return []; }
    },

    save(list) {
        localStorage.setItem(this.KEY, JSON.stringify(list));
    },

    add(item, floor) {
        const list = this.get().filter(f => f.cid !== item.content_id);
        list.unshift({
            cid:   item.content_id,
            title: item.title,
            img:   item.imageURL?.list || item.imageURL?.small || '',
            url:   item.affiliateURL || item.URL || '#',
            price: item.prices?.price || '',
            floor: floor || 'videoa',
            ts:    Date.now()
        });
        if (list.length > 100) list.length = 100;
        this.save(list);
    },

    remove(cid) {
        this.save(this.get().filter(f => f.cid !== cid));
    },

    has(cid) {
        return this.get().some(f => f.cid === cid);
    },

    // トグル：追加→true / 削除→false を返す
    toggle(item, floor) {
        if (this.has(item.content_id)) { this.remove(item.content_id); return false; }
        this.add(item, floor); return true;
    }
};

const Hist = {
    KEY: 'fanza_history',

    get() {
        try { return JSON.parse(localStorage.getItem(this.KEY) || '[]'); }
        catch(e) { return []; }
    },

    add(item, floor) {
        const list = this.get().filter(h => h.cid !== item.content_id);
        list.unshift({
            cid:   item.content_id,
            title: item.title,
            img:   item.imageURL?.list || item.imageURL?.small || '',
            url:   item.affiliateURL || item.URL || '#',
            floor: floor || 'videoa',
            ts:    Date.now()
        });
        if (list.length > 30) list.length = 30;
        localStorage.setItem(this.KEY, JSON.stringify(list));
    },

    remove(cid) {
        const list = this.get().filter(h => h.cid !== cid);
        localStorage.setItem(this.KEY, JSON.stringify(list));
    }
};

// ===== いいね管理（トグル方式：1ユーザー1いいね、累計カウント付き）=====
const Like = {
    KEY:       'fanza_likes',        // 現在いいね中のcid Set
    KEY_COUNT: 'fanza_like_counts',  // 累計カウント {[cid]: number}（一方向加算）
    _set:    null,
    _counts: null,

    _loadSet() {
        if (!this._set) {
            try {
                const raw = JSON.parse(localStorage.getItem(this.KEY) || '[]');
                if (Array.isArray(raw)) {
                    // 旧版: 文字列配列 or オブジェクト配列
                    this._set = new Set(raw.map(m => typeof m === 'string' ? m : (m?.cid || m?.content_id)).filter(Boolean));
                } else {
                    this._set = new Set(Object.keys(raw));
                }
            } catch(e) { this._set = new Set(); }
        }
        return this._set;
    },

    _loadCounts() {
        if (!this._counts) {
            try {
                const raw = JSON.parse(localStorage.getItem(this.KEY_COUNT) || '{}');
                this._counts = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
            } catch(e) { this._counts = {}; }
        }
        return this._counts;
    },

    _saveSet()    { localStorage.setItem(this.KEY,       JSON.stringify([...this._set])); },
    _saveCounts() { localStorage.setItem(this.KEY_COUNT, JSON.stringify(this._counts)); },

    has(cid) { return this._loadSet().has(String(cid)); },

    count(cid) { return this._loadCounts()[String(cid)] || 0; },

    toggle(cid) {
        const s = this._loadSet(), id = String(cid);
        if (s.has(id)) {
            s.delete(id); this._saveSet(); return false;
        }
        s.add(id); this._saveSet();
        // 初回いいねのみカウント加算（同一デバイスで最大1）
        const c = this._loadCounts();
        if (!c[id]) { c[id] = 1; this._saveCounts(); }
        return true;
    }
};

