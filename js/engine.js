// ==============================================================
// engine.js — Ridgeline Story Rendering Engine
//
// If window.STORY is defined (via story.js), builds all DOM
// from structured data then calls initDialogues + initStoryBeats.
//
// If window.STORY is not defined, falls back to reading beats
// already present in the HTML (legacy mode).
// ==============================================================

// ── STATE ──────────────────────────────────────────────────────
let main;
let beats = [];
const beatDocsReviewed = {};
const beatDocRequirements = {};

let _emailCounter  = 0;
let _emailRegistry = {};   // emailId → { subject, from, to, date, body, sig, attachments }
let _unlockedEmailIds = []; // in order revealed

// ── SCENE RENDERERS ────────────────────────────────────────────
// Each renderer accepts a scene object and returns an HTMLElement.

function renderProse(scene) {
  const d = document.createElement('div');
  d.className = 'prose';
  d.innerHTML = scene.html;
  return d;
}

function _lineColor(l) {
  return l.color || (l.role === 'jamie' ? 'var(--teal)' : l.role === 'pm' ? 'var(--amber)' : l.role === 'internal' ? 'var(--green)' : l.role === 'client' ? 'var(--blue)' : 'var(--text-dim)');
}

function renderDialogue(scene) {
  if (scene.style === 'meeting') return renderMeetingDialogue(scene);
  const d = document.createElement('div');
  d.className = 'dialogue';
  d.innerHTML = (scene.lines || []).map(l => {
    const isHero = l.hero === true || l.role === 'jamie';
    const color = _lineColor(l);
    return `<div class="line${isHero ? ' line-hero' : ''}" style="--sc:${color}"><span class="line-speaker" style="color:${color}">${l.speaker || ''}</span><span class="line-text">${l.text}</span></div>`;
  }).join('');
  return d;
}

function renderMeetingDialogue(scene) {
  const lines = scene.lines || [];
  const seen = new Map();
  lines.forEach(l => {
    if (l.speaker && !seen.has(l.speaker))
      seen.set(l.speaker, { color: _lineColor(l), avatar: l.avatar || '' });
  });
  const speakers = [...seen.entries()]; // [[name, {color, avatar}], ...]
  const initials = name => name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const cols = speakers.length <= 2 ? speakers.length : speakers.length <= 4 ? 2 : 3;
  const avatarImg = (src, cls, color, name) =>
    src ? `<img src="img/${src}" class="${cls}" style="object-fit:cover" alt="${name}">`
        : `<div class="${cls}" style="background:${color}">${initials(name)}</div>`;

  const tilesHtml = speakers.map(([name, info]) =>
    `<div class="meeting-tile" data-speaker="${name}">
      ${avatarImg(info.avatar, 'meeting-tile-avatar', info.color, name)}
      <div class="meeting-tile-name">${name}</div>
      <span class="meeting-tile-mic">🎙</span>
    </div>`
  ).join('');

  const messagesHtml = lines.map(l => {
    const color = _lineColor(l);
    const isHero = l.hero === true || l.role === 'jamie';
    return `<div class="line line-hidden" style="--sc:${color}" data-speaker="${l.speaker || ''}" data-hero="${isHero ? 'true' : ''}">
      <div class="meeting-msg">
        <div class="meeting-msg-body">
          <div class="meeting-msg-name" style="color:${color}">${l.speaker || ''}</div>
          <div class="meeting-msg-text">${l.text}</div>
        </div>
      </div>
    </div>`;
  }).join('');

  const d = document.createElement('div');
  d.className = 'dialogue dialogue-meeting';
  d.innerHTML = `
    <div class="meeting-topbar">
      <div class="meeting-topbar-left">
        <span>📅</span>
        <span class="meeting-topbar-title">${scene.meetingTitle || 'Video Call'}</span>
      </div>
      <div class="meeting-topbar-right">${speakers.length} participant${speakers.length !== 1 ? 's' : ''}</div>
    </div>
    <div class="meeting-body">
      <div class="meeting-video-area" style="--cols:${cols}">${tilesHtml}</div>
      <div class="meeting-sidebar">
        <div class="meeting-chat-header">💬 Meeting Chat</div>
        <div class="dialogue-scroll meeting-chat">${messagesHtml}</div>
        <div class="meeting-chat-input-row">
          <div class="meeting-chat-input-fake meeting-chat-draft"></div>
          <button class="meeting-chat-send meeting-send-btn" onclick="meetingSend(this)">➤</button>
        </div>
      </div>
    </div>
    <div class="meeting-toolbar">
      <button class="mtb-btn"><span class="mtb-icon">🎙</span><span class="mtb-label">Mute</span></button>
      <button class="mtb-btn"><span class="mtb-icon">📷</span><span class="mtb-label">Video</span></button>
      <span class="mtb-sep"></span>
      <button class="mtb-btn"><span class="mtb-icon">🖥</span><span class="mtb-label">Share</span></button>
      <button class="mtb-btn"><span class="mtb-icon">😄</span><span class="mtb-label">React</span></button>
      <span class="mtb-sep"></span>
      <button class="mtb-btn"><span class="mtb-icon">👥</span><span class="mtb-label">People</span></button>
      <button class="mtb-btn mtb-active"><span class="mtb-icon">💬</span><span class="mtb-label">Chat</span></button>
      <button class="mtb-btn"><span class="mtb-icon">⋯</span><span class="mtb-label">More</span></button>
      <span class="mtb-sep"></span>
      <button class="mtb-btn mtb-leave"><span class="mtb-icon">📵</span><span class="mtb-label">Leave</span></button>
    </div>`;

  return d;
}

function renderInnerVoice(scene) {
  const d = document.createElement('div');
  d.className = 'inner-voice';
  d.innerHTML = `<div class="inner-voice-label">${scene.label}</div>` +
    scene.paragraphs.map(p => `<p>${p}</p>`).join('');
  return d;
}

function renderSmsCard(scene) {
  const { contact, messages } = scene;
  const d = document.createElement('div');
  d.className = 'phone-frame';

  d.innerHTML = `
    <div class="phone-body">
      <div class="camera-dot"></div>
      <div class="phone-screen">
        <div class="sms-card">
          <div class="sms-contact-header">
            <div class="sms-contact-avatar">${contact.avatar}</div>
            <div class="sms-contact-name">${contact.name}</div>
            <div class="sms-contact-sub">${contact.sub}</div>
          </div>
          <div class="sms-messages">
            ${messages.map((m, i) =>
              `<div class="sms-row ${m.dir} sms-hidden" data-sms-idx="${i}" data-sms-text="${m.text.replace(/"/g,'&quot;')}" data-sms-time="${m.time}">
                <div class="sms-bubble">${m.text}</div>
                <div class="sms-time">${m.time}</div>
              </div>`
            ).join('')}
          </div>
        </div>
        <div class="sms-input-bar">
          <div class="sms-input-field sms-draft"></div>
          <div class="sms-input-icons">
            <span class="sms-mic">🎤</span>
            <button class="sms-send-btn" onclick="smsSend(this)">⬆️</button>
          </div>
        </div>
      </div>
    </div>`;

  return d;
}

// ── SMS INTERACTION ─────────────────────────────────────────────

function initSmsCards() {
  // Only init SMS cards in already-visible scenes (first scene of each beat)
  document.querySelectorAll('.scene-block:not(.scene-hidden) .sms-messages').forEach(container => {
    _smsAdvance(container);
  });
}

function _smsInit(sceneBlock) {
  sceneBlock.querySelectorAll('.sms-messages').forEach(container => {
    _smsAdvance(container);
  });
}

function _smsReveal(row) {
  row.classList.remove('sms-hidden');
  const dir = row.classList.contains('sent') ? 1 : -1;
  row.style.opacity   = '0';
  row.style.transform = `translateX(${dir * 18}px)`;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    row.style.transition = 'opacity 0.28s ease, transform 0.28s ease';
    row.style.opacity    = '1';
    row.style.transform  = 'translateX(0)';
  }));
  // Auto-scroll message area
  const msgs = row.closest('.sms-messages');
  if (msgs) setTimeout(() => { msgs.scrollTop = msgs.scrollHeight; }, 50);
}

function _smsSetDraft(container, sentRow) {
  const phone   = container.closest('.phone-frame');
  const draft   = phone?.querySelector('.sms-draft');
  const sendBtn = phone?.querySelector('.sms-send-btn');
  if (!draft || !sendBtn) return;

  if (!sentRow) {
    draft.textContent = '';
    sendBtn.classList.remove('ready');
    sendBtn._pendingRow = null;
    return;
  }

  // Fade in the pending text
  draft.style.opacity = '0';
  draft.textContent   = sentRow.querySelector('.sms-bubble').textContent;
  requestAnimationFrame(() => {
    draft.style.transition = 'opacity 0.3s ease';
    draft.style.opacity    = '1';
  });
  sendBtn.classList.add('ready');
  sendBtn._pendingRow = sentRow;
}

function _smsLockNav(container) {
  const btn = container.closest('.beat')?.querySelector('.story-next-btn');
  if (btn && !btn.disabled) { btn.disabled = true; btn.dataset.smsLocked = '1'; }
}

function _smsUnlockNav(container) {
  const btn = container.closest('.beat')?.querySelector('.story-next-btn');
  if (btn && btn.dataset.smsLocked) { btn.disabled = false; delete btn.dataset.smsLocked; }
}

function _smsAdvance(container) {
  const nextHidden = container.querySelector('.sms-row.sms-hidden');
  if (!nextHidden) {
    _smsSetDraft(container, null);
    _smsUnlockNav(container);
    return;
  }
  _smsLockNav(container);
  if (nextHidden.classList.contains('received')) {
    setTimeout(() => {
      _smsReveal(nextHidden);
      setTimeout(() => _smsAdvance(container), 700);
    }, 900);
  } else {
    _smsSetDraft(container, nextHidden);
  }
}

function smsSend(btn) {
  if (!btn.classList.contains('ready')) return;
  const phone     = btn.closest('.phone-frame');
  const container = phone.querySelector('.sms-messages');
  const draft     = phone.querySelector('.sms-draft');
  const sentRow   = btn._pendingRow;
  if (!sentRow) return;

  // Disable while sending
  btn.classList.remove('ready');
  btn._pendingRow = null;

  // Flash draft out
  draft.style.transition = 'opacity 0.12s ease';
  draft.style.opacity    = '0';
  setTimeout(() => { draft.textContent = ''; draft.style.opacity = '1'; }, 130);

  // Reveal the sent bubble after a beat
  setTimeout(() => {
    _smsReveal(sentRow);
    // Advance after bubble appears
    setTimeout(() => _smsAdvance(container), 500);
  }, 200);
}

