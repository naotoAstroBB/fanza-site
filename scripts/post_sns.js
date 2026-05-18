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
    return `${a}がエロすぎてやばい

これ知らないのはもったいない
サンプルだけでも抜ける自信ある

${reviewStr(item)}
👇 サンプル動画あり
${siteUrl(item)}

${buildTags(item)}`;
  },
  () => { // 2: ランキングTOP3
    const top = rankItems.slice(0, 3);
    const lines = top.map((x, i) => `${['🥇','🥈','🥉'][i]} ${getActresses(x)[0]||'---'}\n　${shortTitle(x.title,20)}…\n　${reviewStr(x)}`).join('\n\n');
    return `今週ガチで抜けたFANZA作品TOP3

${lines}

サンプル・詳細はこちら
${SITE}

#FANZAランキング #FANZA #AV #エロ動画 #抜ける #おすすめ`;
  },
  (item) => { // 3: 個人おすすめ
    const a = getActresses(item)[0] || '';
    return `正直に言う

${a ? a + 'のこれ' : 'これ'}、想像以上にえろかった

最初から最後まで全部いい
サンプルで既に満足度高い

${reviewStr(item)}
${siteUrl(item)}

${buildTags(item)}`;
  },
  (item) => { // 4: セール推し
    const price = item.prices?.price;
    return `${price ? price + '円でこのエロさ' : 'セール中のやつ'}はコスパおかしい

${shortTitle(item.title)}

${reviewStr(item)}

今のうちに抑えといて
${siteUrl(item)}

${buildTags(item, ['FANZAセール', 'セール'])}`;
  },
  (item) => { // 5: 女優フィーチャー
    const a = getActresses(item)[0]; if (!a) return null;
    return `${a}の何がやばいって

えろいのに上品なんだよな

そのギャップにやられてる人が多いんだと思う

最新作👇
${siteUrl(item)}

${buildTags(item)}`;
  },
  (item) => { // 6: デビュー・新人
    const a = getActresses(item)[0] || '';
    return `${a ? a + ' ' : ''}デビューしたて

なのにこのエロさはずるい

経験値じゃなくて
生まれ持ったやつだと思う

${reviewStr(item)}
${siteUrl(item)}

${buildTags(item, ['新人AV女優', 'デビュー'])}`;
  },
  (item) => { // 7: レビュー偉業
    const avg = parseFloat(item.review?.average || 0);
    const cnt = parseInt(item.review?.count || 0);
    if (avg < 4.0 || cnt < 50) return null;
    return `${cnt.toLocaleString()}人が抜いて${avg}点

この数字が全部物語ってる

文句なしの名作エロ

👇 騙されたと思って見て
${siteUrl(item)}

${buildTags(item, ['高評価', '名作'])}`;
  },
  (item) => { // 8: 問いかけ
    const gs = getGenres(item).filter(g => g.length <= 6 && !['ハイビジョン','独占配信'].includes(g));
    if (gs.length < 2) return null;
    return `${gs[0]}と${gs[1]}どっちが好き？

どっちも捨てられない人のために
どっちも全部入ってる作品持ってきた

これはずるい
${siteUrl(item)}

${buildTags(item)}`;
  },
  (item) => { // 9: 知る人ぞ知る
    return `表に出てないけどえろい名作

派手に宣伝されてないのに
わかってる人がずっと見てる

${reviewStr(item)}

こっそり保存しといて
${siteUrl(item)}

${buildTags(item, ['名作', '隠れた名作'])}`;
  },
  (item) => { // 10: スペック推し
    const a = getActresses(item)[0] || '';
    const gs = getGenres(item).filter(g => ['巨乳','美乳','美少女','スレンダー','痴女','人妻'].includes(g));
    return `${a}の${gs[0] || 'このスペック'}がえろすぎる件

全部ちょうどいいんだよな
ちょうどいいってのが一番やばい

${reviewStr(item)}
${siteUrl(item)}

${buildTags(item)}`;
  },
  (item) => { // 11: 深夜
    return `深夜限定で流すやつ

${shortTitle(item.title)}

これ見たあとすぐ寝れる人いたら教えて

${reviewStr(item)}
${siteUrl(item)}

${buildTags(item, ['深夜', 'えろい'])}`;
  },
  (item) => { // 12: 共感フック
    const g = getGenres(item).filter(g => g.length < 8 && !['ハイビジョン'].includes(g))[0];
    if (!g) return null;
    return `${g}好きって外れるとほんとにきついよね

だから信頼できるやつだけ紹介したくて

これは間違いない
マジでえろい

${reviewStr(item)}
${siteUrl(item)}

${buildTags(item)}`;
  },
  (item) => { // 13: ジャンル特化
    const g = getGenres(item).filter(g => !['ハイビジョン','BEST・総集編','独占配信'].includes(g))[0];
    if (!g) return null;
    const a = getActresses(item)[0] || '';
    return `${g}のエロさをちゃんとわかってる人向け

${a}

サンプルだけでも見る価値ある

${reviewStr(item)}
${siteUrl(item)}

${buildTags(item)}`;
  },
  (item) => { // 14: 比較おすすめ
    const g = getGenres(item).filter(g => !['ハイビジョン'].includes(g))[0] || 'このジャンル';
    return `${g}で抜くならこれ一択

色々試してきたけど
えろさのレベルが違う

${reviewStr(item)}
${siteUrl(item)}

${buildTags(item)}`;
  },
  (item) => { // 15: 実況・感想
    const a = getActresses(item)[0] || '';
    return `さっき見終わった

${a ? a + 'にごめんなさいしたくなった' : 'これはやばかった'}

なめてたのに途中から全力になってた

${reviewStr(item)}
${siteUrl(item)}

${buildTags(item)}`;
  },
  (item) => { // 16: データ統計
    const cnt = parseInt(item.review?.count || 0);
    const avg = item.review?.average;
    if (!avg || !cnt) return null;
    return `${cnt.toLocaleString()}人が見て${avg}点

どれだけえろいかは数字を見ればわかる

これが全部語ってる

${siteUrl(item)}

${buildTags(item, ['高評価'])}`;
  },
  (item) => { // 17: 週末推薦
    return `今週末に見るべき一本

${shortTitle(item.title)}

時間たっぷりある日に見ないともったいない
そういうえろさがある

${reviewStr(item)}
${siteUrl(item)}

${buildTags(item, ['週末'])}`;
  },
  (item) => { // 18: タイムセール速報
    return `⚡ 今すぐ見て

${shortTitle(item.title)}

このえろさでこの値段は正気じゃない

${reviewStr(item)}
${siteUrl(item)}

${buildTags(item, ['FANZAセール', 'セール'])}`;
  },
  (item) => { // 19: レジェンド推し
    const a = getActresses(item)[0]; if (!a) return null;
    return `${a}のえろさは時代を超える

何年経っても色褪せない
むしろ今見た方が刺さる

これはレジェンド

${reviewStr(item)}
${siteUrl(item)}

${buildTags(item, ['レジェンド', '名作'])}`;
  },
  (item) => { // 20: シナリオ・妄想
    const gs = getGenres(item).filter(g => !['ハイビジョン','BEST・総集編','独占配信'].includes(g));
    const gStr = gs.slice(0, 2).join('×') || 'このジャンル';
    return `${gStr}でこんなにえろい作品あったんだ

シチュエーションも
展開も
全部ツボだった

妄想が止まらなくなる

${reviewStr(item)}
${siteUrl(item)}

${buildTags(item)}`;
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
            .filter(t => t && /[぀-鿿一-鿿]/.test(t))
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

// ===== サンプル動画URL取得 =====
function getSampleVideoUrl(item) {
  const mv = item.sampleMovieURL;
  if (!mv) return null;
  return mv.size_720_480 || mv.size_644_414 || mv.size_560_360 || mv.size_476_306 || null;
}

// ===== Bluesky 動画アップロード =====
function uploadVideo(buffer, mime, jwt) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'video.bsky.app',
      path: '/xrpc/app.bsky.video.uploadVideo',
      method: 'POST',
      headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': mime, 'Content-Length': buffer.length }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        if (res.statusCode >= 400) return reject(new Error(`Video upload ${res.statusCode}: ${d}`));
        resolve(JSON.parse(d));
      });
    });
    req.on('error', reject);
    req.write(buffer);
    req.end();
  });
}

