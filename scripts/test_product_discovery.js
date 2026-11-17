'use strict';
const assert=require('node:assert/strict');
const {URL}=require('node:url');
const memory=new Map();
global.localStorage={
  getItem:k=>memory.get(k)||null,
  setItem:(k,v)=>memory.set(k,v),
  removeItem:k=>memory.delete(k)
};
const Discovery=require('../js/product-discovery.js');
const Filters=require('../js/catalogue-filters.js');
const cid='k568agotp10200';
const official='https://book.dmm.co.jp/product/6168811/'+cid+'/tachiyomi/?cid=abc';
const item=(i,floor='book')=>({
  content_id:'comic'+i,
  title:'テスト漫画'+i,
  prices:{price:'500円'},
  imageURL:{list:'https://pics.dmm.co.jp/images/'+i+'.jpg'},
  tachiyomi:{URL:'https://book.dmm.co.jp/product/6168811/comic'+i+'/tachiyomi/?id=123'},
  iteminfo:{maker:[{name:'メーカーX'}]},
  affiliateURL:'https://al.fanza.co.jp/?lurl=https%3A%2F%2Fbook.dmm.co.jp%2Fproduct'
});
assert.equal(Discovery.count(),0);
assert.equal(Discovery.toggle(item(1),'book').ok,true);
assert.equal(Discovery.toggle(item(2),'book').ok,true);
assert.equal(Discovery.toggle(item(3),'book').ok,true);
assert.equal(Discovery.count(),3);
assert.equal(Discovery.toggle(item(4),'book').ok,false);
assert.equal(Discovery.toggle(item(1),'book').added,false);
assert.equal(Discovery.count(),2);
assert.equal(Discovery.has('comic2','book'),true);
Discovery.remove('comic2','book');
assert.equal(Discovery.count(),1);
assert.equal(Discovery.affiliateUrl('javascript:alert(1)'),'');
assert.equal(Discovery.affiliateUrl('https://phishing.example/'),'');
assert.ok(Discovery.affiliateUrl(item(1).affiliateURL).startsWith('https://al.fanza.co.jp/'));
const state={floor:'book',sort:'date',keyword:'テスト',genre:'',filters:{year:'2026',previewOnly:'1'}};
assert.equal(Discovery.saveSearch(state).ok,true);
assert.equal(Discovery.searches().length,1);
assert.equal(Discovery.saveSearch(state).ok,true);
assert.equal(Discovery.searches().length,1);
assert.equal(Discovery.searches()[0].state.filters.previewOnly,'1');
const found=Discovery.getSearch(Discovery.searches()[0].id);
assert.equal(found.state.keyword,'テスト');
assert.ok(Discovery.label(found.state).includes('試し読みあり'));
Discovery.deleteSearch(found.id);
assert.equal(Discovery.searches().length,0);
for(let i=0;i<10;i++)Discovery.saveSearch({floor:'book',keyword:'q'+i,filters:{}});
assert.equal(Discovery.searches().length,8);
assert.equal(Discovery.searches()[0].state.keyword,'q9');
assert.equal(Discovery.searches()[7].state.keyword,'q2');
assert.equal(Discovery.normalizeSearch({floor:'wrong',filters:{previewOnly:'hacked'}}).floor,'videoa');
assert.equal(Discovery.normalizeSearch({floor:'wrong',filters:{previewOnly:'hacked'}}).filters.previewOnly,'');
Discovery.clear();
assert.equal(Discovery.count(),0);
assert.equal(Filters.hasActive({previewOnly:'1'}),true);
const comic={...item(1),content_id:cid,tachiyomi:{URL:official}};
assert.equal(Filters.hasPreview(comic),true);
assert.equal(Filters.hasPreview({...comic,tachiyomi:{URL:'https://bad.example/product/6168811/'+cid+'/tachiyomi/'}}),false);
assert.equal(Filters.hasPreview({...comic,tachiyomi:{}}),false);
assert.equal(Filters.filter([comic],{previewOnly:'1'},'book').length,1);
assert.equal(Filters.filter([comic],{previewOnly:'1'},'videoa').length,0);
assert.equal(Filters.filter([comic],{previewOnly:'1',maxPrice:'400'},'book').length,0);
assert.equal(Filters.filter([comic],{previewOnly:'1',maxPrice:'600'},'book').length,1);
console.log('Discovery: comparison, saved searches, URL validation and reader filters passed');
