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

// ===== いいね管理（トグル方式：1ユーザー1いいね）=====
const Like = {
    KEY: 'fanza_likes',
    _set: null,

    _load() {
        if (!this._set) {
            try {
                const raw = JSON.parse(localStorage.getItem(this.KEY) || '[]');
                if (Array.isArray(raw)) {
                    this._set = new Set(raw.map(m => typeof m === 'string' ? m : m?.cid).filter(Boolean));
                } else {
                    // 後方互換: 旧オブジェクト形式 {cid: count} → Set に変換
                    this._set = new Set(Object.keys(raw));
                }
            } catch(e) { this._set = new Set(); }
        }
        return this._set;
    },

    _save() {
        localStorage.setItem(this.KEY, JSON.stringify([...this._set]));
    },

    has(cid) {
        return this._load().has(String(cid));
    },

    toggle(cid) {
        const s = this._load(), id = String(cid);
        if (s.has(id)) { s.delete(id); this._save(); return false; }
        s.add(id); this._save(); return true;
    }
};