async function pollVideoJob(jobId, jwt) {
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const status = await new Promise((resolve, reject) => {
      https.get(
        `https://video.bsky.app/xrpc/app.bsky.video.getJobStatus?jobId=${encodeURIComponent(jobId)}`,
        { headers: { Authorization: `Bearer ${jwt}` } },
        res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(JSON.parse(d))); }
      ).on('error', reject);
    });
    const state = status.jobStatus?.state;
    if (state === 'JOB_STATE_COMPLETED') return status.jobStatus.blob;
    if (state === 'JOB_STATE_FAILED') throw new Error('動画処理失敗: ' + (status.jobStatus?.error || ''));
  }
  throw new Error('動画ジョブタイムアウト');
}

// ===== Bluesky 投稿 =====
async function postBluesky(text, item) {
  const handle = (process.env.BSKY_HANDLE || '').trim();
  const pass   = (process.env.BSKY_APP_PASSWORD || '').trim();
  if (!handle || !pass) { console.log('Bluesky: 認証情報なし、スキップ'); return; }

  const auth = await request('https://bsky.social/xrpc/com.atproto.server.createSession',
    { identifier: handle, password: pass });
  console.log('Bluesky: 認証OK');

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

  const postUrl = siteUrl(item);
  const imgUrl  = item.imageURL?.list || item.imageURL?.small || '';
  const videoUrl = getSampleVideoUrl(item);

  // 動画埋め込みを最優先で試みる
  let embedDone = false;
  if (videoUrl) {
    try {
      const { buffer, mime } = await fetchBuffer(videoUrl);
      if (mime.startsWith('video/') || videoUrl.endsWith('.mp4')) {
        console.log('Bluesky: 動画アップロード中...');
        const job = await uploadVideo(buffer, mime.startsWith('video/') ? mime : 'video/mp4', auth.accessJwt);
        const blob = await pollVideoJob(job.jobId, auth.accessJwt);
        record.embed = { $type: 'app.bsky.embed.video', video: blob, aspectRatio: { width: 16, height: 9 } };
        embedDone = true;
        console.log('Bluesky: 動画埋め込み完了 ✅');
      }
    } catch(e) {
      console.log('Bluesky: 動画取得失敗:', e.message);
    }
  }

  // 動画がなければサムネイルカード
  if (!embedDone && imgUrl) {
    try {
      const { buffer, mime } = await fetchBuffer(imgUrl);
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

// ===== バズり投稿へのコメント =====
async function commentOnTrendingPosts(jwt, did) {
  // トレンドトピックを取得してバズり投稿を探す
  let trendKeywords = [];
  try {
    const trends = await getJson(
      'https://bsky.social/xrpc/app.bsky.unspecced.getTrends?limit=10',
      { Authorization: `Bearer ${jwt}` }
    );
    trendKeywords = (trends.trends || []).map(t => t.topic || t.hashtag || '').filter(Boolean).slice(0, 5);
  } catch(e) {
    console.log('トレンド取得失敗:', e.message);
  }

  // トレンドキーワードがなければ日本語の一般ワードで検索
  if (!trendKeywords.length) trendKeywords = ['おはよう', '今日', 'これ', 'やばい'];

  const kw = trendKeywords[SEED % trendKeywords.length];
  console.log('コメント対象トレンド:', kw);

  let posts = [];
  try {
    const res = await getJson(
      `https://bsky.social/xrpc/app.bsky.feed.searchPosts?q=${encodeURIComponent(kw)}&limit=50&sort=top`,
      { Authorization: `Bearer ${jwt}` }
    );
    posts = (res.posts || [])
      .filter(p =>
        p.author.did !== did &&
        (p.likeCount || 0) + (p.repostCount || 0) >= 1000 &&
        !p.record?.reply
      )
      .sort((a, b) => ((b.likeCount || 0) + (b.repostCount || 0)) - ((a.likeCount || 0) + (a.repostCount || 0)))
      .slice(0, 2);
  } catch(e) {
    console.log('コメント: 投稿検索失敗:', e.message);
    return;
  }

  if (!posts.length) { console.log('コメント対象なし（1000いいね未満）'); return; }

  // 自然なコメント（プロフィールへの誘導を意識、AV色なし）
  const COMMENTS = [
    'わかりみが深すぎる😭',
    'これはバズるのわかる笑',
    'ほんとそれ🙏',
    'センスありすぎ✨',
    'こういうの好きすぎる😂',
    '深夜に見てよかった',
    '刺さりすぎて保存した',
    'なんでこんなにわかるの笑',
    'これ共感しかない',
    'ありがとうございます🙏 癒された',
  ];

  let count = 0;
  for (const post of posts) {
    const comment = COMMENTS[(SEED + count * 3) % COMMENTS.length];
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
          langs: ['ja']
        }
      }, { Authorization: `Bearer ${jwt}` });
      console.log(`コメント投稿 ✅ (${(post.likeCount||0) + (post.repostCount||0)}いいね) "${comment}"`);
      count++;
    } catch(e) {
      console.log('コメント失敗:', e.message);
    }
  }
  console.log(`コメント完了: ${count}件`);
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
            .filter(t => t && /^[A-Za-z0-9_]+$/.test(t))  // 英語のみ
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
  (item) => {
    const a = getActresses(item)[0];
    const avg = parseFloat(item.review?.average || 0);
    const cnt = parseInt(item.review?.count || 0);
    return `${a ? a + ' is insane 🔥\n\n' : ''}This one hit different\n\n${cnt > 0 ? `⭐${avg} from ${cnt.toLocaleString()} reviews` : ''}\nSample clip available 👇\n${siteUrl(item)}`;
  },
  (item) => {
    const top = rankItems.slice(0, 3);
    const lines = top.map((x, i) => `${['🥇','🥈','🥉'][i]} ${getActresses(x)[0] || 'Unknown'} — ${(x.title||'').slice(0,25)}...`).join('\n');
    return `Top 3 JAV picks right now 🎌\n\n${lines}\n\nFull list + samples:\n${SITE}`;
  },
  (item) => {
    const gs = getGenres(item).filter(g => !['ハイビジョン','独占配信'].includes(g));
    const g = gs[0] || '';
    const a = getActresses(item)[0] || '';
    return `If you're into ${g || 'JAV'}, this is the one\n\n${a}\n\nRatings don't lie 👇\n${siteUrl(item)}`;
  },
  (item) => {
    const avg = parseFloat(item.review?.average || 0);
    const cnt = parseInt(item.review?.count || 0);
    if (!avg || !cnt) return `Hidden gem 💎\n\nNot talked about enough\nBut the people who found it know\n\n${siteUrl(item)}`;
    return `${cnt.toLocaleString()} people rated this ⭐${avg}\n\nThat number says everything\n\nJAV doesn't get better than this 👇\n${siteUrl(item)}`;
  },
  (item) => {
    const a = getActresses(item)[0];
    return `Just finished watching\n\n${a ? a + ' — I was NOT ready' : 'This was NOT what I expected'}\n\nLegit top tier\n${siteUrl(item)}`;
  },
  (item) => {
    const a = getActresses(item)[0];
    return `${a ? a + ' is the reason' : 'This is the reason'} I can't sleep tonight 😭\n\nFree sample on site 👇\n${siteUrl(item)}`;
  },
];