// ── MEETING CHAT INTERACTION ────────────────────────────────────

function initMeetingChats() {
  document.querySelectorAll('.scene-block:not(.scene-hidden) .meeting-chat').forEach(chat => {
    _meetingAdvance(chat);
  });
}

function _meetingInit(sceneBlock) {
  sceneBlock.querySelectorAll('.meeting-chat').forEach(chat => _meetingAdvance(chat));
}

function _meetingReveal(line) {
  line.classList.remove('line-hidden');
  line.style.opacity   = '0';
  line.style.transform = 'translateY(6px)';
  requestAnimationFrame(() => requestAnimationFrame(() => {
    line.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
    line.style.opacity    = '1';
    line.style.transform  = 'translateY(0)';
  }));
  const chat = line.closest('.meeting-chat');
  if (chat) setTimeout(() => { chat.scrollTop = chat.scrollHeight; }, 50);
  // Update speaking tile
  const dl = line.closest('.dialogue-meeting');
  if (dl) {
    const speaker = line.dataset.speaker;
    dl.querySelectorAll('.meeting-tile').forEach(t => t.classList.remove('speaking'));
    if (speaker) dl.querySelector(`.meeting-tile[data-speaker="${speaker}"]`)?.classList.add('speaking');
  }
}

function _meetingSetDraft(chat, line) {
  const row    = chat.closest('.meeting-sidebar')?.querySelector('.meeting-chat-input-row');
  const draft  = row?.querySelector('.meeting-chat-draft');
  const sendBtn = row?.querySelector('.meeting-send-btn');
  if (!draft || !sendBtn) return;
  if (!line) {
    draft.textContent = '';
    draft.dataset.placeholder = '';
    sendBtn.classList.remove('ready');
    sendBtn._pendingLine = null;
    _meetingUnlockNav(chat);
    return;
  }
  const text = line.querySelector('.meeting-msg-text')?.textContent || '';
  draft.style.opacity = '0';
  draft.textContent   = text;
  requestAnimationFrame(() => {
    draft.style.transition = 'opacity 0.3s ease';
    draft.style.opacity    = '1';
  });
  sendBtn.classList.add('ready');
  sendBtn._pendingLine = line;
}

function _meetingLockNav(chat) {
  const btn = chat.closest('.beat')?.querySelector('.story-next-btn');
  if (btn && !btn.disabled) { btn.disabled = true; btn.dataset.meetingLocked = '1'; }
}

function _meetingUnlockNav(chat) {
  const btn = chat.closest('.beat')?.querySelector('.story-next-btn');
  if (btn && btn.dataset.meetingLocked) { btn.disabled = false; delete btn.dataset.meetingLocked; }
}

function _meetingAdvance(chat) {
  const nextHidden = chat.querySelector('.line.line-hidden');
  if (!nextHidden) {
    _meetingSetDraft(chat, null);
    return;
  }
  _meetingLockNav(chat);
  if (nextHidden.dataset.hero === 'true') {
    _meetingSetDraft(chat, nextHidden);
  } else {
    setTimeout(() => {
      _meetingReveal(nextHidden);
      setTimeout(() => _meetingAdvance(chat), 700);
    }, 900);
  }
}

function meetingSend(btn) {
  if (!btn.classList.contains('ready')) return;
  const row   = btn.closest('.meeting-chat-input-row');
  const draft = row?.querySelector('.meeting-chat-draft');
  const chat  = btn.closest('.meeting-sidebar')?.querySelector('.meeting-chat');
  const line  = btn._pendingLine;
  if (!line || !chat) return;
  btn.classList.remove('ready');
  btn._pendingLine = null;
  draft.style.transition = 'opacity 0.12s ease';
  draft.style.opacity    = '0';
  setTimeout(() => { draft.textContent = ''; draft.style.opacity = '1'; }, 130);
  setTimeout(() => {
    _meetingReveal(line);
    setTimeout(() => _meetingAdvance(chat), 500);
  }, 200);
}

function renderEmailCard(scene) {
  const { email, docHint } = scene;
  const d = document.createElement('div');
  const _eid = ++_emailCounter;
  d.dataset.emailId = _eid;
  _emailRegistry[_eid] = scene.email;
  const attachmentsHtml = email.attachments
    ? `<div class="email-attachment-bar">${email.attachments.map(a =>
        `<div class="email-attachment" onclick="${a.onclick}"><span class="email-attachment-icon">${a.icon}</span> ${a.name}</div>`
      ).join('')}</div>`
    : '';
  const sigHtml = email.sig
    ? `<div class="email-sig"><span class="sig-name">${email.sig.name}</span><br><span class="sig-title">${email.sig.title}</span><br><span class="sig-firm">${email.sig.firm}</span></div>`
    : '';
  d.innerHTML = `
    <div class="email-card">
      <div class="email-topbar">
        <div class="email-dot red"></div><div class="email-dot yellow"></div><div class="email-dot green"></div>
        <span class="email-topbar-label">Email</span>
      </div>
      <div class="email-header">
        <div class="email-subject">${email.subject}</div>
        <div class="email-meta">
          <div class="email-meta-row"><span class="email-meta-label">From:</span><span class="email-meta-value">${email.from}</span></div>
          <div class="email-meta-row"><span class="email-meta-label">To:</span><span class="email-meta-value">${email.to}</span></div>
          <div class="email-meta-row"><span class="email-meta-label">Date:</span><span class="email-meta-value">${email.date}</span></div>
        </div>
      </div>
      <div class="email-body">${email.body}</div>
      ${attachmentsHtml}
      ${sigHtml}
    </div>
    ${docHint ? `<div class="doc-hint" id="doc-hint-${docHint.beatId}">${docHint.text}</div>` : ''}`;
  return d;
}

function renderCallout(scene) {
  const d = document.createElement('div');
  d.className = `callout ${scene.color || ''}`.trim();
  d.innerHTML = `<div class="callout-label">${scene.label}</div>${scene.bodyHtml}`;
  return d;
}

function renderStatusRow(scene) {
  const d = document.createElement('div');
  d.className = 'status-row';
  d.innerHTML = scene.badges.map(b =>
    `<div class="status-badge">
      <span class="sb-label">${b.label}</span>
      <span class="sb-val ${b.status || ''}">${b.value}</span>
      ${b.sub ? `<span class="sb-sub">${b.sub}</span>` : ''}
    </div>`
  ).join('');
  return d;
}

function renderWorkBlock(scene) {
  const d = document.createElement('div');
  d.className = 'work-block';
  d.innerHTML = (scene.label ? `<span class="wb-label">${scene.label}</span>` : '') + scene.contentHtml;
  return d;
}

function renderGridNote(scene) {
  const d = document.createElement('div');
  d.innerHTML = scene.contentHtml;
  return d.firstElementChild || d;
}

function renderSetupChecklist(scene) {
  const d = document.createElement('div');
  if (scene.intro) d.innerHTML = `<p>${scene.intro}</p>`;
  (scene.groups || []).forEach(g => {
    d.innerHTML += `<div class="setup-group-title">${g.title}</div>` +
      g.items.map(item =>
        `<div class="setup-item"><div class="setup-check">✓</div><span>${item}</span></div>`
      ).join('');
  });
  return d;
}

function renderTimeline(scene) {
  const d = document.createElement('div');
  d.className = 'timeline';
  d.innerHTML = scene.events.map(e =>
    `<div class="tl-item">
      <div class="tl-dot${e.done ? ' done' : ''}">${e.dot}</div>
      <div class="tl-content">
        <div class="tl-month">${e.month}</div>
        <div class="tl-event">${e.text}</div>
      </div>
    </div>`
  ).join('');
  return d;
}

function renderExcel(scene) {
  // scene.contentHtml is the full Excel mock markup
  const d = document.createElement('div');
  d.innerHTML = scene.contentHtml;
  return d.firstElementChild || d;
}

function renderHtml(scene) {
  const d = document.createElement('div');
  d.innerHTML = scene.content;
  return d.firstElementChild || d;
}

let _binderSeq = 0;

function _binderPageInner(p) {
  if (!p) return '';
  return `${p.label   ? `<div class="page-label">${p.label}</div>` : ''}
    ${p.title   ? `<div class="page-title">${p.title}</div>` : ''}
    <div class="page-body">${p.body || ''}</div>
    ${p.pageNum != null ? `<div class="page-number">${p.pageNum}</div>` : ''}`;
}

function renderBinder(scene) {
  const pages   = scene.pages   || [];
  const tabs    = scene.tabs    || [];
  const bid     = 'binder-' + (++_binderSeq);
  const multi   = pages.length > 1;
  const noRings = !!scene.noRings;
  const noTabs  = !!scene.noTabs;
  const grid    = !!scene.grid;

  const pageExtra = grid ? ' grid' : '';

  const spreadsHtml = pages.map((p, i) =>
    `<div class="binder-spread${i === 0 ? ' active' : ''}">
      <div class="binder-page left${pageExtra}${multi ? ' binder-clickable' : ''}" ${multi ? `onclick="binderStep('${bid}',-1)"` : ''}>${_binderPageInner(p.left)}</div>
      <div class="binder-page right${pageExtra}${multi ? ' binder-clickable' : ''}" ${multi ? `onclick="binderStep('${bid}',1)"` : ''}>${_binderPageInner(p.right)}</div>
    </div>`
  ).join('');

  const tabsHtml = (!noTabs && tabs.length)
    ? `<div class="binder-tabs">${tabs.map(t =>
        `<div class="binder-tab${t.page === 0 ? ' active' : ''}" data-page="${t.page}" onclick="binderGoto('${bid}',${t.page})">${t.label}</div>`
      ).join('')}</div>`
    : '';

  const ringsHtml = noRings ? '' : `
    <div class="binder-rings">
      <div class="binder-ring"></div>
      <div class="binder-ring"></div>
      <div class="binder-ring"></div>
    </div>`;

  const wrapper = document.createElement('div');
  wrapper.className = 'binder-wrap';

  const expandBtn = document.createElement('button');
  expandBtn.className = 'binder-expand-btn';
  expandBtn.title = 'Open full view';
  expandBtn.textContent = '⛶';
  expandBtn.onclick = () => openBinderModal(scene);
  wrapper.appendChild(expandBtn);

  const d = document.createElement('div');
  d.className = 'binder-realistic';
  d.id = bid;
  if (multi) d.classList.add('binder-at-start');
  if (pages.length <= 1) d.classList.add('binder-at-end');
  d.innerHTML = `${spreadsHtml}${tabsHtml}${ringsHtml}`;
  wrapper.appendChild(d);
  return wrapper;
}

