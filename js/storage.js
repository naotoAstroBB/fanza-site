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
