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

// ===== いいね管理 =====
const Like = {
    KEY: 'fanza_likes',

    get() {
        try {
            const arr = JSON.parse(localStorage.getItem(this.KEY) || '[]');
            // 後方互換: 旧版はCID文字列配列
            return arr.map(m => typeof m === 'string'
                ? { cid: m, title: '', img: '', url: '#', floor: 'videoa', ts: 0 }
                : m);
        } catch(e) { return []; }
    },

    _save(list) {
        localStorage.setItem(this.KEY, JSON.stringify(list));
    },

    has(cid) {
        return this.get().some(m => m.cid === String(cid));
    },

    toggle(item, floor) {
        const cid  = String(typeof item === 'object' ? item.content_id : item);
        const all  = this.get();
        const list = all.filter(m => m.cid !== cid);
        if (list.length < all.length) { this._save(list); return false; }
        list.unshift({
            cid,
            title: typeof item === 'object' ? (item.title || '') : '',
            img:   typeof item === 'object' ? (item.imageURL?.list || item.imageURL?.small || '') : '',
            url:   typeof item === 'object' ? (item.affiliateURL || item.URL || '#') : '#',
            floor: floor || 'videoa',
            ts:    Date.now()
        });
        if (list.length > 200) list.length = 200;
        this._save(list);
        return true;
    },

    remove(cid) {
        this._save(this.get().filter(m => m.cid !== String(cid)));
    },

    count() {
        return this.get().length;
    }
};