function openBinderModal(scene) {
  let overlay = document.getElementById('binder-modal-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'binder-modal-overlay';
    overlay.className = 'binder-modal-overlay';
    overlay.onclick = e => { if (e.target === overlay) closeBinderModal(); };
    document.body.appendChild(overlay);
  }
  // Re-render a fresh binder instance inside the modal
  const inner = renderBinder(scene);
  overlay.innerHTML = '';
  const closeBtn = document.createElement('button');
  closeBtn.className = 'binder-modal-close';
  closeBtn.textContent = '✕';
  closeBtn.onclick = closeBinderModal;
  overlay.appendChild(closeBtn);
  overlay.appendChild(inner);
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeBinderModal() {
  document.getElementById('binder-modal-overlay')?.classList.remove('open');
  document.body.style.overflow = '';
}

function binderGoto(binderId, pageIdx) {
  const binder = document.getElementById(binderId);
  if (!binder) return;
  const spreads = binder.querySelectorAll('.binder-spread');
  const clamped = Math.max(0, Math.min(pageIdx, spreads.length - 1));
  spreads.forEach((s, i) => s.classList.toggle('active', i === clamped));
  binder.querySelectorAll('.binder-tab').forEach(t =>
    t.classList.toggle('active', parseInt(t.dataset.page) === clamped));
  // Show/hide flip hints
  binder.classList.toggle('binder-at-start', clamped === 0);
  binder.classList.toggle('binder-at-end',   clamped === spreads.length - 1);
}

function binderStep(binderId, dir) {
  const binder = document.getElementById(binderId);
  if (!binder) return;
  const spreads = binder.querySelectorAll('.binder-spread');
  const current = Array.from(spreads).findIndex(s => s.classList.contains('active'));
  binderGoto(binderId, current + dir);
}

// ── QUIZ SCENE ──────────────────────────────────────────────────
// Options raw format (one per line):
//   * Correct answer text || Optional per-option feedback
//   Wrong answer text
function _parseQuizOpts(raw) {
  const keys = ['A','B','C','D','E','F'];
  return (raw || '').split('\n').map(l => l.trim()).filter(Boolean).map((line, i) => {
    const correct = line.startsWith('*');
    const rest    = correct ? line.slice(1).trim() : line;
    const parts   = rest.split('||');
    return { text: parts[0].trim(), correct, feedback: (parts[1] || '').trim(), key: keys[i] };
  });
}

function renderQuiz(scene) {
  // Normalise to questions array — supports both new multi-Q and legacy single-Q format
  let questions = scene.questions || [];
  if (!questions.length && scene.question) {
    questions = [{
      context:         scene.context,
      question:        scene.question,
      optionsRaw:      (scene.options || []).map(o => {
        const text    = typeof o === 'object' ? o.text     : String(o);
        const correct = typeof o === 'object' ? !!o.correct : false;
        const fb      = typeof o === 'object' ? (o.feedback || '') : '';
        return `${correct ? '* ' : ''}${text}${fb ? ' || ' + fb : ''}`;
      }).join('\n'),
      feedbackCorrect: scene.feedbackCorrect,
      feedbackWrong:   scene.feedbackWrong,
    }];
  }

  const total     = questions.length;
  const multiQ    = total > 1;

  const panesHtml = questions.map((q, qi) => {
    const opts    = _parseQuizOpts(q.optionsRaw);
    const optsHtml = opts.map(opt =>
      `<button class="quiz-opt" data-correct="${opt.correct ? '1' : '0'}" data-fb="${(opt.feedback||'').replace(/"/g,'&quot;')}" onclick="quizSelect(this)"><span class="quiz-opt-key">${opt.key}</span><span>${opt.text}</span></button>`
    ).join('');
    return `<div class="quiz-pane" data-qidx="${qi}"${qi > 0 ? ' style="display:none"' : ''} data-fb-correct="${(q.feedbackCorrect||'').replace(/"/g,'&quot;')}" data-fb-wrong="${(q.feedbackWrong||'').replace(/"/g,'&quot;')}">
      ${q.context ? `<div class="quiz-scene-context">${q.context}</div>` : ''}
      <div class="quiz-scene-question">${q.question || ''}</div>
      <div class="quiz-scene-options">${optsHtml}</div>
      <div class="quiz-scene-feedback"></div>
      <div class="quiz-scene-footer">
        <button class="quiz-submit-btn" onclick="quizSubmit(this)" disabled>Check Answer</button>
      </div>
    </div>`;
  }).join('');

  const d = document.createElement('div');
  d.className = 'quiz-scene';
  d.dataset.total   = total;
  d.dataset.current = '0';
  d.dataset.score   = '0';
  d.innerHTML = `
    ${multiQ ? `<div class="quiz-hd">
      <span class="quiz-prog-label">Question 1 of ${total}</span>
      <div class="quiz-prog-bar"><div class="quiz-prog-fill" style="width:0%"></div></div>
    </div>` : ''}
    ${panesHtml}
    <div class="quiz-complete" style="display:none">
      <div class="quiz-score-ring"></div>
      <div class="quiz-score-title">Quiz Complete</div>
      <div class="quiz-score-sub"></div>
      <button class="scene-action-btn" style="margin-top:4px" onclick="quizRetry(this)">↩ Try Again</button>
    </div>`;
  return d;
}

// ── DRAG-MATCH SCENE ────────────────────────────────────────────
function renderDragMatch(scene) {
  const chips = (scene.chips || []).map(c =>
    `<div class="drag-chip" draggable="true" data-chipid="${c.id}" ondragstart="dragStart(this,event)" ondragend="dragEnd(this)">
      <span class="drag-chip-icon">${c.icon || '≡'}</span>${c.label}
    </div>`
  ).join('');
  const zones = (scene.zones || []).map(z =>
    `<div class="drag-zone" data-answer="${z.answer}" ondragover="dragOver(this,event)" ondragleave="dragLeave(this)" ondrop="dragDrop(this,event)">
      <div class="drag-zone-label">${z.label}</div>
      <div class="drag-zone-slot">drop here</div>
      <div class="drag-zone-status"></div>
    </div>`
  ).join('');
  const d = document.createElement('div');
  d.className = 'drag-match-scene';
  d.innerHTML = `
    <div class="drag-match-head">
      <div class="drag-match-q">${scene.question || ''}</div>
      <div class="drag-match-hint">Drag items from the right column to their matching zone on the left</div>
    </div>
    <div class="drag-match-layout">
      <div class="drag-zones"><div class="drag-col-label">Match to</div>${zones}</div>
      <div class="drag-chips-col"><div class="drag-col-label">Items</div>${chips}</div>
    </div>
    <div class="drag-match-footer">
      <div class="drag-match-score"></div>
      <button class="scene-action-btn" onclick="dragReset(this)">Reset</button>
      <button class="scene-action-btn primary" onclick="dragCheck(this)">Check Answers</button>
    </div>`;
  return d;
}

// ── FILL-CELL SCENE ─────────────────────────────────────────────
function renderFillCell(scene) {
  const d = document.createElement('div');
  d.className = 'fill-cell-scene';
  d.dataset.answers  = JSON.stringify(scene.answers  || {});
  d.dataset.tolerance = String(scene.tolerance ?? 1);
  d.innerHTML = `
    <div class="fill-cell-head">
      <div class="fill-cell-q">${scene.question || ''}</div>
      ${scene.formula ? `<div class="fill-cell-formula">${scene.formula}</div>` : ''}
    </div>
    ${scene.hint ? `<div class="fill-cell-hint">${scene.hint}</div>` : ''}
    <div class="fill-xls-wrap">
      <table class="fill-xls">${scene.tableHtml || ''}</table>
    </div>
    <div class="fill-cell-footer">
      <div class="fill-cell-feedback"></div>
      <button class="scene-action-btn" onclick="fillReset(this)">Reset</button>
      <button class="scene-action-btn primary" onclick="fillCheck(this)">Check Answer</button>
    </div>`;
  return d;
}

// ── BRANCH SCENE ────────────────────────────────────────────────
function renderBranch(scene) {
  const slides = scene.slides || [];
  const keys = ['A','B','C','D','E'];
  const slideHtml = slides.map((s, si) => {
    const avClass = s.avatarClass || 'branch-av-other';
    const outcomeHtml = s.outcome
      ? `<div class="branch-outcome ${s.outcome}">
           <span>${s.outcome === 'good' ? '✓' : s.outcome === 'bad' ? '✗' : '⚠'}</span>
           <span>${s.outcomeLabel || s.outcome.toUpperCase()}</span>
         </div>`
      : '';
    const choicesHtml = (s.choices || []).map((c, ci) =>
      `<button class="branch-btn" onclick="branchGo(this,'${c.next}','${c.outcome || ''}')" data-outcome="${c.outcome || ''}">
        <span class="branch-btn-key">${keys[ci]}</span><span>${c.text}</span>
      </button>`
    ).join('');
    const debriefHtml = s.debrief
      ? `<div class="branch-debrief"><div class="branch-debrief-label">Debrief</div><div class="branch-debrief-text">${s.debrief}</div></div>` : '';
    const tryAgainHtml = s.outcome && !s.choices?.length
      ? `<div class="branch-footer"><button class="scene-action-btn" onclick="branchReset(this)">↩ Try Again</button><div class="branch-path"></div></div>` : '';
    return `<div class="branch-slide" data-slide-id="${s.id}"${si > 0 ? ' style="display:none"' : ''}>
      ${outcomeHtml}
      <div class="branch-hd">
        <div class="branch-av ${avClass}">${s.avatar || '?'}</div>
        <div><div class="branch-speaker">${s.speaker || ''}</div><div class="branch-loc">${s.loc || ''}</div></div>
      </div>
      <div class="branch-body">
        <div class="branch-text">${s.text || ''}</div>
        ${s.situation ? `<div class="branch-situation">${s.situation}</div>` : ''}
        <div class="branch-choices">${choicesHtml}</div>
      </div>
      ${debriefHtml}
      ${tryAgainHtml}
    </div>`;
  }).join('');
  const d = document.createElement('div');
  d.className = 'branch-scene';
  d.innerHTML = slideHtml || '<div style="padding:20px;color:var(--text-dim)">No slides defined.</div>';
  return d;
}

// ── CLICK-DOC SCENE ─────────────────────────────────────────────
function renderClickDoc(scene) {
  // Support both correctKeys (multi, comma-sep) and legacy correctKey (single)
  const keys = (scene.correctKeys || scene.correctKey || '').split(',').map(k => k.trim()).filter(Boolean);
  const total = keys.length;
  const d = document.createElement('div');
  d.className = 'click-doc-scene';
  d.dataset.correctKeys = keys.join(',');
  d.dataset.fbCorrect   = scene.feedbackCorrect || '';
  d.dataset.fbWrong     = scene.feedbackWrong   || '';
  d.innerHTML = `
    <div class="click-doc-toolbar">
      <span class="click-doc-title-text">${scene.docTitle || 'Document'}</span>
      <div style="display:flex;align-items:center;gap:10px">
        <span class="click-doc-badge">⬡ exercise mode</span>
        <button class="scene-action-btn" onclick="clickDocStart(this)">Start Exercise</button>
      </div>
    </div>
    <div class="click-doc-question">
      <span class="q-label">Exercise — identify the correct passage${total > 1 ? 's' : ''}</span>
      ${scene.question || ''}
    </div>
    ${total > 1 ? `<div class="click-doc-progress"><span class="click-doc-found">0</span> of ${total} found</div>` : ''}
    <div class="click-doc-body">${scene.contentHtml || ''}</div>
    <div class="click-doc-feedback"></div>`;
  return d;
}

const RENDERERS = {
  'prose': renderProse,
  'dialogue': renderDialogue,
  'inner-voice': renderInnerVoice,
  'sms-card': renderSmsCard,
  'email-card': renderEmailCard,
  'callout': renderCallout,
  'status-row': renderStatusRow,
  'work-block': renderWorkBlock,
  'grid-note': renderGridNote,
  'setup-checklist': renderSetupChecklist,
  'timeline': renderTimeline,
  'excel': renderExcel,
  'html': renderHtml,
  'realbinder': renderBinder,
  'quiz': renderQuiz,
  'drag-match': renderDragMatch,
  'fill-cell': renderFillCell,
  'branch': renderBranch,
  'click-doc': renderClickDoc,
};

// ── BUILDERS ───────────────────────────────────────────────────

function buildSceneBlock(scene) {
  const wrapper = document.createElement('div');
  wrapper.className = 'scene-block';
  if (scene.id) wrapper.id = scene.id;
  if (scene.folderUnlock) wrapper.dataset.folderUnlock = scene.folderUnlock;
  if (scene.requireDocs)  wrapper.dataset.requireDocs  = scene.requireDocs;
  if (scene.beat)         wrapper.dataset.beat         = scene.beat;
  if (scene.gated) wrapper.dataset.requireAnswer = '1';
  if (scene.maxWidth || scene.align) {
    const w = scene.maxWidth || '';
    const a = scene.align || 'left';
    if (w) wrapper.style.maxWidth = w;
    if (a === 'center') { wrapper.style.marginLeft = 'auto'; wrapper.style.marginRight = 'auto'; }
    else if (a === 'right') { wrapper.style.marginLeft = 'auto'; wrapper.style.marginRight = '0'; }
    else { wrapper.style.marginLeft = '0'; wrapper.style.marginRight = 'auto'; }
  }
  if (scene.alertType) {
    if (!wrapper.id) wrapper.id = 'alert-target-' + Math.random().toString(36).slice(2, 7);
    wrapper.dataset.alertType      = scene.alertType;
    wrapper.dataset.alertCount     = scene.alertCount ?? 1;
    wrapper.dataset.alertLabel     = scene.alertLabel || '';
    wrapper.dataset.alertCallTitle = scene.alertCallTitle || '';
  }
  const renderer = RENDERERS[scene.type];
  if (!renderer) { console.warn('engine.js: unknown scene type:', scene.type); return wrapper; }
  wrapper.appendChild(renderer(scene));
  return wrapper;
}

function buildBeat(beat) {
  const div = document.createElement('div');
  div.className = 'beat';
  div.id = beat.id;
  if (beat.folderUnlock) div.dataset.folderUnlock = beat.folderUnlock;
  div.innerHTML = `
    <div class="beat-header">
      <div class="beat-num">${beat.num}</div>
      <div class="beat-header-text">
        <div class="beat-eyebrow">${beat.eyebrow}</div>
        <div class="beat-title">${beat.title}</div>
        <div class="beat-context">${beat.context}</div>
      </div>
    </div>`;
  (beat.scenes || []).forEach(scene => div.appendChild(buildSceneBlock(scene)));
  return div;
}

function buildSidebar(story) {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;
  const { meta } = story;
  sidebar.innerHTML = `
    <div class="sidebar-header">
      <div class="sidebar-eyebrow">${meta.eyebrow}</div>
      <div class="sidebar-title">${meta.title}</div>
      <div class="sidebar-sub">${meta.sub}</div>
    </div>
    <div class="disclaimer"><p>${meta.disclaimer}</p></div>
    <div class="cast-block">
      <div class="cast-label">${meta.castLabel || 'Cast'}</div>
      ${meta.cast.map(c =>
        `<div class="cast-item">
          <span class="cast-name${c.hero ? ' hero' : ''}">${c.name}</span>
          <span class="cast-role">${c.role}</span>
        </div>`
      ).join('')}
    </div>
    <div class="nav-section">
      <div class="nav-section-label">${meta.navLabel || 'Story Beats'}</div>
      ${story.beats.map((b, i) =>
        `<div class="nav-item${i === 0 ? ' active' : ''}" onclick="go('${b.id}',this)">
          <span class="nav-num">${b.num}</span>${b.title}
        </div>`
      ).join('')}
    </div>
    <div class="sidebar-footer">
      <button class="theme-toggle" onclick="toggleTheme()" title="Switch to light mode">☀️</button>
    </div>`;
}

function buildHero(meta) {
  const heroEl = document.querySelector('#main > .hero');
  if (!heroEl) return;
  heroEl.innerHTML = `
    <div class="hero-eyebrow">${meta.heroEyebrow}</div>
    <div class="hero-title">${meta.heroTitle}</div>
    <div class="hero-sub">${meta.heroSub}</div>
    <div class="hero-tags">
      ${(meta.heroTags || []).map(t =>
        `<span class="tag ${t.color || ''}">${t.text}</span>`
      ).join('')}
    </div>`;
}

function buildDocModals(docs) {
  const container = document.getElementById('doc-modals');
  if (!container) return;
  (docs || []).forEach(doc => {
    const wrap = document.createElement('div');
    wrap.innerHTML = doc.html;
    const node = wrap.firstElementChild;
    if (node) container.appendChild(node);
  });
}

function initDocModals() {
  const container = document.getElementById('doc-modals') || document.body;
  (window.STORY?.docs || []).forEach(d => {
    if (!d.content || document.getElementById(d.id)) return;
    const trimmed = d.content.trim();
    if (trimmed.startsWith('<div class="doc-overlay') || trimmed.startsWith("<div class='doc-overlay")) {
      // Full modal HTML pasted — insert directly
      const tmp = document.createElement('div');
      tmp.innerHTML = trimmed;
      const el = tmp.firstElementChild;
      if (el) container.appendChild(el);
    } else {
      // Body content only — wrap with standard chrome
      const overlay = document.createElement('div');
      overlay.className = 'doc-overlay';
      overlay.id = d.id;
      overlay.setAttribute('onclick', 'closeDoc(this)');
      overlay.innerHTML = `
        <div class="doc-window" onclick="event.stopPropagation()">
          <div class="doc-header">
            <div class="doc-title">${d.name || d.id}</div>
            <button class="doc-close" onclick="closeDoc(this)">✕</button>
          </div>
          <div class="doc-body">${d.content}</div>
        </div>`;
      container.appendChild(overlay);
    }
  });
}

// ── EMAIL INBOX ─────────────────────────────────────────────────

function _unlockEmail(id) {
  if (!id || _unlockedEmailIds.includes(id)) return;
  _unlockedEmailIds.push(id);
  document.getElementById('email-app-fab')?.classList.remove('email-app-btn-hidden');
  _updateEmailBadge();
}

function _updateEmailBadge() {
  const n = _unlockedEmailIds.length;
  document.querySelectorAll('.email-app-count').forEach(el => {
    el.textContent = n;
    el.style.display = n > 0 ? 'flex' : 'none';
  });
}

// ── EMAIL APP ───────────────────────────────────────────────────

let _selectedEmailId = null;

function openEmailApp() {
  let overlay = document.getElementById('email-app-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'email-app-overlay';
    overlay.className = 'email-app-overlay';
    overlay.innerHTML = `
      <div class="email-app">
        <div class="email-app-bar">
          <span class="email-app-bar-title">📧 Inbox</span>
          <button class="email-app-close" onclick="closeEmailApp()">✕</button>
        </div>
        <div class="email-app-body">
          <div class="email-app-list" id="email-app-list"></div>
          <div class="email-app-detail" id="email-app-detail">
            <div class="email-app-empty">Select an email to read it.</div>
          </div>
        </div>
      </div>`;
    document.body.appendChild(overlay);
  }
  _renderEmailList();
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeEmailApp() {
  const overlay = document.getElementById('email-app-overlay');
  if (overlay) overlay.classList.remove('open');
  document.body.style.overflow = '';
}

function _renderEmailList() {
  const list = document.getElementById('email-app-list');
  if (!list) return;
  if (_unlockedEmailIds.length === 0) {
    list.innerHTML = '<div class="email-app-empty" style="padding:20px;">No emails yet.</div>';
    return;
  }
  list.innerHTML = _unlockedEmailIds.slice().reverse().map(id => {
    const e = _emailRegistry[id];
    if (!e) return '';
    const snippet = (e.body || '').replace(/<[^>]+>/g, '').trim().slice(0, 80);
    const isSelected = id === _selectedEmailId;
    return `<div class="email-list-item${isSelected ? ' selected' : ''}" onclick="selectEmail(${id})">
      <div class="email-list-from">${e.from || ''}</div>
      <div class="email-list-subject">${e.subject || '(no subject)'}</div>
      <div class="email-list-preview">${e.date ? `<span class="email-list-date">${e.date}</span>` : ''}${snippet ? `<span>${snippet}</span>` : ''}</div>
    </div>`;
  }).join('');
}

function selectEmail(id) {
  _selectedEmailId = id;
  _renderEmailList(); // re-render to update selected state
  const e = _emailRegistry[id];
  const detail = document.getElementById('email-app-detail');
  if (!detail || !e) return;
  const scene = { type: 'email-card', email: e };
  const rendered = renderEmailCard(scene);
  // Strip the topbar — the app provides its own chrome
  const topbar = rendered.querySelector('.email-topbar');
  if (topbar) topbar.remove();
  const card = rendered.querySelector('.email-card');
  if (card) { card.style.margin = '0'; card.style.maxWidth = 'none'; card.style.borderRadius = '0'; card.style.boxShadow = 'none'; }
  detail.innerHTML = '';
  detail.appendChild(rendered);
}

// ── THEME ───────────────────────────────────────────────────────

function initTheme() {
  const saved = localStorage.getItem('story-theme') || 'dark';
  document.documentElement.dataset.theme = saved;
  // Sync button icon after sidebar is built
  requestAnimationFrame(() => {
    document.querySelectorAll('.theme-toggle').forEach(btn => {
      btn.textContent = saved === 'light' ? '🌙' : '☀️';
      btn.title = saved === 'light' ? 'Switch to dark mode' : 'Switch to light mode';
    });
  });
}

function toggleTheme() {
  const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
  document.documentElement.dataset.theme = next;
  localStorage.setItem('story-theme', next);
  document.querySelectorAll('.theme-toggle').forEach(btn => {
    btn.textContent = next === 'light' ? '🌙' : '☀️';
    btn.title = next === 'light' ? 'Switch to dark mode' : 'Switch to light mode';
  });
}

// ── MAIN ENTRY POINT ───────────────────────────────────────────

function initStory() {
  const story = window.STORY;
  if (!story) {
    console.error('engine.js: window.STORY is not defined — load story.js before engine.js');
    return;
  }
  initTheme();
  buildSidebar(story);
  buildHero(story.meta);
  initDocModals();
  buildDocModals(story.docs);
  story.beats.forEach(beat => {
    if (beat.docRequirements) beatDocRequirements[beat.id] = beat.docRequirements;
    main.appendChild(buildBeat(beat));
  });
  beats = story.beats.map(b => b.id);
  initDialogues();
  initStoryBeats();
  initSmsCards();
  initMeetingChats();
  // Inject fixed email button top-right
  if (!document.getElementById('email-app-fab')) {
    const fab = document.createElement('button');
    fab.id = 'email-app-fab';
    fab.className = 'email-app-btn email-app-btn-hidden';
    fab.title = 'Open email inbox';
    fab.onclick = openEmailApp;
    fab.innerHTML = '📧 <span class="email-app-count" id="email-app-count" style="display:none">0</span>';
    document.body.appendChild(fab);
  }
  // Unlock emails visible from the start (first scenes of beat 1)
  document.querySelectorAll('.scene-block:not(.scene-hidden) [data-email-id]').forEach(el => {
    _unlockEmail(parseInt(el.dataset.emailId));
  });
}

// ── INTERACTION FUNCTIONS (verbatim from index.html) ───────────

function openDoc(id) { document.getElementById(id).classList.add('open'); document.body.style.overflow = 'hidden'; }
function closeDoc(el) { el.classList.remove('open'); document.body.style.overflow = ''; }

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') document.querySelectorAll('.doc-overlay.open').forEach(closeDoc);
});

