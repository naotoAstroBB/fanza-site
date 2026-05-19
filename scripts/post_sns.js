#!/usr/bin/env node
// SNS自動投稿スクリプト（リーチ最大化版）v5
// 環境変数: BSKY_HANDLE, BSKY_APP_PASSWORD, X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET, MISSKEY_INSTANCE, MISSKEY_TOKEN, POST_SLOT

const fs     = require('fs');
const https  = require('https');
const http   = require('http');
const crypto = require('crypto');

const SITE = 'https://douga-adult.com';

// ===== データ読み込み =====
function loadJSON(path) {
  try { return JSON.parse(fs.readFileSync(path, 'utf8')); } catch { return null; }
}
const rankItems      = loadJSON('data/rank.json')?.result?.items        || [];
const newItems       = loadJSON('data/new.json')?.result?.items         || [];
const reviewItems    = loadJSON('data/review.json')?.result?.items      || [];
const actressPopular = loadJSON('data/actress_popular.json')?.result?.actress || [];
const actressNew     = loadJSON('data/actress_new.json')?.result?.actress     || [];
const actressMonthly = loadJSON('data/actress_monthly.json')?.result?.actress || [];
if (!rankItems.length) { console.error('データなし'); process.exit(1); }

// 商品の経過日数（古い商品をフィルタするため）
function itemAgeDays(item) {
  const d = new Date((item.date || '').replace(/\//g, '-'));
  return isNaN(d.getTime()) ? 9999 : (Date.now() - d.getTime()) / 86400000;
}

// 投稿モード: 0-2=商品, 3=女優ランキング, 4=新人女優, 5=女優紹介
const POST_MODE = Math.floor(Math.random() * 6);

// ===== シード（毎回ランダムに選択）=====
function hash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h * 33) ^ str.charCodeAt(i)) >>> 0;
  return h;
}
const slot    = parseInt(process.env.POST_SLOT || '0', 10);
const SEED    = Math.floor(Math.random() * 0xFFFFFFFF);

// ===== ヘルパー =====
function getActresses(item) { return (item.iteminfo?.actress || []).map(a => a.name); }
function getGenres(item)    { return (item.iteminfo?.genre   || []).map(g => g.name); }

// リーチ最大化ハッシュタグ生成
function buildTags(item, extra = []) {
  const set = new Set(['FANZA', 'AV', 'アダルト動画', 'エロ動画', ...extra]);

  // 女優名タグ
  getActresses(item).slice(0, 2).forEach(a => set.add(a.replace(/[\s　]/g, '')));

  // ジャンル→タグマップ（リーチの大きいタグに変換）
  const MAP = {
    '巨乳': ['巨乳', '爆乳'],      '美乳': ['美乳'],
    '美少女': ['美少女', '美女'],  'スレンダー': ['スレンダー'],
    '痴女': ['痴女'],               '人妻': ['人妻', '熟女'],
    '素人': ['素人'],               'OL': ['OL'],
    'コスプレ': ['コスプレ'],       'ギャル': ['ギャル'],
    '単体作品': ['単体作品'],       'デビュー作品': ['新人AV女優', 'デビュー'],
    'BEST・総集編': ['ベスト作品'], '4時間以上作品': ['長時間'],
    '中出し': ['中出し'],           'フェラ': ['フェラ'],
    'SM': ['SM'],                  'ロリ': ['ロリ'],
    '近親相姦': ['禁断'],          'ナンパ': ['ナンパ'],
  };
  getGenres(item).forEach(g => (MAP[g] || []).forEach(t => set.add(t)));

  // 評価が高ければ追加タグ
  const avg = parseFloat(item.review?.average || 0);
  if (avg >= 4.5) set.add('高評価');
  if (parseInt(item.review?.count || 0) > 500) set.add('名作');

  return [...set].slice(0, 9).map(t => '#' + t).join(' ');
}

function reviewStr(item) {
  const avg = parseFloat(item.review?.average || 0);
  const cnt = parseInt(item.review?.count || 0);
  if (!avg) return '';
  return `${'★'.repeat(Math.min(5, Math.round(avg)))} ${avg}点 (${cnt.toLocaleString()}件)`;
}
function shortTitle(t, len = 28) { return (t || '').slice(0, len); }
function siteUrl(item)  { return `${SITE}/product.html?cid=${item.content_id}`; }

// ===== フレーズバリエーションヘルパー（同一ランで一貫性） =====
function rv(pool, offset) {
  return pool[(SEED + (offset || 0) * 13) % pool.length];
}

