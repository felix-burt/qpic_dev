import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as crypto from 'crypto';

let previewPanel: vscode.WebviewPanel | undefined;
let statusBarItem: vscode.StatusBarItem;
let extensionUri: vscode.Uri;
let currentProc: cp.ChildProcess | undefined;
let debounceTimer: ReturnType<typeof setTimeout> | undefined;

export function activate(context: vscode.ExtensionContext) {
    extensionUri = context.extensionUri;

    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0);
    statusBarItem.command = 'qpic.showPreview';
    context.subscriptions.push(statusBarItem);

    context.subscriptions.push(
        vscode.commands.registerCommand('qpic.showPreview', () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor || !editor.document.fileName.endsWith('.qpic')) {
                vscode.window.showErrorMessage('Open a .qpic file first.');
                return;
            }
            openOrRevealPreview(editor.document);
        })
    );

    // Update status bar when switching to/from a .qpic file
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(editor => {
            if (editor?.document.fileName.endsWith('.qpic')) {
                statusBarItem.text = '$(open-preview) qpic Preview';
                statusBarItem.tooltip = 'Click to open qpic preview';
                statusBarItem.show();
            } else {
                statusBarItem.hide();
            }
        })
    );

    // Recompile on save if the preview panel is open (debounced)
    context.subscriptions.push(
        vscode.workspace.onDidSaveTextDocument(doc => {
            const config = vscode.workspace.getConfiguration('qpic');
            if (
                doc.fileName.endsWith('.qpic') &&
                previewPanel &&
                config.get<boolean>('autoRefreshOnSave', true)
            ) {
                if (debounceTimer) { clearTimeout(debounceTimer); }
                debounceTimer = setTimeout(() => compileAndRefresh(doc.fileName), 300);
            }
        })
    );

    // Show status bar if a .qpic file is already open on activation
    if (vscode.window.activeTextEditor?.document.fileName.endsWith('.qpic')) {
        statusBarItem.text = '$(open-preview) qpic Preview';
        statusBarItem.tooltip = 'Click to open qpic preview';
        statusBarItem.show();
    }
}

