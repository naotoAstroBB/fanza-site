/* Comparison page uses only items explicitly selected by the visitor. */
const ComparePage = {
  esc(value) { return ProductDiscovery.escape(value); },
  render() {
    const items=ProductDiscovery.readCompare();
    const target=document.getElementById('comparePageContent');
    const count=document.getElementById('comparePageCount');
    const clear=document.getElementById('compareClear');
    if(!target||!count)return;
    count.textContent=items.length+' / 3作品を選択中';
    if(clear)clear.hidden=items.length===0;
    if(!items.length){
      target.innerHTML='<div class="compare-empty"><strong>まだ比較する作品がありません</strong><p>作品一覧で「比較に追加」を選ぶと、ここで並べて確認できます。</p><a href="home.html">作品一覧から探す</a></div>';
      return;
    }
    const safeTitle=(item)=>this.esc(item.title||item.cid);
    const safeHref=(item)=>'product.html?cid='+encodeURIComponent(item.cid)+'&floor='+encodeURIComponent(item.floor)+'&from='+encodeURIComponent('/compare.html');
    const cards=items.map(item=>{
      const image=ProductDiscovery.httpsUrl(item.image);
      return `<article class="compare-item">
        ${image?`<a href="${this.esc(safeHref(item))}"><img src="${this.esc(image)}" alt="${safeTitle(item)}" loading="lazy"></a>`:''}
        <h2><a href="${this.esc(safeHref(item))}">${safeTitle(item)}</a></h2>
        <div class="compare-item-actions">
          <a class="compare-detail-link" href="${this.esc(safeHref(item))}">作品情報を見る</a>
          <button type="button" data-remove-cid="${this.esc(item.cid)}" data-remove-floor="${this.esc(item.floor)}">解除</button>
        </div>
      </article>`;
    }).join('');
    const floorNames={videoa:'動画',anime:'アニメ',book:'漫画',goods:'グッズ',mono:'グッズ',vr:'VR'};
    const values=[
      ['カテゴリ', item=>floorNames[item.floor]||'—'],
      ['参考価格', item=>item.price ? item.price.replace(/^[¥￥]/,'').replace(/円\s*$/,'')+'円（要公式確認）' : '不明'],
      ['収録時間・ページ数', item=>item.volume ? item.volume+(item.floor==='book'?'ページ':(['videoa','anime','vr'].includes(item.floor)?'分':'')) : '未掲載'],
      ['発売日', item=>item.date||'未掲載'],
      ['メーカー', item=>item.maker||'未掲載'],
      ['評価（公式掲載値）', item=>item.review ? item.review : '未掲載'],
      ['品番', item=>item.cid]
    ];
    const table=values.map(([label,value])=>`<tr><th scope="row">${this.esc(label)}</th>${items.map(it=>`<td>${this.esc(value(it))}</td>`).join('')}</tr>`).join('');
    const official=items.map(item=>{
      const url=ProductDiscovery.affiliateUrl(item.affiliate);
      return url ? `<a href="${this.esc(url)}" target="_blank" rel="sponsored noopener noreferrer">FANZA公式で確認</a>`
                 : '<span>公式URL未登録</span>';
    }).join('</td><td>');
    target.innerHTML=`<div class="compare-scroll" role="region" aria-label="作品比較表" tabindex="0">
      <div class="compare-wide" style="--compare-cols:${items.length}">
        <div class="compare-grid"><div class="compare-grid-label" aria-hidden="true">比較項目</div>${cards}</div>
        <table class="compare-table"><tbody>${table}<tr><th scope="row">公式ページ</th><td>${official}</td></tr></tbody></table>
      </div></div>`;
    target.querySelectorAll('[data-remove-cid]').forEach(btn=>{
      btn.addEventListener('click',()=>{
        ProductDiscovery.remove(btn.dataset.removeCid,btn.dataset.removeFloor);
        this.render();
      });
    });
  },
  clear() { ProductDiscovery.clear();this.render(); }
};
ComparePage.render();