function go(id, navEl) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  if (navEl) navEl.classList.add('active');
  const el = document.getElementById(id);
  if (el) document.getElementById('main').scrollTo({ top: el.offsetTop - 20, behavior: 'smooth' });
}

function initDialogues() {
  document.querySelectorAll('.dialogue').forEach(dl => {
    if (dl.classList.contains('dialogue-meeting')) return; // handled by meeting system
    const lines = Array.from(dl.querySelectorAll('.line'));
    if (lines.length <= 1) return;
    if (!dl.querySelector(':scope > .dialogue-scroll')) {
      const scroll = document.createElement('div');
      scroll.className = 'dialogue-scroll';
      lines.forEach(l => scroll.appendChild(l));
      dl.insertBefore(scroll, dl.firstChild);
    }
    lines.slice(1).forEach(l => l.classList.add('line-hidden'));
    const ctrl = document.createElement('div');
    ctrl.className = 'dialogue-controls';
    ctrl.innerHTML = `<button class="dlg-next" onclick="dlgNext(this)">Next ›</button><span class="dlg-progress">1 / ${lines.length}</span><button class="dlg-showall" onclick="dlgShowAll(this)">show all</button>`;
    dl.appendChild(ctrl);
  });
}

function dlgNext(btn) {
  const dl = btn.closest('.dialogue');
  const lines = Array.from(dl.querySelectorAll('.line'));
  const hidden = dl.querySelector('.line.line-hidden');
  if (!hidden) return;
  hidden.classList.remove('line-hidden');
  // Update speaking tile for meeting style
  if (dl.classList.contains('dialogue-meeting')) {
    const speaker = hidden.dataset.speaker;
    dl.querySelectorAll('.meeting-tile').forEach(t => t.classList.remove('speaking'));
    if (speaker) dl.querySelector(`.meeting-tile[data-speaker="${speaker}"]`)?.classList.add('speaking');
  }
  const scrollEl = dl.querySelector('.dialogue-scroll');
  if (scrollEl) setTimeout(() => {
    const lineBottom = hidden.offsetTop + hidden.offsetHeight;
    const visibleBottom = scrollEl.scrollTop + scrollEl.clientHeight;
    if (lineBottom > visibleBottom) {
      scrollEl.scrollTo({ top: lineBottom - scrollEl.clientHeight, behavior: 'smooth' });
    }
  }, 50);
  const revealed = lines.filter(l => !l.classList.contains('line-hidden')).length;
  dl.querySelector('.dlg-progress').textContent = `${revealed} / ${lines.length}`;
  if (!dl.querySelector('.line.line-hidden')) { btn.textContent = 'Done ✓'; btn.disabled = true; }
}

