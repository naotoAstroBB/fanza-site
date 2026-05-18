#!/usr/bin/env node
// SNS自動投稿スクリプト（リーチ最大化版）
// 環境変数: BSKY_HANDLE, BSKY_APP_PASSWORD, MISSKEY_INSTANCE, MISSKEY_TOKEN, POST_SLOT

const fs    = require('fs');
const https = require('https');
const http  = require('http');

const SITE = 'https://douga-adult.com';

// ===== データ読み込み =====
function loadJSON(path) {
  try { return JSON.parse(fs.readFileSync(path, 'utf8')); } catch { return null; }
}
const rankItems   = loadJSON('data/rank.json')?.result?.items   || [];
const newItems    = loadJSON('data/new.json')?.result?.items    || [];
const reviewItems = loadJSON('data/review.json')?.result?.items || [];
if (!rankItems.length) { console.error('データなし'); process.exit(1); }

// ===== シード（日付×スロットで決定論的に選択）=====
function hash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h * 33) ^ str.charCodeAt(i)) >>> 0;
  return h;
}
const jst     = new Date(Date.now() + 9 * 3600000);
const dateStr = jst.toISOString().slice(0, 10);
const slot    = parseInt(process.env.POST_SLOT || '0', 10);
const SEED    = hash(dateStr + '-' + slot);

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

