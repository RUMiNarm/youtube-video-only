'use strict';

const ext = globalThis.browser ?? globalThis.chrome;

const STORAGE_KEY = 'videoOnly';
const DEFAULT_VIDEO_ONLY = true;

const toggle = document.getElementById('toggle');
const linkMode = document.getElementById('link-mode');
const buttonMode = document.getElementById('button-mode');

function render(videoOnly) {
  toggle.checked = videoOnly;
  linkMode.textContent = videoOnly ? '動画だけ' : 'プレイリスト付き';
  buttonMode.textContent = videoOnly ? 'プレイリスト付き' : '動画だけ';
}

toggle.addEventListener('change', () => {
  render(toggle.checked);
  ext.storage.local.set({ [STORAGE_KEY]: toggle.checked });
});

ext.storage.local
  .get({ [STORAGE_KEY]: DEFAULT_VIDEO_ONLY })
  .then((items) => render(items[STORAGE_KEY]));
