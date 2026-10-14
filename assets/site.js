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
      sortLabel: '並び順', sortManual: 'おすすめ順', sortNew: '新しい順', sortOld: '古い順',
      moreLabel: '絞り込み', clearLabel: '選択を解除'
    },
    activities: ['美少女イラスト制作', 'キャラクターデザイン', '創作キャラクターのビジュアル制作', 'イラストコミッション'],
    links: [],
    categories: [{ id: 'commission', name: 'ご依頼作品' }, { id: 'original', name: '自主制作' }],
    styles: [],
    plans: [{ id: 'plan-icon', name: 'アイコンイラスト' }, { id: 'plan-single', name: '一枚絵' }],
    sort: 'manual', showSort: true, defaultCat: 'commission',
    protect: { noSave: true, wm: true, wmText: 'melune sample' },
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
  s.sort = ['manual', 'new', 'old'].indexOf(raw.sort) >= 0 ? raw.sort : 'manual';
  s.showSort = raw.showSort !== false;
  var dc = typeof raw.defaultCat === 'string' ? raw.defaultCat : 'commission';
  s.defaultCat = (dc === 'all' || s.categories.some(function (c) { return c.id === dc; })) ? dc : 'all';
  if (raw.protect && typeof raw.protect === 'object') {
    s.protect.noSave = raw.protect.noSave !== false;
    s.protect.wm = raw.protect.wm !== false;
    if (typeof raw.protect.wmText === 'string') s.protect.wmText = raw.protect.wmText.slice(0, 40);
  }
  s.heroId = raw.heroId ? String(raw.heroId) : null;
  s.iconId = raw.iconId ? String(raw.iconId) : null;
  s.imgs = {};
  if (raw.imgs && typeof raw.imgs === 'object') Object.keys(raw.imgs).forEach(function (k) {
    var m = raw.imgs[k];
    if (m && typeof m === 'object') s.imgs[k] = { w: +m.w || 0, h: +m.h || 0, file: String(m.file || '') };
  });
  s.works = Array.isArray(raw.works) ? raw.works.filter(function (w) { return w && w.id && w.imgId; }).map(function (w) {
    return { id: String(w.id), imgId: String(w.imgId), title: String(w.title || ''), desc: String(w.desc || ''), cat: String(w.cat || ''), year: /^\d{4}$/.test(String(w.year || '')) ? String(w.year) : '', style: String(w.style || ''), plan: String(w.plan || '') };
  }) : [];
  return s;
}
function refIds(S) {
  var out = [];
  [S.heroId, S.iconId].concat(S.works.map(function (w) { return w.imgId; })).forEach(function (id) { if (id && out.indexOf(id) < 0) out.push(id); });
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
  return (m && m.file) ? 'images/' + encodeURIComponent(m.file) : '';
}

function startCat(S) {
  var c = S.defaultCat;
  if (c === 'all' || !S.categories.some(function (x) { return x.id === c; })) return 'all';
  return S.works.some(function (w) { return w.cat === c; }) ? c : 'all';
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
  var yc = Object.keys(ys).length;
  if (S.showSort && yc > 1) groups.push({ g: 'sort', label: T.sortLabel, items: [{ id: 'manual', name: T.sortManual }, { id: 'new', name: T.sortNew }, { id: 'old', name: T.sortOld }] });
  return groups;
}

function siteHTML(S) {
  var T = S.texts, name = T.siteName || '';
  var links = S.links.filter(function (l) { return safeUrl(l.url); });
  var tags = S.activities.filter(function (a) { return a && a.trim(); });
  var cta = safeUrl(T.commissionUrl);
  var h = '<div class="site" style="' + esc(siteVars(S)) + '">';
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
  h += '<section class="gallery" id="gallery"><div class="g-head"><div class="orn" aria-hidden="true">' + BOW + '</div><h2 class="g-en">' + esc(T.galleryEn) + '</h2>' + (T.galleryJa ? '<p class="g-ja">' + esc(T.galleryJa) + '</p>' : '') + '</div>';
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
  h += '<div class="cols"><div class="col"></div><div class="col"></div></div><p class="empty" hidden>' + esc(T.emptyText) + '</p></section>';
  if (cta) h += '<section class="cta"><div class="cta-card"><h2 class="cta-en">' + esc(T.commissionEn) + '</h2>' + (T.commissionBody ? '<p class="cta-body">' + esc(T.commissionBody) + '</p>' : '') + '<a class="btn" href="' + esc(cta) + '" target="_blank" rel="noopener noreferrer">' + esc(T.commissionButton || '詳しく見る') + '</a></div></section>';
  h += '<footer class="foot"><span class="copy">' + esc(T.footer) + '</span></footer>';
  h += '<div class="modal" hidden role="dialog" aria-modal="true" aria-label="作品の拡大表示"><div class="m-back" data-close></div>' +
    '<figure class="m-card"><button type="button" class="m-x" data-close aria-label="' + esc(T.closeLabel || '閉じる') + '">&times;</button>' +
    '<div class="m-img"><img alt=""></div><figcaption class="m-cap"><div class="m-meta"></div><h3 class="m-title"></h3><p class="m-desc"></p></figcaption></figure>' +
    '<button type="button" class="m-nav prev" aria-label="前の作品">&#8249;</button><button type="button" class="m-nav next" aria-label="次の作品">&#8250;</button></div>';
  h += '</div>';
  return h;
}