function dlgShowAll(btn) {
  const dl = btn.closest('.dialogue');
  const lines = Array.from(dl.querySelectorAll('.line'));
  dl.querySelectorAll('.line.line-hidden').forEach(l => l.classList.remove('line-hidden'));
  dl.querySelector('.dlg-progress').textContent = `${lines.length} / ${lines.length}`;
  dl.querySelector('.dlg-next').textContent = 'Done ✓';
  dl.querySelector('.dlg-next').disabled = true;
}

function navItemForBeat(beatId) {
  return Array.from(document.querySelectorAll('.nav-item')).find(n => {
    const m = n.getAttribute('onclick')?.match(/'([^']+)'/);
    return m && m[1] === beatId;
  });
}

function unlockBeat(beat) {
  beat.classList.remove('beat-locked');
  const firstScene = beat.querySelector(':scope > .scene-block');
  if (firstScene) {
    const emailEl = firstScene.querySelector('[data-email-id]');
    if (emailEl) _unlockEmail(parseInt(emailEl.dataset.emailId));
  }
  beat.style.opacity = '0';
  requestAnimationFrame(() => requestAnimationFrame(() => {
    beat.style.transition = 'opacity 0.5s ease';
    beat.style.opacity = '1';
  }));
  setTimeout(() => beat.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  const navItem = navItemForBeat(beat.id);
  if (navItem) navItem.classList.remove('nav-locked');
}

function unlockNextBeat(currentBeat) {
  const allBeats = Array.from(document.querySelectorAll('.beat'));
  const idx = allBeats.indexOf(currentBeat);
  if (idx + 1 < allBeats.length) unlockBeat(allBeats[idx + 1]);
}

function initStoryBeats() {
  const allBeats = Array.from(document.querySelectorAll('.beat'));
  allBeats.slice(1).forEach(b => {
    b.classList.add('beat-locked');
    const navItem = navItemForBeat(b.id);
    if (navItem) navItem.classList.add('nav-locked');
  });
  allBeats.forEach((beat, beatIdx) => {
    const scenes = Array.from(beat.querySelectorAll(':scope > .scene-block'));
    const isLastBeat = beatIdx === allBeats.length - 1;
    if (scenes.length) {
      scenes.slice(1).forEach(s => s.classList.add('scene-hidden'));
      const nav = document.createElement('div');
      nav.className = 'story-nav';
      nav.id = beat.id + '-nav';
      nav.dataset.current = '0';
      nav.dataset.total = scenes.length;
      nav.innerHTML = `<button class="story-next-btn" onclick="beatNext('${beat.id}')">Continue ›</button><span class="story-progress-label">Scene 1 of ${scenes.length}</span>`;
      beat.appendChild(nav);
    } else if (!isLastBeat) {
      const unlockKey = beat.dataset.folderUnlock || '';
      const adv = document.createElement('div');
      adv.className = 'beat-advance';
      adv.innerHTML = `<button class="beat-advance-btn" onclick="${unlockKey ? `handleFolderUnlock('${unlockKey}');` : ''}this.closest('.beat-advance').dataset.used='1';this.textContent='Done ✓';this.disabled=true;unlockNextBeat(this.closest('.beat'))">Continue to next section ›</button>`;
      beat.appendChild(adv);
    }
  });
}

function _revealScene(scene) {
  scene.classList.remove('scene-hidden');
  const emailEl = scene.querySelector('[data-email-id]');
  if (emailEl) _unlockEmail(parseInt(emailEl.dataset.emailId));
  scene.style.opacity = '0';
  scene.style.transform = 'translateY(10px)';
  requestAnimationFrame(() => requestAnimationFrame(() => {
    scene.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
    scene.style.opacity = '1';
    scene.style.transform = 'translateY(0)';
  }));
}

function beatNext(beatId) {
  const beat    = document.getElementById(beatId);
  const nav     = document.getElementById(beatId + '-nav');
  const current = parseInt(nav.dataset.current);
  const total   = parseInt(nav.dataset.total);
  const scenes  = Array.from(beat.querySelectorAll(':scope > .scene-block'));
  if (current + 1 >= total) return;

  const nextScene    = scenes[current + 1];
  const leavingScene = scenes[current];

  // Answer gate — quiz/exercise in current scene must be completed
  if (leavingScene.dataset.requireAnswer && !leavingScene.dataset.answerDone) {
    const btn = nav.querySelector('.story-next-btn');
    const orig = btn.textContent;
    btn.textContent = 'Complete the exercise first';
    setTimeout(() => { btn.textContent = orig; }, 2800);
    return;
  }

  // Doc gate
  const reqs = nextScene.dataset.requireDocs;
  if (reqs) {
    const required = reqs.split(',');
    const reviewed = beatDocsReviewed[nextScene.dataset.beat] || new Set();
    const missing  = required.filter(d => !reviewed.has(d));
    if (missing.length > 0) {
      const btn  = nav.querySelector('.story-next-btn');
      const orig = btn.textContent;
      btn.textContent = `Open ${missing.length} more attachment${missing.length > 1 ? 's' : ''} first`;
      setTimeout(() => { btn.textContent = orig; }, 2800);
      return;
    }
  }

  // Dim the scene we're leaving
  leavingScene.classList.add('scene-past');

  // Fire folder unlock on leaving current scene
  if (leavingScene.dataset.folderUnlock) handleFolderUnlock(leavingScene.dataset.folderUnlock);

  const newCurrent = current + 1;
  const isLast     = newCurrent + 1 >= total;

  // Alert intercept — show badge and hold scene hidden until badge is clicked
  if (nextScene.dataset.alertType) {
    const btn = nav.querySelector('.story-next-btn');
    btn.disabled = true;
    btn.textContent = 'Check your notifications ›';

    showAlert({
      type:      nextScene.dataset.alertType,
      count:     parseInt(nextScene.dataset.alertCount) || 1,
      label:     nextScene.dataset.alertLabel || (nextScene.dataset.alertType === 'phone' ? 'New message' : nextScene.dataset.alertType === 'call' ? 'Incoming call' : 'New email'),
      callTitle: nextScene.dataset.alertCallTitle || '',
      target:    nextScene.id,
      onDismiss: () => {
        _revealScene(nextScene);
        nav.dataset.current = newCurrent;
        nav.querySelector('.story-progress-label').textContent = `Scene ${newCurrent + 1} of ${total}`;
        if (isLast) {
          btn.textContent = 'Complete ✓';
          btn.disabled    = true;
          unlockNextBeat(beat);
          setTimeout(() => beat.querySelectorAll('.scene-block').forEach(s => { if (s !== nextScene) s.classList.add('scene-past'); }), 800);
        } else {
          btn.textContent = 'Continue ›';
          btn.disabled    = false;
        }
        _smsInit(nextScene);
        _meetingInit(nextScene); // runs last — meeting lock overrides the re-enable above
        setTimeout(() => nextScene.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
      },
    });
    return;
  }

  // Normal reveal
  _revealScene(nextScene);
  _smsInit(nextScene);
  _meetingInit(nextScene);
  setTimeout(() => nav.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 80);
  nav.dataset.current = newCurrent;
  nav.querySelector('.story-progress-label').textContent = `Scene ${newCurrent + 1} of ${total}`;
  if (isLast) {
    nav.querySelector('.story-next-btn').textContent = 'Complete ✓';
    nav.querySelector('.story-next-btn').disabled    = true;
    unlockNextBeat(beat);
    setTimeout(() => beat.querySelectorAll('.scene-block').forEach(s => { if (s !== nextScene) s.classList.add('scene-past'); }), 800);
  }
}

function trackDocOpen(beatId, docId) {
  if (!beatDocsReviewed[beatId]) beatDocsReviewed[beatId] = new Set();
  beatDocsReviewed[beatId].add(docId);
  openDoc(docId);
  const reqs = beatDocRequirements[beatId];
  if (reqs) {
    const reviewed = beatDocsReviewed[beatId];
    const remaining = reqs.filter(d => !reviewed.has(d)).length;
    const hint = document.getElementById('doc-hint-' + beatId);
    if (hint) {
      if (remaining === 0) {
        hint.textContent = 'All documents reviewed — your kickoff notes are ready. Click Continue.';
        hint.classList.add('docs-done');
      } else {
        hint.textContent = `${remaining} attachment${remaining > 1 ? 's' : ''} left to review.`;
      }
    }
  }
}

function handleFolderUnlock(keys) {
  keys.split(',').forEach(key => key.trim() && _folderUnlock(key));
}

function _folderUnlock(key) {
  // ── Data-driven path: read from STORY.docs ──────────────────────
  const storyDocs = (window.STORY?.docs || []).filter(d => d.unlockKey === key);
  if (storyDocs.length) {
    document.getElementById('folder-tab')?.classList.add('folder-tab-visible');
    storyDocs.forEach(d => {
      const isNotes  = d.section === 'notes';
      const sectionId = isNotes ? 'folder-notes'       : 'folder-docs';
      const emptyId   = isNotes ? 'folder-notes-empty' : 'folder-docs-empty';
      document.getElementById(emptyId)?.remove();
      const sectionEl  = document.getElementById(sectionId);
      const container  = d.folder ? _ensureSubfolder(sectionEl, d.folder) : sectionEl;
      _injectDocItem(container, d);
    });
    return;
  }
  // ── Legacy hardcoded fallback (backwards compat) ─────────────────
  if (key === 'handover-docs') {
    document.getElementById('folder-tab')?.classList.add('folder-tab-visible');
    const docsEl = document.getElementById('folder-docs');
    document.getElementById('folder-docs-empty')?.remove();
    if (!document.getElementById('folder-handover')) {
      const frag = document.createElement('div');
      frag.id = 'folder-handover';
      frag.innerHTML = `
        <div class="folder-subfolder open" onclick="toggleSubfolder(this)">
          <span class="folder-subfolder-icon">📂</span><span class="folder-subfolder-name">Handover</span><span class="folder-subfolder-arrow">›</span>
        </div>
        <div class="folder-subfolder-contents open">
          <div class="folder-doc-item" onclick="openDoc('doc-contract')"><span class="folder-doc-icon">📄</span><div><div class="folder-doc-name">Ridgeline_Contract_Signed.pdf</div><div class="folder-doc-type">PDF · Signed Contract</div></div></div>
          <div class="folder-doc-item" onclick="openDoc('doc-estimate')"><span class="folder-doc-icon">📊</span><div><div class="folder-doc-name">Ridgeline_Estimate_v3.xlsx</div><div class="folder-doc-type">Excel · Budget Estimate</div></div></div>
          <div class="folder-doc-item" onclick="openDoc('doc-schedule')"><span class="folder-doc-icon">📅</span><div><div class="folder-doc-name">Ridgeline_Baseline_Schedule.pdf</div><div class="folder-doc-type">PDF · Baseline Schedule</div></div></div>
          <div class="folder-doc-item" onclick="openDoc('doc-brief')"><span class="folder-doc-icon">📋</span><div><div class="folder-doc-name">Ridgeline_Project_Brief.docx</div><div class="folder-doc-type">Word · Project Brief</div></div></div>
        </div>`;
      docsEl.appendChild(frag);
    }
  }
  if (key === 'kickoff-notes') {
    document.getElementById('folder-notes-empty')?.remove();
    if (!document.getElementById('folder-item-kickoff')) {
      const item = document.createElement('div');
      item.id = 'folder-item-kickoff'; item.className = 'folder-doc-item';
      item.onclick = () => openDoc('doc-kickoff-notes');
      item.innerHTML = `<span class="folder-doc-icon">📓</span><div><div class="folder-doc-name">PC Kickoff Prep Notes</div><div class="folder-doc-type">J. Okafor · Jan 16</div></div>`;
      document.getElementById('folder-notes').appendChild(item);
    }
  }
  if (key === 'meeting-notes') {
    document.getElementById('folder-notes-empty')?.remove();
    if (!document.getElementById('folder-item-meeting')) {
      const item = document.createElement('div');
      item.id = 'folder-item-meeting'; item.className = 'folder-doc-item';
      item.onclick = () => openDoc('doc-meeting-notes');
      item.innerHTML = `<span class="folder-doc-icon">📓</span><div><div class="folder-doc-name">Kickoff Meeting Notes</div><div class="folder-doc-type">Sarah Chen · Jan 17</div></div>`;
      document.getElementById('folder-notes').appendChild(item);
    }
  }
  if (key === 'rules-of-credit') {
    const contents = _legacyEnsurePCFolder();
    if (!document.getElementById('folder-item-roc') && contents) {
      const item = document.createElement('div');
      item.id = 'folder-item-roc'; item.className = 'folder-doc-item';
      item.onclick = () => openDoc('doc-rules-of-credit');
      item.innerHTML = `<span class="folder-doc-icon">📊</span><div><div class="folder-doc-name">WBS &amp; Rules of Credit</div><div class="folder-doc-type">Excel · Week 2 Setup</div></div>`;
      contents.appendChild(item);
    }
  }
  if (key === 'pc-report') {
    const contents = document.getElementById('folder-pc-contents');
    if (!document.getElementById('folder-item-pcreport') && contents) {
      const item = document.createElement('div');
      item.id = 'folder-item-pcreport'; item.className = 'folder-doc-item';
      item.onclick = () => openDoc('doc-pc-report');
      item.innerHTML = `<span class="folder-doc-icon">📄</span><div><div class="folder-doc-name">Month 1 — PC Status Report</div><div class="folder-doc-type">Word · End of Month 1</div></div>`;
      contents.appendChild(item);
    }
  }
  if (key === 'dan-email') {
    document.getElementById('folder-docs-empty')?.remove();
    if (!document.getElementById('folder-pc-controls')) {
      const frag = document.createElement('div');
      frag.id = 'folder-pc-controls';
      frag.innerHTML = `
        <div class="folder-subfolder open" onclick="toggleSubfolder(this)">
          <span class="folder-subfolder-icon">📂</span><span class="folder-subfolder-name">Project Controls</span><span class="folder-subfolder-arrow">›</span>
        </div>
        <div id="folder-pc-contents" class="folder-subfolder-contents open">
          <div class="folder-doc-item" onclick="openDoc('doc-dan-email')"><span class="folder-doc-icon">📧</span><div><div class="folder-doc-name">PC Checklist — Dan Reyes</div><div class="folder-doc-type">Email · Jan 20</div></div></div>
        </div>`;
      document.getElementById('folder-docs').appendChild(frag);
    }
  }
}

// Generic subfolder creator — finds or creates by name
function _ensureSubfolder(sectionEl, name) {
  const slug = 'folder-sub-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const existing = document.getElementById(slug + '-contents');
  if (existing) return existing;
  const frag = document.createElement('div');
  frag.id = slug;
  frag.innerHTML = `
    <div class="folder-subfolder open" onclick="toggleSubfolder(this)">
      <span class="folder-subfolder-icon">📂</span>
      <span class="folder-subfolder-name">${name}</span>
      <span class="folder-subfolder-arrow">›</span>
    </div>
    <div id="${slug}-contents" class="folder-subfolder-contents open"></div>`;
  sectionEl.appendChild(frag);
  return document.getElementById(slug + '-contents');
}

// Inject a single doc item (deduped by id)
function _injectDocItem(container, d) {
  if (!container) return;
  const elId = 'folder-doc-' + d.id;
  if (document.getElementById(elId)) return;
  const item = document.createElement('div');
  item.id = elId;
  item.className = 'folder-doc-item';
  if (d.binderId) {
    item.onclick = () => {
      const scene = _findSceneById(d.binderId);
      if (scene) openBinderModal(scene);
    };
  } else {
    item.onclick = () => openDoc(d.id);
  }
  item.innerHTML = `<span class="folder-doc-icon">${d.icon || '📄'}</span><div><div class="folder-doc-name">${d.name || d.id}</div><div class="folder-doc-type">${d.sub || ''}</div></div>`;
  container.appendChild(item);
}

function _findSceneById(id) {
  for (const beat of (window.STORY?.beats || [])) {
    for (const scene of (beat.scenes || [])) {
      if (scene.id === id) return scene;
    }
  }
  return null;
}

function _legacyEnsurePCFolder() {
  document.getElementById('folder-docs-empty')?.remove();
  if (!document.getElementById('folder-pc-controls')) {
    const frag = document.createElement('div');
    frag.id = 'folder-pc-controls';
    frag.innerHTML = `
      <div class="folder-subfolder open" onclick="toggleSubfolder(this)">
        <span class="folder-subfolder-icon">📂</span><span class="folder-subfolder-name">Project Controls</span><span class="folder-subfolder-arrow">›</span>
      </div>
      <div id="folder-pc-contents" class="folder-subfolder-contents open"></div>`;
    document.getElementById('folder-docs').appendChild(frag);
  }
  return document.getElementById('folder-pc-contents');
}

function toggleFolder() {
  document.getElementById('folder-panel').classList.toggle('folder-open');
}

function toggleSubfolder(el) {
  el.classList.toggle('open');
  el.nextElementSibling.classList.toggle('open');
}

// ── ALERT BADGES ───────────────────────────────────────────────

function showCallAlert({ label, callTitle, onDismiss }) {
  document.getElementById('call-overlay')?.remove();

  const callerText = label || 'Incoming call';
  const titleText  = callTitle || 'Video call';

  const overlay = document.createElement('div');
  overlay.id = 'call-overlay';
  overlay.className = 'call-overlay';
  overlay.innerHTML = `
    <div class="call-card">
      <div class="call-ring">
        <div class="call-ring-icon">📹</div>
      </div>
      <div class="call-info">
        <div class="call-title">${titleText}</div>
        <div class="call-caller">${callerText}</div>
      </div>
      <div class="call-actions">
        <button class="call-btn call-accept" title="Accept">
          <span>📞</span>
          <span class="call-btn-label">Accept</span>
        </button>
      </div>
    </div>`;

  document.body.appendChild(overlay);

  overlay.querySelector('.call-accept').onclick = () => {
    overlay.classList.add('call-connecting');
    setTimeout(() => {
      overlay.remove();
      if (onDismiss) onDismiss();
    }, 600);
  };

}

function showAlert({ type, count, label, target, callTitle, onDismiss }) {
  if (type === 'call') {
    showCallAlert({ label, callTitle, target, onDismiss });
    return;
  }
  const tray = document.getElementById('alert-tray');
  if (!tray) return;
  if (target && tray.querySelector(`[data-target="${target}"]`)) return;

  const icon    = type === 'phone' ? '📱' : '✉️';
  const tooltip = label || (type === 'phone' ? 'New message' : 'New email');

  const badge = document.createElement('div');
  badge.className = 'alert-badge';
  if (target) badge.dataset.target = target;
  badge.innerHTML = `
    <span class="alert-badge-icon">${icon}</span>
    ${count > 0 ? `<span class="alert-badge-count">${count}</span>` : ''}
    <span class="alert-badge-tooltip">${tooltip}</span>`;

  badge.onclick = () => {
    badge.classList.add('dismissing');
    setTimeout(() => badge.remove(), 220);
    if (onDismiss) onDismiss();
  };

  tray.appendChild(badge);
}

// ── BOOTSTRAP ──────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  main = document.getElementById('main');

  if (window.STORY) {
    initStory();
  } else {
    // Legacy: beats are already in the HTML
    beatDocRequirements['beat1'] = ['doc-contract', 'doc-estimate', 'doc-schedule', 'doc-brief'];
    beats = Array.from(document.querySelectorAll('.beat')).map(b => b.id);
    initDialogues();
    initStoryBeats();
  }

  main.addEventListener('scroll', () => {
    const scrollPos = main.scrollTop + 120;
    let current = beats[0];
    beats.forEach(id => {
      const el = document.getElementById(id);
      if (el && el.offsetTop <= scrollPos) current = id;
    });
    document.querySelectorAll('.nav-item').forEach(n => {
      const target = n.getAttribute('onclick')?.match(/'([^']+)'/)?.[1];
      n.classList.toggle('active', target === current);
    });
  });

  document.getElementById('main').addEventListener('click', () => {
    document.getElementById('folder-panel').classList.remove('folder-open');
  });
});

