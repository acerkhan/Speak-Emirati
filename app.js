const lessonList = document.getElementById("lesson-list");
const lessonDetails = document.getElementById("lesson-details");
const statusMessage = document.getElementById("status-message");
const levelTabs = document.querySelectorAll(".level-tab");

let lessons = [];
let currentLesson = null;
let currentLevel = "beginner";
let currentLineIndex = -1;

let audio = new Audio();
let isPlayingLesson = false;
let isPaused = false;
let playbackToken = 0;
let statusTimer = null;

function showStatus(message) {
    statusMessage.textContent = message;
    statusMessage.classList.add("visible");

    clearTimeout(statusTimer);

    statusTimer = setTimeout(() => {
        statusMessage.classList.remove("visible");
    }, 3500);
}

function levelForLesson(id) {
    if (id >= 1 && id <= 5) return "beginner";
    if (id >= 6 && id <= 12) return "everyday";
    return "advanced";
}

async function loadLessons() {
    try {
        const response = await fetch("lessons.json", {
            cache: "no-store"
        });

        if (!response.ok) {
            throw new Error("Could not load lessons.json");
        }

        const data = await response.json();

        if (!Array.isArray(data.lessons)) {
            throw new Error("Invalid lesson data");
        }

        lessons = data.lessons.map(lesson => ({
            ...lesson,
            level: lesson.level || levelForLesson(lesson.id)
        }));

        renderLessonList();

        const firstLesson = lessons.find(
            lesson => lesson.level === currentLevel
        );

        if (firstLesson) {
            selectLesson(firstLesson.id);
        } else {
            lessonDetails.innerHTML =
                '<p class="muted">No lessons in this group yet.</p>';
        }

    } catch (error) {
        console.error(error);

        lessonList.innerHTML =
            '<p class="muted">Could not load lessons.</p>';

        lessonDetails.innerHTML =
            '<p class="muted">Check that lessons.json exists and is valid.</p>';
    }
}

function renderLessonList() {
    lessonList.innerHTML = "";

    const filtered = lessons.filter(
        lesson => lesson.level === currentLevel
    );

    if (filtered.length === 0) {
        lessonList.innerHTML =
            '<p class="muted">Lessons will appear here.</p>';
        return;
    }

    filtered.forEach(lesson => {
        const button = document.createElement("button");

        button.className = "lesson-choice";
        button.dataset.lessonId = lesson.id;

        const number = document.createElement("span");
        number.className = "lesson-number";
        number.textContent =
            `LESSON ${String(lesson.id).padStart(2, "0")}`;

        const title = document.createElement("span");
        title.className = "lesson-title";
        title.textContent = lesson.title;

        button.append(number, title);

        button.addEventListener("click", () => {
            selectLesson(lesson.id);
        });

        lessonList.appendChild(button);
    });

    updateSelectedLesson();
}

function updateSelectedLesson() {
    document.querySelectorAll(".lesson-choice").forEach(button => {
        button.classList.toggle(
            "active",
            Number(button.dataset.lessonId) === currentLesson?.id
        );
    });
}

function selectLesson(id) {
    stopPlayback(false);

    currentLesson = lessons.find(lesson => lesson.id === id);

    if (!currentLesson) return;

    currentLineIndex = -1;

    updateSelectedLesson();
    renderLesson();
}

function createButton(text, className, onClick) {
    const button = document.createElement("button");

    button.textContent = text;
    button.className = className;
    button.addEventListener("click", onClick);

    return button;
}