// ===== 投稿パターン（50種） =====
const PATTERNS = [
  (item) => { // 0: 驚き発見
    const a = getActresses(item)[0]; if (!a) return null;
    const hook = rv(['がエロすぎてやばい','のやばさがちょっと異常','に完全にやられた','がえろすぎて困る'], 0);
    const body = rv(['これ知らないのはもったいない\nサンプルだけでも抜ける自信ある','なんでもっと早く見なかったんだろって思った','サンプルの時点でもう無理だった','最初から最後まで全部よかった'], 1);
    return `${a}${hook}\n\n${body}\n\n${reviewStr(item)}\n👇 サンプル動画あり\n${siteUrl(item)}\n\n${buildTags(item)}`;
  },
  () => { // 1: ランキングTOP3
    const top = rankItems.slice(0, 3);
    const lines = top.map((x, i) => `${['🥇','🥈','🥉'][i]} ${getActresses(x)[0]||'---'}\n　${shortTitle(x.title,20)}…\n　${reviewStr(x)}`).join('\n\n');
    const head = rv(['今週ガチで抜けたFANZA作品TOP3','今月バズってるFANZA作品TOP3','えろさで選ぶFANZAランキングTOP3','抜けると評判のFANZA作品TOP3'], 0);
    return `${head}\n\n${lines}\n\nサンプル・詳細はこちら\n${SITE}\n\n#FANZAランキング #FANZA #AV #エロ動画 #抜ける #おすすめ`;
  },
  (item) => { // 2: 個人おすすめ
    const a = getActresses(item)[0] || '';
    const hook = rv(['正直に言う','これだけ言わせて','聞いてほしいんだけど'], 0);
    const body = rv([
      `${a ? a + 'のこれ' : 'これ'}、想像以上にえろかった\n\n最初から最後まで全部いい\nサンプルで既に満足度高い`,
      `${a ? a + 'のやつ' : 'これ'}見てたんだけど\n\n予想の3倍えろかった\nなめてたのにやられた`,
      `${a || 'これ'}がえろかった話をする\n\nサンプルだけで満足できるレベルじゃない`,
    ], 1);
    return `${hook}\n\n${body}\n\n${reviewStr(item)}\n${siteUrl(item)}\n\n${buildTags(item)}`;
  },
  (item) => { // 3: セール推し
    const price = item.prices?.price;
    const head = price ? `${price}円でこのえろさは${rv(['コスパおかしい','頭おかしい','正気じゃない'], 0)}` : `セール中のやつ${rv(['えろすぎる','やばすぎる'], 0)}`;
    return `${head}\n\n${shortTitle(item.title)}\n\n${reviewStr(item)}\n\n今のうちに抑えといて\n${siteUrl(item)}\n\n${buildTags(item, ['FANZAセール', 'セール'])}`;
  },
  (item) => { // 4: 女優フィーチャー
    const a = getActresses(item)[0]; if (!a) return null;
    const body = rv([
      `えろいのに上品なんだよな\n\nそのギャップにやられてる人が多いんだと思う`,
      `えろさの種類が${rv(['他の人と違う','ちょっと特別','最高にいい'], 1)}\n\nこれがわかる人とは仲良くなれる`,
      `なんか${rv(['品がある','雰囲気がある','独特の色気がある'], 1)}んだよな\nえろさと上品さが両立してる`,
    ], 0);
    return `${a}の何がやばいって\n\n${body}\n\n最新作👇\n${siteUrl(item)}\n\n${buildTags(item)}`;
  },
  (item) => { // 5: デビュー・新人
    const a = getActresses(item)[0] || '';
    const body = rv([
      `なのにこのえろさはずるい\n\n経験値じゃなくて\n生まれ持ったやつだと思う`,
      `なのにこの${rv(['えろさ','完成度','やばさ'], 0)}は何？\n\nこれから絶対${rv(['くる','バズる','伸びる'], 1)}やつだ`,
      `なのに${rv(['最初から','もう','いきなり'], 0)}えろすぎる\nデビューしたての顔と体がたまらない`,
    ], 0);
    return `${a ? a + ' ' : ''}デビューしたて\n\n${body}\n\n${reviewStr(item)}\n${siteUrl(item)}\n\n${buildTags(item, ['新人AV女優', 'デビュー'])}`;
  },
  (item) => { // 6: レビュー偉業
    const avg = parseFloat(item.review?.average || 0);
    const cnt = parseInt(item.review?.count || 0);
    if (avg < 4.0 || cnt < 50) return null;
    const body = rv([
      `この数字が全部物語ってる\n\n文句なしの名作エロ`,
      `嘘をつかない数字\nこれだけ見てえろくないわけがない`,
      `${cnt.toLocaleString()}人が正直に評価した結果\nこの点数は${rv(['本物','納得','間違いない'], 1)}`,
    ], 0);
    return `${cnt.toLocaleString()}人が抜いて${avg}点\n\n${body}\n\n👇 騙されたと思って見て\n${siteUrl(item)}\n\n${buildTags(item, ['高評価', '名作'])}`;
  },
  (item) => { // 7: 問いかけ
    const gs = getGenres(item).filter(g => g.length <= 6 && !['ハイビジョン','独占配信'].includes(g));
    if (gs.length < 2) return null;
    const body = rv([
      `どっちも捨てられない人のために\nどっちも全部入ってる作品持ってきた\n\nこれはずるい`,
      `両方好きな人向けに\n全部入りの作品見つけた\n\nありがとうって言いたくなる`,
    ], 0);
    return `${gs[0]}と${gs[1]}どっちが好き？\n\n${body}\n${siteUrl(item)}\n\n${buildTags(item)}`;
  },
  (item) => { // 8: 知る人ぞ知る
    const body = rv([
      `派手に宣伝されてないのに\nわかってる人がずっと見てる`,
      `宣伝してないのに口コミだけで広まってる\nそういうやつって大体間違いない`,
    ], 0);
    return `表に出てないけどえろい名作\n\n${body}\n\n${reviewStr(item)}\n\nこっそり保存しといて\n${siteUrl(item)}\n\n${buildTags(item, ['名作', '隠れた名作'])}`;
  },
  (item) => { // 9: スペック推し
    const a = getActresses(item)[0] || '';
    const gs = getGenres(item).filter(g => ['巨乳','美乳','美少女','スレンダー','痴女','人妻'].includes(g));
    const body = rv([
      `全部ちょうどいいんだよな\nちょうどいいってのが一番やばい`,
      `えろいポイントが全部揃ってる\n何一つ文句がない`,
      `スペックが完璧すぎる\nこれを求めてたって感じがする`,
    ], 0);
    return `${a}の${gs[0] || 'このスペック'}がえろすぎる件\n\n${body}\n\n${reviewStr(item)}\n${siteUrl(item)}\n\n${buildTags(item)}`;
  },
  (item) => { // 10: 深夜
    const time = rv(['深夜限定で流すやつ','夜中に見るやつ','深夜3時に見つけたやつ','寝る前に見るやつじゃなかった'], 0);
    const after = rv(['これ見たあとすぐ寝れる人いたら教えて','眠れなくなっても知らない','翌朝後悔するやつ'], 1);
    return `${time}\n\n${shortTitle(item.title)}\n\n${after}\n\n${reviewStr(item)}\n${siteUrl(item)}\n\n${buildTags(item, ['深夜', 'えろい'])}`;
  },
  (item) => { // 11: 共感フック
    const g = getGenres(item).filter(g => g.length < 8 && !['ハイビジョン'].includes(g))[0];
    if (!g) return null;
    const body = rv([
      `だから信頼できるやつだけ紹介したくて\n\nこれは間違いない\nマジでえろい`,
      `だから厳選したやつだけ貼る\n\nこれは外れない`,
    ], 0);
    return `${g}好きって外れるとほんとにきついよね\n\n${body}\n\n${reviewStr(item)}\n${siteUrl(item)}\n\n${buildTags(item)}`;
  },
  (item) => { // 12: ジャンル特化
    const g = getGenres(item).filter(g => !['ハイビジョン','BEST・総集編','独占配信'].includes(g))[0];
    if (!g) return null;
    const a = getActresses(item)[0] || '';
    const body = rv([
      `サンプルだけでも見る価値ある`,
      `${g}のえろさをわかってる人なら絶対好き`,
      `これのえろさが伝わってほしい`,
    ], 0);
    return `${g}のエロさをちゃんとわかってる人向け\n\n${a}\n\n${body}\n\n${reviewStr(item)}\n${siteUrl(item)}\n\n${buildTags(item)}`;
  },
  (item) => { // 13: 比較おすすめ
    const g = getGenres(item).filter(g => !['ハイビジョン'].includes(g))[0] || 'このジャンル';
    const body = rv([
      `色々試してきたけど\nえろさのレベルが違う`,
      `いろいろ見てきたけど\nこれ超えるやつまだ出会えてない`,
      `散々探し回ってたけど\nこれで全部解決した`,
    ], 0);
    return `${g}で抜くならこれ一択\n\n${body}\n\n${reviewStr(item)}\n${siteUrl(item)}\n\n${buildTags(item)}`;
  },
  (item) => { // 14: 実況・感想
    const a = getActresses(item)[0] || '';
    const body = rv([
      `${a ? a + 'にごめんなさいしたくなった' : 'これはやばかった'}`,
      `${a ? a + 'に全部持ってかれた' : '全部持ってかれた'}`,
      `${a ? a + 'が予想以上すぎた' : '予想の倍えろかった'}`,
    ], 0);
    return `さっき見終わった\n\n${body}\n\nなめてたのに途中から全力になってた\n\n${reviewStr(item)}\n${siteUrl(item)}\n\n${buildTags(item)}`;
  },
  (item) => { // 15: データ統計
    const cnt = parseInt(item.review?.count || 0);
    const avg = item.review?.average;
    if (!avg || !cnt) return null;
    const body = rv([
      `どれだけえろいかは数字を見ればわかる\n\nこれが全部語ってる`,
      `嘘をつかない数字\nえろさは正直に出る`,
      `これだけの人が見てこの点数\nもう語ることはない`,
    ], 0);
    return `${cnt.toLocaleString()}人が見て${avg}点\n\n${body}\n\n${siteUrl(item)}\n\n${buildTags(item, ['高評価'])}`;
  },
  (item) => { // 16: 週末推薦
    const body = rv([
      `時間たっぷりある日に見ないともったいない\nそういうえろさがある`,
      `これは時間確保して見るやつ\n\n途中で止められないから`,
      `週末の夜に全部見てほしい\n後悔しないと思う`,
    ], 0);
    return `今週末に見るべき一本\n\n${shortTitle(item.title)}\n\n${body}\n\n${reviewStr(item)}\n${siteUrl(item)}\n\n${buildTags(item, ['週末'])}`;
  },
  (item) => { // 17: タイムセール速報
    const body = rv([
      `このえろさでこの値段は正気じゃない`,
      `この値段でここまで見れるの頭おかしい`,
      `コスパが完全に壊れてる`,
    ], 0);
    return `⚡ 今すぐ見て\n\n${shortTitle(item.title)}\n\n${body}\n\n${reviewStr(item)}\n${siteUrl(item)}\n\n${buildTags(item, ['FANZAセール', 'セール'])}`;
  },
  (item) => { // 18: レジェンド推し
    const a = getActresses(item)[0]; if (!a) return null;
    const body = rv([
      `何年経っても色褪せない\nむしろ今見た方が刺さる`,
      `時代を超えるえろさってあるんだと思った\nこれがそれ`,
    ], 0);
    return `${a}のえろさは時代を超える\n\n${body}\n\nこれはレジェンド\n\n${reviewStr(item)}\n${siteUrl(item)}\n\n${buildTags(item, ['レジェンド', '名作'])}`;
  },
  (item) => { // 19: シナリオ・妄想
    const gs = getGenres(item).filter(g => !['ハイビジョン','BEST・総集編','独占配信'].includes(g));
    const gStr = gs.slice(0, 2).join('×') || 'このジャンル';
    const body = rv([
      `シチュエーションも\n展開も\n全部ツボだった\n\n妄想が止まらなくなる`,
      `設定が完璧すぎる\nこういうのを求めてた`,
      `全部の要素がちょうどよくて\n見終わったあと余韻がすごかった`,
    ], 0);
    return `${gStr}でこんなにえろい作品あったんだ\n\n${body}\n\n${reviewStr(item)}\n${siteUrl(item)}\n\n${buildTags(item)}`;
  },
  // ===== 20〜 追加パターン =====
  (item) => { // 20: 超短パンチ
    const a = getActresses(item)[0] || shortTitle(item.title, 15);
    return `${a}\n\n${rv(['えろすぎ','やばすぎ','すごすぎ','最高すぎ'], 0)}\n\n${rv(['見て','保存して','見てほしい'], 1)}\n${siteUrl(item)}\n\n${buildTags(item)}`;
  },
  (item) => { // 21: タイムライン風
    const a = getActresses(item)[0] || '';
    const time = rv(['昨夜','今朝','さっき','深夜に','週末に'], 0);
    const reaction = rv(['時間溶けた','寝れなかった','後悔はしてない','止まらなかった','最高だった'], 1);
    return `${time}${a ? a + 'のやつ' : 'これ'}見てた\n\n${reaction}\n\n${reviewStr(item)}\n${siteUrl(item)}\n\n${buildTags(item)}`;
  },
  (item) => { // 22: 後悔・発見
    const a = getActresses(item)[0] || '';
    const open = rv(['なんで今まで見てなかったんだろ','もっと早く見ればよかった','今更見たけど最高だった','ようやく見た'], 0);
    return `${open}\n\n${a || shortTitle(item.title, 20)}\n\n${reviewStr(item)}\n${siteUrl(item)}\n\n${buildTags(item)}`;
  },
  (item) => { // 23: 問いかけ2
    const a = getActresses(item)[0]; if (!a) return null;
    const ask = rv([`${a}好きな人いる？`,`${a}知ってる人いる？`,`${a}のファンいる？`], 0);
    return `${ask}\n\nこれ${rv(['絶対見て','ぜひ見て','見てほしい'], 1)}\n\n${reviewStr(item)}\n${siteUrl(item)}\n\n${buildTags(item)}`;
  },
  (item) => { // 24: ミニマル
    const a = getActresses(item)[0];
    const rev = reviewStr(item);
    return `${a ? a + '\n\n' : ''}${rev ? rev + '\n\n' : ''}${rv(['貼っとく','とりあえず共有','残しとく'], 0)}\n${siteUrl(item)}\n\n${buildTags(item)}`;
  },
  (item) => { // 25: 発見スタイル
    const a = getActresses(item)[0] || '';
    const open = rv(['こんな作品あったの知らなかった','これ知らなかった','発見してしまった','これ見つけてしまった'], 0);
    const body = rv(['サンプルの時点でもう無理','サンプルで既に満足できるやつ','見てよかった'], 1);
    return `${open}\n\n${a || shortTitle(item.title, 20)}\n\n${body}\n\n${reviewStr(item)}\n${siteUrl(item)}\n\n${buildTags(item)}`;
  },
  (item) => { // 26: 深夜保存
    return `${rv(['深夜に','夜中に','朝方に'], 0)}保存したやつ${rv(['共有する','貼る','残しとく'], 1)}\n\n${shortTitle(item.title)}\n\n${reviewStr(item)}\n${siteUrl(item)}\n\n${buildTags(item, ['深夜'])}`;
  },
  (item) => { // 27: 寝れない系
    const a = getActresses(item)[0] || '';
    const result = rv(['眠れなくなった','やられた','時間溶かされた'], 0);
    return `寝る前に見るやつじゃなかった\n\n${a ? a + 'に' : ''}${result}\n\n${reviewStr(item)}\n${siteUrl(item)}\n\n${buildTags(item)}`;
  },
  (item) => { // 28: 今週ベスト
    const a = getActresses(item)[0] || '';
    return `今週見た中で${rv(['ダントツ','断トツ','一番'], 0)}えろかった\n\n${a || shortTitle(item.title, 20)}\n\n${reviewStr(item)}\n${siteUrl(item)}\n\n${buildTags(item)}`;
  },
  (item) => { // 29: えろさ一択
    const g = getGenres(item).filter(g => !['ハイビジョン','独占配信'].includes(g))[0];
    return `${rv(['抜きたい人へ','えろいの探してる人へ','このジャンル好きな人へ'], 0)}\n\n${g ? g + 'ならこれ' : 'これ一択'}\n\n${reviewStr(item)}\n${siteUrl(item)}\n\n${buildTags(item)}`;
  },
  (item) => { // 30: 相談風
    const cnt = parseInt(item.review?.count || 0);
    if (!cnt) return null;
    return `ちょっと聞いていい？\n\nこれ${cnt.toLocaleString()}人が評価してる作品なんだけど\n\n見た人いる？\nえろくない？\n\n${siteUrl(item)}\n\n${buildTags(item)}`;
  },
  (item) => { // 31: 語彙力なくなる
    const a = getActresses(item)[0] || '';
    return `${a ? a + 'を見て' : 'これ見て'}語彙力なくなった\n\n${rv(['えろい','やばい','すごい'], 0)}\n\nそれしか言えない\n\n${reviewStr(item)}\n${siteUrl(item)}\n\n${buildTags(item)}`;
  },
  (item) => { // 32: 比較できないやつ
    return `${rv(['今まで見た中で','いろいろ見てきたけど','色々試したけど'], 0)}\n\nこれを超えるやつ${rv(['まだ出会えてない','なかなかない'], 1)}\n\n${reviewStr(item)}\n${siteUrl(item)}\n\n${buildTags(item)}`;
  },
  (item) => { // 33: サンプル推し
    const a = getActresses(item)[0] || '';
    return `${a || 'これ'}のサンプルが${rv(['もう無理','やばすぎる','えぐすぎる'], 0)}\n\n本編どうなるんだって話\n\n${reviewStr(item)}\n👇 サンプル無料\n${siteUrl(item)}\n\n${buildTags(item)}`;
  },
  (item) => { // 34: ジャンル最強
    const g = getGenres(item).filter(g => !['ハイビジョン','独占配信','BEST・総集編'].includes(g))[0];
    if (!g) return null;
    return `${g}でここまで${rv(['えろいのは','完璧なのは'], 0)}${rv(['初めて見た','なかなかない'], 1)}\n\n${reviewStr(item)}\n${siteUrl(item)}\n\n${buildTags(item)}`;
  },
  (item) => { // 35: 今日のおすすめ
    return `今日の${rv(['おすすめ','一本','セレクト'], 0)}\n\n${shortTitle(item.title)}\n\n${reviewStr(item)}\n${siteUrl(item)}\n\n${buildTags(item)}`;
  },
  (item) => { // 36: えろい理由語り
    const a = getActresses(item)[0]; if (!a) return null;
    const gs = getGenres(item).filter(g => ['巨乳','美乳','美少女','スレンダー','痴女','人妻','ギャル','素人'].includes(g));
    const trait = gs[0] || rv(['顔','体','雰囲気','演技'], 0);
    return `${a}がえろい理由\n\n${trait}が${rv(['最高','やばい','たまらない','完璧'], 1)}だから\n\nそれに尽きる\n\n${reviewStr(item)}\n${siteUrl(item)}\n\n${buildTags(item)}`;
  },
  (item) => { // 37: 圧倒された
    const a = getActresses(item)[0] || '';
    return `${a ? a + 'に' : ''}${rv(['圧倒された','完全にやられた','持ってかれた','引き込まれた'], 0)}\n\n${rv(['最初の5分で引き込まれた','途中から止まらなかった','気づいたら全部見てた'], 1)}\n\n${reviewStr(item)}\n${siteUrl(item)}\n\n${buildTags(item)}`;
  },
  (item) => { // 38: 保存案件
    return `${rv(['これは保存案件','これ保存しといて','これ絶対保存して'], 0)}\n\n${shortTitle(item.title)}\n\n${reviewStr(item)}\n${siteUrl(item)}\n\n${buildTags(item)}`;
  },
  (item) => { // 39: 素直な感想
    const a = getActresses(item)[0] || '';
    return `${rv(['素直に言う','正直に言う','ぶっちゃけ'], 0)}\n\n${a ? a + 'の新作' : 'これ'}えろすぎて${rv(['困った','びっくりした','嬉しかった'], 1)}\n\n${reviewStr(item)}\n${siteUrl(item)}\n\n${buildTags(item)}`;
  },
  (item) => { // 40: 時間帯別
    const hour = new Date(Date.now() + 9*3600000).getUTCHours();
    const timeStr = hour >= 22 || hour <= 3 ? '深夜' : hour < 12 ? '朝' : hour < 18 ? '昼' : '夜';
    return `${timeStr}に見るやつ\n\n${shortTitle(item.title)}\n\n${reviewStr(item)}\n${siteUrl(item)}\n\n${buildTags(item)}`;
  },
  (item) => { // 41: 推薦状スタイル
    const a = getActresses(item)[0] || '';
    return `${a || 'この作品'}を推薦します\n\n${rv(['サンプルだけでも見てください','まずサンプルを見てほしい'], 0)}\n\n絶対に${rv(['後悔しない','損しない','満足できる'], 1)}\n\n${reviewStr(item)}\n${siteUrl(item)}\n\n${buildTags(item)}`;
  },
  (item) => { // 42: 数字だけで語る
    const avg = parseFloat(item.review?.average || 0);
    const cnt = parseInt(item.review?.count || 0);
    if (!avg || !cnt) return null;
    return `${avg}点\n${cnt.toLocaleString()}人評価\n\nこれが全部\n\n${siteUrl(item)}\n\n${buildTags(item)}`;
  },
  (item) => { // 43: 女優×ジャンルクロス
    const a = getActresses(item)[0]; if (!a) return null;
    const g = getGenres(item).filter(g => !['ハイビジョン','独占配信'].includes(g))[0];
    if (!g) return null;
    return `${a}×${g}\n\nこの組み合わせが${rv(['最高','たまらない','やばい','最強'], 0)}\n\n${reviewStr(item)}\n${siteUrl(item)}\n\n${buildTags(item)}`;
  },
  (item) => { // 44: リアルタイム風
    return `今これ見てる\n\n${shortTitle(item.title)}\n\n${rv(['えろすぎて震えてる','最高すぎて止まれない','やばすぎてツイートした'], 0)}\n\n${siteUrl(item)}\n\n${buildTags(item)}`;
  },
  (item) => { // 45: わかってる人向け
    const g = getGenres(item).filter(g => !['ハイビジョン','独占配信','BEST・総集編'].includes(g))[0];
    const a = getActresses(item)[0] || '';
    return `${g || 'このジャンル'}がわかってる人だけ見てほしい\n\n${a}\n\n${rv(['これのえろさが伝わってほしい','わかる人と語りたい'], 0)}\n\n${reviewStr(item)}\n${siteUrl(item)}\n\n${buildTags(item)}`;
  },
  (item) => { // 46: 余韻系
    const a = getActresses(item)[0] || '';
    return `${a ? a + 'を見た余韻が' : '余韻が'}${rv(['すごい','やばい','抜けない'], 0)}\n\n${rv(['しばらく頭から離れない','ずっとリピートしてる','何回でも見れる'], 1)}\n\n${reviewStr(item)}\n${siteUrl(item)}\n\n${buildTags(item)}`;
  },
  (item) => { // 47: 質問→回答スタイル
    const g = getGenres(item).filter(g => !['ハイビジョン','独占配信'].includes(g))[0] || 'AV';
    const a = getActresses(item)[0] || '';
    return `${g}でえろい作品を探してる人へ\n\n答え：${a || shortTitle(item.title, 15)}\n\n${reviewStr(item)}\n${siteUrl(item)}\n\n${buildTags(item)}`;
  },
  (item) => { // 48: 告白スタイル
    const a = getActresses(item)[0] || '';
    return `${rv(['告白します','言います','認めます'], 0)}\n\n${a ? a + 'のことが' : 'これが'}${rv(['好きすぎる','えろすぎて無理','最高すぎる'], 1)}\n\n${reviewStr(item)}\n${siteUrl(item)}\n\n${buildTags(item)}`;
  },
  (item) => { // 49: シンプル共有
    const a = getActresses(item)[0] || '';
    return `FANZAで${rv(['神作品','えろい作品','おすすめの作品'], 0)}見つけた\n\n${a || shortTitle(item.title, 20)}\n\n${reviewStr(item)}\n${siteUrl(item)}\n\n${buildTags(item)}`;
  },
];

