/**
 * Bridgewater Partners — GPT-4 Chatbot Widget
 *
 * Standalone script for embedding in Wix via Custom Code.
 * Requires three DOM elements on the page:
 *   <input  id="userInput"   />
 *   <div    id="responseBox"  ></div>
 *   <button id="sendButton">Send</button>
 *
 * Set API_URL below to your deployed backend URL.
 */
(function () {
  'use strict';

  // ── Configuration ────────────────────────────────────────────────────
  // Replace with your production backend URL (e.g. https://your-app.railway.app)
  var API_URL = 'https://YOUR-BACKEND-URL.example.com/api/chat';
  var MAX_LENGTH = 1000;

  // ── DOM references ───────────────────────────────────────────────────
  var input = document.getElementById('userInput');
  var responseBox = document.getElementById('responseBox');
  var sendBtn = document.getElementById('sendButton');

  if (!input || !responseBox || !sendBtn) {
    console.error('[Chatbot] Missing required elements: #userInput, #responseBox, or #sendButton');
    return;
  }

  // ── State ────────────────────────────────────────────────────────────
  var isSending = false;

  // ── Helpers ──────────────────────────────────────────────────────────

  /** Escape HTML to prevent XSS when displaying user/bot text */
  function escapeHtml(str) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  /** Show a message inside the response box */
  function showMessage(text, className) {
    var el = document.createElement('div');
    el.className = 'chat-msg ' + (className || '');
    el.innerHTML = escapeHtml(text);
    responseBox.appendChild(el);
    responseBox.scrollTop = responseBox.scrollHeight;
  }

  /** Show the typing indicator */
  function showTyping() {
    var el = document.createElement('div');
    el.className = 'chat-msg chat-typing';
    el.id = 'typingIndicator';
    el.textContent = 'Thinking\u2026';
    responseBox.appendChild(el);
    responseBox.scrollTop = responseBox.scrollHeight;
  }

  /** Remove the typing indicator */
  function hideTyping() {
    var el = document.getElementById('typingIndicator');
    if (el) el.remove();
  }

  /** Lock / unlock controls during a request */
  function setLoading(loading) {
    isSending = loading;
    input.disabled = loading;
    sendBtn.disabled = loading;
    sendBtn.textContent = loading ? 'Sending\u2026' : 'Send';
  }

  // ── Core send logic ──────────────────────────────────────────────────
  function sendMessage() {
    if (isSending) return;

    var message = input.value.trim();
    if (!message) return;

    if (message.length > MAX_LENGTH) {
      showMessage('Please keep your message under ' + MAX_LENGTH + ' characters.', 'chat-error');
      return;
    }

    // Display user message
    showMessage(message, 'chat-user');
    input.value = '';

    setLoading(true);
    showTyping();

    fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: message }),
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { ok: res.ok, data: data };
        });
      })
      .then(function (result) {
        hideTyping();
        if (result.ok && result.data.reply) {
          showMessage(result.data.reply, 'chat-bot');
        } else {
          showMessage(result.data.error || 'Something went wrong. Please try again.', 'chat-error');
        }
      })
      .catch(function () {
        hideTyping();
        showMessage('Unable to reach the server. Please check your connection and try again.', 'chat-error');
      })
      .finally(function () {
        setLoading(false);
        input.focus();
      });
  }

  // ── Event listeners ──────────────────────────────────────────────────
  sendBtn.addEventListener('click', sendMessage);

  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
})();
