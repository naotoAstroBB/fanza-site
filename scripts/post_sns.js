#!/usr/bin/env node
// SNS自動投稿スクリプト
// 環境変数: BSKY_HANDLE, BSKY_APP_PASSWORD, MISSKEY_INSTANCE, MISSKEY_TOKEN, POST_SLOT

const fs = require('fs');
const https = require('https');

const SITE = 'https://douga-adult.com';

// ===== データ読み込み =====
function loadJSON(path) {
  try { return JSON.parse(fs.readFileSync(path, 'utf8')); } catch(e) { return null; }
}

const rankItems   = loadJSON('data/rank.json')?.result?.items   || [];
const newItems    = loadJSON('data/new.json')?.result?.items    || [];
const reviewItems = loadJSON('data/review.json')?.result?.items || [];

if (!rankItems.length) { console.error('データが読み込めませんでした'); process.exit(1); }

// ===== 決定論的シード =====
function hash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h * 33) ^ str.charCodeAt(i)) >>> 0;
  return h;
}
const jst      = new Date(Date.now() + 9 * 3600000);
const dateStr  = jst.toISOString().slice(0, 10);
const slot     = parseInt(process.env.POST_SLOT || '0', 10);
const SEED     = hash(dateStr + '-' + slot);

function pickIdx(arr) { return SEED % arr.length; }

// ===== ヘルパー =====
function getActresses(item) { return (item.iteminfo?.actress || []).map(a => a.name); }
function getGenres(item)    { return (item.iteminfo?.genre   || []).map(g => g.name); }

function tags(item, extra = []) {
  const t = ['#FANZA', '#AV', ...extra];
  getActresses(item).slice(0, 2).forEach(a => t.push('#' + a.replace(/\s/g, '')));
  getGenres(item)
    .filter(g => !['ハイビジョン','BEST・総集編','独占配信'].includes(g))
    .slice(0, 2)
    .forEach(g => t.push('#' + g.replace(/\s/g, '')));
  return [...new Set(t)].join(' ');
}

function review(item) {
  const avg = parseFloat(item.review?.average || 0);
  const cnt = parseInt(item.review?.count || 0);
  if (!avg) return '';
  return `${'★'.repeat(Math.min(5, Math.round(avg)))} ${avg}点 (${cnt.toLocaleString()}件)`;
}

function siteUrl(item) { return `${SITE}/product.html?cid=${item.content_id}`; }

function shortTitle(item, len = 28) { return (item.title || '').slice(0, len); }