// ===== アルゴリズム分析：商品特性×時間帯から最適パターンを選択 =====
function analyzeItem(item) {
  const avg     = parseFloat(item.review?.average || 0);
  const cnt     = parseInt(item.review?.count     || 0);
  const genres  = getGenres(item);
  const hasActress = getActresses(item).length > 0;
  const isDebut = genres.includes('デビュー作品');
  const hasBest = genres.includes('BEST・総集編');
  const jst     = new Date(Date.now() + 9 * 3600000);
  const hour    = jst.getUTCHours();
  const dow     = jst.getUTCDay(); // 0=日, 6=土
  const isLate  = hour >= 22 || hour <= 3;
  const isWeekend = dow === 0 || dow === 6;

  const priority = [];
  if (isLate)                    priority.push(10);      // 深夜型
  if (isWeekend)                 priority.push(16);      // 週末推薦
  if (slot === 0)                priority.push(1);       // 朝はランキング
  if (isDebut && hasActress)     priority.push(5);       // デビュー
  if (avg >= 4.7 && cnt >= 200)  priority.push(6);       // レビュー偉業
  if (avg >= 4.5 && cnt >= 100)  priority.push(15);      // データ統計
  if (hasBest)                   priority.push(8);       // 知る人ぞ知る
  if (hasActress && avg >= 4.2)  priority.push(0, 4);    // 驚き・女優
  if (genres.length >= 2)        priority.push(7, 12);   // ジャンル活用
  if (cnt >= 300)                priority.push(15, 6);   // 実績重視

  // 残りをシードでシャッフルして補完
  const remaining = [...Array(PATTERNS.length).keys()].filter(i => !priority.includes(i));
  remaining.sort((a, b) => (hash(String(SEED + a * 97)) % 100) - (hash(String(SEED + b * 97)) % 100));

  return [...new Set([...priority, ...remaining])];
}

function generateText(item) {
  const order = analyzeItem(item);
  console.log(`分析 優先パターン: ${order.slice(0, 5).map(i => i + 1).join(' → ')}`);
  for (const idx of order) {
    const result = PATTERNS[idx](item);
    if (result) { console.log(`パターン${idx + 1} 採用`); return result.trim(); }
  }
  return `${item.title}\n\n${reviewStr(item)}\n\n${siteUrl(item)}\n\n${buildTags(item)}`.trim();
}

// ===== 女優関連ヘルパー =====
function actressMeasures(a) {
  const parts = [];
  if (a.height) parts.push(`身長${a.height}cm`);
  if (a.bust && a.waist && a.hip) parts.push(`B${a.bust} W${a.waist} H${a.hip}`);
  return parts.join(' / ');
}
function actressSiteUrl(a, work) {
  return work ? siteUrl(work) : `${SITE}/?q=${encodeURIComponent(a.name)}`;
}
// 読み込み済みデータから女優の代表作を探す
function findActressWork(actressId) {
  const id = String(actressId);
  for (const pool of [newItems, rankItems, reviewItems]) {
    const found = pool.find(item =>
      item.content_id &&
      (item.iteminfo?.actress || []).some(a => String(a.id) === id)
    );
    if (found) return found;
  }
  return null;
}

// ===== 商品選択（日付フィルタ付き）=====
function selectItem() {
  const rawPool = [rankItems, newItems, reviewItems][slot % 3];
  const maxAge  = (slot % 3) === 1 ? 180 : 730; // new=6ヶ月, rank/review=2年
  const filtered = rawPool.filter(x => x.content_id && itemAgeDays(x) <= maxAge);
  const pool = filtered.length >= 10 ? filtered : rawPool.filter(x => x.content_id);
  const item = pool[SEED % pool.length];
  console.log(`商品選択: モード${slot % 3} 対象${pool.length}件 (フィルタ後${filtered.length}件) 日付:${item?.date || 'N/A'}`);
  return item;
}

// 女優の全出演作品数・最高評価作・最新作をまとめて取得
function getActressStats(actressId) {
  const id = String(actressId);
  const all = [...rankItems, ...newItems, ...reviewItems].filter(item =>
    item.content_id &&
    (item.iteminfo?.actress || []).some(a => String(a.id) === id)
  );
  const unique = [...new Map(all.map(x => [x.content_id, x])).values()];
  const topRated = unique
    .filter(x => parseFloat(x.review?.average || 0) >= 4.0)
    .sort((a, b) => parseFloat(b.review?.average || 0) - parseFloat(a.review?.average || 0))[0];
  const newest = unique
    .filter(x => x.date)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  return { count: unique.length, topRated: topRated || newest, newest };
}

// ===== 投稿データ選択（モード分岐）=====
function selectPostData() {
  if (POST_MODE === 5) {
    // 女優紹介モード：popular/monthly/new からランダムに選択
    const allLists = [actressPopular, actressMonthly, actressNew].filter(l => l.length > 0);
    if (allLists.length > 0) {
      const list = allLists[(SEED >> 6) % allLists.length];
      const actress = list[(SEED >> 3) % list.length];
      if (actress) {
        const stats = getActressStats(actress.id);
        console.log(`女優紹介モード: ${actress.name} 作品数:${stats.count}`);
        return { type: 'actress_intro', actress, item: stats.topRated || stats.newest, stats };
      }
    }
  }
  if (POST_MODE >= 3) {
    const iNew = POST_MODE === 4;
    const list = iNew ? actressNew : (actressPopular.length ? actressPopular : actressMonthly);
    if (list.length > 0) {
      const actress = list[(SEED >> 3) % list.length];
      if (actress) {
        const work = findActressWork(actress.id);
        console.log(`女優モード: ${iNew ? '新人' : 'ランキング'} ${actress.name} 代表作:${work?.title?.slice(0,20) || 'なし'}`);
        return { type: iNew ? 'actress_new' : 'actress_rank', actress, item: work };
      }
    }
  }
  const item = selectItem();
  return { type: 'product', actress: null, item };
}

// ===== HTTP =====
function getJson(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    https.get({ hostname: u.hostname, path: u.pathname + u.search, headers: { 'Accept': 'application/json', ...headers } }, res => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => {
        if (res.statusCode >= 400) return reject(new Error(`HTTP ${res.statusCode}: ${buf}`));
        try { resolve(JSON.parse(buf)); } catch { resolve(buf); }
      });
    }).on('error', reject);
  });
}

function request(url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const data = JSON.stringify(body);
    const req = https.request({
      hostname: u.hostname, path: u.pathname + u.search, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), ...headers }
    }, res => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => {
        if (res.statusCode >= 400) return reject(new Error(`HTTP ${res.statusCode}: ${buf}`));
        try { resolve(JSON.parse(buf)); } catch { resolve(buf); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function fetchBuffer(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    mod.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchBuffer(res.headers.location).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ buffer: Buffer.concat(chunks), mime: res.headers['content-type'] || 'image/jpeg' }));
    }).on('error', reject);
  });
}

