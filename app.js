const lessonList = document.getElementById('lesson-list');
const lessonDetails = document.getElementById('lesson-details');
const statusMessage = document.getElementById('status-message');

let lessons = [];
let learningContent = {};
let currentLesson = null;
let audio = new Audio();
let playbackToken = 0;
let currentLineIndex = -1;
let isPaused = false;
let statusTimer = null;

const pad = (n) => String(n).padStart(2, '0');
const escapeHTML = (value = '') => String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

function showStatus(message, isError = false) {
  statusMessage.textContent = message;
  statusMessage.classList.toggle('error', isError);
  statusMessage.classList.add('visible');
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => statusMessage.classList.remove('visible'), 3500);
}

async function loadLessons() {
  lessonList.innerHTML = '<p class="muted">Loading lessons…</p>';
  try {
    const [lessonResponse, contentResponse] = await Promise.all([
      fetch(`lessons.json?v=${Date.now()}`, { cache: 'no-store' }),
      fetch(`learning-content.json?v=${Date.now()}`, { cache: 'no-store' })
    ]);
    if (!lessonResponse.ok) throw new Error(`lessons.json returned ${lessonResponse.status}`);
    const data = await lessonResponse.json();
    if (!Array.isArray(data.lessons) || !data.lessons.length) throw new Error('No lessons were found in lessons.json.');
    lessons = data.lessons.slice().sort((a, b) => Number(a.id) - Number(b.id));
    if (contentResponse.ok) {
      const contentData = await contentResponse.json();
      learningContent = contentData.lessons || {};
    } else {
      learningContent = {};
      showStatus('Dialogue lessons loaded, but learning-content.json could not be loaded.', true);
    }
    renderLessonList();
    selectLesson(lessons[0].id);
  } catch (error) {
    lessonList.innerHTML = '<p class="muted">Could not load lessons.</p>';
    lessonDetails.innerHTML = `<div class="empty-state"><h2>Unable to load lessons</h2><p>${escapeHTML(error.message)}</p><p>Check that lessons.json, learning-content.json, app.js and style.css are in the same folder.</p></div>`;
    console.error(error);
  }
}

function renderLessonList() {
  lessonList.innerHTML = '';
  lessons.forEach((lesson, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'lesson-choice';
    button.dataset.lessonId = lesson.id;
    button.innerHTML = `<span class="lesson-number">${pad(index + 1)}</span><span class="lesson-choice-copy"><span class="lesson-choice-title">${escapeHTML(lesson.title || `Lesson ${index + 1}`)}</span><span class="lesson-choice-meta">${(lesson.lines || []).length} dialogue lines</span></span><span class="lesson-check" aria-hidden="true">✓</span>`;
    button.addEventListener('click', () => selectLesson(lesson.id));
    lessonList.appendChild(button);
  });
}