function openOrRevealPreview(doc: vscode.TextDocument) {
    if (previewPanel) {
        previewPanel.reveal(vscode.ViewColumn.Beside, true);
    } else {
        const pdfJsBuildDir = vscode.Uri.joinPath(
            extensionUri, 'node_modules', 'pdfjs-dist', 'build'
        );
        previewPanel = vscode.window.createWebviewPanel(
            'qpicPreview',
            'qpic Preview',
            { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
            {
                enableScripts: true,
                localResourceRoots: [pdfJsBuildDir],
            }
        );
        previewPanel.onDidDispose(() => {
            previewPanel = undefined;
        });

        // Set the viewer HTML once — PDF.js is kept alive for the panel's lifetime.
        const pdfJsUri = previewPanel.webview.asWebviewUri(
            vscode.Uri.joinPath(extensionUri, 'node_modules', 'pdfjs-dist', 'build', 'pdf.min.js')
        );
        const workerUri = previewPanel.webview.asWebviewUri(
            vscode.Uri.joinPath(extensionUri, 'node_modules', 'pdfjs-dist', 'build', 'pdf.worker.min.js')
        );
        previewPanel.webview.html = buildViewerHtml(pdfJsUri, workerUri);
    }
    compileAndRefresh(doc.fileName);
}

function compileAndRefresh(qpicFile: string) {
    if (!previewPanel) { return; }

    // Kill any in-progress compile before starting a new one
    if (currentProc) {
        currentProc.kill();
        currentProc = undefined;
    }

    const config = vscode.workspace.getConfiguration('qpic');
    const qpicExe = config.get<string>('executablePath', 'qpic');

    const hash = crypto.createHash('md5').update(qpicFile).digest('hex').slice(0, 8);
    const workDir = path.join(os.tmpdir(), `qpic_ext_${hash}`);
    fs.mkdirSync(workDir, { recursive: true });
    const outFilename = 'preview.pdf';
    const tmpPdf = path.join(workDir, outFilename);

    setStatus('compiling');
    previewPanel.webview.postMessage({ type: 'loading' });

    const args = ['--filetype', 'pdf', '--outfile', outFilename, qpicFile];
    const proc = cp.spawn(qpicExe, args, { cwd: workDir });
    currentProc = proc;

    let stderr = '';
    proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    proc.stdout.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

    proc.on('error', err => {
        if (proc !== currentProc) { return; }
        currentProc = undefined;
        setStatus('error');
        previewPanel?.webview.postMessage({
            type: 'error',
            message:
                `Could not launch '${qpicExe}'.\n\n` +
                `Make sure qpic is installed and the 'qpic.executablePath' setting is correct.\n\n` +
                err.message,
        });
    });

    proc.on('close', code => {
        if (proc !== currentProc) { return; } // superseded by a newer compile
        currentProc = undefined;
        if (code !== 0 || !fs.existsSync(tmpPdf)) {
            setStatus('error');
            previewPanel?.webview.postMessage({
                type: 'error',
                message: stderr || `qpic exited with code ${code}`,
            });
            return;
        }
        try {
            const base64 = fs.readFileSync(tmpPdf).toString('base64');
            setStatus('ok');
            previewPanel?.webview.postMessage({
                type: 'update',
                base64,
                filename: path.basename(qpicFile),
            });
        } catch (e) {
            setStatus('error');
            previewPanel?.webview.postMessage({ type: 'error', message: String(e) });
        }
    });
}

function setStatus(state: 'compiling' | 'ok' | 'error') {
    const icons: Record<typeof state, string> = {
        compiling: '$(sync~spin) qpic: compiling…',
        ok: '$(check) qpic: OK',
        error: '$(error) qpic: error',
    };
    statusBarItem.text = icons[state];
    statusBarItem.show();
}

// ---------------------------------------------------------------------------
// HTML builder — called once per panel lifetime
// ---------------------------------------------------------------------------

function buildViewerHtml(pdfJsUri: vscode.Uri, workerUri: vscode.Uri): string {
    return `<!DOCTYPE html>
<html>
<head>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #404040; display: flex; flex-direction: column; min-height: 100vh; }
    .toolbar {
      position: sticky; top: 0; z-index: 10;
      background: #2d2d2d; border-bottom: 1px solid #555;
      padding: 6px 12px; display: flex; align-items: center; gap: 8px;
      font-family: sans-serif; font-size: 12px; color: #ccc;
    }
    .filename { font-weight: 600; color: #eee; }
    .spacer { flex: 1; }
    button {
      border: 1px solid #666; background: #3c3c3c; color: #ccc;
      border-radius: 4px; padding: 2px 8px; cursor: pointer; font-size: 12px;
    }
    button:hover { background: #505050; }
    #pages { padding: 16px; display: flex; flex-direction: column; align-items: center; gap: 12px; }
    canvas { box-shadow: 0 2px 8px rgba(0,0,0,0.5); background: white; display: block; }
    #overlay {
      position: fixed; inset: 0;
      display: flex; align-items: center; justify-content: center;
      font-family: sans-serif; font-size: 14px; color: #ccc;
      background: #1e1e1e;
    }
    #overlay.hidden { display: none; }
    #error-box {
      display: none;
      padding: 24px; color: #f48771; font-family: monospace; font-size: 13px;
    }
    #error-box.visible { display: block; }
    #error-title { font-size: 15px; font-weight: bold; margin-bottom: 12px; }
  </style>
</head>
<body>
  <div class="toolbar" id="toolbar" style="display:none">
    <span class="filename" id="filename"></span>
    <span class="spacer"></span>
    <button onclick="zoom(-0.2)">−</button>
    <span id="zoom-label">100%</span>
    <button onclick="zoom(0.2)">+</button>
    <button onclick="reset()">Reset</button>
  </div>

  <div id="overlay">Compiling…</div>
  <div id="error-box"><div id="error-title">⚠ Compile error</div><pre id="error-pre" style="white-space:pre-wrap;word-break:break-all"></pre></div>
  <div id="pages"></div>

  <script src="${pdfJsUri}"></script>
  <script>
    pdfjsLib.GlobalWorkerOptions.workerSrc = '${workerUri}';

    let pdfDoc = null;
    let scale = 1.5;
    let loadingTask = null;

    window.addEventListener('message', event => {
      const msg = event.data;
      if (msg.type === 'loading') {
        showOverlay('Compiling\u2026');
      } else if (msg.type === 'update') {
        loadPdf(msg.base64, msg.filename);
      } else if (msg.type === 'error') {
        showError(msg.message);
      }
    });

    function showOverlay(text) {
      document.getElementById('overlay').textContent = text;
      document.getElementById('overlay').classList.remove('hidden');
      document.getElementById('error-box').classList.remove('visible');
      document.getElementById('toolbar').style.display = 'none';
    }

    function showError(message) {
      document.getElementById('overlay').classList.add('hidden');
      document.getElementById('error-box').classList.add('visible');
      document.getElementById('error-pre').textContent = message;
      document.getElementById('toolbar').style.display = 'none';
    }

    function loadPdf(base64, filename) {
      // Cancel any in-progress load so old tasks don't stomp on the new one
      if (loadingTask) { loadingTask.destroy(); loadingTask = null; }

      const pdfData = atob(base64);
      const bytes = new Uint8Array(pdfData.length);
      for (let i = 0; i < pdfData.length; i++) bytes[i] = pdfData.charCodeAt(i);

      loadingTask = pdfjsLib.getDocument({ data: bytes });
      loadingTask.promise.then(doc => {
        pdfDoc = doc;
        loadingTask = null;
        document.getElementById('overlay').classList.add('hidden');
        document.getElementById('error-box').classList.remove('visible');
        document.getElementById('toolbar').style.display = '';
        document.getElementById('filename').textContent = filename;
        renderAll();
      }).catch(err => {
        loadingTask = null;
        showError('PDF render error: ' + err.message);
      });
    }

    function renderAll() {
      const container = document.getElementById('pages');
      container.innerHTML = '';
      for (let i = 1; i <= pdfDoc.numPages; i++) renderPage(i, container);
      document.getElementById('zoom-label').textContent = Math.round(scale / 1.5 * 100) + '%';
    }

    function renderPage(num, container) {
      pdfDoc.getPage(num).then(page => {
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        container.appendChild(canvas);
        page.render({ canvasContext: canvas.getContext('2d'), viewport });
      });
    }

    function zoom(delta) {
      scale = Math.max(0.5, Math.min(6, scale + delta * 1.5));
      if (pdfDoc) renderAll();
    }

    function reset() {
      scale = 1.5;
      if (pdfDoc) renderAll();
    }
  </script>
</body>
</html>`;
}

export function deactivate() {}
