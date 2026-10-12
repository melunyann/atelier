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
var tab = 'profile', addCat = '', armed = null, armTimer = 0, previewDoc = '', previewMode = 'pc', memOnly = false;
var blobs = {};
var TABS = [['profile', 'プロフィール'], ['works', '作品'], ['text', '文字'], ['design', 'デザイン'], ['publish', '公開']];

host.innerHTML =
  '<header class="ed-bar"><div class="ed-top"><div class="ed-brand">melune<small>編集ツール</small></div><div class="ed-status" id="ed-status" role="status"></div></div>' +
  '<div class="ed-actions"><button type="button" class="btn-s" data-act="save">下書きを保存</button><button type="button" class="btn-s" data-act="preview">プレビュー</button><button type="button" class="btn-p" data-act="publish">サイトに反映</button></div></header>' +
  '<p class="ed-note">自分のパソコンで使う編集ツールです。公開用のサイト（site フォルダ）と一緒にアップロードしないでください。</p>' +
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
  h += ' ／ ' + (diff ? '<b>site フォルダに反映していない変更があります</b>' : 'site フォルダの内容と同じです');
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
async function compress(file, maxEdge, q) {
  var bmp;
  try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch (e) {
    bmp = await new Promise(function (res, rej) { var u = URL.createObjectURL(file), im = new Image(); im.onload = function () { res(im); }; im.onerror = function () { rej(new Error('decode')); }; im.src = u; });
  }
  var sw = bmp.width || bmp.naturalWidth, sh = bmp.height || bmp.naturalHeight;
  var k = Math.min(1, maxEdge / Math.max(sw, sh)), w = Math.max(1, Math.round(sw * k)), h = Math.max(1, Math.round(sh * k));
  if (k === 1 && file.size < 1200 * 1024 && /^image\/(jpeg|webp|png)$/.test(file.type)) return { blob: file, w: w, h: h };
  var cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  var ctx = cv.getContext('2d'); ctx.imageSmoothingQuality = 'high'; ctx.drawImage(bmp, 0, 0, w, h);
  var blob = await new Promise(function (r) { cv.toBlob(r, 'image/webp', q); });
  if (!blob || blob.type !== 'image/webp') {
    ctx.globalCompositeOperation = 'destination-over'; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
    blob = await new Promise(function (r) { cv.toBlob(r, 'image/jpeg', q); });
  }
  return { blob: blob, w: w, h: h };
}
async function addImage(file, maxEdge, q) {
  if (!/^image\//.test(file.type)) throw new Error('type');
  if (file.size > 80 * MB) throw new Error('big');
  var r = await compress(file, maxEdge, q), id = uid();
  var ext = r.blob.type === 'image/webp' ? 'webp' : r.blob.type === 'image/png' ? 'png' : 'jpg';
  blobs[id] = { blob: r.blob, url: blobToURL(r.blob) };
  if (idb) { try { await dbPut('img', id, { blob: r.blob, type: r.blob.type }); } catch (e) { memOnly = true; } } else memOnly = true;
  S.imgs[id] = { w: r.w, h: r.h, file: 'img-' + id + '.' + ext };
  return id;
}
async function getBlob(id) {
  if (blobs[id]) return blobs[id].blob;
  if (idb) { try { var rec = await dbGet('img', id); if (rec && rec.blob) { blobs[id] = { blob: rec.blob, url: blobToURL(rec.blob) }; return rec.blob; } } catch (e) { } }
  return null;
}
async function urlFor(id) {
  var b = await getBlob(id);
  if (b) return blobs[id].url;
  var m = S.imgs[id];
  return (m && m.file) ? '../site/images/' + encodeURIComponent(m.file) : '';
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
function panelWorks() {
  if (!S.categories.some(function (c) { return c.id === addCat; })) addCat = S.categories.length ? S.categories[S.categories.length - 1].id : '';
  var h = '<section class="ed-card"><h2>作品を追加</h2><p class="ed-hint">縦横比はそのまま、長辺2000pxまでに自動で整えます。複数枚をまとめて選べます。</p>' +
    '<div class="row"><label class="f" style="margin:0;min-width:160px"><span>追加するカテゴリー</span><select class="f-in" id="add-cat">' + catOptions(addCat) + '</select></label>' +
    '<label class="btn-p" style="align-self:flex-end">画像を選ぶ<input type="file" accept="image/*" multiple hidden data-file="add"></label></div></section>';
  h += '<section class="ed-card"><h2>カテゴリー</h2><p class="ed-hint">公開ページの切り替えボタンになります。「ALL」は自動で先頭に付きます。</p>';
  S.categories.forEach(function (c, i) {
    h += '<div class="cat-row"><input type="text" data-cat="' + i + '" value="' + esc(c.name) + '" aria-label="カテゴリー名"><div class="row"><button type="button" class="btn-s" data-act="cat-up" data-i="' + i + '" aria-label="前へ"' + (i === 0 ? ' disabled' : '') + '>↑</button><button type="button" class="btn-s" data-act="cat-down" data-i="' + i + '" aria-label="後ろへ"' + (i === S.categories.length - 1 ? ' disabled' : '') + '>↓</button><button type="button" class="btn-d" data-act="rm-cat" data-i="' + i + '">削除</button></div></div>';
  });
  h += '<div class="row"><button type="button" class="btn-s" data-act="add-cat">カテゴリーを追加</button></div></section>';
  h += '<section class="ed-card"><h2>作品一覧（' + S.works.length + '）</h2>';
  if (!S.works.length) h += '<p class="empty-note">まだ作品がありません。上の「画像を選ぶ」から追加してください。<br>追加するまでは、公開ページに空のフレームが並びます。</p>';
  S.works.forEach(function (w, i) {
    h += '<article class="wk"><div class="wk-thumb"><img data-load="' + esc(w.imgId) + '" alt=""><span class="wk-no">' + (i + 1) + '</span></div><div class="wk-body">' +
      field('タイトル', '<input type="text" data-w="' + w.id + '" data-k="title" value="' + esc(w.title) + '" placeholder="タイトル">') +
      field('説明', '<textarea rows="3" data-w="' + w.id + '" data-k="desc" placeholder="説明">' + esc(w.desc) + '</textarea>') +
      field('カテゴリー', '<select data-w="' + w.id + '" data-k="cat">' + catOptions(w.cat) + '</select>') +
      '<div class="row"><button type="button" class="btn-s" data-act="up" data-id="' + w.id + '"' + (i === 0 ? ' disabled' : '') + '>↑ 前へ</button><button type="button" class="btn-s" data-act="down" data-id="' + w.id + '"' + (i === S.works.length - 1 ? ' disabled' : '') + '>↓ 後ろへ</button>' +
      '<label class="btn-s">画像を差し替え<input type="file" accept="image/*" hidden data-file="replace" data-id="' + w.id + '"></label><button type="button" class="btn-d" data-act="rm-work" data-id="' + w.id + '">削除</button></div></div></article>';
  });
  return h + '</section>';
}
function panelText() {
  var h = '<section class="ed-card"><h2>ギャラリーの文字</h2>' +
    '<div class="pair">' + tin('texts.galleryEn', '見出し（英字）') + tin('texts.galleryJa', '見出し（日本語）') + '</div>' +
    tin('texts.filterAll', '「すべて表示」ボタンの文字') + tin('texts.emptyText', '作品がないときの文', { area: 1, rows: 2 }) + tin('texts.closeLabel', '拡大表示の「閉じる」ボタン（読み上げ用）') + '</section>';
  h += '<section class="ed-card"><h2>ご依頼セクション</h2><p class="ed-hint">リンク先URLを入れると、ギャラリーの下にボタン付きで表示されます。空のときは表示されません。</p>' +
    tin('texts.commissionEn', '見出し') + tin('texts.commissionBody', '説明文', { area: 1, rows: 3 }) +
    '<div class="pair">' + tin('texts.commissionButton', 'ボタンの文字') + tin('texts.commissionUrl', 'ボタンのリンク先URL', { type: 'url', ph: 'https://...' }) + '</div></section>';
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
  var h = '<section class="ed-card"><h2>公開の流れ</h2><p>' + (diff ? '下書きに、site フォルダへまだ反映していない変更があります。' : '下書きは site フォルダの内容と同じです。') + '</p>' +
    '<ol class="steps"><li>「プレビュー」でPC表示とスマホ表示を確認します。</li><li>「サイトに反映」を押して、更新用のZIPファイルを保存します。</li><li>ZIPを解凍し、中の <code>data</code> と <code>images</code> を <code>site</code> フォルダに上書きコピーします。</li><li><code>site</code> フォルダの中身を、ホスティングにアップロードします。</li></ol>' +
    '<div class="row"><button type="button" class="btn-s" data-act="preview">プレビュー</button><button type="button" class="btn-p" data-act="publish">サイトに反映</button></div></section>';
  h += '<section class="ed-card"><h2>公開前チェック</h2><ul class="checks">' + checks.map(function (c) { return '<li class="' + (c[0] ? 'ok' : '') + '">' + c[1] + '</li>'; }).join('') + '</ul></section>';
  h += '<section class="ed-card"><h2>下書きを破棄</h2><p class="ed-hint">下書きの変更をすべて捨てて、site フォルダの内容から読み込み直します。</p><div class="row"><button type="button" class="btn-d" data-act="discard">下書きを破棄して読み込み直す</button></div></section>';
  return h;
}
function renderTabs() { elTabs.innerHTML = TABS.map(function (t) { return '<button type="button" role="tab" data-tab="' + t[0] + '" aria-selected="' + (t[0] === tab ? 'true' : 'false') + '">' + t[1] + '</button>'; }).join(''); }
function renderPanel() {
  var fn = { profile: panelProfile, works: panelWorks, text: panelText, design: panelDesign, publish: panelPublish }[tab];
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
    if (kind === 'add') {
      var okN = 0;
      for (var i = 0; i < arr.length; i++) {
        setBusy('作品を読み込み中… (' + (i + 1) + '/' + arr.length + ')');
        try {
          var iid = await addImage(arr[i], 2000, 0.88);
          S.works.push({ id: uid(), imgId: iid, title: '', desc: '', cat: addCat }); okN++; touch();
        } catch (e) { toast('「' + arr[i].name + '」を追加できませんでした。' + why(e), true); }
      }
      if (okN) toast(okN + '枚の作品を追加しました');
    } else {
      setBusy('画像を読み込み中…');
      var nid = await addImage(arr[0], kind === 'hero' ? 2560 : kind === 'icon' ? 640 : 2000, 0.88);
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
function moveCat(i, d) { var j = i + d; if (j < 0 || j >= S.categories.length) return; var t = S.categories[i]; S.categories[i] = S.categories[j]; S.categories[j] = t; touch(); renderPanel(); }
function closeOv() { elOv.hidden = true; elOv.innerHTML = ''; previewDoc = ''; }

async function buildPreviewDoc() {
  var urls = {}, ids = refIds(S);
  for (var i = 0; i < ids.length; i++) urls[ids[i]] = await urlFor(ids[i]);
  function js(v) { return JSON.stringify(v).replace(/</g, '\\u003c'); }
  return '<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<link rel="stylesheet" href="' + FONT_HREF + '"><link rel="stylesheet" href="../site/assets/style.css"></head><body>' +
    '<div id="melune-root"></div><script>window.SITE_DATA=' + js(S) + ';window.SITE_PREVIEW={urls:' + js(urls) + '};<\/script>' +
    '<script src="../site/assets/site.js"><\/script></body></html>';
}
async function openPreview(mode) {
  previewMode = mode || previewMode;
  elOv.hidden = false;
  elOv.innerHTML = '<div class="pv"><div class="pv-bar"><div class="seg" role="group" aria-label="表示の切り替え"><button type="button" data-pv="pc" aria-pressed="' + (previewMode === 'pc') + '">PC</button><button type="button" data-pv="sp" aria-pressed="' + (previewMode === 'sp') + '">スマホ</button></div>' +
    '<span class="pv-note">下書きの内容です。まだ site フォルダには反映されていません。</span><button type="button" class="btn-s" data-act="pv-close">閉じる</button><button type="button" class="btn-p" data-act="publish">サイトに反映</button></div>' +
    '<div class="pv-stage" id="pv-stage"><p class="ed-boot">読み込み中…</p></div></div>';
  try { await flush(); previewDoc = await buildPreviewDoc(); showFrame(); }
  catch (e) { var st = elOv.querySelector('#pv-stage'); if (st) st.innerHTML = '<p class="ed-boot">プレビューを表示できませんでした。もう一度お試しください。</p>'; }
}
function showFrame() {
  var st = elOv.querySelector('#pv-stage'); if (!st || !previewDoc) return;
  Array.prototype.forEach.call(elOv.querySelectorAll('[data-pv]'), function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-pv') === previewMode)); });
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
  elOv.innerHTML = '<div class="dlg" role="dialog" aria-modal="true" aria-labelledby="dlg-t"><h2 id="dlg-t">公開用ファイルを書き出します</h2>' +
    '<p>更新用のZIPファイルを保存します。まだ公開はされません。</p>' +
    '<ol class="steps"><li>ZIPを解凍します。</li><li>中の <code>data</code> と <code>images</code> を、<code>site</code> フォルダに上書きコピーします。</li><li><code>site</code> フォルダの中身をアップロードします。</li></ol>' +
    '<div class="row"><button type="button" class="btn-s" data-act="ov-close">キャンセル</button><button type="button" class="btn-p" data-act="do-publish">ZIPを書き出す</button></div></div>';
  var b = elOv.querySelector('[data-act="do-publish"]'); if (b) b.focus();
}
function stamp() { var d = new Date(), p = function (n) { return ('0' + n).slice(-2); }; return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()); }
async function doPublish() {
  var btn = elOv.querySelector('[data-act="do-publish"]'); if (btn) btn.disabled = true;
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
async function discardDraft() {
  var old = refIds(S);
  S = normalizeState(clone(window.SITE_DATA || {}));
  old.forEach(function (id) { releaseIfUnused(id); });
  touch(); renderPanel(); toast('下書きを破棄して、site フォルダの内容に戻しました');
}

/* ---------- イベント ---------- */
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
    if (/^design\./.test(d.path) || /^texts\.(siteName|tagline|intro)$/.test(d.path)) updateSample();
    touch();
  } else if (d.list === 'activities') { S.activities = t.value.split('\n').map(function (x) { return x.trim(); }).filter(Boolean); touch(); }
  else if (d.link !== undefined) { var l = S.links[+d.link]; if (l) { l[d.k] = t.value; touch(); } }
  else if (d.cat !== undefined) { var c = S.categories[+d.cat]; if (c) { c.name = t.value; touch(); } }
  else if (d.w) { var w = S.works.filter(function (x) { return x.id === d.w; })[0]; if (w) { w[d.k] = t.value; touch(); } }
  else if (t.id === 'add-cat') { addCat = t.value; }
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
  var b = e.target.closest('[data-act]'); if (!b) return;
  var a = b.getAttribute('data-act'), id = b.getAttribute('data-id'), i = +b.getAttribute('data-i');
  switch (a) {
    case 'save':
      setBusy('下書きを保存中…');
      flush().then(function () { setBusy(''); toast('下書きを保存しました'); }).catch(function () { setBusy(''); toast('下書きを保存できませんでした。', true); });
      break;
    case 'preview': openPreview(); break;
    case 'pv-close': case 'ov-close': closeOv(); break;
    case 'publish': askPublish(); break;
    case 'do-publish': doPublish(); break;
    case 'rm-hero': if (arm(b)) { var o = S.heroId; S.heroId = null; releaseIfUnused(o); touch(); renderPanel(); } break;
    case 'rm-icon': if (arm(b)) { var o2 = S.iconId; S.iconId = null; releaseIfUnused(o2); touch(); renderPanel(); } break;
    case 'add-link': S.links.push({ label: '', url: '' }); touch(); renderPanel(); break;
    case 'rm-link': S.links.splice(i, 1); touch(); renderPanel(); break;
    case 'add-cat': S.categories.push({ id: uid(), name: '新しいカテゴリー' }); touch(); renderPanel(); break;
    case 'rm-cat':
      var cc = S.categories[i];
      if (cc && S.works.some(function (w) { return w.cat === cc.id; })) { toast('このカテゴリーを使っている作品があります。先に作品のカテゴリーを変更してください。', true); break; }
      S.categories.splice(i, 1); touch(); renderPanel(); break;
    case 'cat-up': moveCat(i, -1); break;
    case 'cat-down': moveCat(i, 1); break;
    case 'up': moveWork(id, -1); break;
    case 'down': moveWork(id, 1); break;
    case 'rm-work':
      if (arm(b)) { var k = S.works.findIndex(function (w) { return w.id === id; }); if (k >= 0) { var im = S.works[k].imgId; S.works.splice(k, 1); releaseIfUnused(im); touch(); renderPanel(); } }
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
  var base = normalizeState(clone(window.SITE_DATA || {}));
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
  gcImages();
})();
})();
