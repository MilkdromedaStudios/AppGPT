# AppGPT ✦

AppGPT is a static, GitHub Pages-friendly Telegram Mini App builder that lets users bring their own AI provider and generate working Telegram Mini Apps from natural-language prompts.

## Features

- Build a Telegram Mini App from a text prompt
- Continue editing the same app with AI
- Persistent multi-chat sessions with automatic resume
- IndexedDB chat/project storage, with browser fallback
- Telegram DeviceStorage for restoring the last session when supported
- Telegram SecureStorage for remembered API keys when supported
- Live Telegram-style phone preview
- Download generated apps as a single `index.html`
- OpenAI, OpenRouter, Groq, DeepSeek, Mistral, Together, xAI, Gemini, Anthropic, and custom OpenAI-compatible endpoints
- Donation UI for Telegram Stars, TON, and external card/support links
- Works as a normal website and inside a Telegram Mini App

## Storage

AppGPT does not use cookies for large chat histories. Cookies are too small for generated HTML and many conversations.

Instead it uses:

- **IndexedDB** for chats, messages, and generated app HTML
- **Telegram DeviceStorage** for the most recently opened chat when available
- **Telegram SecureStorage** for a remembered AI API key when available
- Browser storage fallbacks outside Telegram

This is local/device storage. Cross-device account sync requires a backend/database and is not included in the GitHub Pages-only version.

## AI provider setup

Open **Provider**, choose a provider, paste an API key, select a model, and test the connection.

> GitHub Pages is a static host. Some AI providers may reject direct browser requests because of CORS, and public/shared generated AI apps should use a backend proxy so secrets are never exposed to visitors.

## Donations

Public donation destinations are configured in `config.js`.

```js
export const DONATION_CONFIG = {
  botUsername: "",
  starsEndpoint: "",
  tonAddress: "",
  cardDonationUrl: "",
  starAmounts: [50, 100, 250, 500],
  tonAmounts: [0.5, 1, 5]
};
```

### Telegram Stars

The recommended flow is to set `starsEndpoint` to a small secure backend endpoint. It should receive the requested Stars amount, call Telegram's Bot API with the private bot token, create an `XTR` invoice/invoice link, and return:

```json
{ "invoiceUrl": "https://t.me/$..." }
```

AppGPT then opens that invoice with `Telegram.WebApp.openInvoice()`.

**Never put the Telegram bot token in this GitHub repository or any GitHub Pages JavaScript.**

As a simpler fallback, `botUsername` can deep-link users back to your bot using payloads like `donate_100`, where your bot can send the Stars invoice.

### TON

Set `tonAddress` to a public receiving wallet address. The donation buttons open a `ton://transfer/...` link with the selected amount.

### Card / real money

Set `cardDonationUrl` to a public checkout/support URL such as a Stripe Payment Link or creator-support page. Do not put secret payment-provider keys in the repository.

## GitHub Pages

1. Open **Settings → Pages** in the GitHub repository.
2. Choose **Deploy from a branch**.
3. Select `main` and `/ (root)`.
4. Save.

For this repository the expected URL is:

`https://milkdromedastudios.github.io/AppGPT/`

## Telegram setup

In `@BotFather`:

1. Choose your existing bot.
2. Configure its Main Mini App or menu button.
3. Use your GitHub Pages HTTPS URL.

## Security

- Never hardcode API keys into generated public apps.
- Never expose a Telegram bot token in frontend JavaScript.
- Never put payment-provider secret keys in `config.js`.
- `config.js` is for public values only: receiving address, bot username, public support URL, and public backend URL.

## License

See `LICENSE`.