function generateEnglishText(item) {
  const idx = SEED % EN_PATTERNS.length;
  const result = EN_PATTERNS[idx](item);
  return (result || `${item.title}\n\n${siteUrl(item)}`).trim();
}

// ===== Bluesky 英語投稿 =====
async function postBlueskyEnglish(item, auth) {
  let text = generateEnglishText(item);

  // 英語トレンドタグ取得・追加
  const trendTags = await getEnglishTrendingTags(auth.accessJwt);
  const staticTags = ['#JAV', '#NSFW', '#AdultContent', '#JapaneseAdult'];
  const allTags = [...new Set([...staticTags, ...trendTags.map(t => '#' + t)])].slice(0, 6);
  text = text + '\n\n' + allTags.join(' ');

  const facets = buildFacets(text);
  const record = {
    $type: 'app.bsky.feed.post',
    text,
    createdAt: new Date(Date.now() + 2000).toISOString(),  // 2秒ずらす
    langs: ['en'],
    facets,
  };

  // サムネイルカード
  const imgUrl = item.imageURL?.list || item.imageURL?.small || '';
  if (imgUrl) {
    try {
      const { buffer, mime } = await fetchBuffer(imgUrl);
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

  // Bluesky 投稿（必須）→ トレンドへのコメント → Misskey（オプション）
  const bskyAuth = await (async () => {
    const handle = (process.env.BSKY_HANDLE || '').trim();
    const pass   = (process.env.BSKY_APP_PASSWORD || '').trim();
    if (!handle || !pass) return null;
    return request('https://bsky.social/xrpc/com.atproto.server.createSession', { identifier: handle, password: pass });
  })();

  if (!bskyAuth) { console.error('Bluesky: 認証情報なし'); process.exit(1); }

  await postBluesky(text, item);
  await postBlueskyEnglish(item, bskyAuth)
    .catch(e => console.error('英語投稿エラー (続行):', e.message));
  await commentOnTrendingPosts(bskyAuth.accessJwt, bskyAuth.did)
    .catch(e => console.error('コメント機能エラー (続行):', e.message));
  await postMisskey(text).catch(e => console.error('Misskey エラー (続行):', e.message));
})().catch(e => { console.error('致命的エラー:', e.message); process.exit(1); });
