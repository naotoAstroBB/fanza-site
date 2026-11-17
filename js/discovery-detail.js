/* Evidence-based details: daily cached price observations and exact-ID series. */
(function (root) {
  'use strict';
  const safeId = x => /^[A-Za-z0-9_-]{1,100}$/.test(String(x || ''));
  const esc = x => String(x ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  const https = x => {
    try {
      const url = new URL(String(x || ''));
      return url.protocol === 'https:' ? url.href : '';
    } catch (_) { return ''; }
  };
  const dateValue = x => /^\d{4}-\d{2}-\d{2}/.test(String(x || '')) ?
    Date.parse(String(x).slice(0,10)) : NaN;
  const ids = (item, field) => new Set(
    (Array.isArray(item?.iteminfo?.[field]) ? item.iteminfo[field] : [])
    .filter(x => x && x.id != null).map(x=>String(x.id))
  );
  const containsId = (entries, own) => Array.isArray(entries) &&
    entries.some(x => x && own.has(String(x.id)));
  const normalizeItem = (x,floor) => x && x.floor === floor && safeId(x.cid) && x.title ? x : null;
  const recommendations = (item, floor, entries) => {
    if (!Array.isArray(entries)) return {series:[],similar:[]};
    const ownSeries=ids(item,'series'), ownActor=ids(item,'actress'), ownMaker=ids(item,'maker');
    const base=entries.filter(x => normalizeItem(x,floor) &&
      x.cid !== item.content_id);
    const bySeries = base.filter(x=>containsId(x.series,ownSeries));
    // Release-date order is not an official series episode order.
    bySeries.sort((a,b) => {
      const aa=dateValue(a.date), bb=dateValue(b.date);
      return (Number.isNaN(aa)?Infinity:aa) - (Number.isNaN(bb)?Infinity:bb) ||
        a.cid.localeCompare(b.cid);
    });
    const already=new Set(bySeries.map(x=>x.cid));
    const similar=base.filter(x=>!already.has(x.cid)).map(x => {
      const actor=Array.isArray(x.actress_ids) &&
        x.actress_ids.some(id=>ownActor.has(String(id)));
      const maker=Array.isArray(x.maker_ids) &&
        x.maker_ids.some(id=>ownMaker.has(String(id)));
      return {item:x,score:(actor?4:0)+(maker?1:0),
        reason:actor?'同じ出演者':maker?'同じメーカー':''};
    }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score ||
      (dateValue(b.item.date)||0)-(dateValue(a.item.date)||0));
    return {series:bySeries.slice(0,12),similar:similar.slice(0,6)};
  };
  const pricePoints = (history,floor,cid) => {
    const key = String(floor)+':'+String(cid);
    const value=history && typeof history==='object' && history.items && history.items[key];
    if (!Array.isArray(value)) return [];
    return value.filter(p=>Array.isArray(p)&&p.length===2 &&
      /^\d{4}-\d{2}-\d{2}$/.test(String(p[0])) &&
      Number.isInteger(p[1]) && p[1]>0 && p[1]<=10000000)
      .sort((a,b)=>a[0].localeCompare(b[0]));
  };
  const priceStats = points => {
    if (!Array.isArray(points)||!points.length)return null;
    const ordered=[...points].sort((a,b)=>a[0].localeCompare(b[0]));
    const prices=ordered.map(x=>x[1]);
    return {first:ordered[0][1],last:ordered.at(-1)[1],
      low:Math.min(...prices),high:Math.max(...prices),
      firstDate:ordered[0][0],lastDate:ordered.at(-1)[0],
      count:new Set(ordered.map(x=>x[0])).size};
  };
  const yen = n => '¥'+Number(n).toLocaleString('ja-JP');
  const productHref = (x,back) =>
    'product.html?cid='+encodeURIComponent(x.cid)+'&floor='+encodeURIComponent(x.floor)+
    '&from='+encodeURIComponent(back || '/home.html');
  const cards = (entries, back) => entries.map(x=>{
    const img=https(x.image);
    const title=esc(String(x.title).slice(0,170));
    const href=esc(productHref(x,back));
    return '<a class="discovery-related-card" href="'+href+'">'+
      (img?'<img src="'+esc(img)+'" alt="" loading="lazy">':'')+
      '<strong>'+title+'</strong>'+
      (x.date?'<small>発売日 '+esc(x.date.slice(0,10))+'</small>':'')+'</a>';
  }).join('');
  const renderSeries = (item,floor,source,node) => {
    if(!node)return;
    const matches=recommendations(item,floor,source?.items);
    const returnTo=root.location?.pathname+root.location?.search || '/home.html';
    const chunks=[];
    if(matches.series.length){
      chunks.push('<section class="discovery-related-block"><h2>同じシリーズの掲載作品</h2>'+
        '<p>作品データのシリーズIDが一致した候補を、発売日順で掲載しています。シリーズの正式な巻数・視聴順を示すものではありません。</p>'+
        '<div class="discovery-related-grid">'+cards(matches.series,returnTo)+'</div></section>');
    }
    if(matches.similar.length){
      chunks.push('<section class="discovery-related-block"><h2>同じ出演者・メーカーの作品</h2>'+
        '<p>作品情報に登録された出演者・メーカーの一致に基づく候補です。</p>'+
        '<div class="discovery-related-grid">'+cards(matches.similar.map(x=>x.item),returnTo)+'</div></section>');
    }
    node.innerHTML=chunks.join('');
  };
  const renderHistory = (history,floor,cid,node) => {
    if(!node)return;
    const points=pricePoints(history,floor,cid);
    const stats=priceStats(points);
    if(!stats){
      node.innerHTML='';
      return;
    }
    // No "discount" assertion without more than one distinct observation date.
    const diff=stats.last-stats.first;
    const trend=stats.count<2?'履歴の蓄積を開始しました':
      diff===0?'最初の記録から同じ金額':diff<0?'最初の記録より'+yen(-diff)+'低い':
      '最初の記録より'+yen(diff)+'高い';
    const sample=points.slice(-12).reverse().map(p=>
      '<li><time datetime="'+esc(p[0])+'">'+esc(p[0])+'</time><span>'+yen(p[1])+'</span></li>').join('');
    node.innerHTML='<section class="discovery-price-panel">'+
      '<h2>価格の記録</h2><p class="discovery-price-lead">サイトに保存されたFANZA商品データの価格を日別に記録しています。公式の現在価格を保証するものではありません。</p>'+
      '<div class="discovery-price-kpis"><div><small>最新の記録値</small><strong>'+yen(stats.last)+'</strong></div>'+
      '<div><small>期間中の最安記録</small><strong>'+yen(stats.low)+'</strong></div>'+
      '<div><small>記録日</small><strong>'+esc(stats.lastDate)+'</strong></div></div>'+
      '<p class="discovery-price-trend">'+esc(trend)+'（記録日数 '+stats.count+'日）</p>'+
      '<details><summary>最近の価格記録を確認</summary><ol class="discovery-price-history">'+sample+'</ol></details>'+
      '<p class="discovery-price-disclaimer">価格帯表示・確認できない価格・配信形式別の価格は履歴に含めていません。購入前に必ずFANZA公式をご確認ください。</p>'+
      '</section>';
  };
  async function load(item,floor) {
    const series=root.document?.getElementById('discoveryRelated');
    const history=root.document?.getElementById('discoveryPrices');
    if(!item?.content_id || !safeId(item.content_id))return;
    const [seriesResult,priceResult]=await Promise.allSettled([
      fetch('data/discovery_index.json').then(r=>r.ok?r.json():null),
      fetch('data/price_history.json').then(r=>r.ok?r.json():null)
    ]);
    if(seriesResult.status==='fulfilled')renderSeries(item,floor,seriesResult.value,series);
    if(priceResult.status==='fulfilled')renderHistory(priceResult.value,floor,item.content_id,history);
  }
  root.DiscoveryDetail={load,recommendations,priceStats,pricePoints};
  if(typeof module==='object'&&module.exports)module.exports=root.DiscoveryDetail;
})(typeof window==='undefined'?globalThis:window);