// ══════════════════════════════════════════════════════════════
// QUIZ INTERACTION
// ══════════════════════════════════════════════════════════════
function quizSelect(btn) {
  const pane = btn.closest('.quiz-pane');
  pane.querySelectorAll('.quiz-opt').forEach(o => o.classList.remove('selected'));
  btn.classList.add('selected');
  const fb = pane.querySelector('.quiz-scene-feedback');
  fb.className = 'quiz-scene-feedback';
  fb.textContent = '';
  pane.querySelector('.quiz-submit-btn').disabled = false;
}

function quizSubmit(btn) {
  const pane     = btn.closest('.quiz-pane');
  const quiz     = btn.closest('.quiz-scene');
  const selected = pane.querySelector('.quiz-opt.selected');
  if (!selected) return;

  const isCorrect = selected.dataset.correct === '1';
  const optFb     = selected.dataset.fb;
  const globalFb  = isCorrect ? (pane.dataset.fbCorrect || '') : (pane.dataset.fbWrong || '');
  const fbText    = optFb || globalFb || (isCorrect ? 'Correct!' : 'Not quite — try again.');
  const fb        = pane.querySelector('.quiz-scene-feedback');

  pane.querySelectorAll('.quiz-opt').forEach(o => {
    o.classList.add('locked');
    if (o.dataset.correct === '1') o.classList.add('correct');
  });
  if (!isCorrect) selected.classList.add('wrong');

  fb.innerHTML = `<strong>${isCorrect ? 'Correct' : 'Incorrect'}</strong>${fbText}`;
  fb.className = `quiz-scene-feedback ${isCorrect ? 'show-correct' : 'show-wrong'}`;
  btn.disabled = true;

  if (isCorrect) {
    const total   = parseInt(quiz.dataset.total);
    const current = parseInt(quiz.dataset.current);
    quiz.dataset.score = parseInt(quiz.dataset.score) + 1;
    const isLast  = current + 1 >= total;
    btn.textContent = isLast ? 'See Results ›' : 'Next Question ›';
    btn.classList.add('answered');
    btn.disabled = false;
    btn.onclick = function() { quizAdvance(this); };
    if (isLast) _markAnswerDone(quiz);
  } else {
    btn.textContent = 'Try Again';
    setTimeout(() => {
      pane.querySelectorAll('.quiz-opt').forEach(o => o.classList.remove('locked','correct','wrong','selected'));
      fb.className = 'quiz-scene-feedback';
      fb.textContent = '';
      btn.textContent = 'Check Answer';
      btn.disabled = true;
      btn.onclick = function() { quizSubmit(this); };
    }, 2000);
  }
}

