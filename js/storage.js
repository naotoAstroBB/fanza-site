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

// ===== いいね管理（累計カウント方式）=====
const Like = {
    KEY: 'fanza_likes',
    _data: null,

    _load() {
        if (!this._data) {
            try {
                const raw = JSON.parse(localStorage.getItem(this.KEY) || '{}');
                if (Array.isArray(raw)) {
                    // 後方互換: 旧配列形式 → cid: 1 に変換
                    this._data = {};
                    for (const m of raw) {
                        const cid = typeof m === 'string' ? m : m?.cid;
                        if (cid) this._data[String(cid)] = 1;
                    }
                } else {
                    this._data = raw;
                }
            } catch(e) { this._data = {}; }
        }
        return this._data;
    },

    _save() {
        localStorage.setItem(this.KEY, JSON.stringify(this._data));
    },

    count(cid) {
        return this._load()[String(cid)] || 0;
    },

    add(cid) {
        const d = this._load();
        const id = String(cid);
        d[id] = (d[id] || 0) + 1;
        this._save();
        return d[id];
    }
};

