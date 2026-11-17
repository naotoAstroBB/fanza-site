'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {previewUrl, safeReturn} = require('../js/site-navigation.js');

const id = 'k568agotp10200';
const official = 'https://book.dmm.co.jp/product/6168811/'+id+'/tachiyomi/?cid=token&lin=1';
const purchase = 'https://al.fanza.co.jp/?lurl=https%3A%2F%2Fbook.dmm.co.jp%2Fproduct';
const item = {content_id:id, tachiyomi:{URL:official,affiliateURL:purchase}};
assert.equal(previewUrl(item,'book'),official);
assert.equal(previewUrl(item,'videoa'),'');
assert.equal(previewUrl({content_id:id,tachiyomi:{affiliateURL:purchase}},'book'),'');
assert.equal(previewUrl({content_id:id,tachiyomi:{URL:'https://bad.example/product/6168811/'+id+'/tachiyomi/'}},'book'),'');
assert.equal(previewUrl({content_id:'another',tachiyomi:{URL:official}},'book'),'');
assert.equal(previewUrl({content_id:id,tachiyomi:{URL:'https://book.dmm.co.jp/product/6168811/'+id+'/'}},'book'),'');
assert.equal(previewUrl({content_id:id,tachiyomi:{URL:'javascript:alert(1)'}},'book'),'');
const loc = {origin:'https://douga-adult.com',pathname:'/product.html',search:'?cid=abc&floor=book',hash:''};
assert.equal(safeReturn('/home.html?floor=book&page=2',loc),'/home.html?floor=book&page=2');
assert.equal(safeReturn('https://attacker.example/steal',loc),'');
assert.equal(safeReturn('//attacker.example/steal',loc),'');
assert.equal(safeReturn('javascript:alert(1)',loc),'');
assert.equal(safeReturn('/product.html?cid=abc&floor=book',loc),'');
assert.equal(safeReturn('/works/example123.html',loc),'/works/example123.html');
assert.equal(safeReturn('/admin.html',loc),'');
assert.equal(safeReturn('https://douga-adult.com/home.html#section',loc),'/home.html#section');

const script=fs.readFileSync('js/site-navigation.js','utf8');
function returnDestination(search, referrer) {
  let destination = '';
  const location = {
    origin:'https://douga-adult.com',pathname:'/product.html',search,hash:'',
    assign(to) {destination=to;}
  };
  const window = {location,document:{referrer}};
  vm.runInNewContext(script,{window,URL,URLSearchParams}, {timeout:800});
  window.FanzaNavigation.goBack('/home.html');
  return destination;
}
assert.equal(
  returnDestination('?cid=abc&from=%2Fhome.html%3Ffloor%3Dbook%26page%3D2',''),
  '/home.html?floor=book&page=2'
);
assert.equal(
  returnDestination('?cid=abc','https://douga-adult.com/actress.html?id=123'),
  '/actress.html?id=123'
);
assert.equal(returnDestination('?cid=abc',''),'/home.html');
assert.equal(returnDestination('?cid=abc','https://attacker.example/'),'/home.html');
assert.equal(
  returnDestination('?cid=abc&from=https%3A%2F%2Fattacker.example%2F',''),
  '/home.html'
);
console.log('Official manga preview and back navigation: all checks passed');