// ===== Bluesky ファセット（ハッシュタグ＋URL をクリッカブルに）=====
function buildFacets(text) {
  const facets = [];

  // ハッシュタグ facet（検索対応）
  const tagRe = /#[\w぀-ゟ゠-ヿ一-鿿豈-﫿ｦ-ﾟ]+/g;
  let m;
  while ((m = tagRe.exec(text)) !== null) {
    const before = Buffer.from(text.slice(0, m.index), 'utf8').length;
    const tagLen = Buffer.from(m[0], 'utf8').length;
    facets.push({
      index: { byteStart: before, byteEnd: before + tagLen },
      features: [{ $type: 'app.bsky.richtext.facet#tag', tag: m[0].slice(1) }]
    });
  }

  // URL facet（リンク対応）
  const urlRe = /https?:\/\/[^\s\n]+/g;
  while ((m = urlRe.exec(text)) !== null) {
    const before = Buffer.from(text.slice(0, m.index), 'utf8').length;
    const urlLen = Buffer.from(m[0], 'utf8').length;
    facets.push({
      index: { byteStart: before, byteEnd: before + urlLen },
      features: [{ $type: 'app.bsky.richtext.facet#link', uri: m[0] }]
    });
  }

  return facets;
}

// ===== Bluesky: blob アップロード =====
function uploadBlob(buffer, mime, jwt) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'bsky.social',
      path: '/xrpc/com.atproto.repo.uploadBlob',
      method: 'POST',
      headers: { 'Content-Type': mime, 'Content-Length': buffer.length, Authorization: `Bearer ${jwt}` }
    }, res => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => {
        if (res.statusCode >= 400) return reject(new Error(`Blob upload ${res.statusCode}: ${buf}`));
        resolve(JSON.parse(buf));
      });
    });
    req.on('error', reject);
    req.write(buffer);
    req.end();
  });
}

// ===== トレンドハッシュタグ取得 =====
function getTrendingTags(jwt) {
  return new Promise(resolve => {
    const req = https.request({
      hostname: 'bsky.social',
      path: '/xrpc/app.bsky.unspecced.getTrends?limit=20',
      method: 'GET',
      headers: { Authorization: `Bearer ${jwt}`, 'Accept': 'application/json' }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const trends = JSON.parse(d).trends || [];
          const tags = trends
            .map(t => (t.topic || t.hashtag || '').replace(/^#/, ''))
            .filter(t => t && /[぀-ゟ゠-ヿ一-鿿]/.test(t))
            .slice(0, 3);
          console.log('トレンドタグ:', tags.join(', ') || 'なし');
          resolve(tags);
        } catch { resolve([]); }
      });
    });
    req.on('error', () => resolve([]));
    req.end();
  });
}

// ===== Bluesky 投稿 =====
async function postBluesky(text, item, auth) {

  // トレンドタグを取得してテキスト末尾に追加
  const trendTags = await getTrendingTags(auth.accessJwt);
  const finalText = trendTags.length > 0
    ? text + '\n' + trendTags.map(t => '#' + t).join(' ')
    : text;

  const facets = buildFacets(finalText);
  const record = {
    $type: 'app.bsky.feed.post',
    text: finalText,
    createdAt: new Date().toISOString(),
    langs: ['ja'],
    facets,
  };

  const postUrl  = siteUrl(item);
  const sampleImgs = item.sampleImageURL?.sample_l?.image || [];
  const mainImgUrl = item.imageURL?.large || item.imageURL?.list || item.imageURL?.small || '';

  // サンプル画像ギャラリー（最大4枚）を最優先で試みる
  let embedDone = false;
  if (sampleImgs.length > 0) {
    const blobs = [];
    for (const url of sampleImgs.slice(0, 4)) {
      try {
        const { buffer, mime } = await fetchBuffer(url);
        const blobRes = await uploadBlob(buffer, mime.split(';')[0] || 'image/jpeg', auth.accessJwt);
        blobs.push(blobRes.blob);
      } catch(e) {
        console.log('Bluesky: 画像1枚スキップ:', e.message);
      }
    }
    if (blobs.length > 0) {
      record.embed = {
        $type: 'app.bsky.embed.images',
        images: blobs.map(blob => ({ image: blob, alt: item.title || '' }))
      };
      embedDone = true;
      console.log(`Bluesky: サンプル画像${blobs.length}枚ギャラリー ✅`);
    }
  }

  // フォールバック: 高画質パッケージ画像でリンクカード
  if (!embedDone && mainImgUrl) {
    try {
      const { buffer, mime } = await fetchBuffer(mainImgUrl);
      const blobRes = await uploadBlob(buffer, mime.split(';')[0], auth.accessJwt);
      record.embed = {
        $type: 'app.bsky.embed.external',
        external: { uri: postUrl, title: item.title || '', description: 'サンプル動画あり | douga-adult.com', thumb: blobRes.blob }
      };
      console.log('Bluesky: サムネイルカード付き');
    } catch(e) {
      console.log('Bluesky: サムネイル取得失敗、テキストのみ:', e.message);
    }
  }

  await request('https://bsky.social/xrpc/com.atproto.repo.createRecord',
    { repo: auth.did, collection: 'app.bsky.feed.post', record },
    { Authorization: `Bearer ${auth.accessJwt}` });
  console.log('Bluesky: 投稿完了 ✅');
}

// ===== 投稿内容カテゴリ判定 =====
function categorizePost(text) {
  if (!text) return 'general';
  if (/サッカー|野球|バスケ|ラグビー|スポーツ|試合|優勝|決勝|選手|ゴール|W杯|オリンピック|得点|監督|チーム/.test(text)) return 'sports_ja';
  if (/映画|ドラマ|アニメ|音楽|ライブ|コンサート|俳優|歌手|推し|アイドル|舞台|新曲|MV/.test(text)) return 'ent_ja';
  if (/食べ|飯|料理|ランチ|ディナー|美味|グルメ|カフェ|うまい|おいしい|レシピ|スイーツ/.test(text)) return 'food_ja';
  if (/泣いた|感動|嬉しい|楽しい|幸せ|つらい|切ない|尊い|ほっこり|癒|泣ける/.test(text)) return 'emotional_ja';
  if (/かわいい|可愛い|萌え|もふもふ|ふわふわ|癒し|ねこ|犬|ペット/.test(text)) return 'cute_ja';
  if (/soccer|football|basketball|baseball|nba|nfl|sports|match|game|goal|score|championship|tournament/i.test(text)) return 'sports_en';
  if (/movie|film|anime|music|concert|actor|singer|album|drama|netflix|series|episode/i.test(text)) return 'ent_en';
  if (/food|eating|delicious|lunch|dinner|restaurant|cafe|coffee|recipe|cook|baking/i.test(text)) return 'food_en';
  if (/emotional|crying|heartwarming|touching|beautiful|inspiring|moved me/i.test(text)) return 'emotional_en';
  if (/cute|adorable|lovely|wholesome|precious|puppy|kitten|cat|dog/i.test(text)) return 'cute_en';
  return /[ぁ-ゖァ-ヶ一-鿿]/.test(text) ? 'general_ja' : 'general_en';
}

const CATEGORY_COMMENTS = {
  sports_ja:   ['これ熱すぎる🔥', 'やばすぎて声でた', '感動した😭', 'リアルタイムで見てよかった', '鳥肌たった', '最高の瞬間すぎる'],
  ent_ja:      ['センスありすぎ😭', 'これは名作', '何回見ても好き', '沼った', 'ずっと聴いてる', 'これ好きな人と仲良くなれる'],
  food_ja:     ['美味しそうすぎる😭', 'これ絶対食べたい', '真似したい', 'レシピ教えてほしい🙏', '天才的なやつ', '今すぐ食べたい'],
  emotional_ja:['わかりすぎて泣いた', 'これ共感しかない', '心に刺さった', '深夜に見たのミスった😭', '保存した', 'ほんとにそれ'],
  cute_ja:     ['可愛すぎて無理😭', '癒されすぎる', '尊い🙏', '何回見ても飽きない', '元気もらえた', 'ありがとうこの投稿'],
  general_ja:  ['わかりみが深すぎる', 'これはバズるの納得', 'センスある', '刺さりすぎた', 'なんでこんなにわかるの笑', '深夜に見てよかった'],
  sports_en:   ['this is absolutely insane 🔥', 'no way this happened', 'legendary moment', 'what a performance', 'chills literally', 'history right here'],
  ent_en:      ['this is everything ✨', 'okay this is literally perfect', 'saving this forever', 'obsessed with this', 'on repeat', 'this is the one'],
  food_en:     ['this looks so good 😭', 'need this immediately', "okay i'm hungry now", 'recipe please 🙏', 'making this tonight', 'literal perfection'],
  emotional_en:['this hit different', 'why is this so accurate 😭', 'needed to hear this today', 'this is so real', 'not me tearing up', 'genuinely made my day'],
  cute_en:     ['this is so adorable 😭', 'absolutely precious', 'needed this today 🙏', 'cannot handle how cute this is', 'my heart ✨', 'wholesome content only'],
  general_en:  ['this deserved way more likes', 'saving this forever ✨', 'the internet needed this today', 'okay but why does this hit so hard', 'this is everything right now', 'genuinely love this'],
};

// ===== コメント済みURIキャッシュ（重複投稿防止） =====
const COMMENTED_FILE = 'logs/commented-posts.json';
const COMMENTED_TTL  = 30 * 24 * 60 * 60 * 1000; // 30日

function loadCommentedPosts() {
  try {
    if (fs.existsSync(COMMENTED_FILE)) {
      const data = JSON.parse(fs.readFileSync(COMMENTED_FILE, 'utf8'));
      const cutoff = Date.now() - COMMENTED_TTL;
      return Array.isArray(data) ? data.filter(e => e.ts > cutoff) : [];
    }
  } catch(e) {}
  return [];
}

function saveCommentedPosts(entries) {
  try {
    fs.mkdirSync('logs', { recursive: true });
    fs.writeFileSync(COMMENTED_FILE, JSON.stringify(entries.slice(-500), null, 2));
  } catch(e) {
    console.log('コメント済みリスト保存失敗:', e.message);
  }
}