function quizAdvance(btn) {
  const quiz    = btn.closest('.quiz-scene');
  const current = parseInt(quiz.dataset.current);
  const total   = parseInt(quiz.dataset.total);
  const newIdx  = current + 1;

  if (newIdx >= total) {
    quiz.querySelectorAll('.quiz-pane').forEach(p => p.style.display = 'none');
    const score = parseInt(quiz.dataset.score);
    const comp  = quiz.querySelector('.quiz-complete');
    comp.querySelector('.quiz-score-ring').textContent = `${score}/${total}`;
    comp.querySelector('.quiz-score-sub').textContent  = score === total ? 'Perfect score!' : `${score} of ${total} correct`;
    comp.style.display = '';
  } else {
    quiz.dataset.current = newIdx;
    quiz.querySelectorAll('.quiz-pane').forEach(p => p.style.display = 'none');
    quiz.querySelector(`.quiz-pane[data-qidx="${newIdx}"]`).style.display = '';
    const label = quiz.querySelector('.quiz-prog-label');
    const fill  = quiz.querySelector('.quiz-prog-fill');
    if (label) label.textContent = `Question ${newIdx + 1} of ${total}`;
    if (fill)  fill.style.width  = `${(newIdx / total) * 100}%`;
  }
}

function quizRetry(btn) {
  const quiz  = btn.closest('.quiz-scene');
  const total = parseInt(quiz.dataset.total);
  quiz.dataset.current = '0';
  quiz.dataset.score   = '0';
  quiz.querySelectorAll('.quiz-pane').forEach((p, i) => {
    p.style.display = i === 0 ? '' : 'none';
    p.querySelectorAll('.quiz-opt').forEach(o => o.classList.remove('locked','correct','wrong','selected'));
    const fb   = p.querySelector('.quiz-scene-feedback');
    const sBtn = p.querySelector('.quiz-submit-btn');
    if (fb)   { fb.className = 'quiz-scene-feedback'; fb.textContent = ''; }
    if (sBtn) { sBtn.textContent = 'Check Answer'; sBtn.disabled = true; sBtn.className = 'quiz-submit-btn'; sBtn.onclick = function() { quizSubmit(this); }; }
  });
  quiz.querySelector('.quiz-complete').style.display = 'none';
  const label = quiz.querySelector('.quiz-prog-label');
  const fill  = quiz.querySelector('.quiz-prog-fill');
  if (label) label.textContent = `Question 1 of ${total}`;
  if (fill)  fill.style.width  = '0%';
}

// ══════════════════════════════════════════════════════════════
// DRAG-MATCH INTERACTION
// ══════════════════════════════════════════════════════════════
let _dragChip = null;