function mountSite(root, S, src) {
  var doc = root.ownerDocument;
  root.innerHTML = siteHTML(S);
  Array.prototype.forEach.call(root.querySelectorAll('img[data-img]'), function (im) {
    var s = src(im.getAttribute('data-img')); if (s) im.src = s; else im.hidden = true;
  });
  var site = root.querySelector('.site');
  if (S.protect && S.protect.noSave) {
    site.classList.add('nosave');
    Array.prototype.forEach.call(site.querySelectorAll('img'), function (im) { im.draggable = false; });
    site.addEventListener('contextmenu', function (e) { var t = e.target; if (t && t.closest && t.closest('img,.work,.m-img,.hero,.icon-wrap')) e.preventDefault(); });
    site.addEventListener('dragstart', function (e) { if (e.target && e.target.tagName === 'IMG') e.preventDefault(); });
  }
  var cols = Array.prototype.slice.call(site.querySelectorAll('.col'));
  var empty = site.querySelector('.empty');
  var modal = site.querySelector('.modal'), mi = modal.querySelector('.m-img img'), mm = modal.querySelector('.m-meta'), mt = modal.querySelector('.m-title'), md = modal.querySelector('.m-desc');
  var nodes = {}, filter = { cat: startCat(S), plan: [], year: [], style: [], sort: S.sort }, list = [], cur = -1, lastBtn = null, locked = false;
  function catName(id) { for (var i = 0; i < S.categories.length; i++) if (S.categories[i].id === id) return S.categories[i].name; return ''; }
  function planName(id) { for (var i = 0; i < S.plans.length; i++) if (S.plans[i].id === id) return S.plans[i].name; return ''; }
  function styleName(id) { for (var i = 0; i < S.styles.length; i++) if (S.styles[i].id === id) return S.styles[i].name; return ''; }
  function node(w) {
    if (nodes[w.id]) return nodes[w.id];
    var n = doc.createElement('button'); n.type = 'button'; n.className = 'work'; n.setAttribute('data-id', w.id);
    n.setAttribute('aria-label', (w.title || '作品') + 'を拡大して見る');
    var im = doc.createElement('img'); im.alt = w.title || ''; im.src = src(w.imgId) || ''; n.appendChild(im);
    if (w.title) { var c = doc.createElement('span'); c.className = 'cap'; c.textContent = w.title; n.appendChild(c); }
    nodes[w.id] = n; return n;
  }
  function layout() {
    list = S.works.filter(function (w) { return (filter.cat === 'all' || w.cat === filter.cat) && (!filter.plan.length || filter.plan.indexOf(w.plan) >= 0) && (!filter.year.length || filter.year.indexOf(w.year) >= 0) && (!filter.style.length || filter.style.indexOf(w.style) >= 0); });
    cols.forEach(function (c) { while (c.firstChild) c.removeChild(c.firstChild); });
    var hs = [0, 0];
    function put(el, r) { var k = hs[0] <= hs[1] ? 0 : 1; cols[k].appendChild(el); hs[k] += r; }
    if (!S.works.length) {
      PH_RATIOS.forEach(function (r) { var d = doc.createElement('div'); d.className = 'ph'; d.setAttribute('aria-hidden', 'true'); d.style.aspectRatio = String(1 / r); d.innerHTML = '<span class="pt">' + PETAL + '</span>'; put(d, r); });
      empty.hidden = false;
    } else {
      if (filter.sort !== 'manual') {
        var dir = filter.sort === 'new' ? -1 : 1;
        list = list.map(function (w, i) { return { w: w, i: i }; }).sort(function (a, b) {
          var ya = a.w.year ? +a.w.year : null, yb = b.w.year ? +b.w.year : null;
          if (ya === null && yb === null) return a.i - b.i;
          if (ya === null) return 1;
          if (yb === null) return -1;
          return ya !== yb ? (ya - yb) * dir : a.i - b.i;
        }).map(function (o) { return o.w; });
      }
      list.forEach(function (w) { put(node(w), imgRatio(S, w.imgId)); });
      empty.textContent = S.texts.noMatchText || '';
      empty.hidden = list.length > 0;
    }
  }
  function show(i) {
    if (!list.length) return;
    cur = (i + list.length) % list.length;
    var w = list[cur];
    mi.src = src(w.imgId) || ''; mi.alt = w.title || '';
    mt.textContent = w.title || ''; mt.hidden = !w.title;
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
  site.querySelector('.cols').addEventListener('click', function (e) { var b = e.target.closest ? e.target.closest('.work') : null; if (b) openM(b); });
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
  modal.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('[data-close]')) closeM(); });
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
  var S = normalizeState(window.SITE_DATA);
  mountSite(root, S, function (id) { return srcOf(S, id); });
  try {
    document.title = S.texts.siteName || 'melune';
    document.body.style.background = col(S.design.bg, '#FFF9F8');
    var desc = document.querySelector('meta[name="description"]');
    if (desc) desc.setAttribute('content', (S.texts.tagline ? S.texts.tagline + ' ' : '') + (S.texts.intro || ''));
    var tc = document.querySelector('meta[name="theme-color"]');
    if (tc) tc.setAttribute('content', col(S.design.bg, '#FFF9F8'));
  } catch (e) { }
}
})();
