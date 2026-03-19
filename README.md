# PaperAgent

PaperAgent is an Electron desktop app for research-oriented LLM conversations. It keeps a lightweight session outline, stores document context, and lets you continue long-running discussions without losing track of the material you already explored.

## What It Does

- Streams model responses in the desktop UI
- Supports OpenAI-compatible APIs and Anthropic Claude
- Persists sessions automatically and lets you export or import them as JSON
- Extracts text from PDFs and images, then keeps those documents attached to the active session
- Maintains a session outline and entity map after each turn
- Renders assistant responses as Markdown
- Lets you rename sessions, browse session history, and collapse side panels

## Current UI

The app uses a three-panel layout:

- Left: session history
- Center-left: session outline
- Center: chat area
- Right: document library

All three side panels are foldable. Session cards in the history panel are clickable and load the related session directly.

## Supported Providers

| Provider | Base URL Behavior |
| --- | --- |
| OpenAI | Enter `https://api.openai.com/v1` |
| DeepSeek | Enter `https://api.deepseek.com` or `https://api.deepseek.com/v1`, depending on the endpoint you want to use |
| Ollama | Enter your local endpoint, for example `http://localhost:11434/v1` if your proxy exposes OpenAI-style routes |
| Anthropic | Select `Anthropic` and provide an API key |
| Other OpenAI-compatible services | Enter the exact base URL your provider expects |

For OpenAI-compatible providers, PaperAgent uses the Base URL literally. If your provider requires `/v1`, include `/v1` yourself.

## Session Storage

PaperAgent stores session data in two places:

- Autosaved session snapshots: `app.getPath('userData')/sessions/<sessionId>.json`
- Session history index in the renderer: `localStorage['paperAgentSessions']`

Configuration is stored at `app.getPath('userData')/config.json`.

On Linux, Electron typically resolves `userData` to `~/.config/PaperAgent/`.

## Project Structure

```text
src/
├── main/
│   ├── index.ts
│   └── mainWindow.ts
├── preload/
│   └── index.ts
├── renderer/
│   ├── index.html
│   ├── styles/main.css
│   └── scripts/
│       ├── main.ts
│       ├── components/
│       │   ├── outlineComponent.ts
│       │   └── sessionManager.ts
│       └── services/
│           ├── contextService.ts
│           ├── documentService.ts
│           └── llmService.ts
└── shared/
    ├── types.ts
    └── utils.ts
```

The repository also keeps JavaScript mirror files under `src/renderer/scripts/` because this project still carries a direct JS copy of some renderer modules alongside the TypeScript sources.

## Local Development

Install dependencies:

```bash
npm install
```

Run in development mode:

```bash
npm run dev
```

Compile without packaging:

```bash
npm run compile
```

Build platform packages:

```bash
npm run build:linux
npm run build:win
npm run build:mac
```

Electron Builder writes release artifacts to `release/`.

## Packaging Notes

- Linux packages are wrapped to launch with `--no-sandbox`
- PDF extraction uses `pdfjs-dist/build/pdf.js` and bundled standard fonts
- The app does not rely on the optional native `canvas` dependency at runtime
- Packaging disables native dependency rebuilds to keep GitHub Actions builds portable across Linux, Windows, and macOS

## GitHub Releases

The repository includes a release workflow at `.github/workflows/release.yml`.

- Pushing a tag that matches `v*` publishes a GitHub release
- The workflow builds Windows, macOS, and Linux binaries
- Release assets are uploaded automatically to the matching GitHub release

## Architecture Summary

### Main Process

- Creates the Electron window
- Handles file dialogs
- Saves and loads sessions
- Extracts PDF and OCR text
- Proxies streaming LLM requests

### Renderer

- Owns the chat UI
- Manages session history and session title editing
- Renders Markdown responses
- Updates the outline and document panels
- Persists session history metadata to localStorage

### Context Flow

1. The user sends a message
2. The renderer builds a prompt from the current outline, documents, and recent history
3. The main process streams the provider response back to the renderer
4. The renderer updates the conversation history
5. The context service extracts key points and entities
6. The outline and entity map are updated
7. The session snapshot is autosaved

## Known Limits

- The Markdown renderer is lightweight and intentionally not a full CommonMark implementation
- The session history index is stored in localStorage, so deleting browser storage resets the visible history list
- Linux may still print upstream Electron and input-method warnings that do not affect app behavior