// ===== バズり投稿へのコメント =====
async function commentOnTrendingPosts(jwt, did) {

  let jaKeywords = [];
  let enKeywords = [];
  try {
    const trends = await getJson(
      'https://bsky.social/xrpc/app.bsky.unspecced.getTrends?limit=20',
      { Authorization: `Bearer ${jwt}` }
    );
    for (const t of (trends.trends || [])) {
      const kw = (t.topic || t.hashtag || '').replace(/^#/, '').trim();
      if (!kw) continue;
      if (/^[A-Za-z0-9 _]+$/.test(kw)) enKeywords.push(kw);
      else jaKeywords.push(kw);
    }
  } catch(e) {
    console.log('トレンド取得失敗:', e.message);
  }

  if (!jaKeywords.length) jaKeywords = ['おはよう', '今日', 'これ', 'やばい'];
  if (!enKeywords.length) enKeywords = ['today', 'trending', 'lol', 'omg'];

  // コメント済みURIをロード（重複防止）
  const commentedEntries = loadCommentedPosts();
  const commentedUris = new Set(commentedEntries.map(e => e.uri));
  console.log(`コメント済みキャッシュ: ${commentedUris.size}件`);

  async function findAndComment(keywords, lang) {
    for (const kw of keywords) {
      console.log(`コメント対象トレンド[${lang}]: ${kw}`);
      let posts = [];
      try {
        const res = await getJson(
          `https://bsky.social/xrpc/app.bsky.feed.searchPosts?q=${encodeURIComponent(kw)}&limit=50&sort=top`,
          { Authorization: `Bearer ${jwt}` }
        );
        posts = (res.posts || [])
          .filter(p =>
            p.author.did !== did &&
            (p.likeCount || 0) + (p.repostCount || 0) >= 300 &&
            !p.record?.reply &&
            !commentedUris.has(p.uri)   // ← 既コメント済みをスキップ
          )
          .sort((a, b) => ((b.likeCount || 0) + (b.repostCount || 0)) - ((a.likeCount || 0) + (a.repostCount || 0)))
          .slice(0, 2);
      } catch(e) {
        console.log(`コメント[${lang}]: 検索失敗:`, e.message);
        continue;
      }
      if (!posts.length) { console.log(`コメント対象なし[${lang}]（スキップ済みor300いいね未満）、次のキーワードへ`); continue; }

      let count = 0;
      for (const post of posts) {
        const cat = categorizePost(post.record?.text || '');
        const pool = CATEGORY_COMMENTS[cat] || CATEGORY_COMMENTS[lang === 'ja' ? 'general_ja' : 'general_en'];
        const comment = pool[(SEED + count * 7) % pool.length];
        console.log(`  カテゴリ[${cat}] → "${comment}"`);
        try {
          await request('https://bsky.social/xrpc/com.atproto.repo.createRecord', {
            repo: did,
            collection: 'app.bsky.feed.post',
            record: {
              $type: 'app.bsky.feed.post',
              text: comment,
              reply: {
                root:   { uri: post.uri, cid: post.cid },
                parent: { uri: post.uri, cid: post.cid }
              },
              createdAt: new Date().toISOString(),
              langs: [lang]
            }
          }, { Authorization: `Bearer ${jwt}` });
          console.log(`コメント投稿[${lang}] ✅ (${(post.likeCount||0)+(post.repostCount||0)}いいね)`);
          // キャッシュに追加（二重防止）
          commentedEntries.push({ uri: post.uri, ts: Date.now() });
          commentedUris.add(post.uri);
          saveCommentedPosts(commentedEntries);
          count++;
        } catch(e) {
          console.log(`コメント失敗[${lang}]:`, e.message);
        }
      }
      return count;
    }
    console.log(`コメント対象なし[${lang}]（全キーワード試行済み）`);
    return 0;
  }

  const jaCount = await findAndComment(jaKeywords.slice(0, 5), 'ja');
  const enCount = await findAndComment(enKeywords.slice(0, 5), 'en');
  console.log(`コメント完了: 日本語${jaCount}件 / 英語${enCount}件`);
}

// ===== 自分の投稿へのリプライに自動返信 =====
async function replyToNotifications(jwt, did) {
  let notifications = [];
  try {
    const res = await getJson(
      'https://bsky.social/xrpc/app.bsky.notification.listNotifications?limit=25',
      { Authorization: `Bearer ${jwt}` }
    );
    notifications = (res.notifications || []).filter(n =>
      n.reason === 'reply' && !n.isRead && n.author.did !== did
    );
  } catch(e) {
    console.log('通知取得失敗:', e.message);
    return;
  }

  if (!notifications.length) { console.log('新規リプライなし'); return; }
  console.log(`新規リプライ: ${notifications.length}件`);

  const JA_REPLIES = [
    'ありがとうございます🙏 他の作品もぜひ！',
    '嬉しいです！気になる作品はこちらも→',
    'コメントありがとう😊 また来てください！',
    'ありがとうございます✨ サンプルもあるのでどうぞ',
    '見てくれてありがとう🙏',
  ];
  const EN_REPLIES = [
    'Thanks so much! 🙏 More content available ✨',
    'Appreciate it! Glad you liked it 😊',
    'Thank you! Check out more on the site 👇',
    'Thanks for the kind words 🙏',
    'Really appreciate it ✨ More picks available!',
  ];

  let count = 0;
  for (const notif of notifications.slice(0, 5)) {
    const replyText = notif.record?.text || '';
    const isJa = /[ぁ-ゖァ-ヶ一-鿿]/.test(replyText);
    const pool = isJa ? JA_REPLIES : EN_REPLIES;
    const reply = pool[(SEED + count * 11) % pool.length];

    const parentUri = notif.uri;
    const parentCid = notif.cid;
    const rootUri = notif.record?.reply?.root?.uri || parentUri;
    const rootCid = notif.record?.reply?.root?.cid || parentCid;

    try {
      await request('https://bsky.social/xrpc/com.atproto.repo.createRecord', {
        repo: did,
        collection: 'app.bsky.feed.post',
        record: {
          $type: 'app.bsky.feed.post',
          text: reply,
          reply: {
            root:   { uri: rootUri,   cid: rootCid },
            parent: { uri: parentUri, cid: parentCid }
          },
          createdAt: new Date().toISOString(),
          langs: [isJa ? 'ja' : 'en']
        }
      }, { Authorization: `Bearer ${jwt}` });
      console.log(`自動リプライ ✅ [${isJa ? 'ja' : 'en'}] "${reply}"`);
      count++;
    } catch(e) {
      console.log('自動リプライ失敗:', e.message);
    }
  }

  // 既読にする
  try {
    await request('https://bsky.social/xrpc/app.bsky.notification.updateSeen',
      { seenAt: new Date().toISOString() },
      { Authorization: `Bearer ${jwt}` }
    );
  } catch(e) { /* ignore */ }

  console.log(`自動リプライ完了: ${count}件`);
}

// ===== 英語トレンドタグ取得 =====
function getEnglishTrendingTags(jwt) {
  return new Promise(resolve => {
    const req = https.request({
      hostname: 'bsky.social',
      path: '/xrpc/app.bsky.unspecced.getTrends?limit=20',
      method: 'GET',
      headers: { Authorization: `Bearer ${jwt}`, Accept: 'application/json' }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const trends = JSON.parse(d).trends || [];
          const tags = trends
            .map(t => (t.topic || t.hashtag || '').replace(/^#/, ''))
            .filter(t => t && /^[A-Za-z0-9_]+$/.test(t))
            .slice(0, 3);
          console.log('英語トレンドタグ:', tags.join(', ') || 'なし');
          resolve(tags);
        } catch { resolve([]); }
      });
    });
    req.on('error', () => resolve([]));
    req.end();
  });
}

// ===== 英語ポスト生成 =====
const EN_PATTERNS = [
  (item) => { // 0
    const a = getActresses(item)[0];
    const avg = parseFloat(item.review?.average || 0);
    const cnt = parseInt(item.review?.count || 0);
    const hook = rv(['is insane 🔥','is something else entirely','absolutely goes off'], 0);
    return `${a ? a + ' ' + hook + '\n\n' : ''}${rv(['This one hit different','Not what I expected at all','Genuinely top tier'], 1)}\n\n${cnt > 0 ? `⭐${avg} from ${cnt.toLocaleString()} reviews` : ''}\nSample clip 👇\n${siteUrl(item)}`;
  },
  (item) => { // 1: Top 3
    const top = rankItems.slice(0, 3);
    const lines = top.map((x, i) => `${['🥇','🥈','🥉'][i]} ${getActresses(x)[0] || 'Unknown'} — ${(x.title||'').slice(0,25)}...`).join('\n');
    const head = rv(['Top 3 JAV picks right now 🎌','The only JAV ranking that matters','This week\'s top JAV 🔥'], 0);
    return `${head}\n\n${lines}\n\nFull list + samples:\n${SITE}`;
  },
  (item) => { // 2: Genre hook
    const gs = getGenres(item).filter(g => !['ハイビジョン','独占配信'].includes(g));
    const a = getActresses(item)[0] || '';
    return `If you're into ${gs[0] || 'JAV'}, this is the one\n\n${a}\n\n${rv(['Ratings don\'t lie 👇','The numbers speak for themselves','Trust the reviews'], 0)}\n${siteUrl(item)}`;
  },
  (item) => { // 3: Data/review
    const avg = parseFloat(item.review?.average || 0);
    const cnt = parseInt(item.review?.count || 0);
    if (!avg || !cnt) return `Hidden gem 💎\n\nNot talked about enough\nBut the people who found it know\n\n${siteUrl(item)}`;
    return `${cnt.toLocaleString()} people rated this ⭐${avg}\n\n${rv(['That number says everything','Numbers don\'t lie','That\'s a real score'], 0)}\n\nJAV doesn't get better 👇\n${siteUrl(item)}`;
  },
  (item) => { // 4: Reaction
    const a = getActresses(item)[0];
    const body = rv(['I was NOT ready','completely not prepared for this','lowkey my new favorite'], 0);
    return `Just finished watching\n\n${a ? a + ' — ' + body : body}\n\n${rv(['Legit top tier','Actually incredible','Cannot recommend enough'], 1)}\n${siteUrl(item)}`;
  },
  (item) => { // 5: Can't sleep
    const a = getActresses(item)[0];
    return `${a ? a + ' is the reason' : 'This is the reason'} I can't sleep tonight 😭\n\n${rv(['Free sample on site 👇','Sample available','Worth every second'], 0)}\n${siteUrl(item)}`;
  },
  (item) => { // 6: Late night find
    const a = getActresses(item)[0] || '';
    return `${rv(['Was up until 3am watching this','Found this at 2am','Couldn\'t stop at midnight'], 0)}\n\n${a}\n\n${rv(['Not sorry','Worth it','No regrets'], 1)}\n\n${siteUrl(item)}`;
  },
  (item) => { // 7: Minimal punch
    const a = getActresses(item)[0] || '';
    const avg = parseFloat(item.review?.average || 0);
    return `${a}\n\n${avg ? '⭐' + avg + '\n\n' : ''}${rv(['Watch it','Just watch','Do yourself a favor'], 0)}\n${siteUrl(item)}`;
  },
  (item) => { // 8: Discovery
    const a = getActresses(item)[0] || '';
    return `${rv(['Didn\'t know this existed','How was this hidden from me','Just found this and'], 0)}\n\n${a || 'this'} is ${rv(['unreal','insane','genuinely incredible'], 1)}\n\n${siteUrl(item)}`;
  },
  (item) => { // 9: Question hook
    const a = getActresses(item)[0]; if (!a) return null;
    return `Anyone else know about ${a}?\n\n${rv(['This is insane','Absolutely wild','Cannot stop watching'], 0)}\n\n${siteUrl(item)}`;
  },
  (item) => { // 10: Comparison
    return `${rv(['Tried a lot but nothing comes close','Been through everything and this wins','Long search, finally found it'], 0)}\n\n${rv(['This is it','This is the one','This is what I was looking for'], 1)}\n\n${reviewStr(item)}\n${siteUrl(item)}`;
  },
  (item) => { // 11: Experience narrative
    const a = getActresses(item)[0] || '';
    return `Not gonna lie\n\n${a ? a + ' got me' : 'this got me'} ${rv(['completely','from the start','unexpectedly'], 0)}\n\n${rv(['Thought it was fine then suddenly wasn\'t','Underestimated it and regret nothing','Didn\'t see it coming'], 1)}\n\n${siteUrl(item)}`;
  },
  (item) => { // 12: Simple recommendation
    const avg = parseFloat(item.review?.average || 0);
    const cnt = parseInt(item.review?.count || 0);
    return `Recommending this because\n\n${avg && cnt ? `⭐${avg} · ${cnt.toLocaleString()} reviews\n\n` : ''}${rv(['I genuinely loved it','It exceeded expectations','It deserves more attention'], 0)}\n${siteUrl(item)}`;
  },
  (item) => { // 13: Saved forever
    const a = getActresses(item)[0] || '';
    return `${rv(['Saving this forever','Bookmarked immediately','This is going in the archive'], 0)}\n\n${a || 'This'}\n\n${rv(['Sample available free','Watch the sample at least','Link below'], 1)}\n${siteUrl(item)}`;
  },
  (item) => { // 14: Genre best
    const gs = getGenres(item).filter(g => !['ハイビジョン','独占配信','BEST・総集編'].includes(g));
    return `${gs[0] || 'JAV'} content ${rv(['doesn\'t get better than this','at its absolute peak','peaked here'], 0)}\n\n${reviewStr(item)}\n${siteUrl(item)}`;
  },
  (item) => { // 15: Short reaction
    const a = getActresses(item)[0] || '';
    return `${rv(['Not okay','Actually cannot','I\'m not fine'], 0)}\n\n${a ? a + ' really said that' : 'This really happened'}\n\n${siteUrl(item)}`;
  },
  (item) => { // 16: Stats tweet
    const avg = parseFloat(item.review?.average || 0);
    const cnt = parseInt(item.review?.count || 0);
    if (!avg || !cnt) return null;
    return `${cnt.toLocaleString()} reviews\n${avg} stars\n\n${rv(['That\'s the whole review','Speaks for itself','Numbers don\'t lie'], 0)}\n\n${siteUrl(item)}`;
  },
  (item) => { // 17: Kept me up
    return `${rv(['This kept me up last night','Lost 3 hours to this','Couldn\'t stop watching'], 0)}\n\n${rv(['Worth it','No regrets at all','Genuinely worth it'], 1)}\n\n${reviewStr(item)}\n${siteUrl(item)}`;
  },
  (item) => { // 18: Afternoon rec
    const a = getActresses(item)[0] || '';
    return `${rv(['Afternoon recommendation','Today\'s pick','Current obsession'], 0)}\n\n${a || shortTitle(item.title, 25)}\n\n${reviewStr(item)}\n${siteUrl(item)}`;
  },
  (item) => { // 19: Community rec
    const a = getActresses(item)[0] || '';
    return `${rv(['If you know, you know','The people who found this know','This has a cult following for a reason'], 0)}\n\n${a}\n\n${reviewStr(item)}\n${siteUrl(item)}`;
  },
];

