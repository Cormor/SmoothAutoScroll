'use strict'

const { randomBytes } = require('node:crypto')
const vscode = require('vscode')

function readerHtml(webview, script, style) {
  const nonce = randomBytes(16).toString('hex')
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}'">
  <link rel="stylesheet" href="${style}">
  <title>连续滚动阅读</title>
</head>
<body>
  <header class="toolbar" aria-label="滚动控制">
    <button type="button" id="toggle" disabled>开始</button>
    <div class="speed" role="group" aria-label="速度档位">
      <button type="button" id="slower" aria-label="向负方向调一档" disabled>−</button>
      <output id="level" aria-label="速度档位" aria-live="polite">+1</output>
      <button type="button" id="faster" aria-label="向正方向调一档" disabled>+</button>
    </div>
    <span id="status" role="status"></span>
    <span class="hint">滚轮调速 · Enter 启停 · Esc 停止</span>
  </header>
  <main id="viewport" tabindex="0" aria-label="文件内容">
    <div id="content"></div>
  </main>
  <script nonce="${nonce}" src="${script}"></script>
</body>
</html>`
}

function activate(context) {
  if (process.platform !== 'win32') return

  const media = vscode.Uri.joinPath(context.extensionUri, 'media')
  let reader

  function sendDocument(session, type) {
    const { document, tabSize } = session.source
    session.stale = false
    void session.panel.webview.postMessage({
      type,
      text: document.getText(),
      firstLine: session.source.firstLine,
      tabSize,
      visible: session.panel.visible,
    })
  }

  context.subscriptions.push(
    vscode.commands.registerCommand('smoothAutoScroll.toggle', () => {
      const editor = vscode.window.activeTextEditor
      const tab = vscode.window.tabGroups.activeTabGroup.activeTab
      if (!editor || !(tab?.input instanceof vscode.TabInputText) ||
          tab.input.uri.toString() !== editor.document.uri.toString()) return

      const source = {
        document: editor.document,
        firstLine: editor.visibleRanges[0]?.start.line ?? editor.selection.active.line,
        tabSize: typeof editor.options.tabSize === 'number' ? editor.options.tabSize : 4,
      }
      const name = source.document.uri.path.split('/').pop() || '无标题文件'
      const title = `${name} · 阅读`

      if (reader) {
        reader.source = source
        reader.stale = false
        reader.panel.title = title
        reader.panel.reveal(editor.viewColumn)
        if (reader.ready) sendDocument(reader, 'open')
        return
      }

      const panel = vscode.window.createWebviewPanel(
        'smoothAutoScroll.reader', title, editor.viewColumn ?? vscode.ViewColumn.Active,
        { enableScripts: true, localResourceRoots: [media], retainContextWhenHidden: true },
      )
      const session = { panel, source, ready: false, stale: false }
      reader = session
      const handlers = [
        panel.webview.onDidReceiveMessage((message) => {
          if (message?.type !== 'ready' || reader !== session || session.ready) return
          session.ready = true
          sendDocument(session, 'open')
        }),
        panel.onDidChangeViewState(({ webviewPanel }) => {
          if (!session.ready) return
          if (webviewPanel.visible && session.stale) sendDocument(session, 'update')
          else void panel.webview.postMessage({ type: 'visibility', visible: webviewPanel.visible })
        }),
        panel.onDidDispose(() => {
          if (reader === session) reader = undefined
          for (const handler of handlers) handler.dispose()
        }),
      ]

      panel.iconPath = vscode.Uri.joinPath(media, 'scroll.svg')
      panel.webview.html = readerHtml(
        panel.webview,
        panel.webview.asWebviewUri(vscode.Uri.joinPath(media, 'controls.js')),
        panel.webview.asWebviewUri(vscode.Uri.joinPath(media, 'controls.css')),
      )
    }),
    vscode.workspace.onDidChangeTextDocument(({ document, contentChanges }) => {
      if (!reader || contentChanges.length === 0 ||
          document.uri.toString() !== reader.source.document.uri.toString()) return

      reader.source.document = document
      if (!reader.ready) return
      if (reader.panel.visible) sendDocument(reader, 'update')
      else reader.stale = true
    }),
    { dispose: () => reader?.panel.dispose() },
  )
}

module.exports = { activate }
