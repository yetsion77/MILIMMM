const GAME_DURATION = 90;
const SKIP_PENALTY = 5;

let gameState = {
    score: 0,
    correctCount: 0,
    timeLeft: GAME_DURATION,
    currentWordIndex: -1,
    availableIndices: [],
    timerInterval: null,
    isPlaying: false
};

// DOM Elements
const foreignWordEl = document.getElementById('foreign-word');
const inputContainer = document.getElementById('input-container');
const scoreDisplay = document.getElementById('score-display');
const timerDisplay = document.getElementById('timer-display');
const skipBtn = document.getElementById('skip-btn');
const resultsModal = document.getElementById('results-modal');
const finalScoreDisplay = document.getElementById('final-score-display');
const finalCorrectDisplay = document.getElementById('final-correct');
const restartBtn = document.getElementById('restart-btn');

function initGame() {
    // Reset state
    gameState.score = 0;
    gameState.correctCount = 0;
    gameState.timeLeft = GAME_DURATION;
    gameState.isPlaying = false;

    // Reset available words
    gameState.availableIndices = wordList.map((_, i) => i);

    // UI Update
    updateScore();
    updateTimer();
    resultsModal.classList.add('hidden');

    startGame();
}

function startGame() {
    gameState.isPlaying = true;
    nextWord();
    startTimer();
}

function startTimer() {
    if (gameState.timerInterval) clearInterval(gameState.timerInterval);
    gameState.timerInterval = setInterval(() => {
        gameState.timeLeft--;
        updateTimer();

        if (gameState.timeLeft <= 0) {
            endGame();
        }
    }, 1000);
}

function updateTimer() {
    timerDisplay.innerText = Math.max(0, gameState.timeLeft);
    if (gameState.timeLeft <= 10) {
        timerDisplay.style.color = 'var(--error-color)';
    } else {
        timerDisplay.style.color = 'var(--accent-color)';
    }
}

function updateScore() {
    scoreDisplay.innerText = gameState.score;
}

function nextWord() {
    if (gameState.availableIndices.length === 0) {
        // Just in case they finish all words (unlikely in 90s but possible)
        endGame();
        return;
    }

    // Pick random index
    const randPos = Math.floor(Math.random() * gameState.availableIndices.length);
    const wordIndex = gameState.availableIndices[randPos];
    gameState.currentWordIndex = wordIndex;

    // Remove from available
    gameState.availableIndices.splice(randPos, 1);

    const wordObj = wordList[wordIndex];
    renderWord(wordObj);
}

function renderWord(wordObj) {
    foreignWordEl.innerText = wordObj.foreign;
    // Trigger animation
    foreignWordEl.classList.remove('fade-in');
    void foreignWordEl.offsetWidth; // trigger reflow
    foreignWordEl.classList.add('fade-in');

    inputContainer.innerHTML = '';

    // Split hebrew answer by space to handle multi-word answers
    const parts = wordObj.hebrew.split(' ');

    parts.forEach((part, partIndex) => {
        const groupEl = document.createElement('div');
        groupEl.className = 'word-group';

        for (let i = 0; i < part.length; i++) {
            const letter = part[i];
            // Skip non-alphanumeric chars if strictly necessary, but user said "spaces"
            // We'll create inputs for all chars in the word provided in the list logic
            // Assuming the list contains valid Hebrew chars.

            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'letter-input';
            input.maxLength = 1;
            input.dataset.letter = letter; // Store correct answer
            input.dataset.part = partIndex;
            input.dataset.index = i;
            // inputmode="text" is standard, but sometimes "search" or "none" helps control kb?
            // "text" is best for Hebrew.

            input.addEventListener('input', (e) => handleInput(e, input));
            input.addEventListener('keydown', (e) => handleKeyDown(e, input));
            input.addEventListener('focus', (e) => e.target.select()); // auto select on focus

            groupEl.appendChild(input);
        }
        inputContainer.appendChild(groupEl);
    });

    // Focus first input
    const firstInput = inputContainer.querySelector('input');
    if (firstInput) firstInput.focus();
}

function handleInput(e, input) {
    const val = e.target.value;

    // If not empty, move next
    if (val.length > 0) {
        // Auto move to next input
        const allInputs = Array.from(inputContainer.querySelectorAll('input'));
        const idx = allInputs.indexOf(input);

        if (idx < allInputs.length - 1) {
            allInputs[idx + 1].focus();
        }

        checkWord();
    }
}

function handleKeyDown(e, input) {
    // Handle backspace
    if (e.key === 'Backspace') {
        if (input.value === '') {
            // Move previous
            const allInputs = Array.from(inputContainer.querySelectorAll('input'));
            const idx = allInputs.indexOf(input);
            if (idx > 0) {
                e.preventDefault(); // prevent deleting char in prev input immediately
                const prev = allInputs[idx - 1];
                prev.focus();
                // prev.value = ''; // Optional: auto-delete prev char? User asked "delete backwards"
                // Usually "delete backwards" means if I'm empty, go back.
            }
        }
    }
}

function checkWord() {
    const allInputs = Array.from(inputContainer.querySelectorAll('input'));
    const currentVal = allInputs.map(input => input.value).join('');
    const correctVal = allInputs.map(input => input.dataset.letter).join(''); // This flattens the multi-word structure into one string

    // We compare flattened strings (ignoring spaces which we skipped in input creation)

    // Check if fully filled
    const isFilled = allInputs.every(input => input.value.length > 0);

    if (isFilled) {
        if (currentVal === correctVal) {
            // Success!
            success();
        } else {
            // Error visual
            allInputs.forEach(input => input.classList.add('shake'));
            setTimeout(() => {
                allInputs.forEach(input => input.classList.remove('shake'));
                // Clear inputs? Or let user fix?
                // Let user fix usually better, but for speed game maybe clear?
                // Request didn't specify, but "speed" games usually clear on error or just shake. 
                // Let's clear to force retry or just select all?
                // Simple shake is good feedback.
                allInputs.forEach(input => input.value = '');
                allInputs[0].focus();
            }, 500);
        }
    }
}

function success() {
    gameState.score++;
    gameState.correctCount++;
    updateScore();

    // Optional: Add time bonus? Not specified.

    // Visual feedback
    const inputs = document.querySelectorAll('.letter-input');
    inputs.forEach(i => i.classList.add('correct'));

    setTimeout(() => {
        nextWord();
    }, 200);
}

function skipWord() {
    if (!gameState.isPlaying) return;
    gameState.timeLeft -= SKIP_PENALTY;
    updateTimer();

    // Reveal answer
    const allInputs = document.querySelectorAll('.letter-input');
    allInputs.forEach(input => {
        input.value = input.dataset.letter;
        input.classList.add('correct'); // Optional: maybe different color for skip?
        // Let's stick to correct style or maybe just filled style. 
        // User asked "Show the correct name", usually implies just text.
    });

    // Temporarily pause interaction
    const wasPlaying = gameState.isPlaying;
    gameState.isPlaying = false; // Prevent double clicks

    setTimeout(() => {
        if (wasPlaying) gameState.isPlaying = true;
        nextWord();
    }, 1000);
}

function endGame() {
    gameState.isPlaying = false;
    clearInterval(gameState.timerInterval);

    finalScoreDisplay.innerText = gameState.score;
    finalCorrectDisplay.innerText = gameState.correctCount;
    resultsModal.classList.remove('hidden');
}

// Event Listeners
skipBtn.addEventListener('click', skipWord);
restartBtn.addEventListener('click', initGame);

// Start
initGame();
