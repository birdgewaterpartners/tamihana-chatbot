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
  var API_URL = 'https://tamihana-chatbot-production-aeac.up.railway.app/api/chat';
  var MAX_LENGTH = 1000;

  // File upload constants
  var MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
  var MAX_FILES = 5;
  var ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf', 'txt', 'csv'];
  var ALLOWED_MIME_TYPES = [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'application/pdf', 'text/plain', 'text/csv',
  ];
  var IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

  // ── DOM references ───────────────────────────────────────────────────
  var input = document.getElementById('userInput');
  var responseBox = document.getElementById('responseBox');
  var sendBtn = document.getElementById('sendButton');

  if (!input || !responseBox || !sendBtn) {
    console.error('[Chatbot] Missing required elements: #userInput, #responseBox, or #sendButton');
    return;
  }

  var chatContainer = responseBox.closest('.chat-container') || responseBox.parentElement;
  var inputArea = input.closest('.chat-input-area') || input.parentElement;

  // ── State ────────────────────────────────────────────────────────────
  var isSending = false;
  var pendingFiles = [];
  var fileIdCounter = 0;

  // ── Inject styles ────────────────────────────────────────────────────
  var styleEl = document.createElement('style');
  styleEl.textContent = [
    /* Attach button */
    '.chat-attach-btn{background:none;border:none;cursor:pointer;padding:4px;display:flex;align-items:center;justify-content:center;border-radius:6px;flex-shrink:0}',
    '.chat-attach-btn:hover{background:#e5e7eb}',
    '.chat-attach-btn:disabled{opacity:.4;cursor:not-allowed}',
    '.chat-attach-btn svg{width:20px;height:20px;color:#6b7280}',

    /* File preview strip */
    '.chat-file-preview{display:none;flex-wrap:wrap;gap:6px;padding:6px 10px 0;border-top:1px solid #e5e7eb}',
    '.chat-file-preview.has-files{display:flex}',

    /* File chips */
    '.chat-file-chip{display:flex;align-items:center;gap:6px;background:#f3f4f6;border:1px solid #d1d5db;border-radius:8px;padding:4px 8px;font-size:.8rem;max-width:200px}',
    '.chat-file-chip-thumb{width:28px;height:28px;border-radius:4px;object-fit:cover;flex-shrink:0}',
    '.chat-file-chip-icon{width:28px;height:28px;border-radius:4px;background:#e5e7eb;display:flex;align-items:center;justify-content:center;font-size:.7rem;color:#6b7280;flex-shrink:0;font-weight:600}',
    '.chat-file-chip-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#374151}',
    '.chat-file-chip-remove{background:none;border:none;cursor:pointer;font-size:1rem;color:#9ca3af;padding:0 2px;line-height:1}',
    '.chat-file-chip-remove:hover{color:#ef4444}',

    /* Drag & drop overlay */
    '.chat-drop-overlay{display:none;position:absolute;inset:0;background:rgba(26,58,92,.85);z-index:100;align-items:center;justify-content:center;border-radius:12px;pointer-events:none}',
    '.chat-drop-overlay.active{display:flex}',
    '.chat-drop-overlay-text{color:#fff;font-size:1.1rem;font-weight:600}',

    /* File attachments in message bubbles */
    '.chat-msg-files{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px}',
    '.chat-msg-thumb{width:120px;height:90px;border-radius:6px;object-fit:cover;cursor:pointer;border:1px solid rgba(255,255,255,.2)}',
    '.chat-msg-thumb:hover{opacity:.85}',
    '.chat-msg-doc{display:inline-flex;align-items:center;gap:4px;background:rgba(255,255,255,.15);border-radius:6px;padding:4px 8px;font-size:.78rem}',
    '.chat-msg-doc-icon{font-weight:700;font-size:.7rem;opacity:.7}',

    /* Fullscreen image overlay */
    '.chat-fullscreen-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:9999;align-items:center;justify-content:center;cursor:zoom-out}',
    '.chat-fullscreen-overlay.active{display:flex}',
    '.chat-fullscreen-overlay img{max-width:90vw;max-height:90vh;border-radius:8px;box-shadow:0 4px 30px rgba(0,0,0,.5)}',
  ].join('\n');
  document.head.appendChild(styleEl);

  // ── Create DOM elements ──────────────────────────────────────────────

  // Hidden file input
  var fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.multiple = true;
  fileInput.accept = ALLOWED_EXTENSIONS.map(function (e) { return '.' + e; }).join(',');
  fileInput.style.display = 'none';
  document.body.appendChild(fileInput);

  // Attach (paperclip) button
  var attachBtn = document.createElement('button');
  attachBtn.type = 'button';
  attachBtn.className = 'chat-attach-btn';
  attachBtn.title = 'Attach files';
  attachBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" /></svg>';
  inputArea.insertBefore(attachBtn, input);

  // File preview strip (above input area)
  var filePreview = document.createElement('div');
  filePreview.className = 'chat-file-preview';
  inputArea.parentNode.insertBefore(filePreview, inputArea);

  // Drag & drop overlay
  var dropOverlay = document.createElement('div');
  dropOverlay.className = 'chat-drop-overlay';
  dropOverlay.innerHTML = '<span class="chat-drop-overlay-text">Drop files here</span>';
  chatContainer.style.position = 'relative';
  chatContainer.appendChild(dropOverlay);

  // Fullscreen image overlay
  var fullscreenOverlay = document.createElement('div');
  fullscreenOverlay.className = 'chat-fullscreen-overlay';
  document.body.appendChild(fullscreenOverlay);

  fullscreenOverlay.addEventListener('click', function () {
    fullscreenOverlay.classList.remove('active');
    fullscreenOverlay.innerHTML = '';
  });

  // ── Helpers ──────────────────────────────────────────────────────────

  /** Escape HTML to prevent XSS when displaying user/bot text */
  function escapeHtml(str) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  /** Get file extension shorthand for display */
  function fileExtLabel(name) {
    var ext = (name || '').split('.').pop().toUpperCase();
    return ext.length > 4 ? 'FILE' : ext;
  }

  /** Check if a mime type is an image */
  function isImage(mime) {
    return IMAGE_MIME_TYPES.indexOf(mime) !== -1;
  }

  // ── File management ──────────────────────────────────────────────────

  function addFiles(fileList) {
    for (var i = 0; i < fileList.length; i++) {
      var file = fileList[i];

      // Validate type
      if (ALLOWED_MIME_TYPES.indexOf(file.type) === -1) {
        showMessage('File "' + escapeHtml(file.name) + '" is not a supported type. Allowed: images, PDF, TXT, CSV.', 'chat-error');
        continue;
      }

      // Validate size
      if (file.size > MAX_FILE_SIZE) {
        showMessage('File "' + escapeHtml(file.name) + '" exceeds the 10 MB limit.', 'chat-error');
        continue;
      }

      // Check total count
      if (pendingFiles.length >= MAX_FILES) {
        showMessage('You can attach up to ' + MAX_FILES + ' files per message.', 'chat-error');
        break;
      }

      // Check duplicates by name+size
      var isDupe = pendingFiles.some(function (pf) {
        return pf.name === file.name && pf.size === file.size;
      });
      if (isDupe) continue;

      // Read file
      (function (f) {
        var id = ++fileIdCounter;
        var reader = new FileReader();
        reader.onload = function (e) {
          pendingFiles.push({
            id: id,
            name: f.name,
            size: f.size,
            mimeType: f.type,
            dataUrl: e.target.result,
          });
          renderFilePreview();
        };
        reader.readAsDataURL(f);
      })(file);
    }
  }

  function removeFile(id) {
    pendingFiles = pendingFiles.filter(function (f) { return f.id !== id; });
    renderFilePreview();
  }

  function renderFilePreview() {
    filePreview.innerHTML = '';
    if (pendingFiles.length === 0) {
      filePreview.classList.remove('has-files');
      return;
    }
    filePreview.classList.add('has-files');

    pendingFiles.forEach(function (pf) {
      var chip = document.createElement('div');
      chip.className = 'chat-file-chip';

      if (isImage(pf.mimeType)) {
        var thumb = document.createElement('img');
        thumb.className = 'chat-file-chip-thumb';
        thumb.src = pf.dataUrl;
        thumb.alt = pf.name;
        chip.appendChild(thumb);
      } else {
        var icon = document.createElement('div');
        icon.className = 'chat-file-chip-icon';
        icon.textContent = fileExtLabel(pf.name);
        chip.appendChild(icon);
      }

      var nameEl = document.createElement('span');
      nameEl.className = 'chat-file-chip-name';
      nameEl.textContent = pf.name;
      chip.appendChild(nameEl);

      var removeBtn = document.createElement('button');
      removeBtn.className = 'chat-file-chip-remove';
      removeBtn.type = 'button';
      removeBtn.innerHTML = '&times;';
      removeBtn.setAttribute('data-id', pf.id);
      removeBtn.addEventListener('click', function () {
        removeFile(pf.id);
      });
      chip.appendChild(removeBtn);

      filePreview.appendChild(chip);
    });
  }

  // ── Message display ──────────────────────────────────────────────────

  /** Show a message inside the response box */
  function showMessage(text, className, files) {
    var el = document.createElement('div');
    el.className = 'chat-msg ' + (className || '');

    // Render file attachments in user message bubbles
    if (files && files.length > 0) {
      var filesWrap = document.createElement('div');
      filesWrap.className = 'chat-msg-files';

      files.forEach(function (f) {
        if (isImage(f.mimeType)) {
          var img = document.createElement('img');
          img.className = 'chat-msg-thumb';
          img.src = f.dataUrl;
          img.alt = f.name;
          img.addEventListener('click', function () {
            showFullscreen(f.dataUrl);
          });
          filesWrap.appendChild(img);
        } else {
          var doc = document.createElement('span');
          doc.className = 'chat-msg-doc';
          doc.innerHTML = '<span class="chat-msg-doc-icon">' + escapeHtml(fileExtLabel(f.name)) + '</span> ' + escapeHtml(f.name);
          filesWrap.appendChild(doc);
        }
      });

      el.appendChild(filesWrap);
    }

    if (text) {
      var textEl = document.createElement('div');
      textEl.innerHTML = escapeHtml(text);
      el.appendChild(textEl);
    }

    responseBox.appendChild(el);
    responseBox.scrollTop = responseBox.scrollHeight;
  }

  /** Show fullscreen image preview */
  function showFullscreen(src) {
    fullscreenOverlay.innerHTML = '';
    var img = document.createElement('img');
    img.src = src;
    fullscreenOverlay.appendChild(img);
    fullscreenOverlay.classList.add('active');
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
    attachBtn.disabled = loading;
    sendBtn.textContent = loading ? 'Sending\u2026' : 'Send';
  }

  // ── Core send logic ──────────────────────────────────────────────────
  function sendMessage() {
    if (isSending) return;

    var message = input.value.trim();
    var hasFiles = pendingFiles.length > 0;

    if (!message && !hasFiles) return;

    if (message.length > MAX_LENGTH) {
      showMessage('Please keep your message under ' + MAX_LENGTH + ' characters.', 'chat-error');
      return;
    }

    // Snapshot files before clearing
    var filesToSend = pendingFiles.slice();

    // Display user message with attachments
    showMessage(message, 'chat-user', filesToSend.length > 0 ? filesToSend : null);
    input.value = '';
    pendingFiles = [];
    renderFilePreview();

    setLoading(true);
    showTyping();

    // Build request body
    var body = {};
    if (message) body.message = message;
    if (filesToSend.length > 0) {
      body.files = filesToSend.map(function (f) {
        // Split dataUrl into mimeType + raw base64
        var base64 = f.dataUrl.split(',')[1] || '';
        return { name: f.name, mimeType: f.mimeType, data: base64 };
      });
    }

    fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
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

  // Send button
  sendBtn.addEventListener('click', sendMessage);

  // Enter key
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // Attach button → file picker
  attachBtn.addEventListener('click', function () {
    if (!isSending) fileInput.click();
  });

  // File input change
  fileInput.addEventListener('change', function () {
    if (fileInput.files.length > 0) {
      addFiles(fileInput.files);
      fileInput.value = ''; // reset so same file can be re-selected
    }
  });

  // Drag & drop
  var dragCounter = 0;

  chatContainer.addEventListener('dragenter', function (e) {
    e.preventDefault();
    dragCounter++;
    dropOverlay.classList.add('active');
  });

  chatContainer.addEventListener('dragleave', function (e) {
    e.preventDefault();
    dragCounter--;
    if (dragCounter <= 0) {
      dragCounter = 0;
      dropOverlay.classList.remove('active');
    }
  });

  chatContainer.addEventListener('dragover', function (e) {
    e.preventDefault();
  });

  chatContainer.addEventListener('drop', function (e) {
    e.preventDefault();
    dragCounter = 0;
    dropOverlay.classList.remove('active');
    if (e.dataTransfer && e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  });

  // Paste images from clipboard
  input.addEventListener('paste', function (e) {
    if (!e.clipboardData || !e.clipboardData.items) return;
    var imageFiles = [];
    for (var i = 0; i < e.clipboardData.items.length; i++) {
      var item = e.clipboardData.items[i];
      if (item.kind === 'file' && item.type.indexOf('image/') === 0) {
        var file = item.getAsFile();
        if (file) imageFiles.push(file);
      }
    }
    if (imageFiles.length > 0) {
      addFiles(imageFiles);
    }
  });
})();
