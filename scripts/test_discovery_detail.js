'use strict';
const assert=require('node:assert/strict');
const {URL}=require('node:url');
const detail=require('../js/discovery-detail.js');
const item={
 content_id:'comic00010',
 iteminfo:{
  series:[{id:343,name:'Series 343'}],
  actress:[{id:20,name:'Artist 20'}],
  maker:[{id:99,name:'Maker'}],
 }
};
const entry=(cid,series,actor,maker,date,floor='book')=>({
 cid,floor,title:cid,date,series:series?[{id:String(series),name:'S'}]:[],
 actress_ids:actor?[String(actor)]:[],maker_ids:maker?[String(maker)]:[]
});
const entries=[
 entry('comic00011',343,0,1,'2026-11-15'),
 entry('comic00012',343,0,1,'2026-10-01'),
 entry('comic00013',500,20,0,'2026-11-15'),
 entry('comic00014',501,0,99,'2026-11-15'),
 entry('comic00015',343,20,99,'2026-11-12','anime'),
 entry('comic00010',343,20,99,'2026-11-12')
];
const result=detail.recommendations(item,'book',entries);
assert.deepEqual(result.series.map(p=>p.cid),['comic00012','comic00011']);
assert.deepEqual(result.similar.map(p=>p.item.cid),['comic00013','comic00014']);
assert.equal(detail.recommendations(item,'goods',entries).series.length,0);
assert.equal(detail.recommendations({content_id:'unmatched',iteminfo:{}},'book',entries).similar.length,0);
const history={items:{
 'book:comic00010':[['2026-11-17',907],['2026-11-18',790],['bad',300],['2026-11-19',0]],
 'videoa:comic00010':[['2026-11-18',2500]]
}};
const prices=detail.pricePoints(history,'book','comic00010');
assert.deepEqual(prices,[['2026-11-17',907],['2026-11-18',790]]);
assert.equal(detail.priceStats(prices).first,907);
assert.equal(detail.priceStats(prices).last,790);
assert.equal(detail.priceStats(prices).low,790);
assert.equal(detail.priceStats(prices).count,2);
assert.equal(detail.priceStats([]),null);
assert.equal(detail.pricePoints(history,'anime','comic00010').length,0);
console.log('Detail discovery data: exact series IDs, date order and price provenance passed');
