/* melune portfolio — site renderer
   data/site.js が window.SITE_DATA を用意し、このファイルがページを組み立てます。
   ふつうはこのファイルを編集する必要はありません。 */
(function () {
'use strict';

var HEX = /^#[0-9a-fA-F]{6}$/;

var FONTS = {
  gothic: { label: 'ゴシック体', stack: "'Zen Kaku Gothic New','Hiragino Kaku Gothic ProN','Yu Gothic',sans-serif" },
  maru: { label: '丸ゴシック体', stack: "'Zen Maru Gothic','Hiragino Maru Gothic ProN','Yu Gothic',sans-serif" },
  mincho: { label: '明朝体', stack: "'Shippori Mincho','Hiragino Mincho ProN','Yu Mincho',serif" },
  script: { label: '筆記体', stack: "'Dancing Script','Yomogi','Hiragino Maru Gothic ProN',cursive" },
  serif: { label: 'セリフ体（欧文）', stack: "'Cormorant Garamond','Shippori Mincho','Hiragino Mincho ProN',serif" },
  dot: { label: 'ドット文字', stack: "'DotGothic16','Hiragino Kaku Gothic ProN',monospace" }
};
var WEIGHTS = {
  light: { label: '細め', body: 300, head: 400 },
  normal: { label: '標準', body: 400, head: 500 },
  bold: { label: '太め', body: 500, head: 700 }
};

var PETAL = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 22C5 15 4 8 8.2 3.5 9.9 1.7 11.3 3 12 5c.7-2 2.1-3.3 3.8-1.5C20 8 19 15 12 22z"/></svg>';
var BOW = '<svg viewBox="0 0 56 28" aria-hidden="true"><path fill="currentColor" opacity=".55" d="M28 14C21 2 7 0 4 8c-3 8 9 13 24 6z"/><path fill="currentColor" opacity=".55" d="M28 14C35 2 49 0 52 8c3 8-9 13-24 6z"/><rect x="24.5" y="9.5" width="7" height="9" rx="3.5" fill="currentColor"/><path fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" d="M26 19c-1.5 3-3.5 5.5-7 8M30 19c1.5 3 3.5 5.5 7 8"/></svg>';
var PT_PROFILE = [[6, 20, 26, -20, .38], [13, 66, 16, 30, .3], [89, 14, 22, 25, .34], [93, 58, 14, -35, .28], [78, 86, 18, 10, .24], [24, 88, 12, 50, .24]];
var PT_HERO = [[9, 30, 34, -25, .55], [28, 62, 22, 20, .45], [63, 22, 40, 35, .5], [84, 60, 26, -15, .55], [47, 80, 18, 60, .4]];
var PH_RATIOS = [1.33, 0.78, 1, 1.4, 0.82, 1.2];

function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function col(v, d) { return HEX.test(v || '') ? v : d; }
function safeUrl(u) { u = String(u == null ? '' : u).trim(); return /^https?:\/\//i.test(u) ? u : ''; }
function uid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); }

function defaultState() {
  return {
    v: 1,
    texts: {
      siteName: 'melune',
      tagline: '甘く、繊細に、ときめきを描く。',
      intro: 'オリジナルキャラクターを中心に、表情や衣装、キャラクター同士の関係性まで丁寧に描いています。',
      galleryEn: 'Gallery', galleryJa: 'ギャラリー', filterAll: 'ALL',
      emptyText: '作品は準備中です。もうすこしだけお待ちください。',
      closeLabel: '閉じる',
      commissionEn: 'Commission',
      commissionBody: 'イラストのご依頼を受け付けています。\nご依頼の流れや条件は、下のボタンからご確認ください。',
      commissionButton: 'ご依頼について', commissionUrl: '',
      footer: '© 2026 melune',
      filterLabelCat: 'カテゴリー', filterLabelYear: '年', filterLabelStyle: '絵柄', filterLabelPlan: 'プラン', yearSuffix: '年',
      noMatchText: 'この条件に合う作品は、まだありません。',
      sortLabel: '並び順', sortNew: '新しい順', sortOld: '古い順',
      moreLabel: '絞り込み', clearLabel: '選択を解除',
      menuHome: 'Home', menuGallery: 'Gallery', menuCommission: 'Commission',
      commissionJa: 'ご依頼について', commissionPlanEn: 'Plan', commissionPlanJa: 'プラン', commissionApply: 'ご依頼・お問い合わせ', commissionEmpty: 'ご依頼ページは準備中です。もうすこしだけお待ちください。',
      viewAllLabel: 'もっと見る', searchPlaceholder: 'タイトル・番号・キーワードで検索', resultSuffix: '件'
    },
    activities: ['美少女イラスト制作', 'キャラクターデザイン', '創作キャラクターのビジュアル制作', 'イラストコミッション'],
    links: [],
    categories: [{ id: 'commission', name: 'ご依頼作品' }, { id: 'original', name: '自主制作' }],
    styles: [],
    plans: [{ id: 'plan-icon', name: 'アイコンイラスト' }, { id: 'plan-single', name: '一枚絵' }],
    sort: 'new', showSort: true, defaultCat: 'commission',
    commission: { intro: '', plans: [], blocks: [] },
    showMenu: true, topCat: 'commission', topCount: 6,
    protect: { noSave: true, wm: true, wmText: 'melune sample', wmColor: 'white' },
    design: { headFont: 'serif', bodyFont: 'gothic', weight: 'normal', italic: false, text: '#493843', bg: '#FFF9F8', accent: '#EBA4B7' },
    heroId: null, iconId: null, imgs: {}, works: []
  };
}
function normalizeState(raw) {
  var s = defaultState();
  if (!raw || typeof raw !== 'object') return s;
  if (raw.texts && typeof raw.texts === 'object') Object.keys(s.texts).forEach(function (k) { if (typeof raw.texts[k] === 'string') s.texts[k] = raw.texts[k]; });
  if (Array.isArray(raw.activities)) s.activities = raw.activities.filter(function (x) { return typeof x === 'string'; });
  if (Array.isArray(raw.links)) s.links = raw.links.filter(Boolean).map(function (l) { return { label: String(l.label || ''), url: String(l.url || '') }; });
  if (Array.isArray(raw.categories)) s.categories = raw.categories.filter(function (c) { return c && c.id; }).map(function (c) { return { id: String(c.id), name: String(c.name || '') }; });
  if (Array.isArray(raw.styles)) s.styles = raw.styles.filter(function (c) { return c && c.id; }).map(function (c) { return { id: String(c.id), name: String(c.name || '') }; });
  if (Array.isArray(raw.plans)) s.plans = raw.plans.filter(function (c) { return c && c.id; }).map(function (c) { return { id: String(c.id), name: String(c.name || '') }; });
  if (raw.design && typeof raw.design === 'object') {
    var d = raw.design, t = s.design;
    if (FONTS[d.headFont]) t.headFont = d.headFont;
    if (FONTS[d.bodyFont]) t.bodyFont = d.bodyFont;
    if (WEIGHTS[d.weight]) t.weight = d.weight;
    t.italic = !!d.italic;
    t.text = col(d.text, t.text); t.bg = col(d.bg, t.bg); t.accent = col(d.accent, t.accent);
  }
  s.sort = raw.sort === 'old' ? 'old' : 'new';
  s.showSort = raw.showSort !== false;
  var dc = typeof raw.defaultCat === 'string' ? raw.defaultCat : 'commission';
  s.defaultCat = (dc === 'all' || s.categories.some(function (c) { return c.id === dc; })) ? dc : 'all';
  if (raw.protect && typeof raw.protect === 'object') {
    s.protect.noSave = raw.protect.noSave !== false;
    s.protect.wm = raw.protect.wm !== false;
    if (['white', 'gray', 'pink'].indexOf(raw.protect.wmColor) >= 0) s.protect.wmColor = raw.protect.wmColor;
    if (typeof raw.protect.wmText === 'string') s.protect.wmText = raw.protect.wmText.slice(0, 40);
  }
  s.showMenu = raw.showMenu !== false;
  var tc = typeof raw.topCat === 'string' ? raw.topCat : 'commission';
  s.topCat = (tc === 'all' || s.categories.some(function (c) { return c.id === tc; })) ? tc : 'all';
  s.topCount = Math.max(1, Math.min(12, parseInt(raw.topCount, 10) || 6));
  s.heroId = raw.heroId ? String(raw.heroId) : null;
  s.iconId = raw.iconId ? String(raw.iconId) : null;
  s.imgs = {};
  if (raw.imgs && typeof raw.imgs === 'object') Object.keys(raw.imgs).forEach(function (k) {
    var m = raw.imgs[k];
    if (m && typeof m === 'object') s.imgs[k] = { w: +m.w || 0, h: +m.h || 0, file: String(m.file || '') };
  });
  s.works = Array.isArray(raw.works) ? raw.works.filter(function (w) { return w && w.id && w.imgId; }).map(function (w) {
    return { id: String(w.id), imgId: String(w.imgId), title: String(w.title || ''), desc: String(w.desc || ''), cat: String(w.cat || ''), year: /^\d{4}$/.test(String(w.year || '')) ? String(w.year) : '', style: String(w.style || ''), plan: String(w.plan || ''), no: String(w.no || '').replace(/[^0-9A-Za-z_-]/g, '').slice(0, 16), extra: Array.isArray(w.extra) ? w.extra.map(String).filter(function (x) { return /^[0-9A-Za-z_-]+$/.test(x) && x !== String(w.imgId); }) : [] };
  }) : [];
  s.commission = { intro: '', plans: [], blocks: [] };
  var rc = raw.commission;
  if (rc && typeof rc === 'object') {
    var cid = function (a) { return Array.isArray(a) ? a.map(String).filter(function (x) { return /^[0-9A-Za-z_-]+$/.test(x); }) : []; };
    if (typeof rc.intro === 'string') s.commission.intro = rc.intro;
    if (Array.isArray(rc.plans)) s.commission.plans = rc.plans.filter(function (p) { return p && p.id; }).map(function (p) {
      return { id: String(p.id), name: String(p.name || ''), mode: p.mode === 'image' ? 'image' : 'input', price: String(p.price || ''), desc: String(p.desc || ''), imgs: cid(p.imgs) };
    });
    if (Array.isArray(rc.blocks)) s.commission.blocks = rc.blocks.filter(function (b) { return b && b.id; }).map(function (b) {
      return { id: String(b.id), title: String(b.title || ''), body: String(b.body || ''), imgs: cid(b.imgs) };
    });
  }
  return s;
}
function refIds(S) {
  var out = [];
  var cm = []; S.commission.plans.concat(S.commission.blocks).forEach(function (x) { cm = cm.concat(x.imgs); });
  var ex = []; S.works.forEach(function (w) { ex = ex.concat(w.extra || []); });
  [S.heroId, S.iconId].concat(S.works.map(function (w) { return w.imgId; })).concat(ex).concat(cm).forEach(function (id) { if (id && out.indexOf(id) < 0) out.push(id); });
  return out;
}
function siteVars(S) {
  var D = S.design, W = WEIGHTS[D.weight] || WEIGHTS.normal;
  return '--ink:' + col(D.text, '#493843') + ';--bg:' + col(D.bg, '#FFF9F8') + ';--accent:' + col(D.accent, '#EBA4B7') +
    ';--f-head:' + (FONTS[D.headFont] || FONTS.serif).stack + ';--f-body:' + (FONTS[D.bodyFont] || FONTS.gothic).stack +
    ';--fw-body:' + W.body + ';--fw-head:' + W.head + ';--fst:' + (D.italic ? 'italic' : 'normal');
}
function petals(list) {
  return list.map(function (p) { return '<span class="pt" style="left:' + p[0] + '%;top:' + p[1] + '%;width:' + p[2] + 'px;height:' + p[2] + 'px;transform:rotate(' + p[3] + 'deg);opacity:' + p[4] + '">' + PETAL + '</span>'; }).join('');
}
function imgRatio(S, id) { var m = S.imgs && S.imgs[id]; return (m && m.w && m.h) ? m.h / m.w : 1.33; }

/* 画像の場所。ふだんは images フォルダ。編集ツールのプレビューでは差し替えられます。 */
function srcOf(S, id) {
  var ov = window.SITE_PREVIEW && window.SITE_PREVIEW.urls;
  if (ov && ov[id]) return ov[id];
  var m = S.imgs && S.imgs[id];
  return (m && m.file) ? (window.SITE_BASE || '') + 'images/' + encodeURIComponent(m.file) : '';
}

function startCat(S) {
  var c = S.defaultCat;
  if (c === 'all' || !S.categories.some(function (x) { return x.id === c; })) return 'all';
  return S.works.some(function (w) { return w.cat === c; }) ? c : 'all';
}

/* 作品番号（年＋連番。例：2026001）で並べます。番号のない作品は最後です。 */
function noKey(w) { var m = /^(\d{4})(\d+)$/.exec(w.no || ''); return m ? [+m[1], +m[2]] : null; }
function sortByNo(list, sort) {
  var dir = sort === 'old' ? 1 : -1;
  return list.map(function (w, i) { return { w: w, i: i }; }).sort(function (a, b) {
    var ka = noKey(a.w), kb = noKey(b.w);
    if (!ka && !kb) return a.i - b.i;
    if (!ka) return 1;
    if (!kb) return -1;
    if (ka[0] !== kb[0]) return (ka[0] - kb[0]) * dir;
    if (ka[1] !== kb[1]) return (ka[1] - kb[1]) * dir;
    return a.i - b.i;
  }).map(function (o) { return o.w; });
}

function topList(S) {
  var c = S.topCat, pool = (c === 'all' || !S.categories.some(function (x) { return x.id === c; })) ? S.works : S.works.filter(function (w) { return w.cat === c; });
  if (!pool.length) pool = S.works;
  pool = sortByNo(pool, 'new');
  return pool.slice(0, Math.max(1, Math.min(12, parseInt(S.topCount, 10) || 6)));
}

function filterGroups(S) {
  var T = S.texts, groups = [];
  if (S.categories.length) groups.push({ g: 'cat', label: T.filterLabelCat, items: S.categories.map(function (c) { return { id: c.id, name: c.name }; }) });
  var usedP = {}; S.works.forEach(function (w) { if (w.plan) usedP[w.plan] = 1; });
  var pl = S.plans.filter(function (c) { return usedP[c.id]; });
  if (pl.length) groups.push({ g: 'plan', label: T.filterLabelPlan, items: pl.map(function (c) { return { id: c.id, name: c.name }; }) });
  var ys = {}; S.works.forEach(function (w) { if (w.year) ys[w.year] = 1; });
  var yl = Object.keys(ys).sort(function (a, b) { return b - a; });
  if (yl.length) groups.push({ g: 'year', label: T.filterLabelYear, items: yl.map(function (y) { return { id: y, name: y + (T.yearSuffix || '') }; }) });
  var used = {}; S.works.forEach(function (w) { if (w.style) used[w.style] = 1; });
  var sl = S.styles.filter(function (c) { return used[c.id]; });
  if (sl.length) groups.push({ g: 'style', label: T.filterLabelStyle, items: sl.map(function (c) { return { id: c.id, name: c.name }; }) });
  var nc = S.works.filter(function (w) { return noKey(w); }).length;
  if (S.showSort && nc > 1) groups.push({ g: 'sort', label: T.sortLabel, items: [{ id: 'new', name: T.sortNew }, { id: 'old', name: T.sortOld }] });
  return groups;
}

function pageHref(from, to) { return (from === 'home' ? '' : '../') + (to === 'home' ? 'index.html' : to + '/index.html'); }
function cmImgs(ids, title, one) {
  if (!ids.length) return '';
  return '<div class="cm-imgs' + (one || ids.length === 1 ? ' one' : '') + '" data-ids="' + esc(ids.join(',')) + '" data-t="' + esc(title) + '"></div>';
}
function commissionHTML(S) {
  var T = S.texts, C = S.commission, url = safeUrl(T.commissionUrl);
  var h = '<section class="gallery gp cm" id="commission"><div class="g-head"><div class="orn" aria-hidden="true">' + BOW + '</div><h2 class="g-en">' + esc(T.commissionEn) + '</h2>' + (T.commissionJa ? '<p class="g-ja">' + esc(T.commissionJa) + '</p>' : '') + '</div>';
  if (!C.plans.length && !C.blocks.length && !C.intro) return h + '<p class="empty">' + esc(T.commissionEmpty) + '</p></section>';
  if (C.intro) h += '<p class="cm-intro">' + esc(C.intro) + '</p>';
  if (C.plans.length) {
    h += '<div class="cm-sec"><div class="g-head cm-sh"><h2 class="g-en sm">' + esc(T.commissionPlanEn) + '</h2>' + (T.commissionPlanJa ? '<p class="g-ja">' + esc(T.commissionPlanJa) + '</p>' : '') + '</div><div class="cm-plans">' +
      C.plans.map(function (p) {
        var inp = p.mode !== 'image', head = (p.name ? '<h3 class="cm-pn">' + esc(p.name) + '</h3>' : '') + (inp && p.price ? '<span class="cm-price">' + esc(p.price) + '</span>' : '');
        return '<article class="cm-plan' + (inp ? '' : ' is-image') + '">' + (head ? '<div class="cm-ph">' + head + '</div>' : '') + (inp && p.desc ? '<p class="cm-desc">' + esc(p.desc) + '</p>' : '') + cmImgs(p.imgs, p.name, !inp) + '</article>';
      }).join('') + '</div></div>';
  }
  C.blocks.forEach(function (b) {
    h += '<div class="cm-block">' + (b.title ? '<h2 class="cm-h">' + esc(b.title) + '</h2>' : '') + (b.body ? '<p class="cm-body">' + esc(b.body) + '</p>' : '') + cmImgs(b.imgs, b.title, false) + '</div>';
  });
  if (url) h += '<div class="more-wrap cm-apply"><a class="btn" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' + esc(T.commissionApply || 'ご依頼・お問い合わせ') + '</a></div>';
  return h + '</section>';
}

function siteHTML(S, page) {
  page = page === 'gallery' || page === 'commission' ? page : 'home';
  var T = S.texts, name = T.siteName || '';
  var links = S.links.filter(function (l) { return safeUrl(l.url); });
  var tags = S.activities.filter(function (a) { return a && a.trim(); });
  var cta = safeUrl(T.commissionUrl), hasCm = !!(S.commission.plans.length || S.commission.blocks.length);
  var h = '<div class="site" id="top" style="' + esc(siteVars(S)) + '">';
  if (S.showMenu) {
    var lh = T.menuHome || 'Home', lg = T.menuGallery || 'Gallery', lc = T.menuCommission || 'Commission';
    var pg = function (key, label) { return key === page ? { l: label, to: 'top' } : { l: label, href: pageHref(page, key), page: key }; };
    var items = [
      pg('home', lh), pg('gallery', lg),
      hasCm ? pg('commission', lc) : !cta ? { l: lc, soon: true } : page === 'home' ? { l: lc, to: 'commission' } : { l: lc, href: '../index.html#commission', page: 'home', hash: 'commission' }
    ];
    h += '<button type="button" class="mb" aria-expanded="false" aria-controls="mn" aria-label="メニューを開く"><span class="mb-l" aria-hidden="true"></span><span class="mb-l" aria-hidden="true"></span><span class="mb-l" aria-hidden="true"></span></button>';
    h += '<nav class="mn" id="mn" hidden aria-label="メニュー"><div class="mn-back" data-mclose></div><div class="mn-in"><div class="orn" aria-hidden="true">' + BOW + '</div><ul class="mn-list">' +
      items.map(function (it) {
        if (it.soon) return '<li><span class="mn-i is-soon" aria-disabled="true">' + esc(it.l) + '<small>準備中</small></span></li>';
        return '<li><a class="mn-i" href="' + (it.href || '#' + it.to) + '"' + (it.to ? ' data-to="' + it.to + '"' : '') + (it.page ? ' data-page="' + it.page + '"' + (it.hash ? ' data-hash="' + it.hash + '"' : '') : '') + '>' + esc(it.l) + '</a></li>';
      }).join('') + '</ul></div></nav>';
  }
  if (page === 'home') {
  h += '<div class="hero">' + (S.heroId ? '<img data-img="' + esc(S.heroId) + '" alt="' + esc(name) + 'のメインビジュアル">' : '<div class="hero-ph" aria-hidden="true">' + petals(PT_HERO) + '</div>') + '</div>';
  h += '<section class="profile"><div class="petals" aria-hidden="true">' + petals(PT_PROFILE) + '</div><div class="icon-wrap">';
  h += S.iconId ? '<img class="icon" data-img="' + esc(S.iconId) + '" alt="' + esc(name) + 'のアイコン">' : '<div class="icon icon-ph" aria-hidden="true">' + esc(Array.from(name)[0] || '') + '</div>';
  h += '</div><h1 class="name">' + esc(name) + '</h1>';
  if (T.tagline) h += '<p class="tagline">' + esc(T.tagline) + '</p>';
  h += '<div class="orn" aria-hidden="true">' + BOW + '</div>';
  if (T.intro) h += '<p class="intro">' + esc(T.intro).replace(/\n/g, '<br>') + '</p>';
  if (tags.length) h += '<ul class="tags">' + tags.map(function (a) { return '<li>' + esc(a) + '</li>'; }).join('') + '</ul>';
  if (links.length) h += '<div class="links">' + links.map(function (l) { return '<a href="' + esc(safeUrl(l.url)) + '" target="_blank" rel="noopener noreferrer">' + esc(l.label || l.url) + '</a>'; }).join('') + '</div>';
  h += '</section>';
  } else h += '<header class="gh"><a class="gh-name" href="../index.html" data-page="home">' + esc(name) + '</a></header>';
  var gHead = '<div class="g-head"><div class="orn" aria-hidden="true">' + BOW + '</div><h2 class="g-en">' + esc(T.galleryEn) + '</h2>' + (T.galleryJa ? '<p class="g-ja">' + esc(T.galleryJa) + '</p>' : '') + '</div>';
  if (page === 'home') {
    h += '<section class="gallery" id="gallery">' + gHead + '<div class="strip"></div><p class="empty" hidden>' + esc(T.emptyText) + '</p></section>';
  } else if (page === 'gallery') {
    h += '<section class="gallery gp" id="gallery">' + gHead;
    h += '<div class="search"><svg class="s-ico" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="9" cy="9" r="5.6"/><path d="M13.3 13.3 17 17"/></svg><input type="search" class="s-in" placeholder="' + esc(T.searchPlaceholder || '') + '" aria-label="' + esc(T.searchPlaceholder || '作品を検索') + '" autocomplete="off" enterkeyhint="search"><button type="button" class="s-x" hidden aria-label="入力を消す">&times;</button></div>';
  var groups = filterGroups(S), sc = startCat(S);
  var catG = groups.filter(function (g) { return g.g === 'cat'; })[0], moreG = groups.filter(function (g) { return g.g !== 'cat'; });
  if (catG || moreG.length) {
    h += '<div class="filters"><div class="f-main">';
    if (catG) {
      h += '<button type="button" class="chip' + (sc === 'all' ? ' is-on' : '') + '" data-g="cat" data-f="all" aria-pressed="' + (sc === 'all') + '">' + esc(T.filterAll) + '</button>' +
        catG.items.map(function (it) { var on = it.id === sc; return '<button type="button" class="chip' + (on ? ' is-on' : '') + '" data-g="cat" data-f="' + esc(it.id) + '" aria-pressed="' + on + '">' + esc(it.name) + '</button>'; }).join('');
    }
    if (moreG.length) h += '<button type="button" class="chip more" aria-expanded="false" aria-controls="f-more"><span class="plus" aria-hidden="true">+</span><span class="more-t">' + esc(T.moreLabel || '絞り込み') + '</span><span class="f-count" hidden></span></button>';
    h += '</div>';
    if (moreG.length) {
      h += '<div class="f-more" id="f-more" hidden>' + moreG.map(function (gr) {
        return '<div class="f-group" role="group" aria-label="' + esc(gr.label) + '"><span class="f-label">' + esc(gr.label) + '</span>' +
          gr.items.map(function (it) { var on = gr.g === 'sort' && it.id === S.sort; return '<button type="button" class="chip' + (on ? ' is-on' : '') + '" data-g="' + gr.g + '" data-f="' + esc(it.id) + '" aria-pressed="' + on + '">' + esc(it.name) + '</button>'; }).join('') + '</div>';
      }).join('') + '<button type="button" class="f-clear" hidden>' + esc(T.clearLabel || '選択を解除') + '</button></div>';
    }
    h += '</div>';
  } else h += '<div class="filters" hidden></div>';
    h += '<p class="f-result" aria-live="polite" hidden></p><div class="cols"><div class="col"></div><div class="col"></div></div><p class="empty" hidden>' + esc(T.emptyText) + '</p></section>';
  } else {
    h += commissionHTML(S);
  }
  if ((cta || hasCm) && page === 'home') h += '<section class="cta" id="commission"><div class="cta-card"><h2 class="cta-en">' + esc(T.commissionEn) + '</h2>' + (T.commissionBody ? '<p class="cta-body">' + esc(T.commissionBody) + '</p>' : '') + (hasCm ? '<a class="btn" href="commission/index.html" data-page="commission">' : '<a class="btn" href="' + esc(cta) + '" target="_blank" rel="noopener noreferrer">') + esc(T.commissionButton || '詳しく見る') + '</a></div></section>';
  h += '<footer class="foot"><span class="copy">' + esc(T.footer) + '</span></footer>';
  h += '<div class="modal" hidden role="dialog" aria-modal="true" aria-label="作品の拡大表示"><div class="m-back" data-close></div>' +
    '<figure class="m-card"><button type="button" class="m-x" data-close aria-label="' + esc(T.closeLabel || '閉じる') + '">&times;</button>' +
    '<div class="m-img"><img alt=""></div><div class="m-vars" hidden></div><figcaption class="m-cap"><div class="m-no" hidden></div><div class="m-meta"></div><h3 class="m-title"></h3><p class="m-desc"></p></figcaption></figure>' +
    '<button type="button" class="m-nav prev" aria-label="前の作品">&#8249;</button><button type="button" class="m-nav next" aria-label="次の作品">&#8250;</button></div>';
  h += '</div>';
  return h;
}

function mountSite(root, S, src, opts) {
  var page = opts && (opts.page === 'gallery' || opts.page === 'commission') ? opts.page : 'home';
  var doc = root.ownerDocument;
  root.innerHTML = siteHTML(S, page);
  Array.prototype.forEach.call(root.querySelectorAll('img[data-img]'), function (im) {
    var s = src(im.getAttribute('data-img')); if (s) im.src = s; else im.hidden = true;
  });
  var site = root.querySelector('.site');
  var mbtn = site.querySelector('.mb'), mnav = site.querySelector('.mn');
  if (mbtn && mnav) {
    var mLocked = false, mTimer = 0, reduce = !!(root.ownerDocument.defaultView && root.ownerDocument.defaultView.matchMedia && root.ownerDocument.defaultView.matchMedia('(prefers-reduced-motion: reduce)').matches);
    var openMenu = function () {
      clearTimeout(mTimer);
      mnav.hidden = false; mbtn.classList.add('is-open'); mbtn.setAttribute('aria-expanded', 'true'); mbtn.setAttribute('aria-label', 'メニューを閉じる');
      mLocked = true; root.ownerDocument.documentElement.style.overflow = 'hidden';
      (root.ownerDocument.defaultView.requestAnimationFrame || setTimeout)(function () { mnav.classList.add('is-show'); });
      var first = mnav.querySelector('a.mn-i'); if (first) first.focus();
    };
    var closeMenu = function (back) {
      if (mnav.hidden) return;
      mnav.classList.remove('is-show'); mbtn.classList.remove('is-open'); mbtn.setAttribute('aria-expanded', 'false'); mbtn.setAttribute('aria-label', 'メニューを開く');
      if (mLocked) { root.ownerDocument.documentElement.style.overflow = ''; mLocked = false; }
      mTimer = setTimeout(function () { mnav.hidden = true; }, reduce ? 0 : 240);
      if (back) mbtn.focus();
    };
    mbtn.addEventListener('click', function () { if (mnav.hidden) openMenu(); else closeMenu(true); });
    mnav.addEventListener('click', function (e) {
      var t = e.target; if (!t || !t.closest) return;
      var a = t.closest('a[data-to]');
      if (a) {
        e.preventDefault();
        var to = a.getAttribute('data-to'), el = to === 'top' ? null : site.querySelector('#' + to);
        closeMenu(false);
        var beh = reduce ? 'auto' : 'smooth';
        if (to === 'top') { var w = root.ownerDocument.defaultView; if (w) w.scrollTo({ top: 0, behavior: beh }); }
        else if (el && el.scrollIntoView) el.scrollIntoView({ behavior: beh, block: 'start' });
      } else if (t.closest('[data-mclose]')) closeMenu(true);
    });
    root.ownerDocument.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !mnav.hidden) closeMenu(true); });
  }
  if (S.protect && S.protect.noSave) {
    site.classList.add('nosave');
    Array.prototype.forEach.call(site.querySelectorAll('img'), function (im) { im.draggable = false; });
    site.addEventListener('contextmenu', function (e) { var t = e.target; if (t && t.closest && t.closest('img,.work,.m-img,.m-vars,.hero,.icon-wrap')) e.preventDefault(); });
    site.addEventListener('dragstart', function (e) { if (e.target && e.target.tagName === 'IMG') e.preventDefault(); });
  }
  var cols = Array.prototype.slice.call(site.querySelectorAll('.col'));
  var empty = site.querySelector('.empty');
  var modal = site.querySelector('.modal'), mi = modal.querySelector('.m-img img'), mm = modal.querySelector('.m-meta'), mt = modal.querySelector('.m-title'), md = modal.querySelector('.m-desc'), mv = modal.querySelector('.m-vars'), mcard = modal.querySelector('.m-card');
  var nodes = {}, filter = { cat: startCat(S), plan: [], year: [], style: [], sort: S.sort }, list = [], cur = -1, lastBtn = null, locked = false;
  var query = '', hay = {}, strip = site.querySelector('.strip'), qIn = site.querySelector('.s-in'), qX = site.querySelector('.s-x'), resEl = site.querySelector('.f-result');
  function norm(s) { var t = String(s == null ? '' : s); try { t = t.normalize('NFKC'); } catch (e) { } return t.toLowerCase(); }
  function hayOf(w) {
    if (!hay[w.id]) hay[w.id] = norm([w.no, w.title, w.desc, catName(w.cat), planName(w.plan), styleName(w.style), w.year, w.year ? w.year + (S.texts.yearSuffix || '') : ''].join(' '));
    return hay[w.id];
  }
  function matchQ(w) {
    var q = norm(query).trim(); if (!q) return true;
    var hs = hayOf(w), ts = q.split(/\s+/);
    for (var i = 0; i < ts.length; i++) if (hs.indexOf(ts[i]) < 0) return false;
    return true;
  }
  function catName(id) { for (var i = 0; i < S.categories.length; i++) if (S.categories[i].id === id) return S.categories[i].name; return ''; }
  function planName(id) { for (var i = 0; i < S.plans.length; i++) if (S.plans[i].id === id) return S.plans[i].name; return ''; }
  function styleName(id) { for (var i = 0; i < S.styles.length; i++) if (S.styles[i].id === id) return S.styles[i].name; return ''; }
  function node(w) {
    if (nodes[w.id]) return nodes[w.id];
    var n = doc.createElement('button'); n.type = 'button'; n.className = 'work'; n.setAttribute('data-id', w.id);
    n.setAttribute('aria-label', (w.title || w.no || '作品') + 'を拡大して見る' + (w.extra && w.extra.length ? '（差分' + w.extra.length + '枚）' : ''));
    var im = doc.createElement('img'); im.alt = w.title || ''; im.src = src(w.imgId) || '';
    var mt0 = S.imgs && S.imgs[w.imgId]; if (mt0 && mt0.w && mt0.h) { im.style.aspectRatio = mt0.w + '/' + mt0.h; n.style.setProperty('--r', String(mt0.w / mt0.h)); }
    n.appendChild(im);
    if (w.title || w.no) {
      var c = doc.createElement('span'); c.className = 'cap';
      if (w.no) { var cn = doc.createElement('span'); cn.className = 'no'; cn.textContent = w.no; c.appendChild(cn); }
      if (w.title) { var ct = doc.createElement('span'); ct.className = 't'; ct.textContent = w.title; c.appendChild(ct); }
      n.appendChild(c);
    }
    if (w.extra && w.extra.length) {
      var vb = doc.createElement('span'); vb.className = 'vb'; vb.setAttribute('aria-hidden', 'true');
      vb.innerHTML = '<svg viewBox="0 0 14 14" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="1.5" y="3.5" width="8" height="8" rx="1.5"/><path d="M4.5 1.5h6a2 2 0 0 1 2 2v6"/></svg>' + (w.extra.length + 1);
      n.appendChild(vb);
    }
    nodes[w.id] = n; return n;
  }
  function layoutHome() {
    strip.innerHTML = '';
    if (!S.works.length) {
      for (var i = 0; i < 6; i++) { var d = doc.createElement('div'); d.className = 'ph'; d.setAttribute('aria-hidden', 'true'); d.style.aspectRatio = String(1 / PH_RATIOS[i % PH_RATIOS.length]); d.style.setProperty('--r', String(1 / PH_RATIOS[i % PH_RATIOS.length])); d.innerHTML = '<span class="pt">' + PETAL + '</span>'; strip.appendChild(d); }
      empty.hidden = false; list = []; return;
    }
    list = topList(S); list.forEach(function (w) { strip.appendChild(node(w)); }); empty.hidden = true;
    var nx = doc.createElement('a'); nx.className = 'strip-next'; nx.href = 'gallery/index.html'; nx.setAttribute('data-page', 'gallery');
    nx.setAttribute('aria-label', S.texts.viewAllLabel || 'もっと見る'); nx.title = S.texts.viewAllLabel || 'もっと見る';
    nx.innerHTML = '<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7.5 3.5 14 10l-6.5 6.5"/></svg>';
    strip.appendChild(nx);
  }
  function layoutCommission() {
    list = [];
    Array.prototype.forEach.call(site.querySelectorAll('.cm-imgs'), function (box) {
      var ids = (box.getAttribute('data-ids') || '').split(',').filter(Boolean), t = box.getAttribute('data-t') || '';
      box.innerHTML = '';
      ids.forEach(function (iid) {
        var w = { id: 'cm' + list.length, imgId: iid, title: t, desc: '', cat: '', year: '', style: '', plan: '', no: '' };
        list.push(w); box.appendChild(node(w));
      });
    });
  }
  function layout() {
    if (page === 'commission') { layoutCommission(); return; }
    if (page === 'home') { layoutHome(); return; }
    list = S.works.filter(function (w) { return (filter.cat === 'all' || w.cat === filter.cat) && (!filter.plan.length || filter.plan.indexOf(w.plan) >= 0) && (!filter.year.length || filter.year.indexOf(w.year) >= 0) && (!filter.style.length || filter.style.indexOf(w.style) >= 0) && matchQ(w); });
    cols.forEach(function (c) { while (c.firstChild) c.removeChild(c.firstChild); });
    var hs = [0, 0];
    function put(el, r) { var k = hs[0] <= hs[1] ? 0 : 1; cols[k].appendChild(el); hs[k] += r; }
    if (!S.works.length) {
      PH_RATIOS.forEach(function (r) { var d = doc.createElement('div'); d.className = 'ph'; d.setAttribute('aria-hidden', 'true'); d.style.aspectRatio = String(1 / r); d.innerHTML = '<span class="pt">' + PETAL + '</span>'; put(d, r); });
      empty.hidden = false;
    } else {
      list = sortByNo(list, filter.sort);
      list.forEach(function (w) { put(node(w), imgRatio(S, w.imgId)); });
      empty.textContent = S.texts.noMatchText || '';
      empty.hidden = list.length > 0;
    }
    if (resEl) { resEl.hidden = !S.works.length; resEl.textContent = list.length + (S.texts.resultSuffix || ''); }
  }
  function showVar(w, k) {
    var ids = [w.imgId].concat(w.extra || []);
    k = Math.max(0, Math.min(ids.length - 1, k));
    mi.src = src(ids[k]) || ''; mi.alt = w.title || '';
    mv.hidden = ids.length < 2; mcard.classList.toggle('has-vars', ids.length > 1);
    mv.innerHTML = ids.length < 2 ? '' : ids.map(function (iid, j) {
      return '<button type="button" class="m-var' + (j === k ? ' is-on' : '') + '" data-v="' + j + '" aria-label="' + (j + 1) + '枚目を見る" aria-pressed="' + (j === k) + '"><img alt="" src="' + esc(src(iid) || '') + '"></button>';
    }).join('');
  }
  function show(i) {
    if (!list.length) return;
    cur = (i + list.length) % list.length;
    var w = list[cur];
    showVar(w, 0);
    mt.textContent = w.title || ''; mt.hidden = !w.title;
    var noEl = modal.querySelector('.m-no'); noEl.textContent = w.no ? 'No. ' + w.no : ''; noEl.hidden = !w.no;
    md.textContent = w.desc || ''; md.hidden = !w.desc;
    var metas = [catName(w.cat), planName(w.plan), w.year ? w.year + (S.texts.yearSuffix || '') : '', styleName(w.style)].filter(Boolean);
    mm.innerHTML = metas.map(function (t) { return '<span class="m-cat">' + esc(t) + '</span>'; }).join(''); mm.hidden = !metas.length;
    modal.querySelector('.m-card').scrollTop = 0;
    Array.prototype.forEach.call(modal.querySelectorAll('.m-nav'), function (b) { b.hidden = list.length < 2; });
  }
  function openM(btn) {
    lastBtn = btn;
    var id = btn.getAttribute('data-id'), i = -1;
    for (var k = 0; k < list.length; k++) if (list[k].id === id) { i = k; break; }
    if (i < 0) return;
    show(i); modal.hidden = false; locked = true; doc.documentElement.style.overflow = 'hidden';
    modal.querySelector('.m-x').focus();
  }
  function closeM() {
    if (modal.hidden) return;
    modal.hidden = true;
    if (locked) { doc.documentElement.style.overflow = ''; locked = false; }
    if (lastBtn && lastBtn.focus) lastBtn.focus();
  }
  (site.querySelector('.cols') || strip || site.querySelector('.cm')).addEventListener('click', function (e) { var b = e.target.closest ? e.target.closest('.work') : null; if (b) openM(b); });
  var moreBtn = site.querySelector('.chip.more'), morePanel = site.querySelector('.f-more'), countEl = site.querySelector('.f-count'), clearBtn = site.querySelector('.f-clear');
  function syncMore() {
    var n = filter.plan.length + filter.year.length + filter.style.length;
    if (countEl) { countEl.textContent = n; countEl.hidden = !n; }
    if (clearBtn) clearBtn.hidden = !n;
  }
  if (moreBtn) moreBtn.addEventListener('click', function () {
    var open = morePanel.hidden;
    morePanel.hidden = !open; moreBtn.classList.toggle('is-open', open); moreBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  if (clearBtn) clearBtn.addEventListener('click', function () {
    filter.plan = []; filter.year = []; filter.style = [];
    Array.prototype.forEach.call(site.querySelectorAll('.chip[data-g="plan"],.chip[data-g="year"],.chip[data-g="style"]'), function (x) { x.classList.remove('is-on'); x.setAttribute('aria-pressed', 'false'); });
    syncMore(); layout();
  });
  Array.prototype.forEach.call(site.querySelectorAll('.chip[data-g]'), function (b) {
    b.addEventListener('click', function () {
      var g = b.getAttribute('data-g'), v = b.getAttribute('data-f');
      if (g === 'plan' || g === 'year' || g === 'style') {
        var arr = filter[g], k = arr.indexOf(v), on = k < 0;
        if (on) arr.push(v); else arr.splice(k, 1);
        b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false');
      } else {
        filter[g] = v;
        Array.prototype.forEach.call(site.querySelectorAll('.chip[data-g="' + g + '"]'), function (x) { var on2 = x === b; x.classList.toggle('is-on', on2); x.setAttribute('aria-pressed', on2 ? 'true' : 'false'); });
      }
      syncMore(); layout();
    });
  });
  if (qIn) {
    qIn.addEventListener('input', function () { query = qIn.value; if (qX) qX.hidden = !query; layout(); });
    if (qX) qX.addEventListener('click', function () { qIn.value = ''; query = ''; qX.hidden = true; layout(); qIn.focus(); });
  }
  site.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[data-page]') : null, pv = window.SITE_PREVIEW;
    if (a && pv && typeof pv.go === 'function') { e.preventDefault(); pv.go(a.getAttribute('data-page'), a.getAttribute('data-hash') || ''); }
  });
  modal.addEventListener('click', function (e) {
    var vb = e.target.closest ? e.target.closest('.m-var') : null;
    if (vb && list[cur]) { showVar(list[cur], +vb.getAttribute('data-v')); return; }
    if (e.target.closest && e.target.closest('[data-close]')) closeM();
  });
  modal.querySelector('.prev').addEventListener('click', function () { show(cur - 1); });
  modal.querySelector('.next').addEventListener('click', function () { show(cur + 1); });
  doc.addEventListener('keydown', function (e) {
    if (modal.hidden) return;
    if (e.key === 'Escape') closeM();
    else if (e.key === 'ArrowRight') show(cur + 1);
    else if (e.key === 'ArrowLeft') show(cur - 1);
  });
  layout();
  return site;
}

