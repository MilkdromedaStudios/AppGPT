# AppGPT ✦

**AppGPT** is a browser-based AI builder for Telegram Mini Apps. Connect your own AI provider, describe the app you want, preview the generated Mini App, edit it with AI, save projects locally, and export a single-file `index.html` ready for GitHub Pages.

## Features

- Telegram Mini App-aware generator
- BYOK (bring your own API key)
- Provider presets for OpenAI, OpenRouter, Groq, DeepSeek, Mistral, Together AI, xAI, Gemini, Anthropic, and custom OpenAI-compatible APIs
- AI app generation and iterative edits
- Phone-style live preview
- Browser-local project history
- Download generated app as `index.html`
- Responsive glass UI designed to work as a Telegram Mini App itself
- No build step required

## Run locally

Because the app uses ES modules, serve the folder through a local HTTP server instead of double-clicking `index.html`.

```bash
python -m http.server 8080
```

Then open `http://localhost:8080`.

## Deploy AppGPT with GitHub Pages

1. Put these files on the repository's `main` branch.
2. Open **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**.
4. Select `main` and `/(root)`.
5. Save.

Your site will normally be available at:

```text
https://MilkdromedaStudios.github.io/AppGPT/
```

## Connect it to Telegram

In **@BotFather**, select your bot and configure the Mini App / menu button with the HTTPS GitHub Pages URL.

The app loads Telegram's official Mini App JavaScript bridge:

```html
<script src="https://telegram.org/js/telegram-web-app.js"></script>
```

## API-key security ⚠️

GitHub Pages is static hosting. It cannot protect server-side secrets.

AppGPT therefore uses the provider key directly from the creator's browser. By default it is stored only for the browser session; creators may explicitly choose to remember it in local storage.

**Do not embed private provider keys in generated public apps.** If a generated app needs an AI service for all of its visitors, put the provider key behind a server-side proxy such as a Cloudflare Worker, Vercel Function, or another backend.

Some AI providers may block direct browser requests via CORS. In that case, use a provider that supports browser requests or add a secure proxy.

## Files

```text
AppGPT/
├── index.html
├── styles.css
├── app.js
├── providers.js
├── README.md
├── 404.html
└── .nojekyll
```

## Current MVP limits

- Generated projects live in the current browser's `localStorage`.
- Publishing generated apps is export-first; automatic repository creation is not included yet.
- GitHub Pages cannot run a backend.
- Provider model names/endpoints can change, so both model and base URL are editable.

## Next useful upgrades

- GitHub OAuth / PAT-based one-click publishing of generated apps
- Cloudflare Worker proxy for encrypted provider-key storage
- Templates and version history
- Multi-file generation
- Bot-token connection and menu-button configuration
- Optional database / accounts

## License

Apache License 2.0