// ===== 20パターン =====
// null を返した場合は次のパターンへフォールバック
const PATTERNS = [

  // 1: 驚き発見
  (item) => {
    const a = getActresses(item)[0];
    if (!a) return null;
    const rv = review(item);
    return `え、${a}ってこんなすごかったの…

知らなかった人多そうだけど
これ見たら絶対ハマる

${rv ? rv + '\n' : ''}
👇 サンプル動画あり
${siteUrl(item)}

${tags(item)}`;
  },

  // 2: ランキング速報（top3使用）
  () => {
    const top3 = rankItems.slice(0, 3);
    const lines = top3.map((x, i) => {
      const a = getActresses(x)[0] || '---';
      const rv = review(x);
      return `${['🥇','🥈','🥉'][i]} ${a}\n　${shortTitle(x, 18)}…\n　${rv}`;
    }).join('\n\n');
    return `📊 今日のFANZA人気TOP3

${lines}

詳細・サンプルはこちら
${SITE}

#FANZAランキング #FANZA #AV`;
  },

  // 3: 個人おすすめ
  (item) => {
    const a = getActresses(item)[0] || '';
    const rv = review(item);
    return `これ、本当に良かった

${a ? a + 'の作品だったんだけど' : 'たまたま見つけたやつ'}
最初から最後まで全然飽きなかった

${rv}

気になったら見てみて
${siteUrl(item)}

${tags(item)}`;
  },

  // 4: セール・価格推し
  (item) => {
    const price = item.prices?.price;
    const rv = review(item);
    return `${price ? price + '円の作品がセール中' : 'セール対象になってた'}

${shortTitle(item)}

${rv}

このクオリティでこの値段はおかしい
👇
${siteUrl(item)}

${tags(item, ['#FANZAセール'])}`;
  },

  // 5: 女優フィーチャー
  (item) => {
    const a = getActresses(item)[0];
    if (!a) return null;
    return `${a}の話をしたい

何が好きかって言うと
全体的にちょうどいいんだよな

作品数も多いし外れがない

最新作はこれ👇
${siteUrl(item)}

${tags(item)}`;
  },

  // 6: デビュー・新人
  (item) => {
    const a = getActresses(item)[0];
    const genres = getGenres(item);
    const isDebut = genres.includes('デビュー作品') || genres.includes('単体作品');
    const rv = review(item);
    return `${a ? a + '、' : ''}これ絶対伸びる

${isDebut ? 'デビューしたてなのに\nもう完成されすぎてる\n\n' : ''}${rv}

今のうちに見ておいた方がいい
${siteUrl(item)}

${tags(item)}`;
  },

  // 7: レビュー偉業
  (item) => {
    const avg = parseFloat(item.review?.average || 0);
    const cnt = parseInt(item.review?.count || 0);
    if (avg < 4.5 || cnt < 100) return null;
    return `レビュー${cnt.toLocaleString()}件で${avg}点

これがどれだけすごいか
わかる人にはわかる

FANZAでこの数字出すのは
ほぼ不可能に近い

👇 見たら納得する
${siteUrl(item)}

${tags(item)}`;
  },

  // 8: 問いかけ
  (item) => {
    const gs = getGenres(item).filter(g => g.length <= 6 && !['ハイビジョン','独占配信'].includes(g));
    if (gs.length < 2) return null;
    return `${gs[0]}派？それとも${gs[1]}派？

どっちか選べって言われたら困るんだけど

これはどっちも入ってる最強の作品

${siteUrl(item)}

${tags(item)}`;
  },

  // 9: 知る人ぞ知る
  (item) => {
    return `知ってる人だけ知ってる名作

大きく宣伝されてないけど
わかってる人の間では評価高い

${review(item)}

黙って保存しといて
${siteUrl(item)}

${tags(item)}`;
  },

  // 10: スペック推し
  (item) => {
    const a = getActresses(item)[0];
    const gs = getGenres(item).filter(g => ['巨乳','美乳','美少女','スレンダー','痴女'].includes(g));
    if (!a && !gs.length) return null;
    return `${a ? a : ''}${gs.length ? '（' + gs[0] + '）' : ''}の作品

スペック的に全部好きなやつだった

${review(item)}

確認してみて
${siteUrl(item)}

${tags(item)}`;
  },

  // 11: 深夜投稿
  (item) => {
    return `深夜に見るやつ

${shortTitle(item)}

寝れなくなっても知らない

${review(item)}

${siteUrl(item)}

${tags(item)}`;
  },

  // 12: 共感フック
  (item) => {
    const g = getGenres(item).filter(g => g.length < 8 && !['ハイビジョン'].includes(g))[0];
    if (!g) return null;
    return `${g}好きはわかってくれると思うんだけど

外れ引いた時の絶望感って
もう味わいたくないじゃないですか

だからこそこれは自信を持って言える

${review(item)}

${siteUrl(item)}

${tags(item)}`;
  },

  // 13: ジャンル特化
  (item) => {
    const g = getGenres(item).filter(g => !['ハイビジョン','BEST・総集編','独占配信'].includes(g))[0];
    const a = getActresses(item)[0] || '';
    if (!g) return null;
    return `${g}が好きな人に刺さる作品見つけた

${a}

${review(item)}

サンプル動画あるから確認してみて
${siteUrl(item)}

${tags(item)}`;
  },

  // 14: 比較おすすめ
  (item) => {
    const g = getGenres(item).filter(g => !['ハイビジョン'].includes(g))[0] || 'この系統';
    return `${g}が好きなら絶対ハマる

他のやつ色々見てきたけど
これが一番クオリティ高かった

${review(item)}

${siteUrl(item)}

${tags(item)}`;
  },

  // 15: 実況・感想型
  (item) => {
    const a = getActresses(item)[0] || '';
    return `見終わった

${a ? a + '、正直なめてたごめん' : 'これはやばかった'}

サムネで判断してたけど
本編の方が全然よかった

${review(item)}

${siteUrl(item)}

${tags(item)}`;
  },

  // 16: データ統計型
  (item) => {
    const cnt = parseInt(item.review?.count || 0);
    const avg = item.review?.average;
    if (!avg || !cnt) return null;
    return `数字で見るFANZA名作

レビュー件数：${cnt.toLocaleString()}件
平均評価：★${avg}点

この数字が何を意味するかは
実際に見た人が一番わかってる

${siteUrl(item)}

${tags(item)}`;
  },

  // 17: 週末推薦
  (item) => {
    return `週末に見てほしいやつ

${shortTitle(item)}

時間取れる時じゃないともったいない作品

${review(item)}

${siteUrl(item)}

${tags(item)}`;
  },

  // 18: タイムセール速報
  (item) => {
    return `⚡ 見逃し注意

${shortTitle(item)}

${review(item)}

今確認しないと後悔するやつ
👇
${siteUrl(item)}

${tags(item, ['#FANZAセール'])}`;
  },

  // 19: レジェンド推し
  (item) => {
    const a = getActresses(item)[0];
    if (!a) return null;
    return `${a}を知らない世代に伝えたい

この人の作品は時代関係なく刺さる

今見ても全然古くない
むしろこのクオリティが異常

${review(item)}

${siteUrl(item)}

${tags(item)}`;
  },

  // 20: シナリオ・妄想型
  (item) => {
    const gs = getGenres(item).filter(g => !['ハイビジョン','BEST・総集編','独占配信'].includes(g));
    const gStr = gs.slice(0, 2).join('×') || 'このジャンル';
    return `${gStr}の理想が全部詰まってた

シチュエーションも
キャストも
展開も

全部好きなやつだった

${review(item)}

${siteUrl(item)}

${tags(item)}`;
  },
];

