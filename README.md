# Bridgewater Partners — GPT-4 Chatbot

Secure white-labeled chatbot backend for New Zealand immigration queries, designed to embed on the Bridgewater Partners Wix site.

## Quick Start (Local)

```bash
cd chatbot-server
npm install
cp .env.example .env       # then add your real OPENAI_API_KEY
node server.js
```

The server starts on `http://localhost:3001`.

### Test the endpoint

```bash
curl -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "What work visas are available for New Zealand?"}'
```

For local frontend testing, temporarily set `ALLOWED_ORIGIN=*` in `.env` so CORS doesn't block `file://` or `localhost` requests. **Change it back before deploying.**

---

## Deploying the Backend

### Railway

1. Push this directory to a GitHub repo (or use `railway init`).
2. In the Railway dashboard, create a new project from the repo.
3. Add environment variables in **Settings > Variables**:
   - `OPENAI_API_KEY` — your OpenAI key
   - `ALLOWED_ORIGIN` — `https://bridgewaterpartners.co.nz`
   - `PORT` — Railway sets this automatically; leave it out or set `3001`
4. Railway auto-detects `npm start`. Deploy.
5. Note the public URL (e.g. `https://your-app.up.railway.app`).

### Render

1. Create a **Web Service** from your repo.
2. Build command: `npm install`
3. Start command: `node server.js`
4. Add the same environment variables above.
5. Note the `.onrender.com` URL.

### Heroku

```bash
heroku create bridgewater-chatbot
heroku config:set OPENAI_API_KEY=sk-... ALLOWED_ORIGIN=https://bridgewaterpartners.co.nz
git push heroku main
```

---

## Adding the Chatbot to Wix

### 1. Add the HTML elements

In your Wix page editor, add an **Embed > Custom Element** or **HTML iFrame** block with this markup:

```html
<div id="responseBox" style="height:400px; overflow-y:auto; padding:1rem; border:1px solid #e5e7eb; border-radius:8px; margin-bottom:.5rem; font-family:sans-serif;"></div>
<div style="display:flex; gap:.5rem;">
  <input id="userInput" type="text" placeholder="Type your question..." maxlength="1000"
         style="flex:1; padding:.6rem .75rem; border:1px solid #d1d5db; border-radius:8px; font-size:.925rem;" />
  <button id="sendButton"
          style="padding:.6rem 1.25rem; background:#1a3a5c; color:#fff; border:none; border-radius:8px; cursor:pointer;">Send</button>
</div>
```

### 2. Add the chatbot script

1. Open `frontend/chatbot.js`.
2. Change `API_URL` at the top to your deployed backend URL:
   ```js
   var API_URL = 'https://your-app.up.railway.app/api/chat';
   ```
3. In Wix, go to **Settings > Custom Code** (or use Velo).
4. Paste the contents of `chatbot.js` into a `<script>` tag placed in the **Body — end** section, set to load on the specific page(s) where the chatbot lives.

### 3. Style to match your theme

Refer to `frontend/example.html` for reference CSS classes. Adjust colours, fonts, and spacing to match your Wix site design.

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `OPENAI_API_KEY` | — | **Required.** Your OpenAI API key |
| `ALLOWED_ORIGIN` | `https://bridgewaterpartners.co.nz` | CORS allowed origin |
| `PORT` | `3001` | Server port |

---

## Security

- **API key** stays on the server — never sent to the browser.
- **CORS** restricted to your domain only.
- **Rate limiting** — 20 requests/minute per IP.
- **Helmet** — secure HTTP headers.
- **Input validation** — messages trimmed, max 1000 characters.
- **HTML escaping** in the frontend prevents XSS.

---

## File Structure

```
chatbot-server/
├── server.js              # Express backend
├── package.json
├── .env.example           # Environment variable template
├── .gitignore
├── README.md
└── frontend/
    ├── chatbot.js         # Script to embed in Wix
    └── example.html       # Reference UI with styling
```
