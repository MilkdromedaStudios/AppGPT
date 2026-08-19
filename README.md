# AppGPT ✦

AppGPT is a GitHub Pages-friendly AI builder for **Telegram Mini Apps**.

The core idea is intentionally simple: every generation produces **one complete `index.html` file** containing the app's HTML, CSS, and JavaScript. The generated file is attached to a persistent build chat so users can come back, continue editing, preview older versions, copy the HTML, or download it later.

## Current features

- Persistent multi-chat history using IndexedDB
- Automatically resumes the last opened chat
- Versioned `index.html` artifacts saved inside each chat
- Preview / Copy HTML / Download controls on generated-file cards
- AI editing creates a new HTML version instead of destroying chat history
- Dedicated Telegram Mini App system instructions for the AI
- Robust extraction of HTML even if a model accidentally wraps it in a code fence
- Validation that generated output contains a full HTML document
- BYOK support for OpenAI, OpenRouter, Groq, DeepSeek, Mistral, Together, xAI, Gemini, Anthropic, and custom OpenAI-compatible APIs
- Telegram SecureStorage for remembered API keys when available
- Telegram DeviceStorage for last-session restoration when available
- Normal-browser fallbacks

## Telegram-native create flow

When AppGPT runs inside Telegram it uses Telegram Mini App UI APIs when available:

- `MainButton` → opens the Create App flow
- `SecondaryButton` → opens Chats
- `SettingsButton` → opens Provider settings
- `BackButton` → returns to the builder
- `showPopup()` → native confirmation before creating an app
- `HapticFeedback` → native-feeling success/error/selection feedback

Telegram's native popup does not provide arbitrary text fields, so after the native confirmation AppGPT opens its own Telegram-themed setup sheet for:

- App name
- What the app should do
- Visual style
- Extra instructions

Pressing **Create app** sends those details to the selected AI provider and automatically generates the saved `index.html` artifact.

## AI output contract

AppGPT gives the model a separate system instruction dedicated to Telegram app generation. It requires:

1. Exactly one complete `index.html`
2. Raw HTML only — no Markdown explanation
3. All CSS inside `<style>` tags
4. All JavaScript inside `<script>` tags
5. Telegram's `telegram-web-app.js` SDK included
6. Telegram APIs feature-detected with browser fallbacks
7. No bot tokens or secret credentials embedded in generated code
8. No React/npm/build step required

When a user asks for an edit, AppGPT sends the current HTML plus the edit request and requires the model to return the **complete replacement `index.html`**, which becomes the next saved version.

## How files are stored in chats

Each chat stores:

- Messages
- App metadata
- Up to 20 recent HTML artifacts
- Latest artifact ID

An assistant message can reference an `artifactId`. The artifact record contains the real HTML text, filename, MIME type, version, byte size, and creation time. This is why AppGPT can reliably show a file card and export the file without trying to scrape code out of chat text.

## Storage

Large chats and generated HTML are stored in **IndexedDB**, not cookies. The latest chat ID can also be mirrored into Telegram DeviceStorage where available. API keys can use Telegram SecureStorage where available.

Storage is still device-local in this GitHub Pages-only version. True account-based cross-device chat sync would require a backend/database.

## GitHub Pages

Expected URL for this repository:

`https://milkdromedastudios.github.io/AppGPT/`

Enable it from **Settings → Pages → Deploy from a branch → main → /(root)** if it is not already enabled.

## Telegram setup

In `@BotFather`, configure your existing bot's Mini App/menu button to use the GitHub Pages HTTPS URL.

AppGPT can generate the **Mini App frontend**, but frontend JavaScript cannot securely create a Telegram bot or register a Main Mini App with BotFather automatically. Those bot-level operations require Telegram's bot configuration flow and, for Bot API calls involving secrets, a secure backend.

## Security

- Never commit Telegram bot tokens.
- Never hardcode private AI-provider keys into generated public apps.
- GitHub Pages is static hosting and cannot keep secrets from visitors.

## License

See `LICENSE`.