function generateEnglishText(item) {
  const idx = SEED % EN_PATTERNS.length;
  const result = EN_PATTERNS[idx](item);
  return (result || `${item.title}\n\n${siteUrl(item)}`).trim();
}

// ===== 女優特化パターン（日本語・❤︎口調）=====
const ACTRESS_PATTERNS_JA = [
  (a, work) => { // 0: ランキング推し
    const m = actressMeasures(a);
    const url = actressSiteUrl(a, work);
    const hook = rv(['えろさが次元違いすぎる❤︎','この子やばすぎない？❤︎','知らないのはもったいなすぎる❤︎'], 0);
    return `女優ランキング上位の子❤︎\n\n${a.name}\n${m ? m + '\n' : ''}${hook}\n\nサンプルで確認して👇\n${url}\n\n#${a.name.replace(/\s/g,'')} #AV女優 #女優ランキング #FANZA #エロ動画`;
  },
  (a, work) => { // 1: 新人発見
    const m = actressMeasures(a);
    const url = actressSiteUrl(a, work);
    const body = rv([
      `デビューしたてなのにこのえろさって反則じゃない？❤︎`,
      `新人なのに経験値が段違い❤︎ これからが楽しみすぎる`,
      `デビュー作品なのにもう完成されてる❤︎ えろすぎて笑える`,
    ], 0);
    return `新人AV女優さん発見した❤︎\n\n${a.name}\n${m ? m + '\n' : ''}\n${body}\n\n👇 サンプルあり\n${url}\n\n#新人AV女優 #デビュー #FANZA #${a.name.replace(/\s/g,'')}`;
  },
  (a, work) => { // 2: スリーサイズ推し
    if (!a.bust) return null;
    const url = actressSiteUrl(a, work);
    const body = rv([
      `この体型のえろさ、わかる人いる？❤︎\n\nスリーサイズが全部ちょうどいいんだよね`,
      `B${a.bust} W${a.waist} H${a.hip} って何なの❤︎\n\nスペックが完璧すぎて困る`,
      `スリーサイズだけで全部わかる❤︎\n\nこういう子が一番えろい`,
    ], 0);
    return `${a.name}のスペックが好きすぎる❤︎\n\nB${a.bust} W${a.waist} H${a.hip}${a.height ? ` / ${a.height}cm` : ''}\n\n${body}\n\n${url}\n\n#${a.name.replace(/\s/g,'')} #AV女優 #FANZA #巨乳`;
  },
  (a, work) => { // 3: 月間おすすめ
    const url = actressSiteUrl(a, work);
    const open = rv(['今月イチ推しの女優さん❤︎','最近ずっとハマってる女優さん❤︎','この子のこと毎日考えてる❤︎'], 0);
    const body = rv([
      `もっとたくさんの人に知ってほしい\nえろさが格別なんだよね`,
      `えろいのに品があるって最高じゃない\nそのギャップがたまらない`,
      `この子を知らずにAV語れないと思う\nそれくらいえろい`,
    ], 1);
    return `${open}\n\n${a.name}\n\n${body}\n\n👇 最新作はこちら\n${url}\n\n#${a.name.replace(/\s/g,'')} #AV女優 #FANZA #おすすめ女優`;
  },
  (a, work) => { // 4: 推し活口調
    const url = actressSiteUrl(a, work);
    const body = rv([
      `えろいだけじゃなくて\n雰囲気とか表情とかも全部好き❤︎`,
      `この子のえろさがわかる人と繋がりたい❤︎\nファンが多いのちゃんとわかる`,
      `毎回期待を超えてくる❤︎\nこういう子が本当にえろい`,
    ], 0);
    return `${a.name}のことずっと推してる❤︎\n\n${body}\n\n${url}\n\n#${a.name.replace(/\s/g,'')} #AV女優 #推し #FANZA`;
  },
  (a, work) => { // 5: えろすぎ発見
    const url = actressSiteUrl(a, work);
    const hook = rv(['えろすぎて発信せずにいられなかった❤︎','やばすぎて黙ってられない❤︎','みんなに知らせたくなった❤︎'], 0);
    return `${a.name}\n\n${hook}\n\nサンプルだけでも見てほしい\nこのえろさ、言葉にならない\n\n${url}\n\n#${a.name.replace(/\s/g,'')} #AV女優 #えろい #FANZA #アダルト動画`;
  },
  (a, work) => { // 6: ランキング形式
    const top = actressPopular.slice(0, 3).filter(x => x?.name);
    if (top.length < 3) return null;
    const lines = top.map((x, i) => `${['🥇','🥈','🥉'][i]} ${x.name}${actressMeasures(x) ? ' / ' + actressMeasures(x) : ''}`).join('\n');
    return `今月の女優ランキングTOP3❤︎\n\n${lines}\n\nえろすぎる子たちが勢揃いだよ💕\n${SITE}\n\n#女優ランキング #AV女優 #FANZA #AV #エロ動画`;
  },
  (a, work) => { // 7: 身長フィーチャー
    const url = actressSiteUrl(a, work);
    const body = rv([
      `小柄なのに${rv(['えろさが大きすぎる','えろすぎる雰囲気が出てる','スタイルは抜群'], 1)}❤︎`,
      `このサイズ感が好きすぎる❤︎\nえろさとかわいさが同居してる`,
      `身長は関係ない証明してくれる❤︎\nえろさに身長は関係ない`,
    ], 0);
    return `${a.name}${a.height ? `（${a.height}cm）` : ''}\n\n${body}\n\n${url}\n\n#${a.name.replace(/\s/g,'')} #AV女優 #FANZA #かわいい #えろい`;
  },
  (a, work) => { // 8: 今週ベスト
    const url = actressSiteUrl(a, work);
    const title = work ? `「${work.title?.slice(0, 20)}…」` : '';
    return `今週一番気になってる女優さん❤︎\n\n${a.name}\n${title}\n\n${rv(['えろさのレベルが他と違う','この子だけ何か持ってる','見るたびに新しい発見がある'], 0)}\n\n${url}\n\n#${a.name.replace(/\s/g,'')} #AV女優 #今週のおすすめ #FANZA`;
  },
  (a, work) => { // 9: 共感フック
    const url = actressSiteUrl(a, work);
    return `${a.name}が好きな人❤︎\n\n${rv(['この気持ち絶対わかってくれる','同じ気持ちの人いるよね','これがわかる人と仲良くなりたい'], 0)}\n\nえろさとかわいさが完璧に共存してる💕\n\n${url}\n\n#${a.name.replace(/\s/g,'')} #AV女優 #FANZA`;
  },
  (a, work) => { // 10: 表情推し
    const url = actressSiteUrl(a, work);
    return `${a.name}の表情がえろすぎる❤︎\n\n${rv(['顔だけで全部持ってかれる','表情の演技が神がかってる','ここまで表情えろい子なかなかいない'], 0)}\n\n${rv(['サンプルだけでも確認して','騙されたと思って見て'], 1)}\n${url}\n\n#${a.name.replace(/\s/g,'')} #AV女優 #FANZA #えろい`;
  },
  (a, work) => { // 11: あなたにも知ってほしい
    const m = actressMeasures(a);
    const url = actressSiteUrl(a, work);
    const body = rv([
      `もっと有名になっていいと思う\nえろさがトップクラスだから❤︎`,
      `知る人ぞ知る存在だったけど\nもうみんなに知ってほしい❤︎`,
      `好きすぎて黙ってられなくなった❤︎\nこのえろさ、広まってほしい`,
    ], 0);
    return `${a.name}のこと知ってほしい❤︎\n${m ? m + '\n' : ''}\n${body}\n\n${url}\n\n#${a.name.replace(/\s/g,'')} #AV女優 #FANZA #おすすめ`;
  },
];

// ===== 女優特化パターン（英語・❤︎口調）=====
const EN_ACTRESS_PATTERNS = [
  (a, work) => { // 0: Ranking feature
    const m = actressMeasures(a);
    const url = actressSiteUrl(a, work);
    return `Top ranked actress right now ❤︎\n\n${a.name}${m ? '\n' + m : ''}\n\n${rv(['The reason she\'s #1 is obvious','Rankings don\'t lie','She earned every spot'], 0)}\n\n${url}\n\n#JAV #AVactress #FANZA #Ranking`;
  },
  (a, work) => { // 1: New debut
    const url = actressSiteUrl(a, work);
    return `Just debuted and already this good?? ❤︎\n\n${a.name}\n\n${rv(['New to the scene but zero rookie energy','Debut energy but pro-level everything','How is this her first work??'], 0)}\n\n${url}\n\n#NewActress #JAVdebut #FANZA #JAV`;
  },
  (a, work) => { // 2: Stats/measurements
    if (!a.bust) return null;
    const url = actressSiteUrl(a, work);
    return `${a.name} ❤︎\nB${a.bust} W${a.waist} H${a.hip}${a.height ? ` / ${a.height}cm` : ''}\n\n${rv(['That body should be illegal','Perfect specs don\'t exi—','I\'m not okay and that\'s fine'], 0)}\n\n${url}\n\n#JAV #AVactress #FANZA #JAVgirl`;
  },
  (a, work) => { // 3: Monthly obsession
    const url = actressSiteUrl(a, work);
    return `My current obsession ❤︎\n\n${a.name}\n\n${rv(['Can\'t stop watching her work','She has something the others don\'t','Every video is better than the last'], 0)}\n\n${url}\n\n#JAV #FANZA #AVactress #Recommend`;
  },
  (a, work) => { // 4: Fan voice
    const url = actressSiteUrl(a, work);
    return `Been a fan of ${a.name} for a while ❤︎\n\n${rv(['And she keeps getting better','Every time she surprises me','The gap between cute and hot is criminal'], 0)}\n\nLatest work 👇\n${url}\n\n#JAV #${a.name.replace(/\s/g,'_')} #FANZA #AVactress`;
  },
  (a, work) => { // 5: Can't keep quiet
    const url = actressSiteUrl(a, work);
    return `Had to share this ❤︎\n\n${a.name} is ${rv(['genuinely something else','on another level entirely','not fair to the others'], 0)}\n\n${rv(['Sample clip alone is worth it','You\'ll understand once you see it','Trust me on this one'], 1)}\n${url}\n\n#JAV #FANZA #AVactress #MustWatch`;
  },
  (a, work) => { // 6: Top 3 ranking
    const top = actressPopular.slice(0, 3).filter(x => x?.name);
    if (top.length < 3) return null;
    const lines = top.map((x, i) => `${['🥇','🥈','🥉'][i]} ${x.name}`).join('\n');
    return `This month's actress ranking ❤︎\n\n${lines}\n\nAll of them have free samples 💕\n${SITE}\n\n#JAV #AVactress #FANZA #Ranking #TopJAV`;
  },
  (a, work) => { // 7: Expression/face
    const url = actressSiteUrl(a, work);
    return `${a.name}'s expressions are unreal ❤︎\n\n${rv(['Face alone carries the whole video','The way she looks at the camera...','Her expressions are honestly art'], 0)}\n\n${url}\n\n#JAV #AVactress #FANZA #JAVgirl`;
  },
  (a, work) => { // 8: Hidden gem vibe
    const url = actressSiteUrl(a, work);
    return `${rv(['Not enough people talk about','Criminally underrated:','Someone has to say it —'], 0)} ${a.name} ❤︎\n\n${rv(['She deserves way more attention','One of the best out there','This level of talent can\'t stay hidden'], 0)}\n\n${url}\n\n#JAV #FANZA #AVactress #HiddenGem`;
  },
  (a, work) => { // 9: Connect with fans
    const url = actressSiteUrl(a, work);
    return `Anyone else into ${a.name}? ❤︎\n\n${rv(['She has a quality I can\'t explain','The vibe is unlike anyone else','Cute AND hot AND talented — rare'], 0)}\n\n${url}\n\n#JAV #FANZA #AVactress #${a.name.replace(/\s/g,'_')}`;
  },
];