function dragStart(chip, e) {
  _dragChip = chip;
  chip.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', chip.dataset.chipid);
}

function dragEnd(chip) {
  chip.classList.remove('dragging');
  _dragChip = null;
}

function dragOver(zone, e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  zone.classList.add('drag-over');
}

function dragLeave(zone) {
  zone.classList.remove('drag-over');
}

function dragDrop(zone, e) {
  e.preventDefault();
  zone.classList.remove('drag-over');
  const chipId = e.dataTransfer.getData('text/plain') || (_dragChip && _dragChip.dataset.chipid);
  if (!chipId) return;
  const scene = zone.closest('.drag-match-scene');
  const chip  = scene.querySelector(`.drag-chip[data-chipid="${chipId}"]`);
  if (!chip) return;

  // If zone already has a chip, return it
  const prevId = zone.dataset.placed;
  if (prevId) {
    const prevChip = scene.querySelector(`.drag-chip[data-chipid="${prevId}"]`);
    if (prevChip) prevChip.classList.remove('placed');
  }
  // If chip was already in another zone, clear that zone
  scene.querySelectorAll('.drag-zone').forEach(z => {
    if (z !== zone && z.dataset.placed === chipId) {
      z.dataset.placed = '';
      z.classList.remove('zone-ok','zone-err');
      const slot = z.querySelector('.drag-zone-slot');
      slot.textContent = 'drop here';
      slot.classList.remove('has-chip');
      z.querySelector('.drag-zone-status').textContent = '';
    }
  });

  zone.dataset.placed = chipId;
  chip.classList.add('placed');
  const slot = zone.querySelector('.drag-zone-slot');
  slot.textContent = chip.textContent.trim();
  slot.classList.add('has-chip');
  zone.querySelector('.drag-zone-status').textContent = '';
  zone.classList.remove('zone-ok','zone-err');

  // Update score display
  _dragUpdateScore(scene);
}

function _dragUpdateScore(scene) {
  const zones   = scene.querySelectorAll('.drag-zone');
  const placed  = Array.from(zones).filter(z => z.dataset.placed).length;
  const score   = scene.querySelector('.drag-match-score');
  if (score) score.textContent = `${placed} of ${zones.length} placed`;
}

function dragCheck(btn) {
  const scene  = btn.closest('.drag-match-scene');
  const zones  = scene.querySelectorAll('.drag-zone');
  let correct = 0;
  zones.forEach(z => {
    const placed = z.dataset.placed;
    const status = z.querySelector('.drag-zone-status');
    if (!placed) { status.textContent = ''; return; }
    const ok = placed === z.dataset.answer;
    z.classList.toggle('zone-ok',  ok);
    z.classList.toggle('zone-err', !ok);
    status.textContent = ok ? '✓' : '✗';
    if (ok) correct++;
  });
  const score = scene.querySelector('.drag-match-score');
  const total = zones.length;
  score.textContent = `${correct} / ${total} correct`;
  if (correct === total) _markAnswerDone(scene);
}

function dragReset(btn) {
  const scene = btn.closest('.drag-match-scene');
  scene.querySelectorAll('.drag-zone').forEach(z => {
    z.dataset.placed = '';
    z.classList.remove('zone-ok','zone-err');
    const slot = z.querySelector('.drag-zone-slot');
    slot.textContent = 'drop here';
    slot.classList.remove('has-chip');
    z.querySelector('.drag-zone-status').textContent = '';
  });
  scene.querySelectorAll('.drag-chip').forEach(c => c.classList.remove('placed'));
  const score = scene.querySelector('.drag-match-score');
  if (score) score.textContent = '';
}

// ══════════════════════════════════════════════════════════════
// FILL-CELL INTERACTION
// ══════════════════════════════════════════════════════════════
function fillCheck(btn) {
  const scene     = btn.closest('.fill-cell-scene');
  const answers   = JSON.parse(scene.dataset.answers || '{}');
  const tolerance = parseFloat(scene.dataset.tolerance ?? 1);
  const inputs    = scene.querySelectorAll('.fill-answer');
  const fb        = scene.querySelector('.fill-cell-feedback');
  let allCorrect  = true;

  inputs.forEach(inp => {
    const key   = inp.dataset.key;
    const expected = answers[key];
    if (expected === undefined) return;
    const raw   = inp.value.replace(/[$,\s()]/g,'').trim();
    const val   = parseFloat(raw) * (inp.value.includes('(') ? -1 : 1);
    const ok    = Math.abs(val - expected) <= tolerance;
    inp.classList.toggle('ans-ok',  ok);
    inp.classList.toggle('ans-err', !ok);
    if (!ok) allCorrect = false;
  });

  if (allCorrect && inputs.length > 0) {
    fb.className = 'fill-cell-feedback fb-ok';
    fb.textContent = '✓ Correct!';
    _markAnswerDone(scene);
  } else {
    fb.className = 'fill-cell-feedback fb-err';
    fb.textContent = 'One or more values are incorrect — check your formula.';
    setTimeout(() => inputs.forEach(i => i.classList.remove('ans-err')), 2200);
  }
}

function fillReset(btn) {
  const scene = btn.closest('.fill-cell-scene');
  scene.querySelectorAll('.fill-answer').forEach(i => {
    i.value = '';
    i.className = 'fill-answer';
  });
  const fb = scene.querySelector('.fill-cell-feedback');
  if (fb) { fb.className = 'fill-cell-feedback'; fb.textContent = ''; }
}

// ══════════════════════════════════════════════════════════════
// BRANCH INTERACTION
// ══════════════════════════════════════════════════════════════
function branchGo(btn, slideId, outcome) {
  const scene  = btn.closest('.branch-scene');
  const from   = btn.closest('.branch-slide');
  const target = scene.querySelector(`.branch-slide[data-slide-id="${slideId}"]`);
  if (!target) return;

  // Track path
  const fromId = from.dataset.slideId || 'start';
  const path   = JSON.parse(scene.dataset.path || '[]');
  path.push({ id: fromId, outcome });
  scene.dataset.path = JSON.stringify(path);

  from.style.display = 'none';
  target.style.display = '';

  // Update path trackers in outcomes
  scene.querySelectorAll('.branch-path').forEach(p => {
    p.innerHTML = path.map((step, i) => {
      const arrow = i > 0 ? '<span class="branch-path-arrow">›</span>' : '';
      return `${arrow}<div class="branch-path-step ${step.outcome || ''}"><div class="branch-path-dot"></div>${step.id}</div>`;
    }).join('');
  });
}

function branchReset(btn) {
  const scene = btn.closest('.branch-scene');
  scene.dataset.path = '[]';
  scene.querySelectorAll('.branch-slide').forEach((s, i) => {
    s.style.display = i === 0 ? '' : 'none';
  });
  scene.querySelectorAll('.branch-path').forEach(p => p.innerHTML = '');
}

// ══════════════════════════════════════════════════════════════
// CLICK-DOC INTERACTION
// ══════════════════════════════════════════════════════════════
function clickDocStart(btn) {
  const scene = btn.closest('.click-doc-scene');
  scene.querySelector('.click-doc-body').classList.add('exercise-on');
  scene.querySelector('.click-doc-badge').classList.add('visible');
  scene.querySelector('.click-doc-question').classList.add('visible');
  scene.dataset.found = '';
  btn.textContent = 'Reset';
  btn.onclick = function() { clickDocReset(this); };
}

function clickDocSelect(el) {
  const scene = el.closest('.click-doc-scene');
  if (!scene.querySelector('.click-doc-body').classList.contains('exercise-on')) return;
  if (el.classList.contains('ct-correct')) return; // already found

  const correctKeys = (scene.dataset.correctKeys || '').split(',').map(k => k.trim()).filter(Boolean);
  const total       = correctKeys.length;
  const isCorrect   = correctKeys.includes(el.dataset.key);
  const fb          = scene.querySelector('.click-doc-feedback');

  if (isCorrect) {
    el.classList.add('ct-correct');
    el.style.pointerEvents = 'none';

    // Track found keys
    const found = (scene.dataset.found || '').split(',').filter(Boolean);
    if (!found.includes(el.dataset.key)) found.push(el.dataset.key);
    scene.dataset.found = found.join(',');

    // Update progress counter
    const counter = scene.querySelector('.click-doc-found');
    if (counter) counter.textContent = found.length;

    const allDone = total <= 1 ? true : found.length >= total;

    if (allDone) {
      const fbText = scene.dataset.fbCorrect || (total > 1 ? 'All passages found!' : 'That\'s the right passage.');
      fb.innerHTML = `<span class="fb-label">Complete</span>${fbText}`;
      fb.className = 'click-doc-feedback fb-correct';
      _markAnswerDone(scene);
      // Disable remaining unfound targets
      scene.querySelectorAll('.click-target:not(.ct-correct)').forEach(t => { t.style.pointerEvents = 'none'; });
    } else {
      const remaining = total - found.length;
      fb.innerHTML = `<span class="fb-label">Found</span>${remaining} more to find.`;
      fb.className = 'click-doc-feedback fb-correct';
    }
  } else {
    el.classList.add('ct-wrong');
    const fbText = scene.dataset.fbWrong || 'Not that one — keep looking.';
    fb.innerHTML = `<span class="fb-label">Incorrect</span>${fbText}`;
    fb.className = 'click-doc-feedback fb-wrong';
    setTimeout(() => el.classList.remove('ct-wrong'), 1400);
  }
}

function clickDocReset(btn) {
  const scene = btn.closest('.click-doc-scene');
  scene.querySelector('.click-doc-body').classList.remove('exercise-on');
  scene.querySelector('.click-doc-badge').classList.remove('visible');
  scene.querySelector('.click-doc-question').classList.remove('visible');
  scene.dataset.found = '';
  scene.querySelectorAll('.click-target').forEach(t => {
    t.classList.remove('ct-selected','ct-correct','ct-wrong');
    t.style.pointerEvents = '';
  });
  const counter = scene.querySelector('.click-doc-found');
  if (counter) counter.textContent = '0';
  const fb = scene.querySelector('.click-doc-feedback');
  fb.className = 'click-doc-feedback';
  fb.textContent = '';
  btn.textContent = 'Start Exercise';
  btn.onclick = function() { clickDocStart(this); };
}

// ── SHARED UTILITY ──────────────────────────────────────────────
function _markAnswerDone(el) {
  const scene = el.closest('.scene-block');
  if (scene) scene.dataset.answerDone = '1';
}
