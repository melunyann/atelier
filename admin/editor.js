/* melune 編集ツール（自分のパソコンで使う専用ページ）
   - 編集内容（下書き）は、このブラウザの中に自動で保存されます。
   - 「サイトに反映」を押すと、公開サイトに入れるファイル一式（ZIP）を書き出します。 */
(function () {
'use strict';

var host = document.getElementById('editor');
var M = window.MeluneSite;
if (!M) {
  host.innerHTML = '<p class="ed-boot">編集ツールを開始できませんでした。<br>フォルダの構成（site と editor が同じ場所に並んでいること）を変えていないか確認してください。</p>';
  return;
}
var esc = M.esc, uid = M.uid, FONTS = M.FONTS, WEIGHTS = M.WEIGHTS, HEX = M.HEX, refIds = M.refIds, siteVars = M.siteVars, normalizeState = M.normalizeState;
var MB = 1024 * 1024;
var FONT_HREF = 'https://fonts.googleapis.com/css2?family=Zen+Kaku+Gothic+New:wght@300;400;500;700&family=Zen+Maru+Gothic:wght@300;400;500;700&family=Shippori+Mincho:wght@400;500;700&family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,700;1,300;1,400;1,500;1,700&family=Dancing+Script:wght@400;500;700&family=Yomogi&family=DotGothic16&display=swap';

function clone(o) { return JSON.parse(JSON.stringify(o)); }
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

/* ---------- ブラウザ内の保存（IndexedDB） ---------- */
var idb = null;
function openDB() {
  return new Promise(function (res) {
    try {
      var r = indexedDB.open('melune-editor', 1);
      r.onupgradeneeded = function () { var d = r.result; d.createObjectStore('kv'); d.createObjectStore('img'); };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { res(null); };
      r.onblocked = function () { res(null); };
    } catch (e) { res(null); }
  });
}
function tx(store, mode, fn) {
  return new Promise(function (res, rej) {
    if (!idb) return rej(new Error('nodb'));
    try {
      var t = idb.transaction(store, mode), r = fn(t.objectStore(store));
      t.oncomplete = function () { res(r ? r.result : undefined); };
      t.onerror = function () { rej(t.error); };
      t.onabort = function () { rej(t.error); };
    } catch (e) { rej(e); }
  });
}
function dbGet(s, k) { return tx(s, 'readonly', function (o) { return o.get(k); }); }
function dbPut(s, k, v) { return tx(s, 'readwrite', function (o) { return o.put(v, k); }); }
function dbDel(s, k) { return tx(s, 'readwrite', function (o) { return o.delete(k); }); }
function dbKeys(s) { return tx(s, 'readonly', function (o) { return o.getAllKeys(); }); }

/* ---------- ZIP（圧縮なし）を作る ---------- */
var CRC_T = (function () { var t = [], c, n, k; for (n = 0; n < 256; n++) { c = n; for (k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c >>> 0; } return t; })();
function crc32(u8) { var c = 0xFFFFFFFF; for (var i = 0; i < u8.length; i++) c = CRC_T[(c ^ u8[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function makeZip(files) {
  var enc = new TextEncoder(), parts = [], central = [], offset = 0, now = new Date();
  var dtime = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xFFFF;
  var ddate = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xFFFF;
  files.forEach(function (f) {
    var name = enc.encode(f.name), crc = crc32(f.data), size = f.data.length;
    var lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
    lh.setUint16(10, dtime, true); lh.setUint16(12, ddate, true); lh.setUint32(14, crc, true); lh.setUint32(18, size, true); lh.setUint32(22, size, true);
    lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
    parts.push(new Uint8Array(lh.buffer), name, f.data);
    var ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
    ch.setUint16(12, dtime, true); ch.setUint16(14, ddate, true); ch.setUint32(16, crc, true); ch.setUint32(20, size, true); ch.setUint32(24, size, true);
    ch.setUint16(28, name.length, true); ch.setUint32(42, offset, true);
    central.push(new Uint8Array(ch.buffer), name);
    offset += 30 + name.length + size;
  });
  var csize = 0; central.forEach(function (c) { csize += c.length; });
  var end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, csize, true); end.setUint32(16, offset, true);
  return new Blob(parts.concat(central, [new Uint8Array(end.buffer)]), { type: 'application/zip' });
}

/* ---------- 状態 ---------- */
var S = null, pubSig = '', saving = false, queued = false, dirty = false, saveErr = false, lastSaved = 0, timer = 0;
var tab = 'profile', addCat = '', addYear = String(new Date().getFullYear()), addStyle = '', addPlan = '', armed = null, armTimer = 0, previewDoc = '', previewPage = 'home', previewHash = '', previewMode = 'pc', memOnly = false;
var blobs = {};
var baseState = null, gh = { repo: '', branch: '', dir: '', token: '' }, ghState = '';
var TABS = [['profile', 'プロフィール'], ['works', '作品'], ['commission', 'ご依頼'], ['guideline', 'ガイドライン'], ['text', '文字'], ['design', 'デザイン'], ['publish', '公開'], ['github', '接続']];

host.innerHTML =
  '<header class="ed-bar"><div class="ed-top"><div class="ed-brand">melune<small>編集ツール</small></div><div class="ed-status" id="ed-status" role="status"></div></div>' +
  '<div class="ed-actions"><button type="button" class="btn-s" data-act="save">下書きを保存</button><button type="button" class="btn-s" data-act="preview">プレビュー</button><button type="button" class="btn-p" data-act="publish">サイトに反映</button></div></header>' +
  '<p class="ed-note">最初に「接続」タブでGitHubとの接続を設定すると、「サイトに反映」だけで公開ページを更新できます。設定した人だけが公開内容を変えられます。</p>' +
  '<nav class="ed-tabs" id="ed-tabs" role="tablist"></nav><main class="ed-main" id="ed-panel"></main>' +
  '<div class="ed-busy" id="ed-busy" hidden></div><div class="ed-toast" id="ed-toast" hidden></div><div class="ed-ov" id="ed-ov" hidden></div>';
var elStatus = host.querySelector('#ed-status'), elTabs = host.querySelector('#ed-tabs'), elPanel = host.querySelector('#ed-panel'),
  elBusy = host.querySelector('#ed-busy'), elToast = host.querySelector('#ed-toast'), elOv = host.querySelector('#ed-ov');

/* ---------- 小さな道具 ---------- */
function fmtTime(t) { var d = new Date(t); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }
function setBusy(t) { elBusy.textContent = t || ''; elBusy.hidden = !t; }
var toastT = 0;
function toast(msg, bad) { elToast.textContent = msg; elToast.className = 'ed-toast' + (bad ? ' bad' : ''); elToast.hidden = false; clearTimeout(toastT); toastT = setTimeout(function () { elToast.hidden = true; }, bad ? 6000 : 2600); }
function pathGet(o, p) { return p.split('.').reduce(function (a, k) { return a && a[k]; }, o); }
function pathSet(o, p, v) { var ks = p.split('.'), last = ks.pop(), t = ks.reduce(function (a, k) { return a[k]; }, o); t[last] = v; }
function arm(btn) {
  if (armed === btn) { armed = null; clearTimeout(armTimer); return true; }
  if (armed) { armed.classList.remove('is-armed'); armed.textContent = armed.getAttribute('data-label'); }
  armed = btn; btn.setAttribute('data-label', btn.textContent); btn.textContent = 'もう一度押すと実行'; btn.classList.add('is-armed');
  clearTimeout(armTimer); armTimer = setTimeout(function () { if (armed) { armed.classList.remove('is-armed'); armed.textContent = armed.getAttribute('data-label'); armed = null; } }, 3200);
  return false;
}

/* ---------- 保存 ---------- */
function updateStatus() {
  if (!S) return;
  var diff = JSON.stringify(S) !== pubSig, h = '';
  if (saveErr) h = '<span class="bad">下書きを保存できませんでした。</span>';
  else if (saving) h = '下書きを保存中…';
  else if (dirty) h = '未保存の変更があります';
  else h = '下書き保存済み' + (lastSaved ? ' ' + fmtTime(lastSaved) : '');
  if (memOnly) h += ' <span class="bad">（このブラウザでは保存できません。書き出しは使えます）</span>';
  h += ' ／ ' + (diff ? '<b>公開ページに未反映の変更があります</b>' : '公開中の内容と同じです');
  elStatus.innerHTML = h;
}
function pruneImgs() { var keep = {}; refIds(S).forEach(function (id) { keep[id] = 1; }); Object.keys(S.imgs).forEach(function (k) { if (!keep[k]) delete S.imgs[k]; }); }
function touch() { dirty = true; updateStatus(); clearTimeout(timer); timer = setTimeout(saveDraft, 700); }
async function saveDraft() {
  if (saving) { queued = true; return; }
  saving = true; clearTimeout(timer);
  try {
    do {
      queued = false; dirty = false; pruneImgs(); updateStatus();
      if (idb) await dbPut('kv', 'draft', { json: JSON.stringify(S), savedAt: Date.now() });
      else memOnly = true;
      lastSaved = Date.now();
    } while (queued);
    saveErr = false;
  } catch (e) { dirty = true; saveErr = true; }
  saving = false; updateStatus();
}
async function flush() {
  clearTimeout(timer);
  if (saving) { queued = true; while (saving) await sleep(60); }
  else await saveDraft();
  if (saveErr) throw new Error('save');
}
document.addEventListener('visibilitychange', function () { if (document.hidden && dirty && S) saveDraft(); });

/* ---------- 画像 ---------- */
function blobToURL(b) { return URL.createObjectURL(b); }
function wmStyle(kind) {
  if (kind === 'pink') {
    var a = (S.design && HEX.test(S.design.accent || '')) ? S.design.accent : '#EBA4B7';
    var r = parseInt(a.slice(1, 3), 16), g = parseInt(a.slice(3, 5), 16), b = parseInt(a.slice(5, 7), 16);
    return { fill: 'rgba(' + r + ',' + g + ',' + b + ',.62)', stroke: 'rgba(' + Math.round(r * .62) + ',' + Math.round(g * .62) + ',' + Math.round(b * .62) + ',.16)' };
  }
  if (kind === 'gray') return { fill: 'rgba(238,234,236,.55)', stroke: 'rgba(90,80,86,.14)' };
  return { fill: 'rgba(255,255,255,.55)', stroke: 'rgba(90,70,82,.12)' };
}
function drawWatermark(ctx, w, h, text, kind) {
  var fs = Math.max(12, Math.round(Math.max(w, h) / 40));
  ctx.save();
  ctx.font = '600 ' + fs + 'px "Hiragino Kaku Gothic ProN","Yu Gothic",Arial,sans-serif';
  ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
  ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(2, fs / 7);
  var st = wmStyle(kind); ctx.strokeStyle = st.stroke; ctx.fillStyle = st.fill;
  var tw = ctx.measureText(text).width, sx = tw + fs * 3, sy = fs * 4.6, dd = Math.ceil(Math.sqrt(w * w + h * h) / 2) + sx;
  ctx.translate(w / 2, h / 2); ctx.rotate(-Math.PI / 6);
  var row = 0;
  for (var y = -dd; y <= dd; y += sy, row++) {
    for (var x = -dd + (row % 2 ? sx / 2 : 0); x <= dd; x += sx) { ctx.strokeText(text, x, y); ctx.fillText(text, x, y); }
  }
  ctx.restore();
}
async function compress(file, maxEdge, q, wm) {
  var bmp;
  try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch (e) {
    bmp = await new Promise(function (res, rej) { var u = URL.createObjectURL(file), im = new Image(); im.onload = function () { res(im); }; im.onerror = function () { rej(new Error('decode')); }; im.src = u; });
  }
  var sw = bmp.width || bmp.naturalWidth, sh = bmp.height || bmp.naturalHeight;
  var k = Math.min(1, maxEdge / Math.max(sw, sh)), w = Math.max(1, Math.round(sw * k)), h = Math.max(1, Math.round(sh * k));
  if (!wm && k === 1 && file.size < 1200 * 1024 && /^image\/(jpeg|webp|png)$/.test(file.type)) return { blob: file, w: w, h: h };
  var cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  var ctx = cv.getContext('2d'); ctx.imageSmoothingQuality = 'high'; ctx.drawImage(bmp, 0, 0, w, h);
  if (wm) drawWatermark(ctx, w, h, wm, wmKind());
  var blob = await new Promise(function (r) { cv.toBlob(r, 'image/webp', q); });
  if (!blob || blob.type !== 'image/webp') {
    ctx.globalCompositeOperation = 'destination-over'; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
    blob = await new Promise(function (r) { cv.toBlob(r, 'image/jpeg', q); });
  }
  return { blob: blob, w: w, h: h };
}
async function addImage(file, maxEdge, q, wm) {
  if (!/^image\//.test(file.type)) throw new Error('type');
  if (file.size > 80 * MB) throw new Error('big');
  var r = await compress(file, maxEdge, q, wm), id = uid();
  var ext = r.blob.type === 'image/webp' ? 'webp' : r.blob.type === 'image/png' ? 'png' : 'jpg';
  blobs[id] = { blob: r.blob, url: blobToURL(r.blob) };
  if (idb) { try { await dbPut('img', id, { blob: r.blob, type: r.blob.type }); } catch (e) { memOnly = true; } } else memOnly = true;
  S.imgs[id] = { w: r.w, h: r.h, file: 'img-' + id + '.' + ext };
  return id;
}
function wmKind() { return (S.protect && S.protect.wmColor) || 'white'; }
function wmText() { return (S.protect && S.protect.wm && S.protect.wmText) ? S.protect.wmText : ''; }
async function getBlob(id) {
  if (blobs[id]) return blobs[id].blob;
  if (idb) { try { var rec = await dbGet('img', id); if (rec && rec.blob) { blobs[id] = { blob: rec.blob, url: blobToURL(rec.blob) }; return rec.blob; } } catch (e) { } }
  return null;
}
async function urlFor(id) {
  var b = await getBlob(id);
  if (b) return blobs[id].url;
  var m = S.imgs[id];
  return (m && m.file) ? '../images/' + encodeURIComponent(m.file) : '';
}
function releaseIfUnused(id) {
  if (!id || refIds(S).indexOf(id) >= 0) return;
  delete S.imgs[id];
  if (blobs[id]) { try { URL.revokeObjectURL(blobs[id].url); } catch (e) { } delete blobs[id]; }
  if (idb) dbDel('img', id).catch(function () { });
}
async function gcImages() {
  if (!idb) return;
  try {
    var keys = await dbKeys('img'), refs = refIds(S);
    for (var i = 0; i < keys.length; i++) if (refs.indexOf(keys[i]) < 0) await dbDel('img', keys[i]);
  } catch (e) { }
}

/* ---------- 画面（パネル） ---------- */
function field(label, input, cls) { return '<label class="f' + (cls ? ' ' + cls : '') + '">' + label + input + '</label>'; }
function tin(path, label, opt) {
  opt = opt || {}; var v = pathGet(S, path) || '';
  if (opt.area) return field(label, '<textarea rows="' + (opt.rows || 3) + '" data-path="' + path + '"' + (opt.ph ? ' placeholder="' + esc(opt.ph) + '"' : '') + '>' + esc(v) + '</textarea>');
  return field(label, '<input type="' + (opt.type || 'text') + '" data-path="' + path + '" value="' + esc(v) + '"' + (opt.ph ? ' placeholder="' + esc(opt.ph) + '"' : '') + (opt.type === 'url' ? ' inputmode="url" autocomplete="off"' : '') + '>');
}
function imgBlock(kind) {
  var id = kind === 'hero' ? S.heroId : S.iconId, m = id && S.imgs[id], isHero = kind === 'hero', h = '';
  if (isHero) h += id ? '<div class="thumb-hero"><img data-load="' + id + '" alt="メイン画像"></div>' : '<div class="thumb-hero empty">画像が未設定です<br>（公開ページでは淡い色のフレームが表示されます）</div>';
  else h += id ? '<img class="thumb-icon" data-load="' + id + '" alt="プロフィールアイコン">' : '<div class="thumb-icon empty">未設定</div>';
  if (isHero && m && m.w && m.h / m.w > 0.8) h += '<p class="ed-warn">縦長に近い画像です。メイン画像は横長の画像にすると、サイト上部がきれいに収まります。</p>';
  h += '<div class="row"><label class="btn-s">' + (id ? '画像を差し替える' : '画像を選ぶ') + '<input type="file" accept="image/*" hidden data-file="' + kind + '"></label>' + (id ? '<button type="button" class="btn-d" data-act="rm-' + kind + '">削除</button>' : '') + '</div>';
  return h;
}
function panelProfile() {
  var h = '<section class="ed-card"><h2>メイン画像</h2><p class="ed-hint">サイトの一番上に、左右いっぱいの大きさで表示されます。横長（16:9〜3:1くらい）がおすすめです。</p>' + imgBlock('hero') + '</section>';
  h += '<section class="ed-card"><h2>プロフィールアイコン</h2><p class="ed-hint">丸く表示されます。正方形に近い画像だと、全体がきれいに収まります。</p>' + imgBlock('icon') + '</section>';
  h += '<section class="ed-card"><h2>名前と紹介文</h2>' + tin('texts.siteName', '活動名') + tin('texts.tagline', 'キャッチコピー') + tin('texts.intro', '紹介文', { area: 1, rows: 4 }) + '</section>';
  h += '<section class="ed-card"><h2>活動内容</h2><p class="ed-hint">1行に1つ書くと、紹介文の下にラベルとして並びます。</p>' + field('活動内容（1行1項目）', '<textarea rows="5" data-list="activities">' + esc(S.activities.join('\n')) + '</textarea>') + '</section>';
  h += '<section class="ed-card"><h2>リンク</h2><p class="ed-hint">SNSや作品ページなどのリンクです。URLを入れたものだけが表示されます。</p>';
  S.links.forEach(function (l, i) {
    h += '<div class="link-row"><input type="text" data-link="' + i + '" data-k="label" value="' + esc(l.label) + '" placeholder="表示名（例：X）" aria-label="表示名"><input type="url" inputmode="url" data-link="' + i + '" data-k="url" value="' + esc(l.url) + '" placeholder="https://..." aria-label="URL"><button type="button" class="btn-d" data-act="rm-link" data-i="' + i + '">削除</button></div>';
  });
  h += '<div class="row"><button type="button" class="btn-s" data-act="add-link">リンクを追加</button></div></section>';
  return h;
}
function catOptions(sel) {
  return '<option value=""' + (!sel ? ' selected' : '') + '>未分類</option>' + S.categories.map(function (c) { return '<option value="' + esc(c.id) + '"' + (c.id === sel ? ' selected' : '') + '>' + esc(c.name) + '</option>'; }).join('');
}
function yearOptions(sel) {
  var cy = new Date().getFullYear(), list = [];
  for (var y = cy + 1; y >= 2000; y--) list.push(String(y));
  if (sel && list.indexOf(sel) < 0) list.push(sel);
  return '<option value=""' + (!sel ? ' selected' : '') + '>未設定</option>' + list.map(function (y) { return '<option value="' + y + '"' + (y === sel ? ' selected' : '') + '>' + y + '年</option>'; }).join('');
}
function styleOptions(sel) {
  return '<option value=""' + (!sel ? ' selected' : '') + '>未設定</option>' + S.styles.map(function (c) { return '<option value="' + esc(c.id) + '"' + (c.id === sel ? ' selected' : '') + '>' + esc(c.name) + '</option>'; }).join('');
}
function planOptions(sel) {
  return '<option value=""' + (!sel ? ' selected' : '') + '>未設定</option>' + S.plans.map(function (c) { return '<option value="' + esc(c.id) + '"' + (c.id === sel ? ' selected' : '') + '>' + esc(c.name) + '</option>'; }).join('');
}
function noSeq(no, year) { if (!no || !year || no.indexOf(year) !== 0) return 0; var r = no.slice(year.length); return /^\d+$/.test(r) ? parseInt(r, 10) : 0; }
function nextNo(year) {
  if (!year) return '';
  var m = 0; S.works.forEach(function (w) { if (w.year === year) { var q = noSeq(w.no, year); if (q > m) m = q; } });
  var s = String(m + 1); while (s.length < 3) s = '0' + s;
  return year + s;
}
function fillNumbers() {
  var ch = false;
  for (var i = S.works.length - 1; i >= 0; i--) { var w = S.works[i]; if (w.year && !w.no) { w.no = nextNo(w.year); ch = true; } }
  return ch;
}
function wkThumbs(w) {
  var ex = w.extra || [];
  if (!ex.length) return '<p class="ed-hint" style="margin:4px 0">差分はありません。</p>';
  return '<div style="display:flex;flex-wrap:wrap;gap:10px;margin:8px 0">' + ex.map(function (iid, j) {
    var at = ' data-id="' + w.id + '" data-i="' + j + '"';
    return '<div style="width:92px"><div class="wk-thumb"><img data-load="' + esc(iid) + '" alt=""></div><div class="row" style="margin-top:4px;gap:2px;flex-wrap:nowrap">' +
      '<button type="button" class="btn-s" data-act="wk-img-l"' + at + ' aria-label="前へ"' + (j === 0 ? ' disabled' : '') + '>←</button>' +
      '<button type="button" class="btn-s" data-act="wk-img-r"' + at + ' aria-label="後ろへ"' + (j === ex.length - 1 ? ' disabled' : '') + '>→</button>' +
      '<button type="button" class="btn-d" data-act="wk-img-x"' + at + ' aria-label="この差分を外す">×</button></div>' +
      '<button type="button" class="btn-s" style="margin-top:4px;width:100%" data-act="wk-img-main"' + at + '>表紙にする</button></div>';
  }).join('') + '</div>';
}
function panelWorks() {
  if (!S.categories.some(function (c) { return c.id === addCat; })) addCat = S.categories.length ? S.categories[S.categories.length - 1].id : '';
  if (addPlan && !S.plans.some(function (c) { return c.id === addPlan; })) addPlan = '';
  if (addStyle && !S.styles.some(function (c) { return c.id === addStyle; })) addStyle = '';
  var h = '<section class="ed-card"><h2>作品を追加</h2><p class="ed-hint">縦横比はそのまま、長辺2000pxまでに自動で整えます。複数枚をまとめて選べます（1枚が1作品になります。差分は、追加した作品ごとの「差分画像」から足せます）。新しく追加した作品は、作品一覧の先頭（いちばん上）に入ります。作品番号は、制作した年＋3桁の連番（例：2026001）が自動で付きます。年を「未設定」にすると、番号は付きません。ここで選んだカテゴリー・プラン・年・絵柄が、追加する作品すべてに付きます（あとから1枚ずつ変えられます）。</p>' +
    '<div class="row"><label class="f" style="margin:0;min-width:140px"><span>カテゴリー</span><select class="f-in" id="add-cat">' + catOptions(addCat) + '</select></label>' +
    '<label class="f" style="margin:0;min-width:140px"><span>プラン</span><select class="f-in" id="add-plan">' + planOptions(addPlan) + '</select></label>' +
    '<label class="f" style="margin:0;min-width:110px"><span>制作した年</span><select class="f-in" id="add-year">' + yearOptions(addYear) + '</select></label>' +
    '<label class="f" style="margin:0;min-width:140px"><span>絵柄</span><select class="f-in" id="add-style">' + styleOptions(addStyle) + '</select></label>' +
    '<label class="btn-p" style="align-self:flex-end">画像を選ぶ<input type="file" accept="image/*" multiple hidden data-file="add"></label></div></section>';
  h += '<section class="ed-card"><h2>カテゴリー</h2><p class="ed-hint">公開ページの切り替えボタンになります。「ALL」は自動で先頭に付きます。</p>';
  S.categories.forEach(function (c, i) {
    h += '<div class="cat-row"><input type="text" data-cat="' + i + '" value="' + esc(c.name) + '" aria-label="カテゴリー名"><div class="row"><button type="button" class="btn-s" data-act="cat-up" data-i="' + i + '" aria-label="前へ"' + (i === 0 ? ' disabled' : '') + '>↑</button><button type="button" class="btn-s" data-act="cat-down" data-i="' + i + '" aria-label="後ろへ"' + (i === S.categories.length - 1 ? ' disabled' : '') + '>↓</button><button type="button" class="btn-d" data-act="rm-cat" data-i="' + i + '">削除</button></div></div>';
  });
  h += '<div class="row"><button type="button" class="btn-s" data-act="add-cat">カテゴリーを追加</button></div>' +
    field('最初に表示するカテゴリー', '<select data-path="defaultCat"><option value="all"' + (S.defaultCat === 'all' ? ' selected' : '') + '>ALL（すべての作品）</option>' + S.categories.map(function (c) { return '<option value="' + esc(c.id) + '"' + (c.id === S.defaultCat ? ' selected' : '') + '>' + esc(c.name) + '</option>'; }).join('') + '</select>') +
    '<p class="ed-hint" style="margin-top:6px">ここで選んだカテゴリーの作品だけが、最初に表示されます。公開ページで「ALL」を押すと、自主制作を含むすべての作品が表示されます。選んだカテゴリーに作品がまだ無いときは、ALLで表示します。</p></section>';
  h += '<section class="ed-card"><h2>プラン</h2><p class="ed-hint">ご依頼の種類の分類です（例：アイコンイラスト、一枚絵など）。公開ページでは、作品に付けたプランだけが、「＋」ボタンの中の絞り込みタグ（複数選択できます）になります。</p>';
  S.plans.forEach(function (c, i) {
    h += '<div class="cat-row"><input type="text" data-pln="' + i + '" value="' + esc(c.name) + '" aria-label="プラン名"><div class="row"><button type="button" class="btn-s" data-act="plan-up" data-i="' + i + '" aria-label="前へ"' + (i === 0 ? ' disabled' : '') + '>↑</button><button type="button" class="btn-s" data-act="plan-down" data-i="' + i + '" aria-label="後ろへ"' + (i === S.plans.length - 1 ? ' disabled' : '') + '>↓</button><button type="button" class="btn-d" data-act="rm-plan" data-i="' + i + '">削除</button></div></div>';
  });
  h += '<div class="row"><button type="button" class="btn-s" data-act="add-plan">プランを追加</button></div></section>';
  h += '<section class="ed-card"><h2>絵柄</h2><p class="ed-hint">絵柄ごとの分類です（例：ふんわり塗り、キリッと、デフォルメなど）。公開ページでは、作品に付けた絵柄だけが、「＋」ボタンの中の絞り込みタグ（複数選択できます）になります。</p>';
  S.styles.forEach(function (c, i) {
    h += '<div class="cat-row"><input type="text" data-sty="' + i + '" value="' + esc(c.name) + '" aria-label="絵柄の名前"><div class="row"><button type="button" class="btn-s" data-act="style-up" data-i="' + i + '" aria-label="前へ"' + (i === 0 ? ' disabled' : '') + '>↑</button><button type="button" class="btn-s" data-act="style-down" data-i="' + i + '" aria-label="後ろへ"' + (i === S.styles.length - 1 ? ' disabled' : '') + '>↓</button><button type="button" class="btn-d" data-act="rm-style" data-i="' + i + '">削除</button></div></div>';
  });
  h += '<div class="row"><button type="button" class="btn-s" data-act="add-style">絵柄を追加</button></div></section>';
  h += '<section class="ed-card"><h2>トップページに出す作品</h2><p class="ed-hint">トップページには、選んだカテゴリーの作品を、作品番号が新しい順（番号が大きい順）に、横並びで出します。画像の列の右端に「＞」の矢印が付き、押すと全作品ページが開きます。絞り込みと検索は、全作品ページにだけ付きます。</p>' +
    '<div class="pair">' + field('出すカテゴリー', '<select data-path="topCat"><option value="all"' + (S.topCat === 'all' ? ' selected' : '') + '>ALL（すべての作品）</option>' + S.categories.map(function (c) { return '<option value="' + esc(c.id) + '"' + (c.id === S.topCat ? ' selected' : '') + '>' + esc(c.name) + '</option>'; }).join('') + '</select>') +
    field('出す枚数（1〜12）', '<input type="number" min="1" max="12" data-path="topCount" value="' + S.topCount + '">') + '</div></section>';
  h += '<section class="ed-card"><h2>画像の保護</h2><p class="ed-hint">完全に防ぐことはできませんが、気軽な保存や持ち出し、AIの学習への利用を防ぎやすくします。</p>' +
    '<label class="chk"><input type="checkbox" data-path="protect.noSave"' + (S.protect.noSave ? ' checked' : '') + '>右クリック・長押し・ドラッグでの画像保存をできなくする</label>' +
    '<label class="chk"><input type="checkbox" data-path="protect.wm"' + (S.protect.wm ? ' checked' : '') + '>作品の画像に透かしを全体に敷き詰める</label>' +
    tin('protect.wmText', '透かしの文字') +
    field('透かしの色', '<select data-path="protect.wmColor">' + [['white', '白'], ['gray', '白に近いグレー'], ['pink', 'サイトのピンク（「デザイン」のアクセント色）']].map(function (o) { return '<option value="' + o[0] + '"' + (S.protect.wmColor === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>') +
    '<p class="ed-hint" style="margin-top:6px">透かしは、これから追加する作品、または「画像を差し替え」した作品に付きます。色を変えたときも同じです（画像に焼き込みます）。すでに追加した作品には付かないので、入れ直してください。メイン画像とアイコンには付きません。外部のサービスやAIには送りません。</p></section>';
  h += '<section class="ed-card"><h2>並び順</h2><p class="ed-hint">公開ページでの作品の並び方は、作品番号をもとにします。「新しい順」は番号が大きい順（2026002 → 2026001 → 2025002 …）、「古い順」は番号が小さい順（2025001 → 2025002 → 2026001 …）です。番号のない作品は最後になります。同じ番号の作品は、下の作品一覧の並びのままです。</p>' +
    field('最初に表示する並び順', '<select data-path="sort">' + [['new', '新しい順（番号が大きい順）'], ['old', '古い順（番号が小さい順）']].map(function (o) { return '<option value="' + o[0] + '"' + (S.sort === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>') +
    '<label class="chk"><input type="checkbox" data-path="showSort"' + (S.showSort ? ' checked' : '') + '>訪問者が並び順を切り替えられるようにする（番号の付いた作品が2つ以上あるときに表示）</label></section>';
  h += '<section class="ed-card"><h2>作品一覧（' + S.works.length + '）</h2>';
  if (!S.works.length) h += '<p class="empty-note">まだ作品がありません。上の「画像を選ぶ」から追加してください。<br>追加するまでは、公開ページに空のフレームが並びます。</p>';
  var noCount = {}; S.works.forEach(function (x) { if (x.no) noCount[x.no] = (noCount[x.no] || 0) + 1; });
  S.works.forEach(function (w, i) {
    h += '<article class="wk"><div class="wk-thumb"><img data-load="' + esc(w.imgId) + '" alt=""><span class="wk-no">' + (i + 1) + '</span></div><div class="wk-body">' +
      field('タイトル', '<input type="text" data-w="' + w.id + '" data-k="title" value="' + esc(w.title) + '" placeholder="タイトル">') +
      field('説明', '<textarea rows="3" data-w="' + w.id + '" data-k="desc" placeholder="説明">' + esc(w.desc) + '</textarea>') +
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:0 12px">' +
      field('カテゴリー', '<select data-w="' + w.id + '" data-k="cat">' + catOptions(w.cat) + '</select>') +
      field('プラン', '<select data-w="' + w.id + '" data-k="plan">' + planOptions(w.plan) + '</select>') +
      field('制作した年', '<select data-w="' + w.id + '" data-k="year">' + yearOptions(w.year) + '</select>') +
      field('絵柄', '<select data-w="' + w.id + '" data-k="style">' + styleOptions(w.style) + '</select>') +
      field('作品番号', '<input type="text" data-w="' + w.id + '" data-k="no" value="' + esc(w.no || '') + '" placeholder="年を選ぶと自動で付きます" maxlength="16" spellcheck="false">') + '</div>' +
      (w.no && noCount[w.no] > 1 ? '<p class="ed-hint" style="color:#b4415a;margin:0 0 6px">この番号は、他の作品にも付いています。番号を変えてください。</p>' : '') +
      '<div class="f"><span style="font-size:12px;color:var(--mute)">差分画像（ギャラリーでは表紙だけ並び、拡大すると切り替えて見られます）</span>' + wkThumbs(w) +
      '<label class="btn-s">差分を追加<input type="file" accept="image/*" multiple hidden data-file="work-extra" data-id="' + w.id + '"></label></div>' +
      '<div class="row"><button type="button" class="btn-s" data-act="up" data-id="' + w.id + '"' + (i === 0 ? ' disabled' : '') + '>↑ 前へ</button><button type="button" class="btn-s" data-act="down" data-id="' + w.id + '"' + (i === S.works.length - 1 ? ' disabled' : '') + '>↓ 後ろへ</button>' +
      '<label class="btn-s">画像を差し替え<input type="file" accept="image/*" hidden data-file="replace" data-id="' + w.id + '"></label><button type="button" class="btn-d" data-act="rm-work" data-id="' + w.id + '">削除</button></div></div></article>';
  });
  return h + '</section>';
}
function cmOwner(kind, id) { var arr = kind === 'plan' ? S.commission.plans : S.commission.blocks.concat(S.guideline.blocks); return arr.filter(function (x) { return x.id === id; })[0]; }
function cmThumbs(kind, o) {
  if (!o.imgs.length) return '<p class="ed-hint" style="margin:6px 0">画像はまだありません。</p>';
  return '<div style="display:flex;flex-wrap:wrap;gap:10px;margin:8px 0">' + o.imgs.map(function (iid, j) {
    var at = ' data-k="' + kind + '" data-id="' + o.id + '" data-i="' + j + '"';
    return '<div style="width:92px"><div class="wk-thumb"><img data-load="' + esc(iid) + '" alt=""></div><div class="row" style="margin-top:4px;gap:2px;flex-wrap:nowrap">' +
      '<button type="button" class="btn-s" data-act="cm-img-l"' + at + ' aria-label="前へ"' + (j === 0 ? ' disabled' : '') + '>←</button>' +
      '<button type="button" class="btn-s" data-act="cm-img-r"' + at + ' aria-label="後ろへ"' + (j === o.imgs.length - 1 ? ' disabled' : '') + '>→</button>' +
      '<button type="button" class="btn-d" data-act="cm-img-x"' + at + ' aria-label="画像を外す">×</button></div></div>';
  }).join('') + '</div>';
}
function cmCtl(kind, o, i, n) {
  return '<div class="row"><button type="button" class="btn-s" data-act="cm-' + kind + '-up" data-i="' + i + '"' + (i === 0 ? ' disabled' : '') + '>↑ 前へ</button><button type="button" class="btn-s" data-act="cm-' + kind + '-down" data-i="' + i + '"' + (i === n - 1 ? ' disabled' : '') + '>↓ 後ろへ</button>' +
    '<button type="button" class="btn-d" data-act="rm-cm-' + kind + '" data-id="' + o.id + '">削除</button></div>';
}
function gdCtl(o, i, n) {
  return '<div class="row"><button type="button" class="btn-s" data-act="gd-block-up" data-i="' + i + '"' + (i === 0 ? ' disabled' : '') + '>↑ 前へ</button><button type="button" class="btn-s" data-act="gd-block-down" data-i="' + i + '"' + (i === n - 1 ? ' disabled' : '') + '>↓ 後ろへ</button>' +
    '<button type="button" class="btn-d" data-act="rm-gd-block" data-id="' + o.id + '">削除</button></div>';
}
function panelGuideline() {
  var G = S.guideline, box = 'border:1px solid var(--line);border-radius:14px;padding:12px 14px;margin-top:12px;background:#fff';
  var h = '<section class="ed-card"><h2>ガイドラインページ</h2><p class="ed-hint">ご依頼ページとは別の、独立したページです。ご依頼の注意事項・禁止事項などを書きます。内容を入れると、メニューに「Guideline」が増え、ご依頼ページからも案内のリンクが出ます。何も入れていないあいだは、メニューにも出ません。</p>' +
    tin('guideline.intro', 'ページの説明文（いちばん上に出ます）', { area: 1, rows: 3 }) + '</section>';
  h += '<section class="ed-card"><h2>ガイドラインの項目</h2><p class="ed-hint">見出しと文章のブロックです。必要な数だけ追加できます。画像も付けられます（透かしは付きません）。上から順に並びます。</p>';
  G.blocks.forEach(function (b, i) {
    h += '<article style="' + box + '">' + field('見出し', '<input type="text" data-cb="' + b.id + '" data-k="title" value="' + esc(b.title) + '" placeholder="例：ご依頼をお受けできないもの">') +
      field('文章', '<textarea rows="6" data-cb="' + b.id + '" data-k="body" placeholder="改行はそのまま反映されます">' + esc(b.body) + '</textarea>') +
      '<div class="f"><span style="font-size:12px;color:var(--mute)">画像（任意・複数可）</span>' + cmThumbs('block', b) +
      '<label class="btn-s">画像を追加<input type="file" accept="image/*" multiple hidden data-file="cm-block" data-id="' + b.id + '"></label></div>' +
      gdCtl(b, i, G.blocks.length) + '</article>';
  });
  h += '<div class="row" style="margin-top:12px">' + ['注意事項', '禁止事項', '著作権・二次利用について', ''].map(function (t) { return '<button type="button" class="btn-s" data-act="add-gd-block" data-t="' + t + '">' + (t ? '「' + t + '」を追加' : '空のブロックを追加') + '</button>'; }).join('') + '</div></section>';
  h += '<section class="ed-card"><h2>ページの文字</h2>' + '<div class="pair">' + tin('texts.guidelineEn', '大見出し') + tin('texts.guidelineJa', '小見出し') + '</div>' + tin('texts.menuGuideline', 'メニューの項目名') + tin('texts.guidelineLink', 'ご依頼ページの案内リンクの文') + '</section>';
  return h;
}
function schedMonths() {
  var d = new Date(), out = [];
  for (var i = 0; i < 6; i++) { var x = new Date(d.getFullYear(), d.getMonth() + i, 1), mm = x.getMonth() + 1; out.push({ key: x.getFullYear() + '-' + (mm < 10 ? '0' : '') + mm, label: x.getFullYear() + '年' + mm + '月' }); }
  return out;
}
function panelCommission() {
  var C = S.commission, box = 'border:1px solid var(--line);border-radius:14px;padding:12px 14px;margin-top:12px;background:#fff';
  var h = '<section class="ed-card"><h2>ご依頼ページ</h2><p class="ed-hint">メニューの「Commission」から開く、ご依頼のページです。プランと、流れ・お支払い方法・注意事項などのブロックを入れると、メニューが「準備中」から開けるようになり、トップのご依頼セクションのボタンも、このページへ進みます。ご依頼・お問い合わせ先のURL（フォームなど）は、「文字」タブの「ご依頼セクション」に入れます。ページの下にボタンで出ます。</p>' +
    tin('commission.intro', 'ページの説明文（いちばん上に出ます）', { area: 1, rows: 4 }) + '</section>';
  h += '<section class="ed-card"><h2>受付状況（月ごと）</h2><p class="ed-hint">月ごとに「〇・△・×」を選びます。公開ページには、見た日の月から3か月分が表にして出ます（月が変わると、自動で次の月に進みます）。トップでは〇・△・×の記号、ご依頼ページでは、下の言葉で表示します。先の月も、あらかじめ入れておけます。どの月も未設定のあいだは、表は出ません。</p>' +
    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:0 12px">' + schedMonths().map(function (m) {
      return field(m.label, '<select data-sc="' + m.key + '">' + [['', '未設定'], ['o', '〇'], ['t', '△'], ['x', '×']].map(function (o) { return '<option value="' + o[0] + '"' + ((C.schedule[m.key] || '') === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>');
    }).join('') + '</div>' +
    tin('texts.scheduleLabel', '表の見出し') +
    '<div class="pair">' + tin('texts.markOpen', '〇のときの言葉（ご依頼ページ）') + tin('texts.markMaybe', '△のときの言葉（ご依頼ページ）') + '</div>' + tin('texts.markClosed', '×のときの言葉（ご依頼ページ）') + '</section>';
  h += '<section class="ed-card"><h2>現在の状況</h2><p class="ed-hint">ご依頼ページの、受付状況の表の下に出ます。数字だけ入れると、後ろに「件」が付きます。空のものは表示しません。作業中の件数は、全体でも、プランごと（下の各プランの欄）でも入れられます。両方入れても、どちらか一方でもかまいません。</p>' +
    '<div class="pair">' + tin('commission.inProgress', '現在の作業中の件数（全体）', { ph: '例：2' }) + tin('commission.done', '実績数（まとめて）', { ph: '例：35' }) + '</div>' +
    '<div class="pair">' + tin('texts.statusInProgress', '「作業中」の見出し') + tin('texts.statusDone', '「実績数」の見出し') + '</div>' + tin('texts.countSuffix', '数字の後ろに付ける文字（例：件）') + '</section>';
  h += '<section class="ed-card"><h2>プラン</h2><p class="ed-hint">プランごとに、「入力式」か「画像式」を選べます。入力式は、名前・料金・説明文・サンプル画像を入力します。画像式は、自分で作った料金表やプラン紹介の画像を、そのまま載せます（名前は空でもかまいません）。入力式のサンプル画像には、「作品」タブの透かしが付きます。画像式の画像には付きません。</p>';
  C.plans.forEach(function (p, i) {
    var inp = p.mode !== 'image';
    h += '<article style="' + box + '"><div class="pair">' + field('プランの名前', '<input type="text" data-cp="' + p.id + '" data-k="name" value="' + esc(p.name) + '" placeholder="例：アイコンイラスト">') +
      field('見せ方', '<select data-cp="' + p.id + '" data-k="mode"><option value="input"' + (inp ? ' selected' : '') + '>入力式（料金・説明文・サンプル画像）</option><option value="image"' + (!inp ? ' selected' : '') + '>画像式（作った画像をそのまま載せる）</option></select>') + '</div>' +
      (inp ? field('料金', '<input type="text" data-cp="' + p.id + '" data-k="price" value="' + esc(p.price) + '" placeholder="例：3,000円〜">') +
        field('説明文', '<textarea rows="4" data-cp="' + p.id + '" data-k="desc" placeholder="内容・納期・オプションなど">' + esc(p.desc) + '</textarea>') : '') +
      field('現在の作業中の件数（このプラン。空なら表示しません）', '<input type="text" data-cp="' + p.id + '" data-k="busy" value="' + esc(p.busy || '') + '" placeholder="例：2">') +
      '<div class="f"><span style="font-size:12px;color:var(--mute)">' + (inp ? 'サンプル画像（複数可）' : 'プランの画像（複数可。上から順に並びます）') + '</span>' + cmThumbs('plan', p) +
      '<label class="btn-s">画像を追加<input type="file" accept="image/*" multiple hidden data-file="cm-plan" data-id="' + p.id + '"></label></div>' +
      cmCtl('plan', p, i, C.plans.length) + '</article>';
  });
  h += '<div class="row"><button type="button" class="btn-s" data-act="add-cm-plan">プランを追加</button></div></section>';
  h += '<section class="ed-card"><h2>ご依頼の流れ・お支払い方法・注意事項など</h2><p class="ed-hint">見出しと文章のブロックです。必要な数だけ追加できます。各ブロックに画像も付けられます（透かしは付きません）。プランのあとに、上から順に並びます。</p>';
  C.blocks.forEach(function (b, i) {
    h += '<article style="' + box + '">' + field('見出し', '<input type="text" data-cb="' + b.id + '" data-k="title" value="' + esc(b.title) + '" placeholder="例：ご依頼の流れ">') +
      field('文章', '<textarea rows="6" data-cb="' + b.id + '" data-k="body" placeholder="改行はそのまま反映されます">' + esc(b.body) + '</textarea>') +
      '<div class="f"><span style="font-size:12px;color:var(--mute)">画像（任意・複数可）</span>' + cmThumbs('block', b) +
      '<label class="btn-s">画像を追加<input type="file" accept="image/*" multiple hidden data-file="cm-block" data-id="' + b.id + '"></label></div>' +
      cmCtl('block', b, i, C.blocks.length) + '</article>';
  });
  h += '<div class="row" style="margin-top:12px">' + ['ご依頼の流れ', 'お支払い方法', '注意事項', ''].map(function (t) { return '<button type="button" class="btn-s" data-act="add-cm-block" data-t="' + t + '">' + (t ? '「' + t + '」を追加' : '空のブロックを追加') + '</button>'; }).join('') + '</div></section>';
  h += '<section class="ed-card"><h2>各サイトへのリンク</h2><p class="ed-hint">フォームの下に、「各サイト経由でのご相談はこちらから」と、文字リンクが並びます。URLを入れたサイトだけが表示されます（https:// から始まるURL）。</p>' +
    tin('commission.sites.tsunagu', 'つなぐ のURL', { type: 'url', ph: 'https://...' }) + tin('commission.sites.artlink', 'Art link のURL', { type: 'url', ph: 'https://...' }) + tin('commission.sites.coconala', 'ココナラ のURL', { type: 'url', ph: 'https://...' }) +
    tin('texts.sitesLead', '案内の文') + '<div class="pair">' + tin('texts.siteTsunagu', 'つなぐ の表示名') + tin('texts.siteArtlink', 'Art link の表示名') + '</div>' + tin('texts.siteCoconala', 'ココナラ の表示名') + '</section>';
  var fm = C.form;
  h += '<section class="ed-card"><h2>ご依頼フォーム</h2><p class="ed-hint">ご依頼ページ下の「ご依頼・お問い合わせ」ボタンを押すと、フォームが開きます。フォームの内容を受け取る方法を選んでください。プレビューでは、送信されません（公開したページで試してください）。</p>' +
    field('受け取り方', '<select data-path="commission.form.mode">' + [['none', 'フォームを使わない（ボタンは「文字」タブのURLへ移動します）'], ['service', 'フォームサービスで受け取る（メールで届きます）'], ['mail', '送る人のメールアプリで送ってもらう']].map(function (o) { return '<option value="' + o[0] + '"' + (fm.mode === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>');
  if (fm.mode === 'service') h += tin('commission.form.endpoint', 'フォームサービスの送信先URL', { type: 'url', ph: 'https://formspree.io/f/xxxxxxxx' }) +
    '<p class="ed-hint" style="margin-top:6px">たとえば「Formspree」などのフォームサービスに登録して、フォームを1つ作ると、「https://」から始まる送信先のURLが発行されます。それをここに貼ります。届いた内容は、登録したメールアドレスに届きます。送られた内容は、そのサービスを通って届きます。無料枠は件数に上限があるので、サービスの案内を確認してください。https:// から始まるURLだけ使えます。</p>';
  if (fm.mode === 'mail') h += tin('commission.form.mailTo', '受け取るメールアドレス', { type: 'email' }) +
    '<p class="ed-hint" style="margin-top:6px">送る人が「送信する」を押すと、その人のメールアプリが開き、書いた内容が入った状態で出てきます。送るのは、その人です。そのため、メールアプリを使わない人には向きません。メールアドレスは、公開ページのデータに含まれ、誰でも見られます。</p>';
  if (fm.mode !== 'none') h += tin('texts.formTitle', 'フォームの見出し') + tin('texts.formNote', 'フォームの説明文', { area: 1, rows: 2 }) + tin('texts.formAgree', '確認チェックの文') +
    '<div class="pair">' + tin('texts.formSend', '送信ボタンの文字') + tin('texts.commissionApply', '「ご依頼」ボタンの文字') + '</div>' + tin('texts.formThanks', '送信後に出す文', { area: 1, rows: 2 }) +
    '<p class="ed-hint" style="margin-top:6px">フォームの項目は、お名前・ご連絡先・ご希望のプラン・ご依頼の内容・ご希望の納期・参考資料のURL・確認のチェックです。プランの選択肢は、上の「プラン」の名前から作られます。</p>';
  h += '</section>';
  return h;
}
function panelText() {
  var h = '<section class="ed-card"><h2>ギャラリーの文字</h2>' +
    '<div class="pair">' + tin('texts.galleryEn', '見出し（英字）') + tin('texts.galleryJa', '見出し（日本語）') + '</div>' +
    tin('texts.filterAll', '「すべて表示」ボタンの文字') + tin('texts.emptyText', '作品がないときの文', { area: 1, rows: 2 }) + tin('texts.closeLabel', '拡大表示の「閉じる」ボタン（読み上げ用）') + '</section>';
  h += '<section class="ed-card"><h2>絞り込みボタンの文字</h2><p class="ed-hint">ギャラリーの上の「＋」ボタンを開くと出る、プラン・年・絵柄・並び順の見出しです。プランや年、絵柄は、作品に付けたときだけ表示されます。</p>' +
    '<div class="pair">' + tin('texts.filterLabelPlan', 'プランの見出し') + tin('texts.filterLabelYear', '年の見出し') + '</div><div class="pair">' + tin('texts.filterLabelStyle', '絵柄の見出し') + '<div></div></div>' +
    '<div class="pair">' + tin('texts.yearSuffix', '年の後ろに付ける文字') + tin('texts.moreLabel', '「＋」ボタンの文字') + '</div>' +
    tin('texts.clearLabel', '選択解除ボタンの文字') +
    tin('texts.noMatchText', '該当する作品がないときの文') +
    tin('texts.sortLabel', '並び順の見出し') +
    '<div class="pair">' + tin('texts.sortNew', '「新しい順」の文字') + tin('texts.sortOld', '「古い順」の文字') + '</div></section>';
  h += '<section class="ed-card"><h2>トップ・全作品ページの文字</h2>' + tin('texts.viewAllLabel', 'トップの「＞」矢印の説明文（読み上げ・カーソルを乗せたときの表示）') + tin('texts.searchPlaceholder', '検索欄の案内文') + tin('texts.resultSuffix', '件数の後ろに付ける文字（例：件）') + '</section>';
  h += '<section class="ed-card"><h2>メニュー（ハンバーガーメニュー）</h2><p class="ed-hint">公開ページの右上に出る「三」のボタンの中身です。「Gallery」は今のページのギャラリーへ、「Commission」は下のご依頼セクションへ移動します。ご依頼セクションのリンク先URLが空のあいだ、「Commission」は「準備中」と表示されます。</p>' +
    '<label class="chk"><input type="checkbox" data-path="showMenu"' + (S.showMenu ? ' checked' : '') + '>右上にメニューボタンを表示する</label>' +
    '<div class="pair">' + tin('texts.menuHome', '1番目の項目（ページの先頭へ）') + tin('texts.menuGallery', '2番目の項目（ギャラリーへ）') + '</div>' + tin('texts.menuCommission', '3番目の項目（ご依頼へ）') + '</section>';
  h += '<section class="ed-card"><h2>ご依頼セクション</h2><p class="ed-hint">トップのギャラリーの下に出る、ご依頼の案内です。受付状況の表は、「ご依頼」タブで入れます。「詳細」の文字リンクは、「ご依頼」タブにプランや項目を入れると、ご依頼ページへ進みます（まだ何も入れていないあいだは、下のリンク先URLへ進みます）。ご依頼フォームを使わないときは、このURLが、ご依頼ページ下の「ご依頼・お問い合わせ」ボタンの行き先にもなります。</p>' +
    tin('texts.commissionEn', '見出し') + tin('texts.commissionBody', '説明文', { area: 1, rows: 3 }) +
    '<div class="pair">' + tin('texts.commissionButton', '文字リンクの文字（例：詳細）') + tin('texts.commissionUrl', 'リンク先URL（外部のフォームなど）', { type: 'url', ph: 'https://...' }) + '</div></section>';
  h += '<section class="ed-card"><h2>フッター</h2>' + tin('texts.footer', 'フッターの文字') + '</section>';
  h += '<p class="ed-hint" style="padding:0 6px">活動名・キャッチコピー・紹介文は「プロフィール」タブ、作品のタイトルと説明は「作品」タブで変更できます。</p>';
  return h;
}
function fontSelect(path, label) {
  var cur = pathGet(S, path);
  return field(label, '<select data-path="' + path + '">' + Object.keys(FONTS).map(function (k) { return '<option value="' + k + '"' + (k === cur ? ' selected' : '') + '>' + FONTS[k].label + '</option>'; }).join('') + '</select>');
}
function colorField(path, label) {
  var v = pathGet(S, path);
  return '<div class="f" style="margin-top:12px"><span style="font-size:12px;color:var(--mute)">' + label + '</span><div class="color-row"><input type="color" data-path="' + path + '" value="' + v.toLowerCase() + '" aria-label="' + label + '"><input type="text" data-path="' + path + '" value="' + v + '" maxlength="7" spellcheck="false" aria-label="' + label + '（コード）"></div></div>';
}
function sampleHTML() {
  return '<div class="sample" id="ed-sample" style="' + esc(siteVars(S)) + '"><div class="s-h">' + esc(S.texts.siteName) + '</div><div class="s-t">' + esc(S.texts.tagline) + '</div><p class="s-b">' + esc(S.texts.intro) + '</p><span class="s-chip">' + esc(S.activities[0] || S.texts.galleryJa) + '</span></div>';
}
function panelDesign() {
  var D = S.design;
  var h = '<section class="ed-card"><h2>文字</h2>' +
    '<div class="pair">' + fontSelect('design.headFont', '見出しのフォント') + fontSelect('design.bodyFont', '本文のフォント') + '</div>' +
    '<div class="f" style="margin-top:12px"><span style="font-size:12px;color:var(--mute)">文字の太さ</span><div class="seg" role="radiogroup" aria-label="文字の太さ">' +
    Object.keys(WEIGHTS).map(function (k) { return '<label><input type="radio" name="weight" value="' + k + '" data-path="design.weight"' + (D.weight === k ? ' checked' : '') + '>' + WEIGHTS[k].label + '</label>'; }).join('') + '</div></div>' +
    '<p class="ed-hint" style="margin-top:6px">フォントによっては、太さが変わらないものがあります。</p>' +
    '<label class="chk"><input type="checkbox" data-path="design.italic"' + (D.italic ? ' checked' : '') + '>斜体にする</label>' + sampleHTML() + '</section>';
  h += '<section class="ed-card"><h2>色</h2><div class="pair">' + colorField('design.text', '文字の色') + colorField('design.bg', '背景の色') + '</div>' + colorField('design.accent', 'アクセントの色（ラベル・ボタン・飾り）') +
    '<div class="row"><button type="button" class="btn-s" data-act="reset-colors">色を初期値に戻す</button></div></section>';
  return h;
}
function panelPublish() {
  var diff = JSON.stringify(S) !== pubSig, T = S.texts;
  var checks = [[!!S.heroId, 'メイン画像を設定した'], [!!S.iconId, 'プロフィールアイコンを設定した'], [S.works.length > 0, '作品を1枚以上追加した（現在 ' + S.works.length + ' 枚）'], [!!T.commissionUrl.trim(), 'ご依頼ボタンのリンク先を入れた（任意）']];
  var h = '<section class="ed-card"><h2>公開の状態</h2><p>' + (diff ? '下書きに、公開ページへ未反映の変更があります。' : '下書きは公開中の内容と同じです。') + '</p>' +
    '<p class="ed-hint" style="margin-top:6px">「サイトに反映」を押すまで、公開ページは変わりません。押す前に「プレビュー」でPC表示とスマホ表示を確認できます。反映から公開ページに出るまで、1〜2分かかることがあります。</p>' +
    (ghReady() ? '' : '<p class="ed-warn">まだGitHubと接続していません。先に「接続」タブで設定してください（最初の1回だけ）。</p>') +
    '<div class="row"><button type="button" class="btn-s" data-act="preview">プレビュー</button><button type="button" class="btn-p" data-act="publish">サイトに反映</button></div></section>';
  h += '<section class="ed-card"><h2>公開前チェック</h2><ul class="checks">' + checks.map(function (c) { return '<li class="' + (c[0] ? 'ok' : '') + '">' + c[1] + '</li>'; }).join('') + '</ul></section>';
  h += '<section class="ed-card"><h2>ZIPで書き出す（予備）</h2><p class="ed-hint">GitHubと接続せず、自分で site フォルダにコピーして更新したいときの方法です。ZIPの中の data と images を site フォルダに上書きコピーしてください。</p><div class="row"><button type="button" class="btn-s" data-act="zip">ZIPを書き出す</button></div></section>';
  h += '<section class="ed-card"><h2>下書きを破棄</h2><p class="ed-hint">下書きの変更をすべて捨てて、公開中の内容に戻します。</p><div class="row"><button type="button" class="btn-d" data-act="discard">下書きを公開中の内容に戻す</button></div></section>';
  return h;
}
function renderTabs() { elTabs.innerHTML = TABS.map(function (t) { return '<button type="button" role="tab" data-tab="' + t[0] + '" aria-selected="' + (t[0] === tab ? 'true' : 'false') + '">' + t[1] + '</button>'; }).join(''); }
function renderPanel() {
  var fn = { profile: panelProfile, works: panelWorks, commission: panelCommission, guideline: panelGuideline, text: panelText, design: panelDesign, publish: panelPublish, github: panelGithub }[tab];
  elPanel.innerHTML = fn(); hydrate();
}
function hydrate() {
  Array.prototype.forEach.call(elPanel.querySelectorAll('img[data-load]'), function (im) {
    urlFor(im.getAttribute('data-load')).then(function (u) { if (u && im.isConnected) im.src = u; });
  });
}
function updateSample() { var el = host.querySelector('#ed-sample'); if (el) el.outerHTML = sampleHTML(); }

/* ---------- 操作 ---------- */
async function handleFiles(kind, files, id, input) {
  var arr = Array.prototype.slice.call(files || []);
  if (input) input.value = '';
  if (!arr.length) return;
  function why(e) { return e && e.message === 'type' ? '画像ファイルではありません。' : e && e.message === 'big' ? 'ファイルが大きすぎます。' : '読み込めない形式かもしれません。'; }
  try {
    if (kind === 'work-extra') {
      var wx = S.works.filter(function (x) { return x.id === id; })[0], okW = 0;
      if (wx) {
        wx.extra = wx.extra || [];
        for (var xi = 0; xi < arr.length; xi++) {
          setBusy('差分を読み込み中… (' + (xi + 1) + '/' + arr.length + ')');
          try { var xid = await addImage(arr[xi], 2000, 0.88, wmText()); wx.extra.push(xid); okW++; touch(); }
          catch (e) { toast('「' + arr[xi].name + '」を追加できませんでした。' + why(e), true); }
        }
        if (okW) toast(okW + '枚の差分を追加しました');
      }
    } else if (kind === 'cm-plan' || kind === 'cm-block') {
      var cow = cmOwner(kind === 'cm-plan' ? 'plan' : 'block', id), okC = 0;
      if (cow) {
        for (var ci = 0; ci < arr.length; ci++) {
          setBusy('画像を読み込み中… (' + (ci + 1) + '/' + arr.length + ')');
          try {
            var isImgMode = kind === 'cm-plan' && cow.mode === 'image';
            var cid2 = await addImage(arr[ci], isImgMode ? 2400 : 2000, isImgMode ? 0.9 : 0.88, (kind === 'cm-plan' && cow.mode !== 'image') ? wmText() : '');
            cow.imgs.push(cid2); okC++; touch();
          } catch (e) { toast('「' + arr[ci].name + '」を追加できませんでした。' + why(e), true); }
        }
        if (okC) toast(okC + '枚の画像を追加しました');
      }
    } else if (kind === 'add') {
      var okN = 0;
      for (var i = 0; i < arr.length; i++) {
        setBusy('作品を読み込み中… (' + (i + 1) + '/' + arr.length + ')');
        try {
          var iid = await addImage(arr[i], 2000, 0.88, wmText());
          S.works.splice(okN, 0, { id: uid(), imgId: iid, title: '', desc: '', cat: addCat, year: addYear, style: addStyle, plan: addPlan, no: nextNo(addYear), extra: [] }); okN++; touch();
        } catch (e) { toast('「' + arr[i].name + '」を追加できませんでした。' + why(e), true); }
      }
      if (okN) toast(okN + '枚の作品を追加しました');
    } else {
      setBusy('画像を読み込み中…');
      var nid = await addImage(arr[0], kind === 'hero' ? 2560 : kind === 'icon' ? 640 : 2000, 0.88, (kind === 'hero' || kind === 'icon') ? '' : wmText());
      if (kind === 'hero') { var o = S.heroId; S.heroId = nid; releaseIfUnused(o); }
      else if (kind === 'icon') { var o2 = S.iconId; S.iconId = nid; releaseIfUnused(o2); }
      else {
        var w = S.works.filter(function (x) { return x.id === id; })[0];
        if (w) { var o3 = w.imgId; w.imgId = nid; releaseIfUnused(o3); } else releaseIfUnused(nid);
      }
      touch(); toast('画像を設定しました');
    }
  } catch (e) { toast('画像を読み込めませんでした。' + why(e), true); }
  setBusy(''); renderPanel(); updateStatus();
}
function moveWork(id, d) { var i = S.works.findIndex(function (w) { return w.id === id; }), j = i + d; if (i < 0 || j < 0 || j >= S.works.length) return; var t = S.works[i]; S.works[i] = S.works[j]; S.works[j] = t; touch(); renderPanel(); }
function movePlan(i, d) { var j = i + d; if (j < 0 || j >= S.plans.length) return; var t = S.plans[i]; S.plans[i] = S.plans[j]; S.plans[j] = t; touch(); renderPanel(); }
function moveStyle(i, d) { var j = i + d; if (j < 0 || j >= S.styles.length) return; var t = S.styles[i]; S.styles[i] = S.styles[j]; S.styles[j] = t; touch(); renderPanel(); }
function moveCat(i, d) { var j = i + d; if (j < 0 || j >= S.categories.length) return; var t = S.categories[i]; S.categories[i] = S.categories[j]; S.categories[j] = t; touch(); renderPanel(); }
function closeOv() { elOv.hidden = true; elOv.innerHTML = ''; previewDoc = ''; previewPage = 'home'; previewHash = ''; }
async function setPreviewPage(p, h) { previewPage = (p === 'gallery' || p === 'commission' || p === 'guideline') ? p : 'home'; previewHash = h || ''; try { previewDoc = await buildPreviewDoc(); showFrame(); } catch (e) { } }
window.addEventListener('message', function (e) { var d = e.data, fr = elOv && elOv.querySelector ? elOv.querySelector('iframe') : null; if (d && d.meluneGo && fr && e.source === fr.contentWindow) setPreviewPage(d.meluneGo, d.hash); });

async function buildPreviewDoc() {
  var urls = {}, ids = refIds(S);
  for (var i = 0; i < ids.length; i++) urls[ids[i]] = await urlFor(ids[i]);
  function js(v) { return JSON.stringify(v).replace(/</g, '\\u003c'); }
  return '<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<link rel="stylesheet" href="' + FONT_HREF + '"><link rel="stylesheet" href="../assets/style.css"></head><body>' +
    '<div id="melune-root"></div><script>window.SITE_DATA=' + js(S) + ';window.SITE_PREVIEW={urls:' + js(urls) + ',page:' + js(previewPage) + ',hash:' + js(previewHash) + ',go:function(p,h){parent.postMessage({meluneGo:p,hash:h||""},"*");}};<\/script>' +
    '<script src="../assets/site.js"><\/script></body></html>';
}
async function openPreview(mode) {
  previewMode = mode || previewMode;
  elOv.hidden = false;
  elOv.innerHTML = '<div class="pv"><div class="pv-bar"><div class="seg" role="group" aria-label="表示の切り替え"><button type="button" data-pv="pc" aria-pressed="' + (previewMode === 'pc') + '">PC</button><button type="button" data-pv="sp" aria-pressed="' + (previewMode === 'sp') + '">スマホ</button></div>' +
    '<div class="seg" role="group" aria-label="ページの切り替え"><button type="button" data-pvpage="home" aria-pressed="' + (previewPage === 'home') + '">トップ</button><button type="button" data-pvpage="gallery" aria-pressed="' + (previewPage === 'gallery') + '">全作品ページ</button><button type="button" data-pvpage="commission" aria-pressed="' + (previewPage === 'commission') + '">ご依頼ページ</button><button type="button" data-pvpage="guideline" aria-pressed="' + (previewPage === 'guideline') + '">ガイドライン</button></div>' +
    '<span class="pv-note">下書きの内容です。まだ公開ページには反映されていません。</span><button type="button" class="btn-s" data-act="pv-close">閉じる</button><button type="button" class="btn-p" data-act="publish">サイトに反映</button></div>' +
    '<div class="pv-stage" id="pv-stage"><p class="ed-boot">読み込み中…</p></div></div>';
  try { await flush(); previewDoc = await buildPreviewDoc(); showFrame(); }
  catch (e) { var st = elOv.querySelector('#pv-stage'); if (st) st.innerHTML = '<p class="ed-boot">プレビューを表示できませんでした。もう一度お試しください。</p>'; }
}
function showFrame() {
  var st = elOv.querySelector('#pv-stage'); if (!st || !previewDoc) return;
  Array.prototype.forEach.call(elOv.querySelectorAll('[data-pv]'), function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-pv') === previewMode)); });
  Array.prototype.forEach.call(elOv.querySelectorAll('[data-pvpage]'), function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-pvpage') === previewPage)); });
  st.innerHTML = '';
  var f = document.createElement('iframe'); f.title = 'プレビュー'; f.srcdoc = previewDoc;
  var availW = Math.max(280, st.clientWidth - 24), availH = Math.max(360, st.clientHeight - 24);
  if (previewMode === 'pc') {
    var W = 1280, k = Math.min(1, availW / W), wrap = document.createElement('div');
    wrap.className = 'pv-pc'; wrap.style.width = Math.round(W * k) + 'px'; wrap.style.height = availH + 'px';
    f.style.width = W + 'px'; f.style.height = Math.round(availH / k) + 'px'; f.style.transform = 'scale(' + k + ')'; f.style.transformOrigin = '0 0';
    wrap.appendChild(f); st.appendChild(wrap);
  } else {
    var wrap2 = document.createElement('div'); wrap2.className = 'pv-sp';
    f.style.width = '390px'; f.style.height = Math.min(844, Math.max(420, availH - 20)) + 'px';
    wrap2.appendChild(f); st.appendChild(wrap2);
  }
}
function askPublish() {
  elOv.hidden = false;
  elOv.innerHTML = '<div class="dlg" role="dialog" aria-modal="true" aria-labelledby="dlg-t"><h2 id="dlg-t">サイトに反映しますか？</h2><p>下書きの内容を公開ページに反映します。反映すると、URLを知っている誰でも見られます。</p>' +
    '<p class="ed-hint">反映先：' + esc(gh.repo) + '</p>' +
    '<div class="row"><button type="button" class="btn-s" data-act="ov-close">キャンセル</button><button type="button" class="btn-p" data-act="do-publish">反映する</button></div></div>';
  var b = elOv.querySelector('[data-act="do-publish"]'); if (b) b.focus();
}
function stamp() { var d = new Date(), p = function (n) { return ('0' + n).slice(-2); }; return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()); }
async function doZip() {
  setBusy('ファイルを書き出しています…');
  try {
    await flush();
    var enc = new TextEncoder(), files = [], out = clone(S);
    var js = '/* melune portfolio — サイトの内容データ\n   編集ツール（editor/index.html）が自動で書き出します。手で編集する必要はありません。 */\nwindow.SITE_DATA = ' + JSON.stringify(out, null, 2) + ';\n';
    files.push({ name: 'data/site.js', data: enc.encode(js) });
    var ids = refIds(S), inc = 0;
    for (var i = 0; i < ids.length; i++) {
      var b = await getBlob(ids[i]);
      if (b) { files.push({ name: 'images/' + S.imgs[ids[i]].file, data: new Uint8Array(await b.arrayBuffer()) }); inc++; }
    }
    files.push({ name: 'このZIPの使い方.txt', data: enc.encode('このZIPの中の「data」フォルダと「images」フォルダを、サイトの「site」フォルダに上書きコピーしてください。\n（すでに site/images にある画像は、そのまま残してください。）\nそのあと site フォルダの中身をホスティングにアップロードすると、公開ページに反映されます。\n') });
    var blob = makeZip(files);
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'melune-update-' + stamp() + '.zip';
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
    setBusy(''); closeOv(); toast('ZIPを書き出しました（画像 ' + inc + ' 枚）。解凍して site フォルダに上書きコピーしてください。');
  } catch (e) {
    setBusy(''); closeOv(); toast(e && e.message === 'save' ? '下書きを保存できなかったため、書き出しを中止しました。' : '書き出せませんでした。もう一度お試しください。', true);
  }
}
/* ---------- GitHub 接続（公開ページへの反映） ---------- */
var GH_KEY = 'melune-gh';
function guessRepo() {
  var m = location.hostname.match(/^([^.]+)\.github\.io$/i);
  if (!m) return '';
  var seg = location.pathname.split('/').filter(Boolean), first = seg[0];
  if (first && first !== 'admin' && !/\.html?$/i.test(first)) return m[1] + '/' + first;
  return m[1] + '/' + m[1] + '.github.io';
}
function ghLoad() {
  try { var r = localStorage.getItem(GH_KEY); if (r) { var o = JSON.parse(r) || {}; gh.repo = o.repo || ''; gh.branch = o.branch || ''; gh.dir = o.dir || ''; gh.token = o.token || ''; } } catch (e) { }
  if (!gh.repo) gh.repo = guessRepo();
}
function ghStore() { try { localStorage.setItem(GH_KEY, JSON.stringify(gh)); return true; } catch (e) { return false; } }
function ghPrefix() { var d = (gh.dir || '').replace(/^\/+|\/+$/g, ''); return d ? d + '/' : ''; }
function ghReady() { return !!(gh.token && gh.repo); }
function refPath(br) { return br.split('/').map(encodeURIComponent).join('/'); }
async function ghApi(path, opt) {
  opt = opt || {};
  var headers = { 'Accept': opt.accept || 'application/vnd.github+json', 'Authorization': 'Bearer ' + gh.token };
  if (opt.body) headers['Content-Type'] = 'application/json';
  var res = await fetch('https://api.github.com' + path, { method: opt.method || 'GET', headers: headers, body: opt.body ? JSON.stringify(opt.body) : undefined, cache: 'no-store', signal: opt.signal });
  var text = await res.text();
  if (!res.ok) {
    var msg = ''; try { msg = (JSON.parse(text) || {}).message || ''; } catch (e) { }
    var err = new Error(msg || ('HTTP ' + res.status)); err.status = res.status; throw err;
  }
  if (opt.text) return text;
  return text ? JSON.parse(text) : null;
}
function ghErr(e) {
  var s = e && e.status;
  if (e && e.message === 'nopush') return 'このトークンには書き込み権限がありません。トークンの「Contents」を「Read and write」にして作り直してください。';
  if (s === 401) return 'トークンが正しくないか、期限が切れています。作り直して入れ直してください。';
  if (s === 403) return '権限が足りないか、短時間に続けて操作しました。トークンの「Contents」が「Read and write」か確認し、少し待ってからお試しください。';
  if (s === 404) return 'リポジトリまたはブランチが見つかりません。名前と、トークンの対象リポジトリを確認してください。';
  if (s === 409 || s === 422) return '公開側が同時に更新されていました。もう一度お試しください。';
  if (!s) return '通信できませんでした。インターネットにつながっているか確認してください。';
  return 'GitHubとの通信に失敗しました。（' + s + '）';
}
async function ghCheck() {
  var info = await ghApi('/repos/' + gh.repo);
  if (info.permissions && info.permissions.push === false) throw new Error('nopush');
  return info;
}
async function fetchPublished() {
  if (!ghReady()) return null;
  var t = 0;
  try {
    var ctl = new AbortController(); t = setTimeout(function () { ctl.abort(); }, 6000);
    var q = gh.branch ? '?ref=' + encodeURIComponent(gh.branch) : '';
    var txt = await ghApi('/repos/' + gh.repo + '/contents/' + ghPrefix() + 'data/site.js' + q, { accept: 'application/vnd.github.raw+json', text: true, signal: ctl.signal });
    clearTimeout(t);
    var a = txt.indexOf('{'), b = txt.lastIndexOf('}');
    return (a >= 0 && b > a) ? JSON.parse(txt.slice(a, b + 1)) : null;
  } catch (e) { clearTimeout(t); return null; }
}
function blobToB64(b) { return new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res(String(r.result).split(',')[1] || ''); }; r.onerror = rej; r.readAsDataURL(b); }); }
function ghSiteUrl() {
  if (/^https?:$/.test(location.protocol)) { try { return new URL('../', location.href).href; } catch (e) { } }
  var p = gh.repo.split('/');
  return p[1] && p[1].toLowerCase() === p[0].toLowerCase() + '.github.io' ? 'https://' + p[0] + '.github.io/' : 'https://' + p[0] + '.github.io/' + (p[1] || '');
}
function panelGithub() {
  var ok = ghReady();
  var h = '<section class="ed-card"><h2>GitHubとの接続</h2><p class="ed-hint">一度設定すると、「サイトに反映」を押すだけで公開ページが更新されます。ファイルのコピーやアップロードは要りません。</p>' +
    '<p>' + (ok ? '<span class="ok-line">設定済み：<code>' + esc(gh.repo) + '</code></span>' : '<span class="ed-warn">まだ設定されていません。</span>') + (ghState ? '<br><span class="ed-hint">' + esc(ghState) + '</span>' : '') + '</p>' +
    field('リポジトリ（ユーザー名/リポジトリ名）', '<input type="text" id="gh-repo" value="' + esc(gh.repo) + '" placeholder="例：myname/melune" autocomplete="off" spellcheck="false">') +
    field('アクセストークン', '<input type="password" id="gh-token" value="" placeholder="' + (gh.token ? '保存済み（変えるときだけ入力）' : 'github_pat_...') + '" autocomplete="off" spellcheck="false">') +
    '<details><summary>詳しい設定（ふつうは変えません）</summary>' +
    field('ブランチ（空欄なら標準のブランチ）', '<input type="text" id="gh-branch" value="' + esc(gh.branch) + '" placeholder="main" autocomplete="off" spellcheck="false">') +
    field('サイトのフォルダ（空欄ならリポジトリの一番上）', '<input type="text" id="gh-dir" value="' + esc(gh.dir) + '" placeholder="例：docs" autocomplete="off" spellcheck="false">') + '</details>' +
    '<div class="row"><button type="button" class="btn-p" data-act="gh-save">保存して接続を確認</button>' + (ok ? '<button type="button" class="btn-d" data-act="gh-clear">接続を解除</button>' : '') + '</div></section>';
  h += '<section class="ed-card"><h2>トークンの作り方（最初の1回だけ）</h2><p class="ed-hint">トークンは、この編集ツールがGitHubに書き込むための合言葉です。画面の表記は変わることがあります。</p>' +
    '<ol class="steps"><li><a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener noreferrer">トークンの作成ページ</a>を開きます（GitHubにログインした状態で）。</li>' +
    '<li>「Token name」に <code>melune</code> など好きな名前を入れます。</li>' +
    '<li>「Expiration」（有効期限）を選びます。期限が切れたら、作り直して入れ直します。</li>' +
    '<li>「Repository access」は「Only select repositories」を選び、このサイトのリポジトリだけを選びます。</li>' +
    '<li>「Permissions」→「Repository permissions」を開き、「Contents」を「Read and write」にします。</li>' +
    '<li>「Generate token」を押し、表示された <code>github_pat_</code> から始まる文字列をコピーして、上の「アクセストークン」に貼り付けます。この文字列は、あとからもう一度は見られません。</li></ol></section>';
  h += '<section class="ed-card"><h2>安全のために</h2><ul class="steps"><li>トークンを知っている人は、このリポジトリを書き換えられます。人に見せたり、共有のパソコンに保存したりしないでください。</li>' +
    '<li>トークンは、いま使っているブラウザの中にだけ保存され、GitHub以外には送られません。</li>' +
    '<li>この編集ページのURLは、公開サイトの一部なので誰でも開けますが、トークンがなければ何も変更できません。公開ページには、編集ボタンも出ません。</li>' +
    '<li>下書きと、まだ反映していない画像は、このブラウザの中に残ります。別のパソコンで編集するときは、そちらでも接続を設定してください（下書きは引き継がれません）。</li></ul></section>';
  return h;
}
async function ghSaveForm() {
  function val(id) { var el = host.querySelector('#' + id); return el ? el.value.trim() : ''; }
  var repo = val('gh-repo').replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/i, '').replace(/^\/+|\/+$/g, '');
  var tok = val('gh-token');
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) { toast('リポジトリは「ユーザー名/リポジトリ名」の形で入れてください。', true); return; }
  if (tok) gh.token = tok;
  if (!gh.token) { toast('アクセストークンを入れてください。', true); return; }
  gh.repo = repo; gh.branch = val('gh-branch'); gh.dir = val('gh-dir');
  var stored = ghStore();
  setBusy('GitHubに接続しています…');
  try {
    var info = await ghCheck();
    ghState = '接続できました（ブランチ：' + (gh.branch || info.default_branch) + '）' + (stored ? '' : '。このブラウザには保存できないため、ページを閉じると設定が消えます');
    var pub = await fetchPublished();
    if (pub) { baseState = normalizeState(clone(pub)); pubSig = JSON.stringify(baseState); }
    toast('GitHubに接続できました');
  } catch (e) { ghState = ghErr(e); toast(ghErr(e), true); }
  setBusy(''); updateStatus(); renderPanel();
}
function showDone() {
  closeOv(); elOv.hidden = false;
  elOv.innerHTML = '<div class="dlg" role="dialog" aria-modal="true"><h2>反映しました</h2><p>公開ページに出るまで、1〜2分かかることがあります。変わらないときは、少し待ってから再読み込みしてください。</p>' +
    '<div class="row"><a class="btn-s" href="' + esc(ghSiteUrl()) + '" target="_blank" rel="noopener noreferrer">公開ページを開く</a><button type="button" class="btn-p" data-act="ov-close">閉じる</button></div></div>';
}
async function doPublish() {
  var btn = elOv.querySelector('[data-act="do-publish"]'); if (btn) btn.disabled = true;
  var P = '/repos/' + gh.repo;
  try {
    await flush();
    setBusy('GitHubに接続しています…');
    var info = await ghCheck(), br = gh.branch || info.default_branch, rp = refPath(br), prefix = ghPrefix();
    var ref = await ghApi(P + '/git/ref/heads/' + rp), head = ref.object.sha;
    var commit = await ghApi(P + '/git/commits/' + head);
    var tr = await ghApi(P + '/git/trees/' + commit.tree.sha + '?recursive=1');
    var existing = {};
    (tr.tree || []).forEach(function (t) { if (t.type === 'blob') existing[t.path] = 1; });
    var js = '/* melune portfolio — サイトの内容データ\n   編集ツール（admin/index.html）が自動で書き出します。手で編集する必要はありません。 */\nwindow.SITE_DATA = ' + JSON.stringify(clone(S), null, 2) + ';\n';
    var bd = await ghApi(P + '/git/blobs', { method: 'POST', body: { content: js, encoding: 'utf-8' } });
    var entries = [{ path: prefix + 'data/site.js', mode: '100644', type: 'blob', sha: bd.sha }];
    var ids = refIds(S), keep = {}, n = 0;
    for (var i = 0; i < ids.length; i++) {
      var path = prefix + 'images/' + S.imgs[ids[i]].file;
      keep[path] = 1;
      if (existing[path]) continue;
      var bl = await getBlob(ids[i]);
      if (!bl) throw new Error('missing');
      n++; setBusy('画像をアップロード中… (' + n + ')');
      var bb = await ghApi(P + '/git/blobs', { method: 'POST', body: { content: await blobToB64(bl), encoding: 'base64' } });
      entries.push({ path: path, mode: '100644', type: 'blob', sha: bb.sha });
    }
    Object.keys(existing).forEach(function (p) { if (p.indexOf(prefix + 'images/img-') === 0 && !keep[p]) entries.push({ path: p, mode: '100644', type: 'blob', sha: null }); });
    setBusy('公開ページに反映しています…');
    var nt = await ghApi(P + '/git/trees', { method: 'POST', body: { base_tree: commit.tree.sha, tree: entries } });
    var nc = await ghApi(P + '/git/commits', { method: 'POST', body: { message: 'melune: サイトを更新 ' + stamp(), tree: nt.sha, parents: [head] } });
    await ghApi(P + '/git/refs/heads/' + rp, { method: 'PATCH', body: { sha: nc.sha } });
    baseState = clone(S); pubSig = JSON.stringify(S);
    setBusy(''); updateStatus(); if (tab === 'publish') renderPanel();
    showDone();
  } catch (e) {
    setBusy(''); closeOv();
    toast(e && e.message === 'save' ? '下書きを保存できなかったため、反映を中止しました。' : e && e.message === 'missing' ? '見つからない画像があります。該当の画像を入れ直してください。' : ghErr(e), true);
  }
}
async function discardDraft() {
  var old = refIds(S);
  S = normalizeState(clone(baseState || window.SITE_DATA || {}));
  old.forEach(function (id) { releaseIfUnused(id); });
  touch(); renderPanel(); toast('下書きを破棄して、公開中の内容に戻しました');
}

/* ---------- イベント ---------- */
function syncOpt(id, name) { Array.prototype.forEach.call(elPanel.querySelectorAll('option'), function (o) { if (o.value === id) o.textContent = name; }); }
function onInput(e) {
  var t = e.target; if (!t || !S) return;
  var d = t.dataset || {};
  if (d.path) {
    var v;
    if (t.type === 'checkbox') v = t.checked;
    else if (t.type === 'radio') { if (!t.checked) return; v = t.value; }
    else v = t.value;
    if ((t.type === 'color' || t.type === 'text') && /^design\.(text|bg|accent)$/.test(d.path)) {
      if (!HEX.test(v)) return;
      v = v.toLowerCase();
      Array.prototype.forEach.call(host.querySelectorAll('[data-path="' + d.path + '"]'), function (o) { if (o !== t) o.value = v; });
    }
    pathSet(S, d.path, v);
    if (d.path === 'commission.form.mode') { touch(); renderPanel(); return; }
    if (/^design\./.test(d.path) || /^texts\.(siteName|tagline|intro)$/.test(d.path)) updateSample();
    touch();
  } else if (d.list === 'activities') { S.activities = t.value.split('\n').map(function (x) { return x.trim(); }).filter(Boolean); touch(); }
  else if (d.link !== undefined) { var l = S.links[+d.link]; if (l) { l[d.k] = t.value; touch(); } }
  else if (d.cat !== undefined) { var c = S.categories[+d.cat]; if (c) { c.name = t.value; syncOpt(c.id, t.value); touch(); } }
  else if (d.pln !== undefined) { var pc = S.plans[+d.pln]; if (pc) { pc.name = t.value; syncOpt(pc.id, t.value); touch(); } }
  else if (d.sty !== undefined) { var sc = S.styles[+d.sty]; if (sc) { sc.name = t.value; syncOpt(sc.id, t.value); touch(); } }
  else if (d.sc) { if (t.value) S.commission.schedule[d.sc] = t.value; else delete S.commission.schedule[d.sc]; touch(); }
  else if (d.cp !== undefined || d.cb !== undefined) {
    var co = cmOwner(d.cp !== undefined ? 'plan' : 'block', d.cp !== undefined ? d.cp : d.cb);
    if (co) { co[d.k] = t.value; touch(); if (d.k === 'mode') renderPanel(); }
  }
  else if (d.w) { var w = S.works.filter(function (x) { return x.id === d.w; })[0]; if (w) {
    var oy = w.year;
    w[d.k] = d.k === 'no' ? t.value.replace(/[^0-9A-Za-z_-]/g, '').slice(0, 16) : t.value;
    if (d.k === 'year' && w.year !== oy) {
      var auto = !w.no || (oy && noSeq(w.no, oy) > 0);
      if (auto) { w.no = ''; w.no = w.year ? nextNo(w.year) : ''; }
      touch(); renderPanel(); return;
    }
    touch();
  } }
  else if (t.id === 'add-cat') { addCat = t.value; }
  else if (t.id === 'add-year') { addYear = t.value; }
  else if (t.id === 'add-plan') { addPlan = t.value; }
  else if (t.id === 'add-style') { addStyle = t.value; }
}
host.addEventListener('input', onInput);
host.addEventListener('change', function (e) {
  var t = e.target;
  if (t && t.dataset && t.dataset.file) { handleFiles(t.dataset.file, t.files, t.dataset.id, t); return; }
  onInput(e);
});
host.addEventListener('click', function (e) {
  var tb = e.target.closest('[data-tab]');
  if (tb) { tab = tb.getAttribute('data-tab'); renderTabs(); renderPanel(); window.scrollTo(0, 0); return; }
  var pv = e.target.closest('[data-pv]');
  if (pv) { previewMode = pv.getAttribute('data-pv'); showFrame(); return; }
  var pp = e.target.closest('[data-pvpage]');
  if (pp) { setPreviewPage(pp.getAttribute('data-pvpage'), ''); return; }
  var b = e.target.closest('[data-act]'); if (!b) return;
  var a = b.getAttribute('data-act'), id = b.getAttribute('data-id'), i = +b.getAttribute('data-i');
  switch (a) {
    case 'save':
      setBusy('下書きを保存中…');
      flush().then(function () { setBusy(''); toast('下書きを保存しました'); }).catch(function () { setBusy(''); toast('下書きを保存できませんでした。', true); });
      break;
    case 'preview': openPreview(); break;
    case 'pv-close': case 'ov-close': closeOv(); break;
    case 'publish':
      if (!ghReady()) { closeOv(); tab = 'github'; renderTabs(); renderPanel(); window.scrollTo(0, 0); toast('先にGitHubとの接続を設定してください。', true); break; }
      askPublish(); break;
    case 'do-publish': doPublish(); break;
    case 'zip': doZip(); break;
    case 'gh-save': ghSaveForm(); break;
    case 'gh-clear':
      if (arm(b)) { gh.token = ''; ghState = ''; ghStore(); toast('接続を解除しました'); renderPanel(); }
      break;
    case 'add-cm-plan': S.commission.plans.push({ id: uid(), name: '新しいプラン', mode: 'input', price: '', desc: '', imgs: [] }); touch(); renderPanel(); break;
    case 'add-cm-block': S.commission.blocks.push({ id: uid(), title: b.getAttribute('data-t') || '新しい項目', body: '', imgs: [] }); touch(); renderPanel(); break;
    case 'add-gd-block': S.guideline.blocks.push({ id: uid(), title: b.getAttribute('data-t') || '新しい項目', body: '', imgs: [] }); touch(); renderPanel(); break;
    case 'gd-block-up': case 'gd-block-down':
      var gj = i + (/up$/.test(a) ? -1 : 1);
      if (gj >= 0 && gj < S.guideline.blocks.length) { var gt = S.guideline.blocks[i]; S.guideline.blocks[i] = S.guideline.blocks[gj]; S.guideline.blocks[gj] = gt; touch(); renderPanel(); }
      break;
    case 'rm-gd-block':
      if (arm(b)) {
        var gk = S.guideline.blocks.findIndex(function (x) { return x.id === id; });
        if (gk >= 0) { var ggone = S.guideline.blocks[gk].imgs.slice(); S.guideline.blocks.splice(gk, 1); ggone.forEach(releaseIfUnused); touch(); renderPanel(); }
      }
      break;
    case 'cm-plan-up': case 'cm-plan-down': case 'cm-block-up': case 'cm-block-down':
      var carr = a.indexOf('plan') >= 0 ? S.commission.plans : S.commission.blocks, cj = i + (/up$/.test(a) ? -1 : 1);
      if (cj >= 0 && cj < carr.length) { var ct = carr[i]; carr[i] = carr[cj]; carr[cj] = ct; touch(); renderPanel(); }
      break;
    case 'rm-cm-plan': case 'rm-cm-block':
      if (arm(b)) {
        var carr2 = a === 'rm-cm-plan' ? S.commission.plans : S.commission.blocks, ck = carr2.findIndex(function (x) { return x.id === id; });
        if (ck >= 0) { var gone = carr2[ck].imgs.slice(); carr2.splice(ck, 1); gone.forEach(releaseIfUnused); touch(); renderPanel(); }
      }
      break;
    case 'cm-img-l': case 'cm-img-r': case 'cm-img-x':
      var cio = cmOwner(b.getAttribute('data-k'), id);
      if (cio) {
        if (a === 'cm-img-x') { var rid = cio.imgs.splice(i, 1)[0]; releaseIfUnused(rid); }
        else { var cj2 = i + (a === 'cm-img-l' ? -1 : 1); if (cj2 >= 0 && cj2 < cio.imgs.length) { var tt = cio.imgs[i]; cio.imgs[i] = cio.imgs[cj2]; cio.imgs[cj2] = tt; } }
        touch(); renderPanel();
      }
      break;
    case 'wk-img-l': case 'wk-img-r': case 'wk-img-x': case 'wk-img-main':
      var wk2 = S.works.filter(function (x) { return x.id === id; })[0];
      if (wk2 && wk2.extra) {
        if (a === 'wk-img-x') { var rid2 = wk2.extra.splice(i, 1)[0]; releaseIfUnused(rid2); }
        else if (a === 'wk-img-main') { var oldMain = wk2.imgId; wk2.imgId = wk2.extra[i]; wk2.extra[i] = oldMain; }
        else { var wj = i + (a === 'wk-img-l' ? -1 : 1); if (wj >= 0 && wj < wk2.extra.length) { var wt = wk2.extra[i]; wk2.extra[i] = wk2.extra[wj]; wk2.extra[wj] = wt; } }
        touch(); renderPanel();
      }
      break;
    case 'rm-hero': if (arm(b)) { var o = S.heroId; S.heroId = null; releaseIfUnused(o); touch(); renderPanel(); } break;
    case 'rm-icon': if (arm(b)) { var o2 = S.iconId; S.iconId = null; releaseIfUnused(o2); touch(); renderPanel(); } break;
    case 'add-link': S.links.push({ label: '', url: '' }); touch(); renderPanel(); break;
    case 'rm-link': S.links.splice(i, 1); touch(); renderPanel(); break;
    case 'add-cat': S.categories.push({ id: uid(), name: '新しいカテゴリー' }); touch(); renderPanel(); break;
    case 'rm-cat':
      var cc = S.categories[i];
      if (cc && S.works.some(function (w) { return w.cat === cc.id; })) { toast('このカテゴリーを使っている作品があります。先に作品のカテゴリーを変更してください。', true); break; }
      if (cc && S.defaultCat === cc.id) S.defaultCat = 'all';
      S.categories.splice(i, 1); touch(); renderPanel(); break;
    case 'cat-up': moveCat(i, -1); break;
    case 'cat-down': moveCat(i, 1); break;
    case 'add-plan': S.plans.push({ id: uid(), name: '新しいプラン' }); touch(); renderPanel(); break;
    case 'rm-plan':
      var pc2 = S.plans[i];
      if (pc2 && S.works.some(function (w) { return w.plan === pc2.id; })) { toast('このプランを使っている作品があります。先に作品のプランを変更してください。', true); break; }
      S.plans.splice(i, 1); touch(); renderPanel(); break;
    case 'plan-up': movePlan(i, -1); break;
    case 'plan-down': movePlan(i, 1); break;
    case 'add-style': S.styles.push({ id: uid(), name: '新しい絵柄' }); touch(); renderPanel(); break;
    case 'rm-style':
      var sc2 = S.styles[i];
      if (sc2 && S.works.some(function (w) { return w.style === sc2.id; })) { toast('この絵柄を使っている作品があります。先に作品の絵柄を変更してください。', true); break; }
      S.styles.splice(i, 1); touch(); renderPanel(); break;
    case 'style-up': moveStyle(i, -1); break;
    case 'style-down': moveStyle(i, 1); break;
    case 'up': moveWork(id, -1); break;
    case 'down': moveWork(id, 1); break;
    case 'rm-work':
      if (arm(b)) { var k = S.works.findIndex(function (w) { return w.id === id; }); if (k >= 0) { var im = S.works[k].imgId, exs = (S.works[k].extra || []).slice(); S.works.splice(k, 1); releaseIfUnused(im); exs.forEach(releaseIfUnused); touch(); renderPanel(); } }
      break;
    case 'reset-colors': S.design.text = '#493843'; S.design.bg = '#FFF9F8'; S.design.accent = '#EBA4B7'; touch(); renderPanel(); break;
    case 'discard': if (arm(b)) discardDraft(); break;
  }
});
elOv.addEventListener('click', function (e) { if (e.target === elOv && !elOv.querySelector('.pv')) closeOv(); });
document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !elOv.hidden) closeOv(); });

/* ---------- 起動 ---------- */
(async function () {
  idb = await openDB();
  ghLoad();
  var pubRaw = await fetchPublished();
  var base = normalizeState(clone(pubRaw || window.SITE_DATA || {}));
  baseState = clone(base);
  pubSig = JSON.stringify(base);
  if (idb) {
    try {
      var rec = await dbGet('kv', 'draft');
      if (rec && rec.json) { S = normalizeState(JSON.parse(rec.json)); lastSaved = rec.savedAt || 0; }
    } catch (e) { }
  } else memOnly = true;
  if (!S) S = base;
  if (S.categories.length) addCat = S.categories[S.categories.length - 1].id;
  renderTabs(); renderPanel(); updateStatus();
  if (fillNumbers()) { touch(); renderPanel(); }
  gcImages();
})();
})();