function generateActressText(actress, work) {
  const order = [...Array(ACTRESS_PATTERNS_JA.length).keys()];
  order.sort((a, b) => (hash(String(SEED + a * 41)) % 100) - (hash(String(SEED + b * 41)) % 100));
  for (const idx of order) {
    const result = ACTRESS_PATTERNS_JA[idx](actress, work);
    if (result) { console.log(`女優JA パターン${idx} 採用`); return result.trim(); }
  }
  return `${actress.name}\n\nえろすぎる女優さん❤︎\n\n${actressSiteUrl(actress, work)}\n\n#${actress.name.replace(/\s/g,'')} #AV女優 #FANZA`.trim();
}

function generateActressTextEn(actress, work) {
  const order = [...Array(EN_ACTRESS_PATTERNS.length).keys()];
  order.sort((a, b) => (hash(String(SEED + a * 53)) % 100) - (hash(String(SEED + b * 53)) % 100));
  for (const idx of order) {
    const result = EN_ACTRESS_PATTERNS[idx](actress, work);
    if (result) { console.log(`女優EN パターン${idx} 採用`); return result.trim(); }
  }
  return `${actress.name} ❤︎\n\n${rv(['Absolutely stunning','Cannot look away','Truly something else'], 0)}\n\n${actressSiteUrl(actress, work)}\n\n#JAV #FANZA #AVactress`.trim();
}

// ===== 女優紹介パターン（日本語）=====
const ACTRESS_INTRO_PATTERNS_JA = [
  (a, stats) => { // 0: プロフィール全部入り
    const m = actressMeasures(a);
    const work = stats.topRated || stats.newest;
    const url = actressSiteUrl(a, work);
    const cnt = stats.count;
    const lines = [
      `✨ 女優紹介 ✨`,
      ``,
      `${a.name}`,
      m ? m : null,
      a.height ? `身長 ${a.height}cm` : null,
      cnt > 0 ? `出演作品 ${cnt}本以上` : null,
      ``,
      rv([
        `${a.name ? a.name + 'の' : ''}えろさが好きすぎて紹介せずにいられなかった❤︎`,
        `この子のことをもっと知ってほしくて❤︎`,
        `えろすぎて黙ってられなくなった❤︎`,
      ], 0),
      ``,
      `作品はこちら👇`,
      url,
      ``,
      `#${a.name.replace(/\s/g,'')} #AV女優 #FANZA #女優紹介 #エロ動画`,
    ].filter(x => x !== null).join('\n');
    return lines;
  },
  (a, stats) => { // 1: スリーサイズ特集
    if (!a.bust) return null;
    const work = stats.topRated || stats.newest;
    const url = actressSiteUrl(a, work);
    const body = rv([
      `B${a.bust} W${a.waist} H${a.hip}${a.height ? ` 身長${a.height}cm` : ''}\n\nこのスペックが全部天然って意味わかんない❤︎\nえろい女の子はスリーサイズに出るよね`,
      `B${a.bust} W${a.waist} H${a.hip}${a.height ? ` / ${a.height}cm` : ''}\n\nこの数字が全部ちょうどいい❤︎\nどこも足りないとこがない`,
      `スリーサイズB${a.bust} W${a.waist} H${a.hip}\n\nこれは反則❤︎ えろいポイント全部揃ってる`,
    ], 0);
    return `${a.name}のプロフィール気になってた人❤︎\n\n${body}\n\n最新作はこちら👇\n${url}\n\n#${a.name.replace(/\s/g,'')} #AV女優 #スリーサイズ #FANZA`;
  },
  (a, stats) => { // 2: 代表作つき紹介
    const work = stats.topRated;
    if (!work) return null;
    const avg = parseFloat(work.review?.average || 0);
    const cnt2 = parseInt(work.review?.count || 0);
    const url = siteUrl(work);
    return `${a.name}を知らない人へ❤︎\n\n${actressMeasures(a) ? actressMeasures(a) + '\n\n' : ''}代表作：「${work.title?.slice(0, 24)}…」\n${avg && cnt2 ? `⭐${avg}（${cnt2.toLocaleString()}人評価）\n` : ''}\n${rv(['えろすぎてファンが多いのちゃんとわかる','この作品だけで好きになれる','初めて見るならこれ一択'], 0)}❤︎\n\n${url}\n\n#${a.name.replace(/\s/g,'')} #AV女優 #代表作 #FANZA`;
  },
  (a, stats) => { // 3: 新人紹介スペシャル
    const m = actressMeasures(a);
    const work = stats.newest;
    const url = actressSiteUrl(a, work);
    const body = rv([
      `デビューしたてなのにこのプロフィールって❤︎\nこれから絶対注目の子だよ`,
      `新人なのにすでに完成されてる❤︎\nこれからが楽しみすぎる`,
      `まだそんなに知られてないから今のうちにチェックして❤︎`,
    ], 0);
    return `新人AV女優紹介❤︎\n\n${a.name}\n${m ? m + '\n' : ''}\n${body}\n\nデビュー作はこちら👇\n${url}\n\n#新人AV女優 #${a.name.replace(/\s/g,'')} #デビュー #FANZA #AV女優`;
  },
  (a, stats) => { // 4: えろいポイント解説
    const m = actressMeasures(a);
    const work = stats.topRated || stats.newest;
    const url = actressSiteUrl(a, work);
    const traits = [];
    if (a.bust && parseInt(a.bust) >= 90) traits.push('爆乳');
    else if (a.bust && parseInt(a.bust) >= 80) traits.push('巨乳');
    if (a.height && parseInt(a.height) <= 155) traits.push('小柄');
    else if (a.height && parseInt(a.height) >= 165) traits.push('スレンダー長身');
    const traitStr = traits.length > 0 ? traits.join('×') + 'という' : '';
    return `${a.name}のえろいポイント教える❤︎\n\n${m ? m + '\n\n' : ''}${traitStr}スペックと\nあの表情と雰囲気が全部合わさってる\n\nこれは反則❤︎\n\n${url}\n\n#${a.name.replace(/\s/g,'')} #AV女優 #FANZA #えろい`;
  },
  (a, stats) => { // 5: 作品数自慢
    if (stats.count < 5) return null;
    const work = stats.topRated || stats.newest;
    const url = actressSiteUrl(a, work);
    return `${a.name}の作品が${stats.count}本以上あるって知ってた？❤︎\n\n${actressMeasures(a) ? actressMeasures(a) + '\n\n' : ''}それだけ${rv(['人気がある証拠','ファンが多い証明','えろい証拠'], 0)}\nどれから見ても間違いない❤︎\n\n${url}\n\n#${a.name.replace(/\s/g,'')} #AV女優 #FANZA`;
  },
];

// ===== 女優紹介パターン（英語）=====
const EN_ACTRESS_INTRO_PATTERNS = [
  (a, stats) => { // 0: Full profile
    const m = actressMeasures(a);
    const work = stats.topRated || stats.newest;
    const url = actressSiteUrl(a, work);
    const cnt = stats.count;
    return `✨ Actress Spotlight ✨\n\n${a.name}${m ? '\n' + m : ''}${a.height ? '\nHeight: ' + a.height + 'cm' : ''}${cnt > 0 ? '\n' + cnt + '+ works' : ''}\n\n${rv(['She has something the others simply don\'t ❤︎','Once you know, you can\'t unknow ❤︎','The reason she has so many fans ❤︎'], 0)}\n\nCheck her out 👇\n${url}\n\n#JAV #AVactress #FANZA #ActressSpotlight`;
  },
  (a, stats) => { // 1: Measurements feature
    if (!a.bust) return null;
    const work = stats.topRated || stats.newest;
    const url = actressSiteUrl(a, work);
    return `${a.name} ❤︎\n\nB${a.bust} / W${a.waist} / H${a.hip}${a.height ? '\nHeight: ' + a.height + 'cm' : ''}\n\n${rv(['Those numbers are not normal','That body is genuinely unfair','This is peak ❤︎'], 0)}\n\n${url}\n\n#JAV #AVactress #FANZA #JAVgirl`;
  },
  (a, stats) => { // 2: Best work intro
    const work = stats.topRated;
    if (!work) return null;
    const avg = parseFloat(work.review?.average || 0);
    const url = siteUrl(work);
    return `New to ${a.name}? Start here ❤︎\n\n${actressMeasures(a) ? actressMeasures(a) + '\n\n' : ''}Best work: "${work.title?.slice(0, 28)}…"\n${avg ? '⭐' + avg + '\n' : ''}\n${rv(['This one will make you a fan immediately','You\'ll understand the hype after 5 minutes','Certified perfect introduction'], 0)}\n\n${url}\n\n#JAV #AVactress #FANZA #ActressIntro`;
  },
  (a, stats) => { // 3: New debut
    const m = actressMeasures(a);
    const work = stats.newest;
    const url = actressSiteUrl(a, work);
    return `Just debuted: ${a.name} ❤︎\n${m ? '\n' + m + '\n' : ''}\n${rv(['Brand new but already at this level??','Debut energy that doesn\'t feel like a debut','Fresh face, zero rookie mistakes'], 0)}\n\nDebut work 👇\n${url}\n\n#NewActress #JAVdebut #FANZA #JAV #AVactress`;
  },
];

function generateActressIntroText(actress, stats) {
  const order = [...Array(ACTRESS_INTRO_PATTERNS_JA.length).keys()];
  order.sort((a, b) => (hash(String(SEED + a * 67)) % 100) - (hash(String(SEED + b * 67)) % 100));
  for (const idx of order) {
    const result = ACTRESS_INTRO_PATTERNS_JA[idx](actress, stats);
    if (result) { console.log(`女優紹介JA パターン${idx} 採用`); return result.trim(); }
  }
  const m = actressMeasures(actress);
  return `${actress.name} ❤︎\n${m ? '\n' + m + '\n' : ''}\nえろすぎる女優さん紹介するね\n\n${actressSiteUrl(actress, stats.topRated || stats.newest)}\n\n#${actress.name.replace(/\s/g,'')} #AV女優 #FANZA`.trim();
}

function generateActressIntroTextEn(actress, stats) {
  const order = [...Array(EN_ACTRESS_INTRO_PATTERNS.length).keys()];
  order.sort((a, b) => (hash(String(SEED + a * 71)) % 100) - (hash(String(SEED + b * 71)) % 100));
  for (const idx of order) {
    const result = EN_ACTRESS_INTRO_PATTERNS[idx](actress, stats);
    if (result) { console.log(`女優紹介EN パターン${idx} 採用`); return result.trim(); }
  }
  return `${actress.name} ❤︎\n\n${rv(['Absolutely gorgeous','A must-follow actress','Truly one of the best'], 0)}\n\n${actressSiteUrl(actress, stats.topRated)}\n\n#JAV #FANZA #AVactress`.trim();
}

