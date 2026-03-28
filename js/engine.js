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

// ── SCENE RENDERERS ────────────────────────────────────────────
// Each renderer accepts a scene object and returns an HTMLElement.

function renderProse(scene) {
  const d = document.createElement('div');
  d.className = 'prose';
  d.innerHTML = scene.html;
  return d;
}

function renderDialogue(scene) {
  const d = document.createElement('div');
  d.className = 'dialogue';
  d.innerHTML = scene.lines.map(l =>
    `<div class="line"><span class="line-speaker ${l.role}">${l.speaker}</span><span class="line-text">${l.text}</span></div>`
  ).join('');
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

function renderEmailCard(scene) {
  const { email, docHint } = scene;
  const d = document.createElement('div');
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
  const pages = scene.pages || [];
  const tabs  = scene.tabs  || [];
  const bid   = 'binder-' + (++_binderSeq);
  const multi = pages.length > 1;

  const spreadsHtml = pages.map((p, i) =>
    `<div class="binder-spread${i === 0 ? ' active' : ''}">
      <div class="binder-page left${multi ? ' binder-clickable' : ''}" ${multi ? `onclick="binderStep('${bid}',-1)"` : ''}>${_binderPageInner(p.left)}</div>
      <div class="binder-page right${multi ? ' binder-clickable' : ''}" ${multi ? `onclick="binderStep('${bid}',1)"` : ''}>${_binderPageInner(p.right)}</div>
    </div>`
  ).join('');

  const tabsHtml = tabs.length
    ? `<div class="binder-tabs">${tabs.map(t =>
        `<div class="binder-tab${t.page === 0 ? ' active' : ''}" data-page="${t.page}" onclick="binderGoto('${bid}',${t.page})">${t.label}</div>`
      ).join('')}</div>`
    : '';

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
  d.innerHTML = `${spreadsHtml}${tabsHtml}
    <div class="binder-rings">
      <div class="binder-ring"></div>
      <div class="binder-ring"></div>
      <div class="binder-ring"></div>
    </div>`;
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
};

// ── BUILDERS ───────────────────────────────────────────────────

function buildSceneBlock(scene) {
  const wrapper = document.createElement('div');
  wrapper.className = 'scene-block';
  if (scene.id) wrapper.id = scene.id;
  if (scene.folderUnlock) wrapper.dataset.folderUnlock = scene.folderUnlock;
  if (scene.requireDocs)  wrapper.dataset.requireDocs  = scene.requireDocs;
  if (scene.beat)         wrapper.dataset.beat         = scene.beat;
  if (scene.alertType) {
    if (!wrapper.id) wrapper.id = 'alert-target-' + Math.random().toString(36).slice(2, 7);
    wrapper.dataset.alertType  = scene.alertType;
    wrapper.dataset.alertCount = scene.alertCount ?? 1;
    wrapper.dataset.alertLabel = scene.alertLabel || '';
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

// ── MAIN ENTRY POINT ───────────────────────────────────────────

function initStory() {
  const story = window.STORY;
  if (!story) {
    console.error('engine.js: window.STORY is not defined — load story.js before engine.js');
    return;
  }
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
    const lines = Array.from(dl.querySelectorAll('.line'));
    if (lines.length <= 1) return;
    const scroll = document.createElement('div');
    scroll.className = 'dialogue-scroll';
    lines.forEach(l => scroll.appendChild(l));
    dl.insertBefore(scroll, dl.firstChild);
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
      type:     nextScene.dataset.alertType,
      count:    parseInt(nextScene.dataset.alertCount) || 1,
      label:    nextScene.dataset.alertLabel || (nextScene.dataset.alertType === 'phone' ? 'New message' : 'New email'),
      target:   nextScene.id,
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
        _smsInit(nextScene); // runs last — SMS lock overrides the re-enable above
        setTimeout(() => nextScene.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
      },
    });
    return;
  }

  // Normal reveal
  _revealScene(nextScene);
  _smsInit(nextScene);
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

function showAlert({ type, count, label, target, onDismiss }) {
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