// ===== 20パターン =====
const PATTERNS = [
  (item) => { // 1: 驚き発見
    const a = getActresses(item)[0]; if (!a) return null;
    return `え、${a}ってこんなすごかったの…\n\n知らなかった人多そうだけど\nこれ見たら絶対ハマる\n\n${reviewStr(item)}\n👇 サンプル動画あり\n${siteUrl(item)}\n\n${buildTags(item)}`;
  },
  () => { // 2: ランキングTOP3
    const top = rankItems.slice(0, 3);
    const lines = top.map((x, i) => `${['🥇','🥈','🥉'][i]} ${getActresses(x)[0]||'---'}\n　${shortTitle(x.title,20)}…\n　${reviewStr(x)}`).join('\n\n');
    return `📊 今日のFANZA人気TOP3\n\n${lines}\n\n詳細・サンプルはこちら\n${SITE}\n\n#FANZAランキング #FANZA #AV #アダルト動画 #エロ動画 #おすすめ`;
  },
  (item) => { // 3: 個人おすすめ
    const a = getActresses(item)[0] || '';
    return `これ、本当に良かった\n\n${a ? a + 'の作品だったんだけど' : 'たまたま見つけたやつ'}\n最初から最後まで全然飽きなかった\n\n${reviewStr(item)}\n\n気になったら見てみて\n${siteUrl(item)}\n\n${buildTags(item)}`;
  },
  (item) => { // 4: セール推し
    const price = item.prices?.price;
    return `${price ? price + '円がセール中' : 'セール対象作品'}\n\n${shortTitle(item.title)}\n\n${reviewStr(item)}\n\nこのクオリティでこの値段はおかしい\n${siteUrl(item)}\n\n${buildTags(item, ['FANZAセール', 'セール'])}`;
  },
  (item) => { // 5: 女優フィーチャー
    const a = getActresses(item)[0]; if (!a) return null;
    return `${a}の話をしたい\n\n何が好きかって言うと全体的にちょうどいいんだよな\n\n作品数も多いし外れがない\n\n最新作はこれ👇\n${siteUrl(item)}\n\n${buildTags(item)}`;
  },
  (item) => { // 6: デビュー・新人
    const a = getActresses(item)[0] || '';
    return `${a ? a + '、' : ''}これ絶対伸びる\n\nデビューしたてなのにもう完成されすぎてる\n\n${reviewStr(item)}\n\n今のうちに見ておいた方がいい\n${siteUrl(item)}\n\n${buildTags(item, ['新人AV女優', 'デビュー'])}`;
  },
  (item) => { // 7: レビュー偉業
    const avg = parseFloat(item.review?.average || 0);
    const cnt = parseInt(item.review?.count || 0);
    if (avg < 4.0 || cnt < 50) return null;
    return `レビュー${cnt.toLocaleString()}件で${avg}点\n\nFANZAでこの数字出すのはほぼ不可能に近い\n\n👇 見たら納得する\n${siteUrl(item)}\n\n${buildTags(item, ['高評価', '名作'])}`;
  },
  (item) => { // 8: 問いかけ
    const gs = getGenres(item).filter(g => g.length <= 6 && !['ハイビジョン','独占配信'].includes(g));
    if (gs.length < 2) return null;
    return `${gs[0]}派？それとも${gs[1]}派？\n\nどっちか選べって言われたら困るんだけど\nこれはどっちも入ってる最強の作品\n\n${siteUrl(item)}\n\n${buildTags(item)}`;
  },
  (item) => { // 9: 知る人ぞ知る
    return `知ってる人だけ知ってる名作\n\n大きく宣伝されてないけどわかってる人の間では評価が高い\n\n${reviewStr(item)}\n\n黙って保存しといて\n${siteUrl(item)}\n\n${buildTags(item, ['名作', '隠れた名作'])}`;
  },
  (item) => { // 10: スペック推し
    const a = getActresses(item)[0] || '';
    const gs = getGenres(item).filter(g => ['巨乳','美乳','美少女','スレンダー','痴女','人妻'].includes(g));
    return `${a}${gs[0] ? '（' + gs[0] + '）' : ''}\n\nスペック的に全部好きなやつだった\n\n${reviewStr(item)}\n\n${siteUrl(item)}\n\n${buildTags(item)}`;
  },
  (item) => { // 11: 深夜
    return `深夜に見るやつ\n\n${shortTitle(item.title)}\n\n寝れなくなっても知らない\n\n${reviewStr(item)}\n\n${siteUrl(item)}\n\n${buildTags(item, ['深夜', 'おすすめ'])}`;
  },
  (item) => { // 12: 共感フック
    const g = getGenres(item).filter(g => g.length < 8 && !['ハイビジョン'].includes(g))[0];
    if (!g) return null;
    return `${g}好きはわかってくれると思うんだけど\n\n外れ引いた時の絶望感ってもう味わいたくないじゃないですか\n\nだからこそこれは自信を持って言える\n\n${reviewStr(item)}\n\n${siteUrl(item)}\n\n${buildTags(item)}`;
  },
  (item) => { // 13: ジャンル特化
    const g = getGenres(item).filter(g => !['ハイビジョン','BEST・総集編','独占配信'].includes(g))[0];
    if (!g) return null;
    return `${g}が好きな人に刺さる作品見つけた\n\n${getActresses(item)[0] || ''}\n\n${reviewStr(item)}\n\nサンプル動画あるから確認してみて\n${siteUrl(item)}\n\n${buildTags(item)}`;
  },
  (item) => { // 14: 比較おすすめ
    const g = getGenres(item).filter(g => !['ハイビジョン'].includes(g))[0] || 'この系統';
    return `${g}が好きなら絶対ハマる\n\n他のやつ色々見てきたけどこれが一番クオリティ高かった\n\n${reviewStr(item)}\n\n${siteUrl(item)}\n\n${buildTags(item)}`;
  },
  (item) => { // 15: 実況・感想
    const a = getActresses(item)[0] || '';
    return `見終わった\n\n${a ? a + '、正直なめてたごめん' : 'これはやばかった'}\n\nサムネで判断してたけど本編の方が全然よかった\n\n${reviewStr(item)}\n\n${siteUrl(item)}\n\n${buildTags(item)}`;
  },
  (item) => { // 16: データ統計
    const cnt = parseInt(item.review?.count || 0);
    const avg = item.review?.average;
    if (!avg || !cnt) return null;
    return `数字で見るFANZA名作\n\nレビュー件数：${cnt.toLocaleString()}件\n平均評価：★${avg}点\n\nこの数字が何を意味するかは実際に見た人が一番わかってる\n\n${siteUrl(item)}\n\n${buildTags(item, ['高評価'])}`;
  },
  (item) => { // 17: 週末推薦
    return `週末に見てほしいやつ\n\n${shortTitle(item.title)}\n\n時間取れる時じゃないともったいない作品\n\n${reviewStr(item)}\n\n${siteUrl(item)}\n\n${buildTags(item, ['週末', 'おすすめ'])}`;
  },
  (item) => { // 18: タイムセール速報
    return `⚡ 見逃し注意\n\n${shortTitle(item.title)}\n\n${reviewStr(item)}\n\n今確認しないと後悔するやつ\n${siteUrl(item)}\n\n${buildTags(item, ['FANZAセール', 'セール', '期間限定'])}`;
  },
  (item) => { // 19: レジェンド推し
    const a = getActresses(item)[0]; if (!a) return null;
    return `${a}を知らない世代に伝えたい\n\nこの人の作品は時代関係なく刺さる\n今見ても全然古くないむしろこのクオリティが異常\n\n${reviewStr(item)}\n\n${siteUrl(item)}\n\n${buildTags(item, ['レジェンド', '名作'])}`;
  },
  (item) => { // 20: シナリオ・妄想
    const gs = getGenres(item).filter(g => !['ハイビジョン','BEST・総集編','独占配信'].includes(g));
    const gStr = gs.slice(0, 2).join('×') || 'このジャンル';
    return `${gStr}の理想が全部詰まってた\n\nシチュエーションも\nキャストも\n展開も\n全部好きなやつだった\n\n${reviewStr(item)}\n\n${siteUrl(item)}\n\n${buildTags(item)}`;
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

// ===== 商品選択 =====
function selectItem() {
  const pools = [rankItems, newItems, reviewItems];
  const pool  = pools[slot % 3].filter(x => x.content_id);
  return pool[SEED % pool.length];
}

// ===== HTTP =====
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
  const tagRe = /#[\w぀-ゟ゠-ヿ一-龯ｦ-ﾟ]+/g;
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

// ===== Bluesky 投稿 =====
async function postBluesky(text, item) {
  const handle = process.env.BSKY_HANDLE;
  const pass   = process.env.BSKY_APP_PASSWORD;
  if (!handle || !pass) { console.log('Bluesky: 認証情報なし、スキップ'); return; }

  const auth = await request('https://bsky.social/xrpc/com.atproto.server.createSession',
    { identifier: handle, password: pass });
  console.log('Bluesky: 認証OK');

  const facets = buildFacets(text);
  const record = {
    $type: 'app.bsky.feed.post',
    text,
    createdAt: new Date().toISOString(),
    langs: ['ja'],
    facets,
  };

  // サムネイル付きリンクカード（external embed）を試みる
  const imgUrl = item.imageURL?.list || item.imageURL?.small || '';
  const postUrl = siteUrl(item);
  if (imgUrl) {
    try {
      const { buffer, mime } = await fetchBuffer(imgUrl);
      const blobRes = await uploadBlob(buffer, mime.split(';')[0], auth.accessJwt);
      record.embed = {
        $type: 'app.bsky.embed.external',
        external: {
          uri: postUrl,
          title: item.title || '',
          description: '詳細・サンプル動画はこちら | douga-adult.com',
          thumb: blobRes.blob,
        }
      };
      console.log('Bluesky: サムネイルカード付き');
    } catch(e) {
      console.log('Bluesky: サムネイル取得失敗、テキストのみで投稿:', e.message);
    }
  }

  await request('https://bsky.social/xrpc/com.atproto.repo.createRecord',
    { repo: auth.did, collection: 'app.bsky.feed.post', record },
    { Authorization: `Bearer ${auth.accessJwt}` });
  console.log('Bluesky: 投稿完了 ✅');
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
  const item = selectItem();
  if (!item) { console.error('商品が見つかりません'); process.exit(1); }

  const text = generateText(item);
  console.log('--- 投稿内容 ---');
  console.log(text);
  console.log('--- 文字数:', text.length, '---');

  await Promise.allSettled([
    postBluesky(text, item),
    postMisskey(text),
  ]);
})();
