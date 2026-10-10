'use strict';

const lessonList = document.getElementById('lesson-list');
const lessonDetails = document.getElementById('lesson-details');
const statusMessage = document.getElementById('status-message');
const progressCount = document.getElementById('progress-count');
const progressFill = document.getElementById('progress-fill');

let lessons = [];
let learningContent = { lessons: [] };
let currentLessonId = 1;
let audio = new Audio();
let isPaused = false;
let playbackToken = 0;
let statusTimer = null;
const exploredLessons = new Set();

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

function showStatus(message) {
  statusMessage.textContent = message;
  statusMessage.classList.add('visible');
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => statusMessage.classList.remove('visible'), 3200);
}

function normalizeArabic(value) {
  return String(value || '')
    .replace(/[؟?!.,،؛:()\[\]{}"'ـ]/g, '')
    .replace(/[ًٌٍَُِّْٰ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ')
    .trim();
}

function getLearningLesson(id) {
  return learningContent.lessons.find(item => Number(item.id) === Number(id)) || null;
}

function getNewVocabulary(id) {
  const content = getLearningLesson(id);
  if (!content || !Array.isArray(content.vocabulary)) return [];
  const previouslyTaught = new Set();
  for (const lesson of learningContent.lessons) {
    if (Number(lesson.id) >= Number(id)) break;
    for (const word of lesson.vocabulary || []) {
      previouslyTaught.add(normalizeArabic(word.key || word.ar));
    }
  }
  const seenThisLesson = new Set();
  return content.vocabulary.filter(word => {
    const key = normalizeArabic(word.key || word.ar);
    if (!key || previouslyTaught.has(key) || seenThisLesson.has(key)) return false;
    seenThisLesson.add(key);
    return true;
  });
}

function updateProgress() {
  const count = exploredLessons.size;
  progressCount.textContent = `${count} of ${lessons.length} lessons explored`;
  progressFill.style.width = `${lessons.length ? (count / lessons.length) * 100 : 0}%`;
}

function renderLessonList() {
  lessonList.innerHTML = '';
  lessons.forEach((lesson, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `lesson-choice${Number(lesson.id) === Number(currentLessonId) ? ' active' : ''}`;
    button.setAttribute('aria-current', Number(lesson.id) === Number(currentLessonId) ? 'page' : 'false');
    button.innerHTML = `
      <span class="lesson-number">${String(lesson.id).padStart(2, '0')}</span>
      <span class="lesson-meta"><strong>${escapeHtml(lesson.title)}</strong><small>${exploredLessons.has(Number(lesson.id)) ? 'Explored' : `Lesson ${String(index + 1).padStart(2, '0')}`}</small></span>`;
    button.addEventListener('click', () => selectLesson(Number(lesson.id)));
    lessonList.appendChild(button);
  });
}

function selectLesson(id) {
  stopPlayback(false);
  currentLessonId = Number(id);
  exploredLessons.add(currentLessonId);
  renderLessonList();
  updateProgress();
  renderLesson();
  if (window.matchMedia('(max-width: 760px)').matches) {
    document.getElementById('lesson-details').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function renderVocabulary(words) {
  if (!words.length) {
    return '<p class="no-content">No new headwords are introduced in this lesson. Review the dialogue and practise the sentence pattern below.</p>';
  }
  return `<div class="vocab-grid">${words.map((word, index) => `
    <article class="vocab-card">
      <div class="vocab-top">
        <div><div class="arabic-word" lang="ar" dir="rtl">${escapeHtml(word.ar)}</div><div class="vocab-translit">${escapeHtml(word.trans || '')}</div></div>
        ${word.audio ? `<button class="audio-mini" type="button" data-vocab-audio="${escapeHtml(word.audio)}" aria-label="Play vocabulary audio">▶</button>` : ''}
      </div>
      <div class="vocab-meaning">${escapeHtml(word.meaning)}</div>
      <div class="vocab-detail">${escapeHtml(word.detail || '')}</div>
      ${word.exampleAr ? `<div class="vocab-example"><div class="arabic-small" lang="ar" dir="rtl">${escapeHtml(word.exampleAr)}</div><p>${escapeHtml(word.exampleTrans || '')}${word.exampleEn ? ` · ${escapeHtml(word.exampleEn)}` : ''}</p></div>` : ''}
      <span class="new-word-label">New vocabulary ${String(index + 1).padStart(2, '0')}</span>
    </article>`).join('')}</div>`;
}

function renderStructure(structure) {
  if (!structure) return '<p class="no-content">Sentence structure notes will be added here.</p>';
  return `<div class="grammar-card">
    <div class="pattern-label">Sentence pattern</div>
    <div class="pattern-line"><span class="pattern-piece">${escapeHtml(structure.pattern || 'Sentence pattern')}</span></div>
    <div class="grammar-explanation"><p>${escapeHtml(structure.explanation || '')}</p></div>
    ${structure.exampleAr ? `<div class="grammar-example"><div class="arabic-sentence" lang="ar" dir="rtl">${escapeHtml(structure.exampleAr)}</div><div class="roman-sentence">${escapeHtml(structure.exampleTrans || '')}</div><div class="english-sentence">${escapeHtml(structure.exampleEn || '')}</div></div>` : ''}
  </div>`;
}

function renderNotes(notes) {
  if (!Array.isArray(notes) || !notes.length) return '<p class="no-content">Usage notes will appear here.</p>';
  return `<div class="usage-list">${notes.map(note => `<article class="usage-note"><span class="note-mark">i</span><div><p><strong>${escapeHtml(note.title || '')}</strong> — ${escapeHtml(note.text || '')}</p><p>${escapeHtml(note.detail || '')}</p></div></article>`).join('')}</div>`;
}

function renderDialogue(lines) {
  if (!Array.isArray(lines) || !lines.length) return '<p class="no-content">No dialogue lines were found for this lesson.</p>';
  return `<div class="dialogue-list">${lines.map((line, index) => `
    <article class="dialogue-card">
      <span class="speaker-badge">${escapeHtml((line.speaker || `S${index + 1}`).replace(/speaker\s*/i, 'S'))}</span>
      <div class="dialogue-main"><div class="dialogue-speaker">${escapeHtml(line.speaker || `Speaker ${index + 1}`)}</div><div class="dialogue-arabic" lang="ar" dir="rtl">${escapeHtml(line.ar || '')}</div><div class="dialogue-translation">${escapeHtml(line.trans || '')}</div></div>
      ${line.audio ? `<button class="line-audio" type="button" data-line-audio="${escapeHtml(line.audio)}" aria-label="Play line ${index + 1}">▶</button>` : ''}
    </article>`).join('')}</div>`;
}

function renderExercises(exercises, lessonId) {
  if (!Array.isArray(exercises) || !exercises.length) return '<p class="no-content">Practice questions will appear here.</p>';
  return exercises.map((exercise, index) => `
    <article class="exercise-card" data-exercise="${lessonId}-${index}">
      <div class="exercise-count">Quick check · ${index + 1} of ${exercises.length}</div>
      <div class="exercise-question">${escapeHtml(exercise.question)}</div>
      <div class="exercise-options">${(exercise.options || []).map((option, optionIndex) => `
        <button class="exercise-option" type="button" data-exercise-id="${lessonId}-${index}" data-option-index="${optionIndex}"><span class="option-letter">${String.fromCharCode(65 + optionIndex)}</span><span>${escapeHtml(option)}</span></button>`).join('')}</div>
      <p class="exercise-feedback" aria-live="polite"></p>
    </article>`).join('');
}

function renderLesson() {
  const lesson = lessons.find(item => Number(item.id) === Number(currentLessonId));
  if (!lesson) {
    lessonDetails.innerHTML = '<p class="no-content">That lesson could not be found in lessons.json.</p>';
    return;
  }
  const content = getLearningLesson(lesson.id) || {};
  const newWords = getNewVocabulary(lesson.id);
  const dialogueLines = Array.isArray(lesson.lines) ? lesson.lines : [];
  lessonDetails.innerHTML = `
    <header class="lesson-hero">
      <div class="lesson-kicker"><span class="kicker-dot"></span> LESSON ${String(lesson.id).padStart(2, '0')} <span>·</span> ${dialogueLines.length} dialogue lines</div>
      <h2 class="lesson-title">${escapeHtml(lesson.title || content.title || `Lesson ${lesson.id}`)}</h2>
      <p class="lesson-subtitle">${escapeHtml(content.objective || 'Listen to the conversation, learn the useful language, and practise using it.')}</p>
    </header>

    <section class="lesson-section" id="vocabulary-section">
      <div class="section-heading"><span class="section-icon">文</span><div><h3>New vocabulary</h3><p>Only words and expressions not introduced in earlier lessons.</p></div><span class="section-count">${newWords.length} new</span></div>
      ${renderVocabulary(newWords)}
    </section>

    <section class="lesson-section">
      <div class="section-heading"><span class="section-icon">↗</span><div><h3>Sentence structure</h3><p>Understand how the words work together to make a natural sentence.</p></div></div>
      ${renderStructure(content.structure)}
    </section>

    <section class="lesson-section">
      <div class="section-heading"><span class="section-icon">✦</span><div><h3>Usage and speaking tips</h3><p>Learn when a phrase sounds natural and how to use it in real conversation.</p></div></div>
      ${renderNotes(content.notes)}
    </section>

    <section class="lesson-section">
      <div class="section-heading"><span class="section-icon">♫</span><div><h3>Dialogue practice</h3><p>Listen to the original conversation. Audio paths are read from your existing lessons.json.</p></div></div>
      <div class="dialogue-toolbar"><button class="primary-button" type="button" id="play-full-lesson">▶ Play full dialogue</button><button class="secondary-button" type="button" id="pause-audio">Ⅱ Pause</button><button class="secondary-button" type="button" id="resume-audio">▶ Resume</button><button class="stop-button" type="button" id="stop-audio">■ Stop</button></div>
      ${renderDialogue(dialogueLines)}
    </section>

    <section class="lesson-section">
      <div class="section-heading"><span class="section-icon">✓</span><div><h3>Check your understanding</h3><p>Choose an answer. You’ll get immediate feedback.</p></div></div>
      ${renderExercises(content.exercises, lesson.id)}
    </section>`;

  document.getElementById('play-full-lesson')?.addEventListener('click', () => playFullLesson(lesson));
  document.getElementById('pause-audio')?.addEventListener('click', pausePlayback);
  document.getElementById('resume-audio')?.addEventListener('click', resumePlayback);
  document.getElementById('stop-audio')?.addEventListener('click', () => stopPlayback(true));

  lessonDetails.querySelectorAll('[data-line-audio]').forEach(button => {
    button.addEventListener('click', () => playSingleLine(button.dataset.lineAudio));
  });
  lessonDetails.querySelectorAll('[data-vocab-audio]').forEach(button => {
    button.addEventListener('click', () => playSingleLine(button.dataset.vocabAudio));
  });
  lessonDetails.querySelectorAll('[data-exercise-id]').forEach(button => {
    button.addEventListener('click', () => answerExercise(button));
  });
}

function playSingleLine(path) {
  if (!path) return;
  playbackToken++;
  const token = playbackToken;
  audio.pause();
  audio = new Audio(path);
  isPaused = false;
  audio.addEventListener('error', () => {
    if (token === playbackToken) showStatus(`Could not play audio: ${path}`);
  }, { once: true });
  audio.play().then(() => {}).catch(() => {
    if (token === playbackToken) showStatus('Audio could not start. Check the audio file path and browser permissions.');
  });
}

async function playFullLesson(lesson) {
  const lines = (lesson.lines || []).filter(line => line.audio);
  if (!lines.length) {
    showStatus('No audio paths were found for this lesson.');
    return;
  }
  playbackToken++;
  const token = playbackToken;
  audio.pause();
  isPaused = false;
  for (const line of lines) {
    if (token !== playbackToken) return;
    audio = new Audio(line.audio);
    const ended = new Promise(resolve => {
      audio.addEventListener('ended', resolve, { once: true });
      audio.addEventListener('error', () => {
        showStatus(`Could not play audio: ${line.audio}`);
        resolve();
      }, { once: true });
    });
    try {
      await audio.play();
      await ended;
    } catch (error) {
      if (token === playbackToken) showStatus('Audio playback was blocked or a file could not be loaded.');
      return;
    }
  }
  if (token === playbackToken) showStatus('Dialogue finished. Great practice!');
}

function pausePlayback() {
  if (!audio.paused) {
    audio.pause();
    isPaused = true;
    showStatus('Audio paused.');
  }
}

function resumePlayback() {
  if (isPaused) {
    audio.play().then(() => {
      isPaused = false;
    }).catch(() => showStatus('Could not resume audio.'));
  }
}

function stopPlayback(showMessage = true) {
  playbackToken++;
  if (audio) {
    audio.pause();
    audio.currentTime = 0;
  }
  isPaused = false;
  if (showMessage) showStatus('Audio stopped.');
}

function answerExercise(button) {
  const [lessonIdText, indexText] = button.dataset.exerciseId.split('-');
  const content = getLearningLesson(Number(lessonIdText));
  const exercise = content?.exercises?.[Number(indexText)];
  if (!exercise) return;
  const card = button.closest('.exercise-card');
  const feedback = card.querySelector('.exercise-feedback');
  const selected = Number(button.dataset.optionIndex);
  card.querySelectorAll('.exercise-option').forEach(option => {
    option.disabled = true;
    if (Number(option.dataset.optionIndex) === Number(exercise.answer)) option.classList.add('correct');
  });
  if (selected === Number(exercise.answer)) {
    feedback.textContent = `Correct! ${exercise.feedback || ''}`;
    feedback.classList.remove('wrong');
  } else {
    button.classList.add('wrong');
    feedback.textContent = `Not quite. ${exercise.feedback || 'Review the explanation and try again in a later review.'}`;
    feedback.classList.add('wrong');
  }
}

async function loadApp() {
  try {
    const [lessonResponse, contentResponse] = await Promise.all([
      fetch('lessons.json', { cache: 'no-store' }),
      fetch('learning-content.json', { cache: 'no-store' })
    ]);
    if (!lessonResponse.ok) throw new Error(`lessons.json returned ${lessonResponse.status}`);
    if (!contentResponse.ok) throw new Error(`learning-content.json returned ${contentResponse.status}`);
    const lessonData = await lessonResponse.json();
    learningContent = await contentResponse.json();
    if (!Array.isArray(lessonData.lessons) || !lessonData.lessons.length) throw new Error('lessons.json must contain a non-empty lessons array.');
    if (!Array.isArray(learningContent.lessons)) throw new Error('learning-content.json must contain a lessons array.');
    lessons = lessonData.lessons.slice().sort((a, b) => Number(a.id) - Number(b.id));
    currentLessonId = Number(lessons[0].id);
    renderLessonList();
    updateProgress();
    renderLesson();
  } catch (error) {
    console.error(error);
    lessonList.innerHTML = '<p class="muted">Could not load lessons.</p>';
    lessonDetails.innerHTML = `<div class="lesson-section"><h2>We couldn't load the course</h2><p class="grammar-explanation">${escapeHtml(error.message)} Check that index.html, app.js, style.css, lessons.json, and learning-content.json are in the same folder. If you opened the HTML file directly, use a local web server or GitHub Pages instead.</p></div>`;
  }
}

loadApp();
