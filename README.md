# AppGPT ✦

AppGPT is a GitHub Pages-friendly AI builder for **Telegram Mini Apps**. A creator brings their own model API key, describes an app (or attaches a screenshot), and AppGPT produces a versioned, single-file `index.html` that can be previewed, edited, debugged, downloaded, and published.

## What works now

### Persistent chats
- A draft chat is saved **before** generation starts.
- Build/edit requests are saved before the AI network call.
- Failed or long-running generations do not make the chat disappear.
- Every generated/edit/repair/visual-edit result is a versioned `index.html` artifact stored in that chat.

### Fast and Reviewed build modes
- **Fast**: one main generation call.
- **Reviewed**: planner → builder → QA reviewer → conditional repair.
- Build progress uses real milestones. While the provider is generating, the bar stays in an explicit waiting state instead of pretending to know an exact completion percentage.

### Screenshot → app
- Attach an image as design/reference input.
- AppGPT compresses the image in the browser before sending it.
- Gemini, OpenAI-compatible vision models, Anthropic vision models, and other compatible models can receive the screenshot as multimodal input.
- The exact model must support vision; provider presets are only best-effort defaults.

### Automatic debugging
- Static checks catch incomplete HTML, missing mobile viewport, missing Telegram SDK, `eval()`/`new Function()`, probable exposed bot tokens/API keys, and several UX/performance warnings.
- The preview injects a small debugging bridge that reports `console.error`, uncaught errors, and unhandled promise rejections back to AppGPT with `postMessage`.
- **Auto-fix** sends real diagnostics plus the current HTML to the selected model and saves the repaired result as a new version.

### Visual editor
- Turn on **Visual edit mode** and click an element in the phone preview.
- Edit leaf text, text/background colors, font size, border radius, and padding.
- Saving a visual edit creates a new `index.html` version without spending an AI call.

### Templates
- 12 built-in templates across education, productivity, games, finance, lifestyle, travel, commerce, and utilities.
- Templates can be exported as shareable `.appgpt-template.json` files.
- Imported template JSON is validated and stored locally.
- This provides real template sharing without pretending AppGPT already has a cross-user marketplace/database.

### One-click GitHub Pages publishing
The Publish screen can:
1. Authenticate with a GitHub personal access token kept in the current browser session.
2. Create a public repository under the token owner's account if it does not exist.
3. Create or update `index.html` in the repository root.
4. Attempt to enable GitHub Pages from the repository's default branch root.

GitHub token requirements depend on token type and repository settings. For automatic Pages configuration, the token needs suitable repository contents plus Pages/administration permissions.

## Telegram integration

AppGPT itself uses the Telegram Mini App bridge when launched inside Telegram:
- `Telegram.WebApp.ready()` / `expand()`
- Main and secondary bottom buttons when available
- Settings and Back buttons
- Haptic feedback
- DeviceStorage / SecureStorage fallbacks for session and key-related state when supported

Generated apps are instructed to load the official Telegram Web App JavaScript bridge, feature-detect Telegram APIs, use Telegram theme/safe-area variables where practical, and still work in an ordinary browser preview.

## AI provider support

Presets include OpenAI, OpenRouter, Groq, DeepSeek, Mistral, Together AI, xAI, Gemini, Anthropic, and a custom OpenAI-compatible endpoint.

### Gemini HTML-only handling
For build/repair requests AppGPT asks Gemini for structured JSON with one `html` field, then extracts that field. AppGPT still runs its normal HTML extractor/validator as a fallback.

### API-key safety
Provider API keys belong to the creator and are never written into a generated app. Remembered provider keys use Telegram SecureStorage where supported; outside Telegram, AppGPT falls back to browser storage.

## Run locally

```bash
python -m http.server 8080
```

Then open `http://localhost:8080`.

## GitHub Pages for AppGPT

For this repository, enable Pages from the `main` branch and repository root. The expected URL is:

`https://milkdromedastudios.github.io/AppGPT/`

## Architecture

- `index.html` — builder UI
- `styles.css` — responsive glass/Telegram-style interface
- `main.js` — chat/build/edit/debug/visual/template/publish workflow
- `thinking.js` — progress panel driven by real build milestone events
- `providers.js` — provider adapters, including multimodal input and Gemini structured HTML output
- `storage.js` — IndexedDB chats/templates plus Telegram/browser storage helpers
- `templates.js` — built-in templates and import/export validation
- `preview-tools.js` — static audit, runtime bridge, visual-edit patching
- `github-publish.js` — browser-side GitHub repository/content/Pages publishing
- `app-state.js` — shared UI/state helpers
- `build-engine.js` — generation, planner/reviewer mode, repairs, and artifact versioning

## Intentional boundary

A true cross-user community marketplace, account sync, shared project database, server-side secrets, and collaborative editing require a backend. AppGPT does not show fake buttons for those features in the GitHub Pages-only build.

## License

See `LICENSE`.