// ===== テキスト生成 =====
function generateText(item, allData) {
  const patternIdx = SEED % PATTERNS.length;
  for (let i = 0; i < PATTERNS.length; i++) {
    const idx = (patternIdx + i) % PATTERNS.length;
    const result = PATTERNS[idx](item, allData);
    if (result) {
      console.log(`パターン${idx + 1} を使用`);
      return result.trim();
    }
  }
  // フォールバック
  return `${item.title}\n\n${review(item)}\n\n${siteUrl(item)}\n\n${tags(item)}`.trim();
}

// ===== 商品選択 =====
function selectItem() {
  // slot 0: rankから、slot 1: newから、slot 2: reviewから (循環)
  const pools = [rankItems, newItems, reviewItems];
  const pool = pools[slot % 3].filter(x => x.content_id);
  return pool[pickIdx(pool)];
}

// ===== HTTP POST =====
function request(url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const { hostname, pathname, search } = new URL(url);
    const data = JSON.stringify(body);
    const req = https.request({
      hostname, path: pathname + search, method: 'POST',
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

// ===== Bluesky 投稿 =====
async function postBluesky(text, postUrl) {
  const handle = process.env.BSKY_HANDLE;
  const pass   = process.env.BSKY_APP_PASSWORD;
  if (!handle || !pass) { console.log('Bluesky: 認証情報なし、スキップ'); return; }

  const auth = await request('https://bsky.social/xrpc/com.atproto.server.createSession',
    { identifier: handle, password: pass });
  console.log('Bluesky: 認証OK');

  const facets = [];
  if (postUrl && text.includes(postUrl)) {
    const enc = Buffer.from(text, 'utf8');
    const urlBuf = Buffer.from(postUrl, 'utf8');
    const idx = enc.indexOf(urlBuf);
    if (idx >= 0) {
      facets.push({
        index: { byteStart: idx, byteEnd: idx + urlBuf.length },
        features: [{ $type: 'app.bsky.richtext.facet#link', uri: postUrl }]
      });
    }
  }

  await request('https://bsky.social/xrpc/com.atproto.repo.createRecord',
    { repo: auth.did, collection: 'app.bsky.feed.post',
      record: { $type: 'app.bsky.feed.post', text, createdAt: new Date().toISOString(),
                langs: ['ja'], ...(facets.length ? { facets } : {}) } },
    { Authorization: `Bearer ${auth.accessJwt}` });
  console.log('Bluesky: 投稿完了');
}

// ===== Misskey 投稿 =====
async function postMisskey(text) {
  const instance = (process.env.MISSKEY_INSTANCE || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
  const token    = process.env.MISSKEY_TOKEN;
  if (!instance || !token) { console.log('Misskey: 認証情報なし、スキップ'); return; }

  await request(`https://${instance}/api/notes/create`,
    { i: token, text, visibility: 'public' });
  console.log('Misskey: 投稿完了');
}

// ===== メイン =====
(async () => {
  const item = selectItem();
  if (!item) { console.error('商品が見つかりません'); process.exit(1); }

  const allData = { rank: rankItems, new: newItems, review: reviewItems };
  const text = generateText(item, allData);
  const postUrl = siteUrl(item);

  console.log('--- 投稿内容 ---');
  console.log(text);
  console.log('---');
  console.log(`文字数: ${text.length}`);

  await Promise.allSettled([
    postBluesky(text, postUrl),
    postMisskey(text),
  ]);
})();