// ===== Bluesky 女優紹介投稿（プロフィール画像＋作品サンプル混合ギャラリー）=====
async function postActressIntro(text, actress, stats, auth) {
  const trendTags = await getTrendingTags(auth.accessJwt);
  const finalText = trendTags.length > 0
    ? text + '\n' + trendTags.map(t => '#' + t).join(' ')
    : text;

  const facets = buildFacets(finalText);
  const record = {
    $type: 'app.bsky.feed.post',
    text: finalText,
    createdAt: new Date().toISOString(),
    langs: ['ja'],
    facets,
  };

  // 画像構成: 1枚目=女優プロフィール写真, 2-4枚目=代表作サンプル画像
  const blobs = [];
  const profileImgUrl = actress.imageURL?.large || actress.imageURL?.small || '';
  if (profileImgUrl) {
    try {
      const { buffer, mime } = await fetchBuffer(profileImgUrl);
      const blobRes = await uploadBlob(buffer, mime.split(';')[0] || 'image/jpeg', auth.accessJwt);
      blobs.push({ blob: blobRes.blob, alt: actress.name });
    } catch(e) { console.log('女優プロフィール画像スキップ:', e.message); }
  }

  const work = stats.topRated || stats.newest;
  if (work) {
    const sampleImgs = work.sampleImageURL?.sample_l?.image || [];
    for (const url of sampleImgs.slice(0, 4 - blobs.length)) {
      if (blobs.length >= 4) break;
      try {
        const { buffer, mime } = await fetchBuffer(url);
        const blobRes = await uploadBlob(buffer, mime.split(';')[0] || 'image/jpeg', auth.accessJwt);
        blobs.push({ blob: blobRes.blob, alt: work.title || actress.name });
      } catch(e) { console.log('女優紹介サンプル画像スキップ:', e.message); }
    }
    // サンプルがなければパッケージ画像
    if (blobs.length < 2) {
      const pkgUrl = work.imageURL?.large || work.imageURL?.list || '';
      if (pkgUrl) {
        try {
          const { buffer, mime } = await fetchBuffer(pkgUrl);
          const blobRes = await uploadBlob(buffer, mime.split(';')[0] || 'image/jpeg', auth.accessJwt);
          blobs.push({ blob: blobRes.blob, alt: work.title || actress.name });
        } catch(e) { console.log('パッケージ画像スキップ:', e.message); }
      }
    }
  }

  if (blobs.length > 0) {
    record.embed = {
      $type: 'app.bsky.embed.images',
      images: blobs.map(b => ({ image: b.blob, alt: b.alt })),
    };
    console.log(`女優紹介: ${blobs.length}枚ギャラリー ✅`);
  }

  await request('https://bsky.social/xrpc/com.atproto.repo.createRecord',
    { repo: auth.did, collection: 'app.bsky.feed.post', record },
    { Authorization: `Bearer ${auth.accessJwt}` });
  console.log('Bluesky 女優紹介投稿完了 ✅');
}

// ===== Bluesky 英語投稿 =====
async function postBlueskyEnglish(item, auth) {
  let text = generateEnglishText(item);

  const trendTags = await getEnglishTrendingTags(auth.accessJwt);
  const staticTags = ['#JAV', '#NSFW', '#AdultContent', '#JapaneseAdult'];
  const allTags = [...new Set([...staticTags, ...trendTags.map(t => '#' + t)])].slice(0, 6);
  text = text + '\n\n' + allTags.join(' ');

  const facets = buildFacets(text);
  const record = {
    $type: 'app.bsky.feed.post',
    text,
    createdAt: new Date(Date.now() + 2000).toISOString(),
    langs: ['en'],
    facets,
  };

  const sampleImgsEn = item.sampleImageURL?.sample_l?.image || [];
  const mainImgUrlEn = item.imageURL?.large || item.imageURL?.list || item.imageURL?.small || '';
  let enEmbedDone = false;
  if (sampleImgsEn.length > 0) {
    const blobs = [];
    for (const url of sampleImgsEn.slice(0, 4)) {
      try {
        const { buffer, mime } = await fetchBuffer(url);
        const blobRes = await uploadBlob(buffer, mime.split(';')[0] || 'image/jpeg', auth.accessJwt);
        blobs.push(blobRes.blob);
      } catch(e) { console.log('英語投稿画像1枚スキップ:', e.message); }
    }
    if (blobs.length > 0) {
      record.embed = {
        $type: 'app.bsky.embed.images',
        images: blobs.map(blob => ({ image: blob, alt: item.title || '' }))
      };
      enEmbedDone = true;
    }
  }
  if (!enEmbedDone && mainImgUrlEn) {
    try {
      const { buffer, mime } = await fetchBuffer(mainImgUrlEn);
      const blobRes = await uploadBlob(buffer, mime.split(';')[0], auth.accessJwt);
      record.embed = {
        $type: 'app.bsky.embed.external',
        external: { uri: siteUrl(item), title: item.title || '', description: 'Sample video available | douga-adult.com', thumb: blobRes.blob }
      };
    } catch(e) { console.log('英語投稿サムネ失敗:', e.message); }
  }

  await request('https://bsky.social/xrpc/com.atproto.repo.createRecord',
    { repo: auth.did, collection: 'app.bsky.feed.post', record },
    { Authorization: `Bearer ${auth.accessJwt}` });
  console.log('Bluesky 英語投稿完了 ✅');
}

// ===== X (Twitter) 投稿 =====
async function postTwitter(text) {
  const apiKey    = (process.env.X_API_KEY            || '').trim();
  const apiSecret = (process.env.X_API_SECRET         || '').trim();
  const accToken  = (process.env.X_ACCESS_TOKEN       || '').trim();
  const accSecret = (process.env.X_ACCESS_TOKEN_SECRET || '').trim();
  if (!apiKey || !apiSecret || !accToken || !accSecret) {
    console.log('X: 認証情報なし、スキップ');
    return;
  }

  const url   = 'https://api.twitter.com/2/tweets';
  const nonce = crypto.randomBytes(16).toString('hex');
  const ts    = Math.floor(Date.now() / 1000).toString();

  const oauthParams = {
    oauth_consumer_key:     apiKey,
    oauth_nonce:            nonce,
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp:        ts,
    oauth_token:            accToken,
    oauth_version:          '1.0',
  };

  const paramStr = Object.keys(oauthParams).sort()
    .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(oauthParams[k])}`)
    .join('&');
  const base   = `POST&${encodeURIComponent(url)}&${encodeURIComponent(paramStr)}`;
  const sigKey = `${encodeURIComponent(apiSecret)}&${encodeURIComponent(accSecret)}`;
  oauthParams.oauth_signature = crypto.createHmac('sha1', sigKey).update(base).digest('base64');

  const authHeader = 'OAuth ' + Object.keys(oauthParams).sort()
    .map(k => `${encodeURIComponent(k)}="${encodeURIComponent(oauthParams[k])}"`)
    .join(', ');

  // URLにref付与してバリエーションを持たせる（同一URL連投によるスパム判定回避）
  const ref = `tw${slot}${SEED % 99}`;
  const tweetText = text
    .replace(/https?:\/\/[^\s\n]+/g, url => url.includes('?') ? `${url}&ref=${ref}` : `${url}?ref=${ref}`)
    .slice(0, 270);

  // possibly_sensitive: true でセンシティブフラグを付与
  await request(url, { text: tweetText, possibly_sensitive: true }, { Authorization: authHeader });
  console.log('X: 投稿完了 ✅');
}

// ===== Misskey 投稿 =====
async function postMisskey(text) {
  const instance = (process.env.MISSKEY_INSTANCE || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
  const token    = process.env.MISSKEY_TOKEN;
  if (!instance || !token) { console.log('Misskey: 認証情報なし、スキップ'); return; }

  await request(`https://${instance}/api/notes/create`,
    { i: token, text, visibility: 'public' });
  console.log('Misskey: 投稿完了 ✅');
}

// ===== メイン =====
(async () => {
  const postData = selectPostData();
  const { type, actress, item } = postData;

  if (!item && !actress) { console.error('投稿データが見つかりません'); process.exit(1); }

  // テキスト生成（投稿タイプ別）
  let text, textEn;
  const stats = postData.stats || null;
  if (type === 'actress_intro') {
    text   = generateActressIntroText(actress, stats);
    textEn = generateActressIntroTextEn(actress, stats);
    console.log(`--- 女優紹介投稿: ${actress.name} ---`);
  } else if (type === 'actress_rank' || type === 'actress_new') {
    text   = generateActressText(actress, item);
    textEn = generateActressTextEn(actress, item);
    console.log(`--- 女優投稿 [${type}]: ${actress.name} ---`);
  } else {
    text   = generateText(item);
    textEn = null; // postBlueskyEnglish内で生成
    console.log('--- 商品投稿 ---');
  }
  console.log(text);
  console.log('--- 文字数:', text.length, '---');

  // postBluesky/postBlueskyEnglishに渡すitemを解決
  const postItem = item || {
    content_id: `actress_${actress?.id}`,
    title: actress?.name || '',
    imageURL: actress?.imageURL,
    sampleImageURL: null,
    iteminfo: { actress: [{ id: actress?.id, name: actress?.name }] },
    review: null,
    date: null,
  };

  // Bluesky 認証（失敗してもX/Misskeyは続行）
  let bskyAuth = null;
  try {
    const handle = (process.env.BSKY_HANDLE || '').trim();
    const pass   = (process.env.BSKY_APP_PASSWORD || '').trim();
    if (handle && pass) {
      bskyAuth = await request('https://bsky.social/xrpc/com.atproto.server.createSession', { identifier: handle, password: pass });
      console.log('Bluesky: 認証OK');
    } else {
      console.log('Bluesky: 認証情報なし、スキップ');
    }
  } catch(e) {
    console.error('Bluesky: 認証失敗 (続行):', e.message);
  }

  if (bskyAuth) {
    // 女優紹介モードは専用関数（プロフィール画像＋作品画像の混合ギャラリー）
    if (type === 'actress_intro') {
      await postActressIntro(text, actress, stats, bskyAuth)
        .catch(e => console.error('Bluesky 女優紹介エラー (続行):', e.message));
      const enText = textEn;
      // EN版も女優紹介専用関数で投稿（ギャラリーは共通）
      if (enText) {
        const enRecord = {
          $type: 'app.bsky.feed.post',
          text: enText + '\n\n#JAV #AVactress #FANZA #ActressSpotlight',
          createdAt: new Date().toISOString(),
          langs: ['en'],
          facets: buildFacets(enText),
        };
        await request('https://bsky.social/xrpc/com.atproto.repo.createRecord',
          { repo: bskyAuth.did, collection: 'app.bsky.feed.post', record: enRecord },
          { Authorization: `Bearer ${bskyAuth.accessJwt}` })
          .catch(e => console.error('Bluesky EN女優紹介エラー (続行):', e.message));
        console.log('Bluesky EN女優紹介投稿完了 ✅');
      }
    } else {
      await postBluesky(text, postItem, bskyAuth)
        .catch(e => console.error('Bluesky JP投稿エラー (続行):', e.message));
    }

    // 英語投稿：女優モードは独自テキスト、商品モードは既存関数
    if (type !== 'actress_intro') {
      if (textEn) {
        await postBluesky(textEn, postItem, bskyAuth)
          .catch(e => console.error('Bluesky EN女優投稿エラー (続行):', e.message));
      } else {
        await postBlueskyEnglish(postItem, bskyAuth)
          .catch(e => console.error('英語投稿エラー (続行):', e.message));
      }
    }

    await commentOnTrendingPosts(bskyAuth.accessJwt, bskyAuth.did)
      .catch(e => console.error('コメント機能エラー (続行):', e.message));
    await replyToNotifications(bskyAuth.accessJwt, bskyAuth.did)
      .catch(e => console.error('自動リプライエラー (続行):', e.message));
  }

  await postTwitter(text).catch(e => console.error('X エラー (続行):', e.message));
  await postMisskey(text).catch(e => console.error('Misskey エラー (続行):', e.message));
})().catch(e => { console.error('致命的エラー:', e.message); process.exit(1); });
