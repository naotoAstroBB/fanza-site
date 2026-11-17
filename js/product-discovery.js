/* Lightweight, client-only product comparison and saved discovery conditions. */
(function (root) {
  'use strict';
  const COMPARE_KEY = 'fanza_compare_v1';
  const SEARCH_KEY = 'fanza_saved_searches_v1';
  const FLOORS = ['videoa', 'anime', 'book', 'goods', 'mono', 'vr'];
  const floorLabels = {videoa:'動画',anime:'アニメ',book:'マンガ',goods:'グッズ',mono:'グッズ',vr:'VR'};
  const text = (value, max=160) => String(value ?? '').trim().slice(0,max);
  const validCid = value => /^[a-zA-Z0-9_-]{1,100}$/.test(String(value ?? ''));
  const normalFloor = floor => FLOORS.includes(floor) ? floor : 'videoa';
  const escape = value => text(value,400).replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  const httpsUrl = value => {
    try {
      const url = new URL(String(value));
      return url.protocol === 'https:' ? url.href : '';
    } catch (_) { return ''; }
  };
  const affiliateUrl = value => {
    const safe = httpsUrl(value);
    if (!safe) return '';
    const host = new URL(safe).hostname.toLowerCase();
    return ['al.fanza.co.jp','al.dmm.co.jp'].includes(host) ? safe : '';
  };
  const getStorage = () => {
    try { return root.localStorage; } catch (_) { return null; }
  };
  const read = (key) => {
    try {
      const raw = getStorage()?.getItem(key);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) { return []; }
  };
  const write = (key, list) => {
    try { getStorage()?.setItem(key,JSON.stringify(list)); return true; }
    catch (_) { return false; }
  };
  const itemSummary = (item, floor) => {
    if (!item || !validCid(item.content_id)) return null;
    const makers = Array.isArray(item.iteminfo?.maker) ? item.iteminfo.maker : [];
    return {
      cid:text(item.content_id,100),
      floor:normalFloor(floor),
      title:text(item.title,180),
      image:httpsUrl(item.imageURL?.list || item.imageURL?.large || ''),
      price:text(item.prices?.price,50),
      volume:text(item.volume,32),
      date:text(item.date,30),
      review:text(item.review?.average,16),
      maker:makers.slice(0,2).map(m=>text(m?.name,60)).filter(Boolean).join('、'),
      affiliate:affiliateUrl(item.affiliateURL || '')
    };
  };
  const readCompare = () => read(COMPARE_KEY).filter(x=>x && validCid(x.cid) &&
    FLOORS.includes(x.floor)).slice(0,3);
  const keyOf = (cid, floor) => normalFloor(floor) + ':' + cid;
  const has = (cid, floor) => readCompare().some(x=>keyOf(x.cid,x.floor)===keyOf(cid,floor));
  const count = () => readCompare().length;
  const remove = (cid, floor) => {
    const list = readCompare().filter(x=>keyOf(x.cid,x.floor)!==keyOf(cid,floor));
    write(COMPARE_KEY,list);
    renderTray();
    return list;
  };
  const toggle = (item, floor) => {
    const entry = itemSummary(item,floor);
    if (!entry) return {ok:false,reason:'作品情報が不足しています'};
    const list = readCompare();
    if (list.some(x=>keyOf(x.cid,x.floor)===keyOf(entry.cid,entry.floor))) {
      remove(entry.cid,entry.floor);
      return {ok:true,added:false,count:count()};
    }
    if (list.length >= 3) return {ok:false,reason:'比較できるのは3作品までです。比較ページから解除してください。'};
    list.push(entry);
    if (!write(COMPARE_KEY,list)) return {ok:false,reason:'このブラウザでは比較内容を保存できません'};
    renderTray();
    return {ok:true,added:true,count:list.length};
  };
  const clear = () => {write(COMPARE_KEY,[]);renderTray();};
  const renderTray = () => {
    const tray = root.document?.getElementById('compareTray');
    const countLabel = root.document?.getElementById('compareTrayCount');
    if (!tray || !countLabel) return;
    const n = count();
    tray.hidden = n === 0;
    countLabel.textContent = n + '/3作品を選択中';
  };

  const normalizeFilters = input => {
    const source = input && typeof input === 'object' ? input : {};
    return Object.fromEntries(
      ['year','minPrice','maxPrice','minMinutes','maker','previewOnly']
        .map(key=>[key,key==='previewOnly'?(source[key]==='1'?'1':''):text(source[key],100)])
    );
  };
  const normalizeSearch = state => ({
    floor:normalFloor(state?.floor),
    sort:['rank','date','review','price','-price'].includes(state?.sort)?state.sort:'rank',
    keyword:text(state?.keyword,100),
    genre:/^\d{1,10}$/.test(String(state?.genre || '')) ? String(state.genre) : '',
    filters:normalizeFilters(state?.filters),
    showSale:!!state?.showSale
  });
  const label = state => {
    const info = [floorLabels[state.floor] || '動画'];
    if(state.keyword) info.push(state.keyword.slice(0,28));
    else if(state.showSale) info.push('セール');
    else info.push(({rank:'人気順',date:'新着順',review:'高評価順',price:'価格順','-price':'価格順'})[state.sort] || '人気順');
    if(state.filters.previewOnly) info.push('試し読みあり');
    if(state.filters.year) info.push(state.filters.year+'年');
    if(state.filters.maxPrice) info.push(state.filters.maxPrice+'円以下');
    if(state.filters.maker) info.push(state.filters.maker.slice(0,20));
    return info.join('・').slice(0,85);
  };
  const searches = () => read(SEARCH_KEY)
    .filter(x=>x && /^[0-9a-z-]{1,40}$/.test(String(x.id||'')) && x.state)
    .map(x=>({id:x.id, savedAt:Number(x.savedAt)||0, state:normalizeSearch(x.state)}))
    .slice(0,8);
  const saveSearch = input => {
    const state=normalizeSearch(input);
    const all=searches();
    const sig=JSON.stringify(state);
    const other=all.filter(x=>JSON.stringify(x.state)!==sig);
    const entry={id:Date.now().toString(36)+'-'+Math.floor(Math.random()*1e6).toString(36),
      savedAt:Date.now(),state};
    const saved=[entry,...other].slice(0,8);
    if (!write(SEARCH_KEY,saved))return {ok:false,reason:'このブラウザでは条件を保存できません'};
    return {ok:true,id:entry.id,count:saved.length};
  };
  const deleteSearch = id => {
    write(SEARCH_KEY,searches().filter(x=>x.id!==id));
  };
  const getSearch = id => searches().find(x=>x.id===id) || null;

  root.ProductDiscovery={toggle,remove,clear,count,has,readCompare,renderTray,
    searches,saveSearch,deleteSearch,getSearch,normalizeSearch,label,escape,
    affiliateUrl,httpsUrl};
  if(typeof module==='object'&&module.exports)module.exports=root.ProductDiscovery;
})(typeof window==='undefined'?globalThis:window);
