# CLAUDE.md — AI Assistant Guide for tamihana-chatbot

## Project Overview

GPT-4o-mini powered chatbot backend for **Bridgewater Partners**, a New Zealand immigration consultancy. The chatbot answers NZ immigration questions and is embedded on their Wix website. It supports text messages and file uploads (images, PDFs, text files).

## Tech Stack

- **Runtime:** Node.js >= 18.0.0
- **Backend framework:** Express 5.0.1
- **AI provider:** OpenAI (`gpt-4o-mini` model via `openai` SDK 4.77.0)
- **Security:** Helmet 8.0.0 (HTTP headers), `express-rate-limit` 7.5.0 (20 req/min/IP), `cors` 2.8.5
- **File processing:** `pdf-parse` 1.1.1 for PDF text extraction
- **Frontend:** Vanilla JavaScript (no framework, no build step)
- **Deployment:** Railway (production URL: `tamihana-chatbot-production-aeac.up.railway.app`)

## Repository Structure

```
tamihana-chatbot/
├── server.js              # Express backend — all routes, OpenAI integration, file processing
├── package.json           # Dependencies and scripts
├── package-lock.json      # Locked dependency versions
├── .env.example           # Environment variable template
├── .gitignore             # Ignores node_modules/ and .env
├── README.md              # Deployment and integration guide
└── frontend/
    ├── chatbot.js          # Self-contained widget script for Wix embed
    └── example.html        # Reference HTML with styling for local testing
```

This is a small codebase (~830 lines total). There is no build step, no bundler, and no compilation required.

## Development Commands

```bash
npm install          # Install dependencies
npm run dev          # Start with --watch (hot reload on file changes)
npm start            # Production start (node server.js)
```

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `OPENAI_API_KEY` | **Yes** | — | OpenAI API key for GPT-4o-mini calls |
| `ALLOWED_ORIGIN` | No | `https://bridgewaterpartners.co.nz` | Documented but not currently enforced (CORS allows all origins) |
| `PORT` | No | `3001` | Server port |

Copy `.env.example` to `.env` and fill in `OPENAI_API_KEY` to run locally.

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET /health` | Health check — returns `{ status: "ok" }` |
| `GET /` | Serves `frontend/example.html` for browser testing |
| `GET /frontend/*` | Static file serving for chatbot.js and example.html |
| `POST /api/chat` | Main chat endpoint (rate-limited, accepts JSON body) |

### POST /api/chat Request Body

```json
{
  "message": "string (max 1000 chars, optional if files present)",
  "files": [
    {
      "name": "document.pdf",
      "mimeType": "application/pdf",
      "data": "<base64-encoded content>"
    }
  ]
}
```

**File constraints:** Max 5 files, max 10 MB each. Allowed types: JPEG, PNG, GIF, WebP, PDF, TXT, CSV.

### Response

```json
{ "reply": "string" }
```

Or on error:

```json
{ "error": "string" }
```

## Architecture Notes

### Backend (server.js)

- Single-file Express server, ~316 lines
- Sections are clearly delimited with comment banners: Configuration, OpenAI client, File validation & processing, Express app, Routes
- Files are sent as base64 in JSON body (no multipart/form-data)
- Images are passed to OpenAI as data URIs for vision capabilities
- PDFs are parsed to text (capped at 8000 chars) via `pdf-parse`
- Text/CSV files are decoded as UTF-8
- OpenAI parameters: temperature 0.7, max_tokens 800 (text) or 1200 (when images present)
- The system prompt constrains the bot to NZ immigration topics and Bridgewater Partners branding

### Frontend (frontend/chatbot.js)

- IIFE (Immediately Invoked Function Expression) with `'use strict'`
- ES5 syntax throughout (no arrow functions, no `let`/`const`, no template literals) for maximum browser compatibility
- Requires three DOM elements: `#userInput`, `#responseBox`, `#sendButton`
- Injects its own CSS styles into the page head
- Creates additional DOM elements dynamically (attach button, file preview strip, drag overlay, fullscreen overlay)
- The `API_URL` is hardcoded at the top of the file

## Key Conventions

### Code Style

- **Backend:** CommonJS (`require`/`module.exports`), modern JS (const/let, arrow functions)
- **Frontend:** ES5 syntax only (`var`, `function`, no template literals) for Wix embed compatibility
- No linter or formatter is configured
- No TypeScript
- No test framework

### Security Practices

- OpenAI API key is server-side only, never exposed to the client
- HTML escaping via DOM `createTextNode` on the frontend to prevent XSS
- Rate limiting: 20 requests per minute per IP on `/api/chat`
- Helmet for secure HTTP headers (CSP relaxed for Wix compatibility)
- Input validation: message length cap (1000 chars), file type/size checks
- CORS is currently open (`cors()` with no origin restriction) because Wix embeds run on unpredictable `wixstatic.com` subdomains

### Error Handling

- OpenAI 429 (rate limit) → surfaced as 429 to client
- OpenAI 401 (auth failure) → surfaced as 502
- Other OpenAI errors → generic 502
- Body too large → 413 with message
- Catch-all 404 for unknown routes
- Global error handler for unhandled exceptions

## Testing

There is no automated test suite. Manual testing via curl:

```bash
# Text-only message
curl -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "What work visas are available for New Zealand?"}'

# Health check
curl http://localhost:3001/health
```

Browser testing: visit `http://localhost:3001/` to use the example HTML interface.

## Deployment

The app deploys to **Railway** (auto-detects `npm start`). Set `OPENAI_API_KEY` in the Railway dashboard environment variables. The production URL is referenced in `frontend/chatbot.js` as the `API_URL` constant.

## Common Modification Points

- **Change AI model or parameters:** `server.js:257-265` (the `openai.chat.completions.create` call)
- **Update system prompt / bot persona:** `server.js:51-62` (`SYSTEM_PROMPT` constant)
- **Adjust rate limiting:** `server.js:172-178` (the `chatLimiter` config)
- **Change file upload limits:** `server.js:20-37` (MAX_FILE_SIZE, MAX_FILES, ALLOWED_MIME_TYPES)
- **Update production API URL:** `frontend/chatbot.js:17` (`API_URL` constant)
- **Modify frontend styling:** `frontend/chatbot.js:50-85` (injected CSS) or `frontend/example.html` (reference styles)
