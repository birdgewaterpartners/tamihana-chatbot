require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const OpenAI = require('openai');
const pdfParse = require('pdf-parse');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const PORT = process.env.PORT || 3001;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const MAX_MESSAGE_LENGTH = 1000;

// File upload limits
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_FILES = 5;
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/plain',
  'text/csv',
]);
const IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
]);
const PDF_TEXT_LIMIT = 8000;

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
- Use New Zealand English spelling (e.g. "organisation", "programme", "colour").
- You can analyse uploaded documents (images, PDFs, text files). When a user shares a document, review its contents and provide relevant immigration guidance based on what you see.`;

// ---------------------------------------------------------------------------
// File validation & processing
// ---------------------------------------------------------------------------

function validateFiles(files) {
  if (!Array.isArray(files)) {
    return 'Files must be an array.';
  }
  if (files.length > MAX_FILES) {
    return `You can attach up to ${MAX_FILES} files per message.`;
  }
  for (const file of files) {
    if (!file.name || !file.mimeType || !file.data) {
      return 'Each file must include name, mimeType, and data.';
    }
    if (!ALLOWED_MIME_TYPES.has(file.mimeType)) {
      return `File type "${file.mimeType}" is not supported. Allowed: JPEG, PNG, GIF, WebP, PDF, TXT, CSV.`;
    }
    // Check base64 size (base64 is ~4/3 of original)
    const sizeEstimate = (file.data.length * 3) / 4;
    if (sizeEstimate > MAX_FILE_SIZE) {
      return `File "${file.name}" exceeds the 10 MB limit.`;
    }
  }
  return null; // valid
}

async function processFileForOpenAI(file) {
  if (IMAGE_MIME_TYPES.has(file.mimeType)) {
    const dataUri = `data:${file.mimeType};base64,${file.data}`;
    return {
      type: 'image_url',
      image_url: { url: dataUri, detail: 'auto' },
    };
  }

  if (file.mimeType === 'application/pdf') {
    try {
      const buffer = Buffer.from(file.data, 'base64');
      const pdf = await pdfParse(buffer);
      let text = (pdf.text || '').trim();
      if (!text) {
        return {
          type: 'text',
          text: `<document name="${file.name}">\n[This PDF appears to be scanned/image-based with no extractable text. If you need the contents analysed, please upload it as an image instead.]\n</document>`,
        };
      }
      if (text.length > PDF_TEXT_LIMIT) {
        text = text.slice(0, PDF_TEXT_LIMIT) + '\n\n[...truncated — document exceeds analysis limit]';
      }
      return {
        type: 'text',
        text: `<document name="${file.name}">\n${text}\n</document>`,
      };
    } catch (err) {
      console.error('[PDF Parse Error]', err.message);
      return {
        type: 'text',
        text: `<document name="${file.name}">\n[Unable to read this PDF. The file may be corrupted or password-protected.]\n</document>`,
      };
    }
  }

  // text/plain, text/csv
  try {
    const text = Buffer.from(file.data, 'base64').toString('utf-8');
    const trimmed = text.length > PDF_TEXT_LIMIT
      ? text.slice(0, PDF_TEXT_LIMIT) + '\n\n[...truncated]'
      : text;
    return {
      type: 'text',
      text: `<document name="${file.name}">\n${trimmed}\n</document>`,
    };
  } catch {
    return {
      type: 'text',
      text: `<document name="${file.name}">\n[Unable to read this file.]\n</document>`,
    };
  }
}

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------

const app = express();

// Security headers
app.use(helmet());

// CORS — allow all origins (API is protected by rate limiting, input
// validation, and server-side API key; Wix HTML embeds run on
// wixstatic.com so we cannot predict the exact origin)
app.use(cors());

// Body parsing — increased limit for base64 file uploads
app.use(express.json({ limit: '15mb' }));

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
    const { message, files } = req.body;

    // --- Validation ---
    const hasMessage = message && typeof message === 'string' && message.trim().length > 0;
    const hasFiles = Array.isArray(files) && files.length > 0;

    if (!hasMessage && !hasFiles) {
      return res.status(400).json({ error: 'A message or at least one file is required.' });
    }

    if (hasMessage && message.trim().length > MAX_MESSAGE_LENGTH) {
      return res.status(400).json({
        error: `Message must be ${MAX_MESSAGE_LENGTH} characters or fewer.`,
      });
    }

    if (hasFiles) {
      const fileError = validateFiles(files);
      if (fileError) {
        return res.status(400).json({ error: fileError });
      }
    }

    const trimmed = hasMessage ? message.trim() : '';

    // --- Build user content ---
    let userContent;
    let hasImages = false;

    if (hasFiles) {
      // Multimodal: build content parts array
      const parts = [];

      if (trimmed) {
        parts.push({ type: 'text', text: trimmed });
      }

      for (const file of files) {
        const part = await processFileForOpenAI(file);
        parts.push(part);
        if (part.type === 'image_url') hasImages = true;
      }

      userContent = parts;
    } else {
      // Text-only: simple string (backward compatible, cheaper)
      userContent = trimmed;
    }

    // --- OpenAI request ---
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
      max_tokens: hasImages ? 1200 : 800,
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

// Body-parser error handler (e.g. entity.too.large)
app.use((err, _req, res, next) => {
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request too large. Maximum total upload size is ~10 MB.' });
  }
  next(err);
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
  console.log('CORS: all origins allowed');
});
