# YouTube Video Only

YouTube の再生リスト（特に「後で見る」）から動画を開くと、プレイリストごと読み込まれて重くなる。
この拡張機能を使うと、プレイリストを読み込まない動画だけのページで開ける。Chrome と Firefox の両方で使える（Manifest V3）。

## 動作

| トグル | 通常クリック（リンク） | 追加ボタン |
| --- | --- | --- |
| ON（デフォルト） | 動画だけ | プレイリスト付き |
| OFF | プレイリスト付き | 動画だけ |

- トグルはツールバーのアイコンから切り替える。開いているページのリンクとボタンもすぐに切り替わる。
- 「動画だけ」の URL は `list` と `index` を外したもの。`t=`（再生位置）などはそのまま残す。
- リンクの `href` 自体を書き換えているので、**中クリック**や Ctrl+クリックでもその URL が新しいタブで開く。追加ボタンも `<a>` なので同じように使える。
- 対象
  - `/playlist?list=...`（後で見る、自分の再生リストなど）の各動画
  - `/feed/...`（「あなた」ページなど）にある「後で見る」(WL)・「高く評価した動画」(LL) の動画
  - 「すべて再生」ボタン、再生リストのカード、ミックス（`RD...`）、動画ページ内の再生リストパネルは対象外

## ビルド

```sh
./build.sh
```

`dist/chrome/`・`dist/firefox/` と、それぞれの zip ができる。アイコンの PNG は `rsvg-convert` があれば `src/icons/icon.svg` から生成する。

## インストール（開発版）

- **Chrome / Edge / Brave など**: `chrome://extensions` →「デベロッパーモード」をオン →「パッケージ化されていない拡張機能を読み込む」で `dist/chrome` を選ぶ
- **Firefox**: `about:debugging#/runtime/this-firefox` →「一時的なアドオンを読み込む」で `dist/firefox/manifest.json` を選ぶ（Firefox を再起動すると外れる。ずっと使うなら AMO で署名した `dist/firefox.zip` を入れる）
  - 拡張機能の管理画面で、www.youtube.com へのアクセスが許可されていることを確認する

## 構成

```
src/
  content.js    YouTube 上で動く本体（リンクの書き換え・ボタン・クリックの横取り）
  content.css   追加ボタンのスタイル
  popup.*       トグル用のポップアップ
  icons/
manifests/
  chrome.json   Chrome 用 manifest
  firefox.json  Firefox 用 manifest（gecko id・data_collection_permissions を含む）
build.sh
```

## 実装メモ

- 各リンクに `data-ytvo-original`（プレイリスト付き）・`data-ytvo-stripped`（動画だけ）を持たせ、トグルの状態に合わせて `href` を切り替える。
- YouTube は要素を使い回して `href` を書き換えることがある。自分が最後に設定した値（`data-ytvo-applied`）と違っていたら、元の URL を取り直す。
- 変化の検出は `MutationObserver`（子要素の追加と `href` 属性の変化）と `yt-navigate-finish` イベントで行う。
- YouTube の SPA 遷移は左クリック時に `href` ではなく内部のデータを使う。そのため「動画だけ」で開く左クリックは `window` の capture フェーズで横取りし、`location.assign` でページごと読み込む。「プレイリスト付き」の左クリックは YouTube 本来の SPA 遷移に任せる。
- トグルの状態は `storage.local` の `videoOnly` に保存する（デフォルトは `true`）。