function selectLesson(id) {
  stopPlayback(false);
  currentLesson = lessons.find(lesson => Number(lesson.id) === Number(id));
  if (!currentLesson) return;
  currentLineIndex = -1;
  document.querySelectorAll('.lesson-choice').forEach(button => button.classList.toggle('active', Number(button.dataset.lessonId) === Number(id)));
  renderLesson();
  if (window.innerWidth < 760) lessonDetails.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function getContent() {
  return learningContent[String(currentLesson.id)] || learningContent[currentLesson.id] || {};
}

function renderLesson() {
  const content = getContent();
  const lines = currentLesson.lines || [];
  const level = currentLesson.level || 'Emirati Arabic';
  const vocab = content.vocabulary || [];
  const structure = content.structure || {};
  const notes = content.notes || [];
  const exercises = content.exercises || [];
  lessonDetails.innerHTML = `
    <section class="lesson-hero">
      <div class="lesson-kicker"><span class="kicker-dot"></span> LESSON ${pad(currentLesson.id)} <span class="kicker-separator">/</span> ${escapeHTML(level)}</div>
      <h2>${escapeHTML(currentLesson.title)}</h2>
      <p class="lesson-intro">Build practical Emirati Arabic through vocabulary, sentence patterns, real usage, and conversation practice.</p>
      <div class="lesson-progress-row"><span>${lines.length} dialogue lines</span><span>${vocab.length} vocabulary items</span><span>${exercises.length} practice questions</span></div>
      <div class="lesson-actions"><button class="button button-primary" id="play-full-lesson"><span aria-hidden="true">▶</span> Play dialogue</button><button class="button button-secondary" id="stop-audio">Stop audio</button></div>
      <div class="playback-status" id="playback-status" aria-live="polite">Ready when you are.</div>
    </section>

    <section class="learning-section" id="vocabulary-section">
      <div class="section-heading"><div><p class="section-eyebrow">01 · WORDS THAT MATTER</p><h3>Vocabulary</h3></div><span class="section-count">${vocab.length} items</span></div>
      ${vocab.length ? `<div class="vocab-grid">${vocab.map((item, index) => `<article class="vocab-card"><div class="vocab-card-top"><span class="vocab-index">${pad(index + 1)}</span>${item.audio ? `<button class="icon-button vocab-audio" data-audio="${escapeHTML(item.audio)}" aria-label="Play ${escapeHTML(item.ar)}" title="Play pronunciation">▶</button>` : ''}</div><div class="arabic-word" lang="ar" dir="rtl">${escapeHTML(item.ar)}</div><div class="transliteration">${escapeHTML(item.transliteration || item.trans || '')}</div><p class="vocab-meaning">${escapeHTML(item.meaning || '')}</p>${item.example ? `<div class="vocab-example"><span lang="ar" dir="rtl">${escapeHTML(item.example.ar || '')}</span><small>${escapeHTML(item.example.en || '')}</small></div>` : ''}</article>`).join('')}</div>` : '<p class="empty-note">Vocabulary content for this lesson has not been added yet.</p>'}
      <p class="micro-note">Pronunciation buttons appear only when a vocabulary audio path is available.</p>
    </section>

    <section class="learning-section">
      <div class="section-heading"><div><p class="section-eyebrow">02 · BUILD YOUR SENTENCES</p><h3>${escapeHTML(structure.title || 'Sentence structure')}</h3></div></div>
      ${structure.explanation ? `<p class="section-lead">${escapeHTML(structure.explanation)}</p>` : ''}
      ${structure.pattern ? `<div class="pattern-box"><span class="pattern-label">PATTERN</span><strong>${escapeHTML(structure.pattern)}</strong></div>` : ''}
      ${(structure.examples || []).map(example => `<div class="grammar-example"><p class="grammar-arabic" lang="ar" dir="rtl">${escapeHTML(example.ar || '')}</p><p class="grammar-translit">${escapeHTML(example.transliteration || '')}</p><p class="grammar-translation">${escapeHTML(example.en || '')}</p>${example.breakdown ? `<p class="grammar-breakdown">${escapeHTML(example.breakdown)}</p>` : ''}</div>`).join('')}
    </section>

    <section class="learning-section">
      <div class="section-heading"><div><p class="section-eyebrow">03 · SOUND NATURAL</p><h3>Usage notes</h3></div></div>
      ${notes.length ? `<div class="notes-list">${notes.map((note, i) => `<article class="usage-note"><span class="note-marker">${i + 1}</span><p>${escapeHTML(note)}</p></article>`).join('')}</div>` : '<p class="empty-note">Usage notes for this lesson have not been added yet.</p>'}
    </section>

    <section class="learning-section practice-section">
      <div class="section-heading"><div><p class="section-eyebrow">04 · CHECK YOURSELF</p><h3>Practice</h3></div><span class="section-count">${exercises.length} questions</span></div>
      <p class="section-lead">Choose the best answer. You will get feedback immediately.</p>
      ${exercises.length ? `<div class="exercise-list">${exercises.map((exercise, index) => renderExercise(exercise, index)).join('')}</div><div class="quiz-summary" id="quiz-summary">Answer the questions to check your understanding.</div><button class="button button-secondary" id="reset-quiz">Reset practice</button>` : '<p class="empty-note">Exercises for this lesson have not been added yet.</p>'}
    </section>

    <section class="learning-section dialogue-section">
      <div class="section-heading"><div><p class="section-eyebrow">05 · HEAR IT IN CONTEXT</p><h3>Dialogue practice</h3></div><span class="section-count">${lines.length} lines</span></div>
      <p class="section-lead">Listen to each line, read the meaning, then replay the full dialogue.</p>
      <div class="dialogue-list">${lines.map((line, index) => `<article class="dialogue-card" data-line-index="${index}"><div class="dialogue-topline"><span class="speaker-label">${escapeHTML(line.speaker || line.speakerId || 'Speaker')}</span><span class="line-number">LINE ${pad(index + 1)}</span></div><p class="dialogue-arabic" lang="ar" dir="rtl">${escapeHTML(line.ar || '')}</p><p class="dialogue-translation">${escapeHTML(line.trans || '')}</p><div class="dialogue-footer"><span class="line-status">${line.audio ? 'Audio available' : 'No audio file set'}</span><button class="button button-small button-secondary play-line" data-line-index="${index}" ${line.audio ? '' : 'disabled'}>▶ Play line</button></div></article>`).join('')}</div>
      <div class="lesson-bottom-nav"><button class="button button-secondary" id="previous-lesson" ${lessons.findIndex(l => Number(l.id) === Number(currentLesson.id)) === 0 ? 'disabled' : ''}>← Previous lesson</button><button class="button button-primary" id="next-lesson" ${lessons.findIndex(l => Number(l.id) === Number(currentLesson.id)) === lessons.length - 1 ? 'disabled' : ''}>Next lesson →</button></div>
    </section>`;

  document.getElementById('play-full-lesson')?.addEventListener('click', playFullLesson);
  document.getElementById('stop-audio')?.addEventListener('click', () => stopPlayback(true));
  document.getElementById('previous-lesson')?.addEventListener('click', () => moveLesson(-1));
  document.getElementById('next-lesson')?.addEventListener('click', () => moveLesson(1));
  document.querySelectorAll('.play-line').forEach(button => button.addEventListener('click', () => playSingleLine(Number(button.dataset.lineIndex))));
  document.querySelectorAll('.vocab-audio').forEach(button => button.addEventListener('click', () => playPath(button.dataset.audio, `Playing vocabulary: ${button.getAttribute('aria-label').replace('Play ', '')}`)));
  document.querySelectorAll('.exercise-option').forEach(button => button.addEventListener('click', () => answerExercise(button)));
  document.getElementById('reset-quiz')?.addEventListener('click', resetQuiz);
}

function renderExercise(exercise, index) {
  return `<article class="exercise-card" data-exercise="${index}" data-answer="${Number(exercise.answer)}"><div class="exercise-top"><span class="exercise-number">Q${pad(index + 1)}</span><span class="exercise-type">${escapeHTML(exercise.type || 'Choose an answer')}</span></div><h4>${escapeHTML(exercise.question)}</h4>${exercise.promptAr ? `<p class="exercise-arabic" lang="ar" dir="rtl">${escapeHTML(exercise.promptAr)}</p>` : ''}<div class="exercise-options">${(exercise.options || []).map((option, optionIndex) => `<button type="button" class="exercise-option" data-option="${optionIndex}"><span class="option-letter">${String.fromCharCode(65 + optionIndex)}</span><span>${escapeHTML(option)}</span></button>`).join('')}</div><p class="exercise-feedback" aria-live="polite"></p></article>`;
}

function answerExercise(button) {
  const card = button.closest('.exercise-card');
  if (!card || card.dataset.answered === 'true') return;
  const selected = Number(button.dataset.option);
  const correct = Number(card.dataset.answer);
  const feedback = card.querySelector('.exercise-feedback');
  card.dataset.answered = 'true';
  card.querySelectorAll('.exercise-option').forEach(option => {
    option.disabled = true;
    if (Number(option.dataset.option) === correct) option.classList.add('correct');
  });
  if (selected === correct) {
    button.classList.add('correct');
    feedback.textContent = `Correct! ${card.dataset.explanation || ''}`.trim();
    feedback.classList.add('feedback-correct');
  } else {
    button.classList.add('incorrect');
    feedback.textContent = `Not quite. The correct answer is ${String.fromCharCode(65 + correct)}. ${getExerciseExplanation(card)}`.trim();
    feedback.classList.add('feedback-incorrect');
  }
  updateQuizSummary();
}

function getExerciseExplanation(card) {
  const index = Number(card.dataset.exercise);
  const exercise = (getContent().exercises || [])[index];
  return exercise?.explanation || '';
}
function updateQuizSummary() {
  const cards = [...document.querySelectorAll('.exercise-card')];
  const answered = cards.filter(card => card.dataset.answered === 'true');
  const score = answered.filter(card => card.querySelector('.exercise-option.correct')?.classList.contains('selected-by-user')).length;
  // Count the user's selected answer by the feedback state instead of relying on visual order.
  const correctCount = answered.filter(card => card.querySelector('.exercise-feedback')?.classList.contains('feedback-correct')).length;
  const summary = document.getElementById('quiz-summary');
  if (summary) summary.textContent = answered.length === cards.length ? `Practice complete: ${correctCount} out of ${cards.length} correct.` : `${answered.length} of ${cards.length} answered · ${correctCount} correct so far.`;
}
function resetQuiz() {
  document.querySelectorAll('.exercise-card').forEach(card => {
    delete card.dataset.answered;
    card.querySelectorAll('.exercise-option').forEach(option => {
      option.disabled = false;
      option.classList.remove('correct', 'incorrect', 'selected-by-user');
    });
    const feedback = card.querySelector('.exercise-feedback');
    feedback.textContent = '';
    feedback.classList.remove('feedback-correct', 'feedback-incorrect');
  });
  const summary = document.getElementById('quiz-summary');
  if (summary) summary.textContent = 'Answer the questions to check your understanding.';
}

function moveLesson(direction) {
  const index = lessons.findIndex(lesson => Number(lesson.id) === Number(currentLesson.id));
  const next = lessons[index + direction];
  if (next) selectLesson(next.id);
}
function setPlaybackStatus(message) {
  const status = document.getElementById('playback-status');
  if (status) status.textContent = message;
}
function playPath(path, label = 'Playing audio') {
  if (!path) return;
  stopPlayback(false);
  const token = ++playbackToken;
  audio = new Audio(path);
  audio.addEventListener('ended', () => { if (token === playbackToken) { setPlaybackStatus('Playback finished.'); currentLineIndex = -1; } }, { once: true });
  audio.addEventListener('error', () => { if (token === playbackToken) { showStatus(`Could not play ${path}. Check the file path.`, true); setPlaybackStatus('Audio could not be loaded.'); } }, { once: true });
  setPlaybackStatus(label);
  audio.play().catch(error => { if (token === playbackToken) { console.error(error); showStatus('Audio could not start. Try pressing play again.', true); } });
}
function playSingleLine(index) {
  const line = (currentLesson.lines || [])[index];
  if (!line?.audio) { showStatus('No audio file is set for this line.', true); return; }
  currentLineIndex = index;
  playPath(line.audio, `Playing line ${index + 1} of ${(currentLesson.lines || []).length}`);
  document.querySelectorAll('.dialogue-card').forEach(card => card.classList.toggle('currently-playing', Number(card.dataset.lineIndex) === index));
}
async function playFullLesson() {
  const lines = currentLesson.lines || [];
  const firstPlayable = lines.findIndex(line => line.audio);
  if (firstPlayable < 0) { showStatus('No dialogue audio paths are set for this lesson.', true); return; }
  stopPlayback(false);
  const token = ++playbackToken;
  currentLineIndex = firstPlayable;
  for (let i = firstPlayable; i < lines.length; i++) {
    if (token !== playbackToken) return;
    if (!lines[i].audio) continue;
    currentLineIndex = i;
    document.querySelectorAll('.dialogue-card').forEach(card => card.classList.toggle('currently-playing', Number(card.dataset.lineIndex) === i));
    setPlaybackStatus(`Playing line ${i + 1} of ${lines.length}`);
    const finished = await playAndWait(lines[i].audio, token);
    if (!finished || token !== playbackToken) return;
  }
  currentLineIndex = -1;
  document.querySelectorAll('.dialogue-card').forEach(card => card.classList.remove('currently-playing'));
  setPlaybackStatus('Full dialogue finished. Replay it whenever you like.');
}
function playAndWait(path, token) {
  return new Promise(resolve => {
    audio = new Audio(path);
    let settled = false;
    const done = result => { if (settled) return; settled = true; resolve(result); };
    audio.addEventListener('ended', () => done(true), { once: true });
    audio.addEventListener('error', () => { showStatus(`Could not play ${path}.`, true); done(false); }, { once: true });
    audio.play().catch(() => { showStatus('Audio could not start. Check the audio path.', true); done(false); });
    if (token !== playbackToken) done(false);
  });
}
function stopPlayback(showMessage = true) {
  playbackToken++;
  try { audio.pause(); audio.currentTime = 0; } catch (_) {}
  currentLineIndex = -1;
  isPaused = false;
  document.querySelectorAll('.dialogue-card').forEach(card => card.classList.remove('currently-playing'));
  if (showMessage) setPlaybackStatus('Playback stopped.');
}

loadLessons();
