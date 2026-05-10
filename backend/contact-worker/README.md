# CloudGenesis Contact Worker

This Worker is the backend for the static Hugo contact form and the controlled FAQ chatbot. GitHub Pages hosts the website only; email delivery, validation, CAPTCHA verification, rate limiting, spam checks, and chatbot FAQ matching run here so secrets never ship to the browser.

The chatbot is FAQ-based only. It does not use OpenAI, AI APIs, vector search, embeddings, RAG, LangChain, databases, or any external chatbot service.

## Guardrails

- Accepts `POST` JSON only.
- Allows only configured origins via `ALLOWED_ORIGINS`.
- Validates name, email, phone, subject, and message length.
- Uses a honeypot field named `company`.
- Verifies Cloudflare Turnstile when `TURNSTILE_SECRET_KEY` is configured.
- Supports Cloudflare KV rate limiting through `CONTACT_RATE_LIMIT`.
- Applies a lightweight spam score before email delivery.
- Sends email through Resend using server-side secrets.
- Optionally sends a Telegram notification using Worker secrets.
- Responds to `/chat` with predefined CloudGenesis FAQ answers only.
- Returns generic failure messages to avoid leaking spam-filter details.

## Endpoints

### `POST /`

Handles contact form submissions. This route validates the request, verifies Turnstile when configured, sends the email through Resend, and optionally sends a Telegram notification.

### `POST /chat`

Handles controlled FAQ chatbot messages. The endpoint never sends chatbot messages through Resend and does not require Turnstile.

Request payload:

```json
{
  "message": "Do you build websites for doctors?"
}
```

Success response:

```json
{
  "success": true,
  "answer": "Yes. CloudGenesis builds premium, responsive, and professional websites for doctors, clinics, hospitals, and healthcare-led businesses."
}
```

Validation error:

```json
{
  "success": false,
  "error": "Please enter a valid question."
}
```

Local testing:

```bash
curl -X POST http://localhost:8787/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"Do you build websites for doctors?"}'
```

## Setup

1. Copy the example config:

```bash
cp backend/contact-worker/wrangler.toml.example backend/contact-worker/wrangler.toml
```

2. Update `ALLOWED_ORIGINS`, `CONTACT_TO_EMAIL`, and `CONTACT_FROM_EMAIL`.

3. Add secrets:

```bash
wrangler secret put RESEND_API_KEY
wrangler secret put TURNSTILE_SECRET_KEY
```

4. Optional: add Telegram notification secrets. Do not paste the bot token into source files or Hugo config.

```bash
wrangler secret put TELEGRAM_BOT_TOKEN
wrangler secret put TELEGRAM_CHAT_ID
```

To find the chat ID, send a message to your bot, then open:

```text
https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates
```

For group chats, add the bot to the group, send a group message, then use the negative `chat.id` value from `getUpdates`.

5. Optional but recommended: create a KV namespace for rate limiting and add it to `wrangler.toml`.

```bash
wrangler kv namespace create CONTACT_RATE_LIMIT
```

6. Deploy:

```bash
cd backend/contact-worker
wrangler deploy
```

7. In `hugo.toml`, set:

```toml
[params]
  contactApiUrl = "https://cloudgenesis-contact.your-subdomain.workers.dev"
  chatbotApiUrl = "https://cloudgenesis-contact.your-subdomain.workers.dev/chat"
  turnstileSiteKey = "your-public-turnstile-site-key"
```

Rebuild and redeploy the Hugo site after setting those values.

## Notes

- The frontend remains usable without a configured endpoint, but it will show a clear message asking users to email directly.
- Do not commit `wrangler.toml` if it contains account-specific IDs or environment details you consider private.
- Do not put `RESEND_API_KEY`, `TURNSTILE_SECRET_KEY`, `TELEGRAM_BOT_TOKEN`, or `TELEGRAM_CHAT_ID` in Hugo config, GitHub Pages, or client-side JavaScript.
- Telegram delivery is optional and non-blocking. If Telegram fails, the contact form can still succeed as long as the primary email delivery succeeds.