function renderLesson() {
    lessonDetails.innerHTML = "";

    if (!currentLesson) return;

    const heading = document.createElement("div");
    heading.className = "lesson-heading";

    const headingText = document.createElement("div");

    const title = document.createElement("h2");
    title.textContent = currentLesson.title;

    const subtitle = document.createElement("p");
    subtitle.textContent =
        `Lesson ${currentLesson.id} · ${currentLesson.lines.length} dialogue lines`;

    headingText.append(title, subtitle);

    const playFullButton = createButton(
        "▶ Play Full Lesson",
        "primary-button",
        playFullLesson
    );

    heading.append(headingText, playFullButton);

    const controls = document.createElement("div");
    controls.className = "playback-controls";

    const pauseButton = createButton(
        "⏸ Pause",
        "control-button",
        pausePlayback
    );

    const resumeButton = createButton(
        "▶ Resume",
        "control-button",
        resumePlayback
    );

    const stopButton = createButton(
        "■ Stop",
        "control-button",
        () => stopPlayback(true)
    );

    controls.append(pauseButton, resumeButton, stopButton);

    const dialogueList = document.createElement("div");
    dialogueList.className = "dialogue-list";

    currentLesson.lines.forEach((line, index) => {
        const card = document.createElement("article");

        card.className = "dialogue-line";
        card.dataset.lineIndex = index;

        const top = document.createElement("div");
        top.className = "line-top";

        const speaker = document.createElement("span");
        speaker.className = "speaker";
        speaker.textContent = line.speaker || "Speaker";

        const playButton = createButton(
            "▶ Play",
            "line-play",
            () => playSingleLine(index)
        );

        top.append(speaker, playButton);

        const arabic = document.createElement("p");
        arabic.className = "arabic";
        arabic.lang = "ar";
        arabic.dir = "rtl";
        arabic.textContent = line.ar;

        const translation = document.createElement("p");
        translation.className = "translation";
        translation.textContent = line.trans;

        card.append(top, arabic, translation);
        dialogueList.appendChild(card);
    });

    lessonDetails.append(heading, controls, dialogueList);

    updateHighlightedLine();
}

function updateHighlightedLine() {
    document.querySelectorAll(".dialogue-line").forEach(card => {
        card.classList.toggle(
            "playing",
            Number(card.dataset.lineIndex) === currentLineIndex &&
            (isPlayingLesson || !audio.paused)
        );
    });
}

function playSingleLine(index) {
    if (!currentLesson) return;

    isPlayingLesson = false;
    playLine(index, false);
}

function playFullLesson() {
    if (!currentLesson || currentLesson.lines.length === 0) return;

    isPlayingLesson = true;
    playbackToken++;

    playLine(0, true);
}

function playLine(index, continueLesson) {
    if (!currentLesson) return;

    const line = currentLesson.lines[index];

    if (!line) {
        stopPlayback(false);
        return;
    }

    playbackToken++;
    const token = playbackToken;

    currentLineIndex = index;
    isPlayingLesson = continueLesson;
    isPaused = false;

    audio.pause();
    audio.currentTime = 0;
    audio.onended = null;
    audio.onerror = null;

    updateHighlightedLine();

    audio.src = line.audio;

    audio.onended = () => {
        if (token !== playbackToken) return;

        if (continueLesson && index + 1 < currentLesson.lines.length) {
            setTimeout(() => {
                if (token === playbackToken && isPlayingLesson) {
                    playLine(index + 1, true);
                }
            }, 450);
        } else {
            stopPlayback(false);
        }
    };

    audio.onerror = () => {
        if (token !== playbackToken) return;

        showStatus(
            `Audio not found for line ${index + 1}. Check its MP3 file and path.`
        );

        stopPlayback(false);
    };

    audio.play().then(() => {
        updateHighlightedLine();
    }).catch(error => {
        console.error(error);

        if (token === playbackToken) {
            showStatus(
                "Audio could not play. Check the MP3 file and try again."
            );

            stopPlayback(false);
        }
    });
}

function pausePlayback() {
    if (!audio.src || audio.paused) return;

    audio.pause();
    isPaused = true;
    updateHighlightedLine();
}

function resumePlayback() {
    if (!audio.src || !isPaused) return;

    audio.play().then(() => {
        isPaused = false;
        updateHighlightedLine();
    }).catch(error => {
        console.error(error);
        showStatus("Could not resume audio. Try pressing Play.");
    });
}

function stopPlayback(showMessage = true) {
    playbackToken++;

    audio.pause();

    try {
        audio.currentTime = 0;
    } catch (_) {
        // The audio may not have loaded yet.
    }

    audio.onended = null;
    audio.onerror = null;
    audio.removeAttribute("src");
    audio.load();

    isPlayingLesson = false;
    isPaused = false;
    currentLineIndex = -1;

    updateHighlightedLine();

    if (showMessage) {
        showStatus("Playback stopped.");
    }
}

levelTabs.forEach(tab => {
    tab.addEventListener("click", () => {
        currentLevel = tab.dataset.level;

        levelTabs.forEach(item => {
            item.classList.toggle("active", item === tab);
        });

        stopPlayback(false);
        renderLessonList();

        const firstLesson = lessons.find(
            lesson => lesson.level === currentLevel
        );

        if (firstLesson) {
            selectLesson(firstLesson.id);
        } else {
            currentLesson = null;

            lessonDetails.innerHTML =
                '<p class="muted">Lessons will appear here.</p>';
        }
    });
});

loadLessons();
