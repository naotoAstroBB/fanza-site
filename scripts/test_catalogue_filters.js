'use strict';
const assert = require('node:assert/strict');
const {filter, hasActive, parseAmount, parseDuration} = require('../js/catalogue-filters.js');

const data = [
  {title:'Example A',date:'2026-11-01',prices:{price:'¥1,280〜'},volume:'150',iteminfo:{maker:[{name:'Studio Alpha'}]}},
  {title:'Example B',date:'2025-02-01',prices:{price:'¥500'},volume:'90',iteminfo:{maker:[{name:'Studio Beta'}]}},
  {title:'Example C',date:'2026-01-01',prices:{},volume:null,iteminfo:{maker:[]}},
  {title:'Example D',date:'2026-03-01',prices:{price:'2,000円'},volume:'200分',iteminfo:{maker:[{name:'ALPHA FACTORY'}]}}
];
assert.equal(parseAmount('¥1,280〜'), 1280);
assert.equal(parseAmount('2,000円'), 2000);
assert.equal(parseAmount(''), null);
assert.equal(parseAmount('20%OFF'), null);
assert.equal(parseDuration('150分'), 150);
assert.equal(parseDuration('120ページ'), 120);
assert.equal(hasActive({year:''}), false);
assert.equal(hasActive({year:'2026'}), true);
assert.equal(filter(data,{year:'2026'},'videoa').length, 3);
assert.equal(filter(data,{minPrice:'600',maxPrice:'1500'},'videoa')[0].title, 'Example A');
assert.equal(filter(data,{minPrice:'600',maxPrice:'1500'},'videoa').length, 1);
assert.deepEqual(filter(data,{maker:'alpha',minMinutes:'120',year:'2026'},'videoa').map(x=>x.title),['Example A','Example D']);
assert.deepEqual(filter(data,{minMinutes:'120'},'book'),[]);
assert.deepEqual(filter(data,{year:'2026',minPrice:'1'},'videoa').map(x=>x.title),['Example A','Example D']);
assert.equal(filter(data,{},'videoa').length,4);
console.log('Catalogue filters: 13 assertions passed');
