# AppGPT Telegram bot onboarding

This directory contains a deployable Cloudflare Worker for the AppGPT Telegram bot.

It handles:

- `/start` — welcome message + Open AppGPT, Templates, AI Providers, Quick Start, and GitHub buttons
- `/app` — opens the builder
- `/templates` — opens AppGPT directly on Templates
- `/providers` — opens AppGPT directly on Provider settings
- `/help` — command help + quick-start link
- a default Telegram menu button that opens AppGPT

The bot token is **never committed to GitHub**.

## 1. Deploy the Worker

Install Wrangler if needed, then from this `bot` directory:

```bash
npx wrangler secret put BOT_TOKEN
npx wrangler secret put WEBHOOK_SECRET
npx wrangler deploy
```

Use a random `WEBHOOK_SECRET` containing only letters, numbers, `_`, or `-` (1–256 characters). Use the same value in the setup command below.

Wrangler will print a Worker URL similar to:

```text
https://appgpt-bot.<your-cloudflare-subdomain>.workers.dev
```

The Worker exposes `/health` for a simple health check and `/webhook` for Telegram updates.

## 2. Configure Telegram

Run the setup script from the repository root with your secrets in environment variables:

```bash
BOT_TOKEN='your-telegram-bot-token' \
WORKER_URL='https://appgpt-bot.<your-cloudflare-subdomain>.workers.dev' \
WEBHOOK_SECRET='the-same-webhook-secret' \
node bot/setup.mjs
```

The script configures:

- `/start`, `/app`, `/templates`, `/providers`, and `/help`
- bot description and short description
- the persistent **Open AppGPT** menu button
- Telegram webhook delivery to `<WORKER_URL>/webhook`
- Telegram's webhook secret-token header verification

## Default links

The Worker is already configured for:

- AppGPT: `https://milkdromedastudios.github.io/AppGPT/`
- Quick Start: `https://milkdromedastudios.github.io/AppGPT/getting-started.html`
- GitHub: `https://github.com/MilkdromedaStudios/AppGPT`

These can be changed with Cloudflare Worker variables `APP_URL` and `GITHUB_URL` if the project URL changes later.

## Security

- `BOT_TOKEN` is a Cloudflare secret.
- `WEBHOOK_SECRET` is a Cloudflare secret and is verified against Telegram's `X-Telegram-Bot-Api-Secret-Token` header.
- Do not put either secret into the GitHub Pages frontend.
