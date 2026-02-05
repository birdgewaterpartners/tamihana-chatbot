require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const OpenAI = require('openai');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const PORT = process.env.PORT || 3001;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://bridgewaterpartners.co.nz';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const MAX_MESSAGE_LENGTH = 1000;

if (!OPENAI_API_KEY) {
  console.error('FATAL: OPENAI_API_KEY environment variable is not set.');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// OpenAI client
// ---------------------------------------------------------------------------

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// System prompt — defines the chatbot's persona and boundaries
const SYSTEM_PROMPT = `You are a helpful and professional AI assistant for Bridgewater Partners, a New Zealand-based consultancy that helps businesses and individuals navigate New Zealand immigration processes.

Guidelines:
- Provide accurate, general information about New Zealand visa categories, residency pathways, work permits, and immigration processes.
- Always clarify that your answers are general guidance, NOT legal advice.
- Encourage users to book a consultation with Bridgewater Partners for personalised advice.
- Be warm, professional, and concise. Use plain language.
- If you are unsure about a specific policy or recent change, say so honestly and recommend the user check Immigration New Zealand (immigration.govt.nz) or speak with a Bridgewater Partners consultant.
- Do NOT discuss topics unrelated to New Zealand immigration, visas, or Bridgewater Partners services.
- When appropriate, mention that Bridgewater Partners offers free initial consultations.
- Use New Zealand English spelling (e.g. "organisation", "programme", "colour").`;

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------

const app = express();

// Security headers
app.use(helmet());

// CORS — restrict to the allowed origin
app.use(cors({
  origin: ALLOWED_ORIGIN,
  methods: ['POST', 'GET', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
}));

// Body parsing
app.use(express.json({ limit: '16kb' }));

// Rate limiting on the chat endpoint — 20 requests per minute per IP
const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please wait a moment and try again.' },
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'bridgewater-chatbot' });
});

// Chat endpoint
app.post('/api/chat', chatLimiter, async (req, res) => {
  try {
    const { message } = req.body;

    // --- Validation ---
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'A "message" string is required.' });
    }

    const trimmed = message.trim();

    if (trimmed.length === 0) {
      return res.status(400).json({ error: 'Message cannot be empty.' });
    }

    if (trimmed.length > MAX_MESSAGE_LENGTH) {
      return res.status(400).json({
        error: `Message must be ${MAX_MESSAGE_LENGTH} characters or fewer.`,
      });
    }

    // --- OpenAI request ---
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: trimmed },
      ],
      max_tokens: 800,
      temperature: 0.7,
    });

    const reply = completion.choices[0]?.message?.content;

    if (!reply) {
      return res.status(502).json({ error: 'No response received from AI service.' });
    }

    return res.json({ reply });
  } catch (err) {
    console.error('[Chat Error]', err.message || err);

    // Surface rate-limit / auth errors from OpenAI clearly
    if (err.status === 429) {
      return res.status(429).json({ error: 'AI service is busy. Please try again shortly.' });
    }
    if (err.status === 401) {
      return res.status(502).json({ error: 'AI service authentication failed.' });
    }

    return res.status(502).json({ error: 'Something went wrong. Please try again later.' });
  }
});

// Catch-all 404
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found.' });
});

// Global error handler
app.use((err, _req, res, _next) => {
  console.error('[Unhandled Error]', err);
  res.status(500).json({ error: 'Internal server error.' });
});

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------

app.listen(PORT, () => {
  console.log(`Chatbot server running on port ${PORT}`);
  console.log(`CORS allowed origin: ${ALLOWED_ORIGIN}`);
});
