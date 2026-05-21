#!/usr/bin/env node
// SNS自動投稿スクリプト（リーチ最大化版）v6
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

// ===== 投稿パターン（30種） =====
const PATTERNS = [
  (item) => { // 0: ジャンル別感情反応
    const a = getActresses(item)[0] || '';
    const gs = getGenres(item).filter(g => !['ハイビジョン','独占配信','BEST・総集編'].includes(g));
    const GR = {
      '中出し':['中出しのシーンで頭おかしくなりそうだった','中出しで乱れる子が一番えろいと思う'],
      '人妻':['人妻がここまで乱れるの…本当に反則','真面目そうな人妻がこうなるの最高にえろい'],
      '制服':['制服のままこうなるの罪すぎる','制服ってどうしてこんなにえろいんだろ'],
      '痴女':['積極的に来てくれる子に弱い','こっちを主導する子のえろさって別格'],
      '素人':['素人の子のリアルな反応がたまらない','素人感がかえって一番えろかったりする'],
      '熟女':['大人の女性のえろさって種類が違う','余裕のあるえろさって独特の魅力がある'],
      'NTR':['この展開に弱い人は覚悟して見て','見てるこっちが罪悪感覚えるくらい'],
      'コスプレ':['このコスプレのまま崩れていくのが最高','設定とえろさが噛み合いすぎてる'],
      'ハメ撮り':['ハメ撮りだと没入感が段違い','この距離感のえろさがやばすぎる'],
      'フェラ':['目線がえろすぎてどうにかなりそう','この子のフェラが頭から離れない'],
      '潮吹き':['このシーンだけで何回でも見れる','反応がリアルすぎてこっちまで',''],
      '3P':['3Pって見てると頭が沸騰する','この状況に置かれたらどうなるんだろってずっと考えてた'],
      '騎乗位':['このアングルで見るの大好き','表情と動きが全部見えるのがたまらない'],
    };
    const g = gs.find(g => GR[g]) || '';
    const [r1, r2] = GR[g] || ['このシーンの表情が特にやばかった','えろさの質が他と違う'];
    const body = rv([r1, r2], 0);
    return `${body}${a ? '\n\n' + a : ''}\n\n${reviewStr(item)}\n${siteUrl(item)}\n\n${buildTags(item)}`;
  },
  () => { // 1: ランキングTOP3
    const top = rankItems.slice(0, 3);
    if (top.length < 3) return null;
    const head = rv(['正直に言うと今月一番抜けたのはこの3本','えろさで選んだランキングを教える','個人的にやばかった作品TOP3'], 0);
    const lines = top.map((x, i) => {
      const a = getActresses(x)[0] || shortTitle(x.title, 12);
      return `${['①','②','③'][i]} ${a}${reviewStr(x) ? '\n　' + reviewStr(x) : ''}`;
    }).join('\n\n');
    return `${head}\n\n${lines}\n\n全部サンプル無料で見れる\n${SITE}\n\n#FANZA #AV #おすすめ #ランキング`;
  },
  (item) => { // 2: 女優没入
    const a = getActresses(item)[0]; if (!a) return null;
    const body = rv([
      `見てる間ずっと${a}のことしか考えられなかった\n\nこれって沼にはまってるってこと？`,
      `${a}の世界に完全に引き込まれてた\n\n気づいたら最初から見直してた`,
      `${a}を一度でも見たら他の人で満足できなくなる\n\nこれが本当に困ってる`,
    ], 0);
    return `${body}\n\n${reviewStr(item)}\n${siteUrl(item)}\n\n${buildTags(item)}`;
  },
  (item) => { // 3: 深夜告白
    const a = getActresses(item)[0] || '';
    const body = rv([
      `誰にも言えないことを深夜に言う\n\n${a ? a + 'の' : 'この'}作品が頭から離れない\n\n何回でも見てしまう`,
      `夜中だからこそ正直に言う\n\n${a || 'これ'}えろすぎて\n定期的に見返してるやつ`,
      `深夜の独り言\n\n${a ? a + 'にときめいてる自分がいる' : 'えろいの見つけてしまった'}\n\n誰かわかってくれる人いる？`,
    ], 0);
    return `${body}\n\n${reviewStr(item)}\n${siteUrl(item)}\n\n${buildTags(item, ['深夜'])}`;
  },
  (item) => { // 4: サンプルで瀕死
    const a = getActresses(item)[0] || '';
    const body = rv([
      `サンプルだけで既に限界\n\n本編どうするつもりなの`,
      `サンプル見ただけで頭おかしくなりそうだった\n\n本編見たら終わる自信がある`,
      `無料のサンプルで既にこれ\n\n本編の破壊力が怖すぎる`,
    ], 0);
    return `${a || 'これ'}\n\n${body}\n\n👇 まずサンプルだけでもいいから見て\n${siteUrl(item)}\n\n${buildTags(item)}`;
  },
  (item) => { // 5: デビュー・新人
    const a = getActresses(item)[0] || '';
    const body = rv([
      `デビューしたてなのにこのえろさは反則すぎる\n\nこれは才能だと思う`,
      `初めての作品でここまでできるの\n\nなんか悔しいくらいえろい`,
      `デビュー作でこのクオリティ\n\n最初から全力で来てる子が好きすぎる`,
    ], 0);
    return `${a ? a + ' ' : ''}デビュー作\n\n${body}\n\n${reviewStr(item)}\n${siteUrl(item)}\n\n${buildTags(item, ['新人AV女優', 'デビュー'])}`;
  },
  (item) => { // 6: 高評価の理由語り
    const avg = parseFloat(item.review?.average || 0);
    const cnt = parseInt(item.review?.count || 0);
    if (avg < 4.0 || cnt < 50) return null;
    const a = getActresses(item)[0] || '';
    const body = rv([
      `なんでこんなに評価高いのか見てみたら\n\nなるほどってなった\n\nえろさが本物だった`,
      `${cnt.toLocaleString()}人がこの点数つけた理由\n\n見たらわかった`,
      `この評価数で${avg}点\n\n嘘じゃないの実際に見てわかった`,
    ], 0);
    return `${a || shortTitle(item.title, 15)}\n\n${body}\n\n${reviewStr(item)}\n${siteUrl(item)}\n\n${buildTags(item, ['高評価', '名作'])}`;
  },
  (item) => { // 7: ジャンル×女優
    const a = getActresses(item)[0]; if (!a) return null;
    const g = getGenres(item).filter(g => !['ハイビジョン','独占配信','BEST・総集編'].includes(g))[0];
    if (!g) return null;
    const body = rv([
      `${g}×${a}の組み合わせを考えた人天才だと思う\n\nどっちも好きなのにこんな形で来るの`,
      `${a}で${g}って聞いただけで無理だったのに\n\n実際に見たらもっと無理だった`,
      `${g}が好きな人に${a}を組み合わせたらどうなるか\n\nその答えがここにある`,
    ], 0);
    return `${body}\n\n${reviewStr(item)}\n${siteUrl(item)}\n\n${buildTags(item)}`;
  },
  (item) => { // 8: 隠れた名作
    const a = getActresses(item)[0] || '';
    const body = rv([
      `あんまり話題になってないけど\n\nこれ知ってる人は絶対わかってる\n\nえろさの質が違う`,
      `大きく宣伝されてないのに\n\n見た人全員が評価してる\n\nそういう作品が一番信頼できる`,
      `話題にならないのが不思議なくらい\n\nこっそり布教してる`,
    ], 0);
    return `${a ? a + '\n\n' : ''}表に出てないけどえろい名作\n\n${body}\n\n${reviewStr(item)}\n${siteUrl(item)}\n\n${buildTags(item, ['名作', '隠れた名作'])}`;
  },
  (item) => { // 9: 身体的反応
    const a = getActresses(item)[0] || '';
    const gs = getGenres(item).filter(g => ['巨乳','美乳','スレンダー','美脚','くびれ','巨尻'].includes(g));
    const part = gs[0] || rv(['顔','体つき','雰囲気'], 0);
    const body = rv([
      `${part}を見てたら体の反応が止まらなかった\n\nこういう正直な感じがえろいと思う`,
      `${part}に視線が吸い込まれて\n\n気づいたら再生し直してた`,
      `${part}がこんなにえろいの\n\nずっと見ていられる`,
    ], 0);
    return `${a ? a + 'の' : ''}${part}\n\n${body}\n\n${reviewStr(item)}\n${siteUrl(item)}\n\n${buildTags(item)}`;
  },
  (item) => { // 10: 時間帯リアル（JST参照）
    const jst = new Date(Date.now() + 9 * 3600000);
    const h = jst.getUTCHours();
    const timeTag = h >= 0 && h <= 4 ? `${h}時に投稿してるんだけど`
      : h >= 23 ? `もう${h}時なのに`
      : h < 7 ? `朝${h}時から`
      : h < 12 ? `午前中から`
      : h < 18 ? `昼間から`
      : `夜${h - 12}時から`;
    const a = getActresses(item)[0] || '';
    const body = rv([
      `こんな時間にえろいの見てる自分を許してほしい`,
      `こんな時間に紹介するの我慢できなかった`,
      `こんな時間まで見てた`,
    ], 0);
    return `${timeTag}\n\n${body}\n\n${a || shortTitle(item.title, 20)}\n\n${reviewStr(item)}\n${siteUrl(item)}\n\n${buildTags(item, ['深夜'])}`;
  },
  (item) => { // 11: 共感フック
    const g = getGenres(item).filter(g => g.length < 8 && !['ハイビジョン','独占配信','BEST・総集編'].includes(g))[0];
    const body = rv([
      `${g ? g + 'が好きな人はもう見てると思うけど' : 'えろいの好きな人はもう見てると思うけど'}\n\nまだの人は今すぐ見て\n\nこれが正解`,
      `${g ? g + 'でハマってる人いる？' : 'えろいの探してる人いる？'}\n\nわかる人に教えたい\n\nこれが最高だと思う`,
      `${g || 'このジャンル'}好きな人と語りたいんだけど\n\nまず見てきてほしい\n\nそれから話しよう`,
    ], 0);
    return `${body}\n\n${reviewStr(item)}\n${siteUrl(item)}\n\n${buildTags(item)}`;
  },
  (item) => { // 12: 見た後余韻
    const a = getActresses(item)[0] || '';
    const body = rv([
      `見終わったあとの余韻がやばい\n\nしばらく何もできなかった\n\nこういう作品に出会えると嬉しい`,
      `見終わってからずっと頭に残ってる\n\n${a ? a + 'のことばかり考えてしまう' : 'あのシーンが頭から離れない'}`,
      `余韻があって眠れない\n\nなんか満足と物足りなさが同時にある\n\nわかる人いる？`,
    ], 0);
    return `${body}\n\n${reviewStr(item)}\n${siteUrl(item)}\n\n${buildTags(item)}`;
  },
  (item) => { // 13: もっと早く見ればよかった
    const a = getActresses(item)[0] || '';
    const body = rv([
      `なんでもっと早く見なかったんだろ\n\n${a ? a + 'の良さを知らなかったのがもったいない' : 'このえろさをずっと知らなかったのがもったいない'}`,
      `今更見たけど\n\nこれ全部知らなかったの損しすぎてた`,
      `${a ? a + 'を' : 'これを'}今まで見てなかったの後悔してる\n\nもっと早く誰かに教えてほしかった`,
    ], 0);
    return `${body}\n\n${reviewStr(item)}\n${siteUrl(item)}\n\n${buildTags(item)}`;
  },
  (item) => { // 14: リアルタイム感想
    const a = getActresses(item)[0] || '';
    const acts = rv([
      `${rv(['うわこれ','あ、これ','え、'], 0)}${rv(['やばい','えろい','無理'], 1)}\n\n思わず投稿した`,
      `見てる途中で投稿してる\n\n止まれないけど誰かに言いたかった`,
      `リアルタイムで見てるんだけど\n\nこれは我慢できなかった`,
    ], 0);
    return `${acts}\n\n${a || shortTitle(item.title, 20)}\n\n${reviewStr(item)}\n${siteUrl(item)}\n\n${buildTags(item)}`;
  },
  (item) => { // 15: データで証明
    const avg = parseFloat(item.review?.average || 0);
    const cnt = parseInt(item.review?.count || 0);
    if (!avg || !cnt) return null;
    const body = rv([
      `${cnt.toLocaleString()}人が正直に評価して${avg}点\n\nこれが全てを語ってる\n\n私が説明するより数字を見て`,
      `嘘をつかない数字がこれ\n\n${cnt.toLocaleString()}人評価で${avg}点\n\nこれを見ないのはもったいない`,
      `${avg}点\n${cnt.toLocaleString()}件のレビュー\n\nえろさは正直に数字に出る`,
    ], 0);
    return `${body}\n\n${siteUrl(item)}\n\n${buildTags(item, ['高評価'])}`;
  },
  (item) => { // 16: 週末推薦
    const a = getActresses(item)[0] || '';
    const body = rv([
      `時間のある週末に見てほしい\n\n途中で止めることたぶんできないから`,
      `週末に全部見て\n\n${a ? a + 'の世界に浸る時間を作って' : 'えろさに浸る時間を作って'}`,
      `今週末のために取っておいてた\n\nゆっくり楽しんでほしい`,
    ], 0);
    return `週末に見てほしいやつ\n\n${a || shortTitle(item.title, 20)}\n\n${body}\n\n${reviewStr(item)}\n${siteUrl(item)}\n\n${buildTags(item, ['週末'])}`;
  },
  (item) => { // 17: 表情・演技に注目
    const a = getActresses(item)[0] || '';
    const body = rv([
      `${a ? a + 'の表情が' : '表情が'}えろすぎて目線が外せなかった\n\nこういう演技できる人って本当に特別`,
      `顔の表情を追いながら見てたら\n\n止まれなくなった\n\n目が離せないえろさがある`,
      `${a ? a + 'の' : 'この'}本番中の表情\n\n演技とリアルの境目がわからなくなってくる`,
    ], 0);
    return `${body}\n\n${reviewStr(item)}\n${siteUrl(item)}\n\n${buildTags(item)}`;
  },
  (item) => { // 18: レジェンド
    const a = getActresses(item)[0]; if (!a) return null;
    const body = rv([
      `${a}のえろさは時代を超えてる\n\n何年経っても見るたびに新しい発見がある`,
      `${a}を知らない人に教えたい\n\n今見ても全然古さを感じない\n\nそれがレジェンドってこと`,
      `${a}の全盛期の作品\n\nこれを超えるものがまだ出てきてない`,
    ], 0);
    return `${body}\n\n${reviewStr(item)}\n${siteUrl(item)}\n\n${buildTags(item, ['レジェンド', '名作'])}`;
  },
  (item) => { // 19: シナリオに弱い
    const gs = getGenres(item).filter(g => !['ハイビジョン','BEST・総集編','独占配信'].includes(g));
    const gStr = gs.slice(0, 2).join('×') || 'このシチュエーション';
    const body = rv([
      `${gStr}っていうシチュエーションに弱い\n\n妄想が止まらなくなる\n\nこういうの待ってた`,
      `${gStr}の展開に心が持っていかれた\n\nシナリオが完璧すぎる`,
      `こういう設定を考えた人天才\n\n${gStr}の組み合わせがこんなにえろいとは`,
    ], 0);
    return `${body}\n\n${reviewStr(item)}\n${siteUrl(item)}\n\n${buildTags(item)}`;
  },
  (item) => { // 20: 一言の衝撃
    const a = getActresses(item)[0] || '';
    const punch = rv(['えろすぎた','やばかった','頭おかしくなった','最高だった','無理だった'], 0);
    const sub = rv(['それだけ','それに尽きる','語彙力が消えた','言葉にならない'], 1);
    return `${a ? a + '\n\n' : ''}${punch}\n\n${sub}\n\n${reviewStr(item)}\n${siteUrl(item)}\n\n${buildTags(item)}`;
  },
  (item) => { // 21: 時系列リアル
    const a = getActresses(item)[0] || '';
    const start = rv(['最初の数分で', '冒頭から', '序盤から'], 0);
    const mid = rv(['途中で一時停止して深呼吸した', '中盤で心拍数上がってた', '途中から止まれなくなってた'], 1);
    const end = rv(['見終わったあとしばらく動けなかった', '最後まで見て後悔はなかった', '全部見て満足した'], 2);
    return `${a ? a + 'を見た記録\n\n' : 'これを見た記録\n\n'}${start}引き込まれて\n${mid}\n${end}\n\n${reviewStr(item)}\n${siteUrl(item)}\n\n${buildTags(item)}`;
  },
  (item) => { // 22: 発見・共有
    const a = getActresses(item)[0] || '';
    const open = rv(['これ知ってる人いる？','これ見てる人いる？','みんな知ってた？'], 0);
    const body = rv([
      `知らなかったら今すぐ見て\n\nえろさの質が本物`,
      `まだ見てないなら絶対に見て\n\n後悔しないやつ`,
      `これを知らない人に教えたくて`,
    ], 1);
    return `${open}\n\n${a || shortTitle(item.title, 20)}\n\n${body}\n\n${reviewStr(item)}\n${siteUrl(item)}\n\n${buildTags(item)}`;
  },
  (item) => { // 23: 女優への問いかけ
    const a = getActresses(item)[0]; if (!a) return null;
    const q = rv([
      `${a}ってなんでこんなにえろいんだろ\n\n答えは本編を見ればわかる`,
      `${a}の魅力ってどこから来てるんだろ\n\n見てれば自然とわかってくる`,
      `${a}のえろさの理由がわかった気がする\n\nこれ見てたらなんとなく`,
    ], 0);
    return `${q}\n\n${reviewStr(item)}\n${siteUrl(item)}\n\n${buildTags(item)}`;
  },
  (item) => { // 24: ギャップ
    const a = getActresses(item)[0] || '';
    const gs = getGenres(item).filter(g => ['素人','制服','人妻','OL','清楚'].includes(g));
    const type = gs[0] || '普通に見えて';
    const body = rv([
      `${type}なのにこのえろさはずるい\n\nギャップって本当に最強の武器`,
      `${type}でこんなになるの\n\nギャップにやられてる自分がいる`,
      `普段の${type}な感じとのギャップが\n\nこんなにえろいとは思わなかった`,
    ], 0);
    return `${a ? a + 'の' : ''}ギャップにやられた\n\n${body}\n\n${reviewStr(item)}\n${siteUrl(item)}\n\n${buildTags(item)}`;
  },
  (item) => { // 25: 本音スタイル
    const a = getActresses(item)[0] || '';
    const body = rv([
      `正直に言う\n\n${a ? a + 'の新しい作品' : 'これ'}がえろすぎて\n\n定期的に見返してしまう`,
      `ぶっちゃけ\n\n${a || 'これ'}を知ってから\n\n他のもので満足できなくなった`,
      `本音を言うと\n\nこれが${rv(['今一番好き','マジでやばい','ずっと見れる'], 1)}\n\n誰かに言いたかった`,
    ], 0);
    return `${body}\n\n${reviewStr(item)}\n${siteUrl(item)}\n\n${buildTags(item)}`;
  },
  (item) => { // 26: センスある選択
    const a = getActresses(item)[0] || '';
    const gs = getGenres(item).filter(g => !['ハイビジョン','独占配信','BEST・総集編'].includes(g));
    const body = rv([
      `えろさに目が肥えてきたら\n\nこういう作品が好きになってくる\n\nわかってる人向け`,
      `なんとなく選んでるわけじゃない\n\nこれがえろさのわかってる人の選択`,
      `${gs[0] ? gs[0] + 'の良さがわかる人は' : 'えろさを知ってる人は'}たぶん同じものを選ぶと思う`,
    ], 0);
    return `${a ? a + '\n\n' : ''}${body}\n\n${reviewStr(item)}\n${siteUrl(item)}\n\n${buildTags(item)}`;
  },
  (item) => { // 27: 声・音への言及
    const a = getActresses(item)[0] || '';
    const body = rv([
      `${a ? a + 'の声が' : '声が'}えろすぎて\n\n目を閉じて聞いてるだけでやばかった`,
      `この${a ? a + 'の' : ''}声と喘ぎ声\n\nイヤホンで聞いたら終わる`,
      `${a ? a + 'の' : ''}声の質がえろい\n\n音だけ聞いてても全部伝わってくる`,
    ], 0);
    return `${body}\n\n${reviewStr(item)}\n${siteUrl(item)}\n\n${buildTags(item)}`;
  },
  (item) => { // 28: 連続視聴
    const a = getActresses(item)[0] || '';
    const body = rv([
      `${a ? a + 'の作品' : 'これ'}を見始めたら止まれなくて\n\n気づいたら何時間も経ってた`,
      `1本のつもりが\n\n${a ? a + 'の' : ''}作品を次々見てしまった\n\nこれは沼`,
      `見るつもりなかったのに\n\n気づいたら${a ? a + 'の全作品を' : '全部'}チェックしてた`,
    ], 0);
    return `${body}\n\n${reviewStr(item)}\n${siteUrl(item)}\n\n${buildTags(item)}`;
  },
  (item) => { // 29: シンプル推薦
    const a = getActresses(item)[0] || '';
    const g = getGenres(item).filter(g => !['ハイビジョン','独占配信'].includes(g))[0] || '';
    const body = rv([
      `見て\n\nえろいから`,
      `とにかく見て\n\n後悔しないから`,
      `これだけは見てほしい`,
    ], 0);
    return `${g ? g + 'が好きな人へ\n\n' : ''}${a || shortTitle(item.title, 20)}\n\n${body}\n\n${reviewStr(item)}\n${siteUrl(item)}\n\n${buildTags(item)}`;
  },
  (item) => { // 30: 女優スペック語り
    const a = getActresses(item)[0]; if (!a) return null;
    const gs = getGenres(item).filter(g => ['巨乳','美乳','美少女','スレンダー','ギャル','痴女','人妻','熟女'].includes(g));
    const trait = gs[0] || rv(['顔','体','色気','雰囲気'], 0);
    return `${a}がえろい理由\n\n${trait}が${rv(['最高','やばい','たまらない','完璧'], 1)}だから\n\nそれに尽きる\n\n${reviewStr(item)}\n${siteUrl(item)}\n\n${buildTags(item)}`;
  },
  (item) => { // 31: コスパ語り
    const cnt = parseInt(item.review?.count || 0);
    const body = rv([
      `${cnt > 0 ? cnt.toLocaleString() + '人が評価してるのに' : ''}サンプルが無料で見れるの\n\nまずサンプルだけでいいから見て`,
      `えろさのコストパフォーマンスがおかしい\n\nこれで損する人いないと思う`,
      `サンプル無料で本編もこの内容\n\nFANZAって${rv(['やばい','すごい','太っ腹'], 0)}な`,
    ], 0);
    return `${body}\n\n${reviewStr(item)}\n${siteUrl(item)}\n\n${buildTags(item, ['FANZA', 'おすすめ'])}`;
  },
  (item) => { // 32: 告白スタイル
    const a = getActresses(item)[0] || '';
    const body = rv([
      `告白します\n\n${a ? a + 'のことが好きすぎる' : 'これが好きすぎる'}\n\n最近ずっと見てる`,
      `認めます\n\n${a ? a + 'に' : 'これに'}完全にハマってる\n\nもう戻れない`,
      `言います\n\n${a || 'この作品'}が${rv(['えろすぎて無理','好きすぎる','最高すぎる'], 1)}\n\n誰かに言いたかった`,
    ], 0);
    return `${body}\n\n${reviewStr(item)}\n${siteUrl(item)}\n\n${buildTags(item)}`;
  },
  (item) => { // 33: 比較・最強宣言
    const g = getGenres(item).filter(g => !['ハイビジョン','独占配信','BEST・総集編'].includes(g))[0] || '';
    const body = rv([
      `色々見てきたけど\n\nこれを超えるやつまだ出会えてない`,
      `いろいろ試したけど\n\nえろさのレベルが違う`,
      `散々探し回ってたけど\n\nこれで全部解決した`,
    ], 0);
    return `${g ? g + 'ならこれ一択\n\n' : ''}${body}\n\n${reviewStr(item)}\n${siteUrl(item)}\n\n${buildTags(item)}`;
  },
  (item) => { // 34: 衝動共有
    const a = getActresses(item)[0] || '';
    return `${rv(['さっき','深夜に','今朝','週末に'], 0)}${a ? a + 'のやつ' : 'これ'}見てた\n\n${rv(['時間溶けた','寝れなかった','後悔はしてない','止まらなかった'], 1)}\n\n${reviewStr(item)}\n${siteUrl(item)}\n\n${buildTags(item)}`;
  },
  (item) => { // 35: 友達に教えるトーン
    const a = getActresses(item)[0] || '';
    const body = rv([
      `えろいの探してる人がいたら教えてあげてほしい\n\nこれ見て`,
      `友達に教えるみたいに言う\n\nこれ絶対見たほうがいい`,
      `誰かに共有したくて\n\nこれが今一番おすすめ`,
    ], 0);
    return `${body}\n\n${a || shortTitle(item.title, 20)}\n\n${reviewStr(item)}\n${siteUrl(item)}\n\n${buildTags(item)}`;
  },
  (item) => { // 36: 熱く語る
    const a = getActresses(item)[0] || '';
    const gs = getGenres(item).filter(g => !['ハイビジョン','独占配信','BEST・総集編'].includes(g));
    const body = rv([
      `${gs[0] ? gs[0] + 'がここまでえろくなれるの' : 'これがここまでえろくなれるの'}知らなかった\n\n見てから世界が変わった`,
      `なんでこんなにえろいのか語らせてほしい\n\n全部が${rv(['ちょうどいい','完璧','最高'], 1)}`,
      `${a ? a + 'のえろさを' : 'このえろさを'}もっとわかってほしい\n\n一回見たらわかるから`,
    ], 0);
    return `${body}\n\n${reviewStr(item)}\n${siteUrl(item)}\n\n${buildTags(item)}`;
  },
  (item) => { // 37: 妄想スタート
    const gs = getGenres(item).filter(g => !['ハイビジョン','独占配信','BEST・総集編'].includes(g));
    const g = gs[0] || '';
    const a = getActresses(item)[0] || '';
    const body = rv([
      `${g ? g + 'って' : 'こういうの'}妄想したことない？\n\nそれが全部入ってる作品がある`,
      `頭の中で描いてた${g || 'シチュエーション'}が\n\nそのままになってた`,
      `${a ? a + 'で' : ''}こういう展開を想像してたことがある\n\nまさにそれがあった`,
    ], 0);
    return `${body}\n\n${reviewStr(item)}\n${siteUrl(item)}\n\n${buildTags(item)}`;
  },
  (item) => { // 38: 語彙力消滅
    const a = getActresses(item)[0] || '';
    return `${a ? a + 'を見て' : 'これ見て'}語彙力なくなった\n\n${rv(['えろい','やばい','すごい'], 0)}\n\nそれしか言えない\n\n${reviewStr(item)}\n${siteUrl(item)}\n\n${buildTags(item)}`;
  },
  (item) => { // 39: 女優の魅力を一つだけ語る
    const a = getActresses(item)[0]; if (!a) return null;
    const point = rv([
      `${a}の目線がえろい\n\nカメラを見る瞬間があるんだけど\n\nそこで心臓止まりそうになる`,
      `${a}の笑い方がえろい\n\n笑顔があるシーンがたまらない`,
      `${a}の動き方がえろい\n\n全部計算してるのか本能なのかわからない\n\nどちらにしてもやばい`,
    ], 0);
    return `${point}\n\n${reviewStr(item)}\n${siteUrl(item)}\n\n${buildTags(item)}`;
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
  if (isLate)                    priority.push(10, 3);   // 深夜型・深夜告白
  if (isWeekend)                 priority.push(16);      // 週末推薦
  if (slot === 0)                priority.push(1);       // 朝はランキング
  if (isDebut && hasActress)     priority.push(5);       // デビュー
  if (avg >= 4.7 && cnt >= 200)  priority.push(6, 15);   // 高評価・データ
  if (avg >= 4.5 && cnt >= 100)  priority.push(15);      // データで証明
  if (hasBest)                   priority.push(8);       // 隠れた名作
  if (hasActress && avg >= 4.2)  priority.push(0, 2);    // ジャンル反応・女優没入
  if (hasActress)                priority.push(17, 27, 39); // 表情・声・魅力
  if (genres.length >= 2)        priority.push(7, 11);   // ジャンル×女優・共感
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
  sports_ja:   ['えー！！すごすぎる🔥', 'やばい鳥肌たった😭', 'リアルタイムで見てよかった💕', '最高の瞬間すぎて泣きそう😭', '感動して声でた🔥', 'これはテンション上がりすぎる！'],
  ent_ja:      ['センスよすぎてため息でた😭', 'これ大好きです💕', '何回でも見れるやつ', '沼りました完全に笑', 'ずっと聴いてます💕', 'これ好きな人と絶対仲良くなれる'],
  food_ja:     ['絶対おいしいやつじゃん😭💕', '食べたすぎて無理！', '真似してみます🙏', 'レシピ教えてほしいです💕', '天才が作るやつ', '今すぐ食べに行きたい'],
  emotional_ja:['わかりすぎて泣いた😭', 'これ刺さりすぎる…', 'ほんとにそれなんよ…', '深夜に見てしまった😭', '保存させてもらいました', '共感しかないんですが'],
  cute_ja:     ['可愛すぎて無理です😭💕', '癒されすぎる…ありがとう', '尊い🙏✨', '何回見ても飽きない', '元気もらえました💕', 'この投稿に感謝しかない'],
  general_ja:  ['これわかりすぎて保存した😭', 'バズるの納得すぎる', 'センスありすぎる…', '刺さりすぎてスクショした', 'なんでこんなにわかるの笑', '深夜に見てよかったやつ'],
  sports_en:   ['omg this is absolutely insane 🔥', 'no way this actually happened??', 'legendary moment i can\'t 😭', 'what a performance honestly', 'chills all over 😭🔥', 'history happening right here'],
  ent_en:      ['this is literally everything ✨', 'okay this is actually perfect', 'saving this forever i love it 💕', 'fully obsessed honestly', 'been on repeat all day', 'this is the one for real'],
  food_en:     ['this looks SO good omg 😭', 'need this in my life immediately', "okay i'm actually hungry now lol", "recipe please i'm begging 🙏", 'making this tonight for real', 'literal perfection 😭💕'],
  emotional_en:['this hit different 😭', 'why is this so accurate omg', 'needed to hear this today 💕', 'this is so real it hurts', 'not me actually tearing up 😭', 'genuinely made my whole day'],
  cute_en:     ['this is SO adorable i can\'t 😭', 'absolutely precious 💕', 'needed this today thank you 🙏', 'i cannot handle how cute this is', 'my heart is so full ✨💕', 'pure wholesome content 💕'],
  general_en:  ['this deserved way more likes honestly', 'saving this forever ✨', 'the internet really needed this today', 'okay but why does this hit so hard 😭', 'this is everything right now 💕', 'genuinely love this so much 😭'],
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

// ===== リプライ内容を文脈解釈して返信文を生成 =====
function buildReplyToFan(replyText, rootText, idx) {
  const isJa = /[ぁ-ゖァ-ヶ一-鿿]/.test(replyText);
  const pick  = (arr) => arr[idx % arr.length];
  const t     = replyText;

  if (isJa) {
    if (/エグい|えぐい/.test(t))
      return pick(['でしょ！？😍 ほんとに反則ですよね💕', 'わかります！！あのシーンが特にやばかった💕', 'えぐいって言ってもらえると嬉しいです😭💕']);
    if (/ヤバい|やばい|やばすぎ|ヤバすぎ/.test(t))
      return pick(['ですよね！！😍 見てるこっちもドキドキです💕', 'やばいよね〜😳 サンプルの時点でもう…💕', '共感してもらえて嬉しいです🥺💕']);
    if (/可愛い|かわいい|かわいすぎ|可愛すぎ/.test(t))
      return pick(['ですよね💕 笑顔がとくに好きで🥰', 'そう！！かわいすぎるんです😭', `かわいいって言ってもらえて嬉しいです💕 もっと作品見てほしい！ ${SITE}`]);
    if (/エロい|えろい|えっち|エッチ|ドスケベ/.test(t))
      return pick(['照れますね😳💕', 'そういってもらえると嬉しいです💕', 'ですよね〜…目が離せないやつ💕']);
    if (/爆乳|おっぱい|巨乳|デカい|でかい/.test(t))
      return pick(['迫力がすごすぎるんですよね😳💕', 'ほんと反則スタイルで💕', 'あれは見るしかないやつですよね💕']);
    if (/スタイル|くびれ|ボディ|細い/.test(t))
      return pick(['ですよね…スタイルよすぎて💕', '反則級のボディしてますよね💕', 'スタイルのよさが異常なんです💕']);
    if (/好き|すき|推し|ファン/.test(t))
      return `嬉しい〜！！💕 もっと作品あるのでぜひ→ ${SITE}`;
    if (/最高|さいこう/.test(t))
      return pick([`最高って言ってもらえると嬉しい😭💕 もっと見てほしいです！ ${SITE}`, 'ほんとに最高なんですよね😭💕']);
    if (/気になる|見たい|みたい|欲しい/.test(t))
      return `ぜひ見てほしいです😍💕 こちら→ ${SITE}`;
    if (/すごい|凄い|すごすぎ/.test(t))
      return pick(['ですよね😍 すごいんですよ💕', 'わかります！ほんとすごくて💕']);
    if (/笑|ｗ+/.test(t))
      return pick(['笑ってもらえて嬉しいです😂💕', '笑笑 でも本当にそう😂💕']);
    return pick([
      `コメントありがとうございます😊💕 他の作品もぜひ→ ${SITE}`,
      '見てくれてありがとうございます🙏💕',
      `嬉しいです！！ また来てください😍💕 ${SITE}`,
    ]);
  } else {
    const rt = t.toLowerCase();
    if (/omg|wtf|insane|holy|unreal|crazy/.test(rt))
      return pick(['RIGHT?? 😍 she really said no mercy 💕', 'i know!! 😳💕 i can\'t look away either', 'EXACTLY 😭💕 she\'s on another level']);
    if (/cute|adorable|pretty|gorgeous/.test(rt))
      return pick(['she really is 🥰💕', 'the cutest honestly 🥰', 'right?? her smile is everything 💕']);
    if (/hot|sexy|fire|incredible|amazing/.test(rt))
      return pick([`I KNOW 😳💕 unfair honestly → ${SITE}`, 'she really said no flaws 💕', 'that\'s exactly what i thought 💕']);
    if (/love|obsessed|fav|favorite|best/.test(rt))
      return `same honestly 💕 more of her here → ${SITE}`;
    if (/lol|lmao|haha|😂|😭/.test(rt))
      return pick(['😂💕 right though', 'lmaoo 💕 but also… correct 😳']);
    if (/want|interested|where|link|more/.test(rt))
      return `right here 👉 ${SITE} 💕`;
    return pick([
      `thanks for watching!! 💕 more here → ${SITE}`,
      'appreciate it so much!! 💕',
      `glad you liked it 😊💕 check out more → ${SITE}`,
    ]);
  }
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

  let count = 0;
  for (const notif of notifications.slice(0, 5)) {
    const replyText = notif.record?.text || '';
    const isJa     = /[ぁ-ゖァ-ヶ一-鿿]/.test(replyText);

    const parentUri = notif.uri;
    const parentCid = notif.cid;
    const rootUri   = notif.record?.reply?.root?.uri || parentUri;
    const rootCid   = notif.record?.reply?.root?.cid || parentCid;

    // 元投稿のテキストを取得して文脈に使う（失敗しても続行）
    let rootPostText = '';
    try {
      const threadRes = await getJson(
        `https://bsky.social/xrpc/app.bsky.feed.getPostThread?uri=${encodeURIComponent(rootUri)}&depth=0`,
        { Authorization: `Bearer ${jwt}` }
      );
      rootPostText = threadRes.thread?.post?.record?.text || '';
    } catch(e) { /* 文脈取得失敗は無視 */ }

    const reply = buildReplyToFan(replyText, rootPostText, SEED + count * 11);

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

// ===== Threads 投稿 =====
// 顔画像URL: https://douga-adult.com/data/faces/actress_{id}.jpg (fetch-productsで生成済み)
async function postThreads(text, imageUrl = null) {
  const token = (process.env.THREADS_TOKEN || '').trim();
  if (!token) { console.log('Threads: 認証情報なし、スキップ'); return; }

  // トークンからユーザーIDを動的取得（THREADS_USER_ID不要）
  const meRes = await getJson(`https://graph.threads.net/v1.0/me?fields=id&access_token=${token}`);
  const userId = meRes.id;
  if (!userId) throw new Error(`Threads ユーザーID取得失敗: ${JSON.stringify(meRes)}`);

  const base = `https://graph.threads.net/v1.0/${userId}`;

  // Threads: 500文字制限（超過は末尾カット）
  const threadsText = text.slice(0, 498);

  // Step 1: メディアコンテナ作成
  const containerPayload = { text: threadsText, access_token: token };
  if (imageUrl) {
    containerPayload.media_type = 'IMAGE';
    containerPayload.image_url  = imageUrl;
  } else {
    containerPayload.media_type = 'TEXT';
  }

  const containerRes = await request(`${base}/threads`, containerPayload);
  const creationId = containerRes.id;
  if (!creationId) throw new Error(`Threads コンテナ作成失敗: ${JSON.stringify(containerRes)}`);

  // Step 2: 公開（作成後1秒待機推奨）
  await new Promise(r => setTimeout(r, 1500));
  await request(`${base}/threads_publish`, { creation_id: creationId, access_token: token });
  console.log(`Threads: 投稿完了 ✅ (${imageUrl ? '画像付き' : 'テキストのみ'})`);
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

  // Threads: 女優紹介は顔クロップ画像付き、商品はテキストのみ
  const threadsImageUrl = (type === 'actress_intro' && actress?.id)
    ? `${SITE}/data/faces/actress_${actress.id}.jpg`
    : null;
  await postThreads(text, threadsImageUrl)
    .catch(e => console.error('Threads エラー (続行):', e.message));
})().catch(e => { console.error('致命的エラー:', e.message); process.exit(1); });