window.MeluneSite = {
  FONTS: FONTS, WEIGHTS: WEIGHTS, HEX: HEX,
  esc: esc, col: col, safeUrl: safeUrl, uid: uid,
  defaultState: defaultState, normalizeState: normalizeState, refIds: refIds,
  siteVars: siteVars, mountSite: mountSite, srcOf: srcOf
};

/* ---- 公開ページの起動 ---- */
var root = document.getElementById('melune-root');
if (root) {
  var PV = window.SITE_PREVIEW || null;
  var pageName = (PV && PV.page) || root.getAttribute('data-page') || 'home';
  window.SITE_BASE = root.getAttribute('data-base') || '';
  var S = normalizeState(window.SITE_DATA);
  mountSite(root, S, function (id) { return srcOf(S, id); }, { page: pageName });
  try {
    var hh = ((PV && PV.hash) || (location.hash || '').replace('#', '')), he = hh ? document.getElementById(hh) : null;
    if (he && he.scrollIntoView) he.scrollIntoView();
  } catch (e) { }
  try {
    document.title = pageName === 'gallery' ? ((S.texts.galleryEn || 'Gallery') + ' | ' + (S.texts.siteName || 'melune')) : pageName === 'commission' ? ((S.texts.commissionEn || 'Commission') + ' | ' + (S.texts.siteName || 'melune')) : (S.texts.siteName || 'melune');
    document.body.style.background = col(S.design.bg, '#FFF9F8');
    var desc = document.querySelector('meta[name="description"]');
    if (desc) desc.setAttribute('content', (S.texts.tagline ? S.texts.tagline + ' ' : '') + (S.texts.intro || ''));
    var tc = document.querySelector('meta[name="theme-color"]');
    if (tc) tc.setAttribute('content', col(S.design.bg, '#FFF9F8'));
  } catch (e) { }
}
})();
