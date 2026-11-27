/*
 * Video Only for YouTube - content script
 *
 * 再生リスト（後で見る など）の動画リンクを「動画だけ」のURLで開けるようにする。
 *
 * - 各動画リンクに original（プレイリスト付き）/ stripped（list・index を除去）の両URLを保持
 * - トグルON : リンク = stripped、追加ボタン = original
 * - トグルOFF: リンク = original、追加ボタン = stripped
 * - href 自体を書き換えるので、中クリック・Ctrl+クリックもそのまま期待どおりに動く
 * - 左クリックは YouTube の SPA 遷移が href ではなく内部データを使うため、
 *   capture フェーズで横取りして遷移先を制御する
 */
(() => {
  'use strict';

  const ext = globalThis.browser ?? globalThis.chrome;

  const STORAGE_KEY = 'videoOnly';
  const DEFAULT_VIDEO_ONLY = true;

  /** 動画だけのURLにするとき外すクエリ */
  const STRIP_PARAMS = ['list', 'index'];

  /** 「後で見る」以外のページ（/feed/you など）で対象にする再生リスト */
  const FEED_TARGET_LISTS = new Set(['WL', 'LL']);

  const ATTR_ORIGINAL = 'data-ytvo-original';
  const ATTR_STRIPPED = 'data-ytvo-stripped';
  const ATTR_APPLIED = 'data-ytvo-applied';
  const BUTTON_CLASS = 'ytvo-alt-button';

  /** 1本の動画を表す要素（この中のリンクを書き換え、ボタンを1つ付ける） */
  const ITEM_SELECTOR = [
    'ytd-playlist-video-renderer',
    'ytd-grid-video-renderer',
    'ytd-video-renderer',
    'ytd-rich-item-renderer',
    'yt-lockup-view-model',
  ].join(',');

  /** 再生リストのヘッダー（「すべて再生」など）は対象外 */
  const EXCLUDE_SELECTOR = [
    'ytd-playlist-header-renderer',
    'ytd-playlist-sidebar-renderer',
    'yt-page-header-renderer',
    'yt-page-header-view-model',
    `.${BUTTON_CLASS}`,
  ].join(',');

  /** 再生リスト自体のカード（サムネイルが重なった表示）は対象外 */
  const COLLECTION_SELECTOR = [
    'yt-collection-thumbnail-view-model',
    'yt-collections-stack',
    'ytd-playlist-thumbnail',
  ].join(',');

  const TITLE_SELECTOR = [
    'a#video-title',
    'a#video-title-link',
    'a.yt-lockup-metadata-view-model__title',
    'a.yt-lockup-metadata-view-model-wiz__title',
  ].join(',');

  let videoOnly = DEFAULT_VIDEO_ONLY;

  /** item 要素 -> 追加ボタン */
  const buttons = new WeakMap();

  // ---------------------------------------------------------------------------
  // URL
  // ---------------------------------------------------------------------------

  function toRelative(url) {
    return url.pathname + url.search + url.hash;
  }

  /** プレイリスト付きの /watch URL なら URL オブジェクトを返す */
  function parsePlaylistWatchUrl(href) {
    if (!href) return null;
    let url;
    try {
      url = new URL(href, location.origin);
    } catch {
      return null;
    }
    if (!/(^|\.)youtube\.com$/.test(url.hostname)) return null;
    if (url.pathname !== '/watch') return null;
    if (!url.searchParams.get('v') || !url.searchParams.get('list')) return null;
    return url;
  }

  /** list / index を外す（t= などその他のパラメータは残す） */
  function stripUrl(url) {
    const stripped = new URL(url.href);
    for (const p of STRIP_PARAMS) stripped.searchParams.delete(p);
    return stripped;
  }

  // ---------------------------------------------------------------------------
  // 対象判定
  // ---------------------------------------------------------------------------

  function isTargetPage() {
    const path = location.pathname;
    return path === '/playlist' || path.startsWith('/feed/');
  }

  /** a が書き換え対象なら、その動画の item 要素を返す */
  function findTargetItem(a, url) {
    if (a.closest(EXCLUDE_SELECTOR)) return null;
    const item = a.closest(ITEM_SELECTOR);
    if (!item) return null;
    if (item.querySelector(COLLECTION_SELECTOR)) return null;

    const list = url.searchParams.get('list');
    if (list.startsWith('RD')) return null; // ミックスは対象外
    if (location.pathname !== '/playlist' && !FEED_TARGET_LISTS.has(list)) return null;
    return item;
  }

  // ---------------------------------------------------------------------------
  // リンクの書き換え
  // ---------------------------------------------------------------------------

  function clearAnchor(a) {
    a.removeAttribute(ATTR_ORIGINAL);
    a.removeAttribute(ATTR_STRIPPED);
    a.removeAttribute(ATTR_APPLIED);
  }

  function applyAnchor(a) {
    const desired = a.getAttribute(videoOnly ? ATTR_STRIPPED : ATTR_ORIGINAL);
    if (a.getAttribute('href') !== desired) a.setAttribute('href', desired);
    if (a.getAttribute(ATTR_APPLIED) !== desired) a.setAttribute(ATTR_APPLIED, desired);
  }

  /**
   * リンクを処理して、対象なら item 要素を返す。
   * YouTube が href を書き換えた（要素の使い回しなど）場合は original を取り直す。
   */
  function processAnchor(a) {
    const current = a.getAttribute('href');

    if (a.hasAttribute(ATTR_ORIGINAL) && current === a.getAttribute(ATTR_APPLIED)) {
      // 自分が設定した状態のまま。トグル状態とのずれだけ直す
      applyAnchor(a);
      return a.closest(ITEM_SELECTOR);
    }

    const url = parsePlaylistWatchUrl(current);
    const item = url && findTargetItem(a, url);
    if (!item) {
      if (a.hasAttribute(ATTR_ORIGINAL)) clearAnchor(a);
      return null;
    }

    a.setAttribute(ATTR_ORIGINAL, toRelative(url));
    a.setAttribute(ATTR_STRIPPED, toRelative(stripUrl(url)));
    applyAnchor(a);
    return item;
  }

  // ---------------------------------------------------------------------------
  // 追加ボタン（<a> なので中クリックで新しいタブに開ける）
  // ---------------------------------------------------------------------------

  function pickTitleAnchor(item, anchors) {
    const title = item.querySelector(TITLE_SELECTOR);
    if (title && anchors.includes(title)) return title;
    return anchors.find((a) => a.textContent.trim() !== '') ?? anchors[anchors.length - 1];
  }

  function buttonLabel() {
    return videoOnly ? '☰ プレイリスト付きで開く' : '▶ 動画だけで開く';
  }

  function ensureButton(item, anchors) {
    const title = pickTitleAnchor(item, anchors);
    const original = title.getAttribute(ATTR_ORIGINAL);
    const stripped = title.getAttribute(ATTR_STRIPPED);

    let btn = buttons.get(item);
    if (!btn || !item.contains(btn)) {
      btn = document.createElement('a');
      btn.className = BUTTON_CLASS;
      btn.draggable = false;
      buttons.set(item, btn);
    }

    const href = videoOnly ? original : stripped;
    const label = buttonLabel();
    if (btn.getAttribute('href') !== href) btn.setAttribute('href', href);
    if (btn.textContent !== label) btn.textContent = label;
    if (btn.title !== label) btn.title = label;

    // タイトルの見出し（h3）の直後に置く
    const h3 = title.closest('h3');
    const anchorPoint = h3 && item.contains(h3) ? h3 : title;
    if (anchorPoint.nextElementSibling !== btn) anchorPoint.after(btn);
  }

  // ---------------------------------------------------------------------------
  // スキャン
  // ---------------------------------------------------------------------------

  function scan() {
    // 動画ページなどでは何もしない（SPA で非表示のまま残る前ページの DOM は、
    // 戻ってきたときの yt-navigate-finish で再スキャンして同期する）
    if (!isTargetPage()) return;

    const groups = new Map(); // item -> anchors[]
    const anchors = document.querySelectorAll(
      `a[href*="list="]:not(.${BUTTON_CLASS}), a[${ATTR_ORIGINAL}]`,
    );
    for (const a of anchors) {
      const item = processAnchor(a);
      if (!item) continue;
      if (!groups.has(item)) groups.set(item, []);
      groups.get(item).push(a);
    }
    for (const [item, group] of groups) ensureButton(item, group);

    // 対象でなくなった item に残ったボタンを片付ける
    for (const btn of document.querySelectorAll(`.${BUTTON_CLASS}`)) {
      const item = btn.closest(ITEM_SELECTOR);
      if (!item || !groups.has(item) || buttons.get(item) !== btn) btn.remove();
    }
  }

  let scanTimer = 0;
  function scheduleScan() {
    if (scanTimer) return;
    scanTimer = setTimeout(() => {
      scanTimer = 0;
      scan();
    }, 100);
  }

  // ---------------------------------------------------------------------------
  // 左クリックの横取り（YouTube の SPA 遷移は href を見ないため）
  // ---------------------------------------------------------------------------

  function findAnchor(event) {
    for (const node of event.composedPath()) {
      if (node instanceof HTMLAnchorElement) return node;
      if (node === document.body) break;
    }
    return null;
  }

  function hardNavigate(event, href) {
    event.preventDefault();
    event.stopImmediatePropagation();
    location.assign(new URL(href, location.origin).href);
  }

  function onClick(event) {
    if (event.button !== 0 || event.defaultPrevented) return;
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;

    const a = findAnchor(event);
    if (!a) return;

    if (a.classList.contains(BUTTON_CLASS)) {
      hardNavigate(event, a.getAttribute('href'));
      return;
    }

    if (!isTargetPage()) return;
    // スキャン前のクリックや、直前に YouTube が href を変えた場合に備えて同期
    if (!processAnchor(a)) return;

    if (videoOnly) {
      hardNavigate(event, a.getAttribute(ATTR_STRIPPED));
    }
    // トグルOFF（プレイリスト付き）は YouTube 本来の SPA 遷移に任せる
  }

  // ---------------------------------------------------------------------------
  // 初期化
  // ---------------------------------------------------------------------------

  function setVideoOnly(value) {
    const next = value ?? DEFAULT_VIDEO_ONLY;
    if (next === videoOnly) return;
    videoOnly = next;
    scan();
  }

  window.addEventListener('click', onClick, true);

  ext.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && STORAGE_KEY in changes) {
      setVideoOnly(changes[STORAGE_KEY].newValue);
    }
  });

  const observer = new MutationObserver(scheduleScan);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['href'],
  });

  document.addEventListener('yt-navigate-finish', scheduleScan);

  ext.storage.local
    .get({ [STORAGE_KEY]: DEFAULT_VIDEO_ONLY })
    .then((items) => {
      videoOnly = items[STORAGE_KEY];
      scan();
    })
    .catch(() => scan());
})();
