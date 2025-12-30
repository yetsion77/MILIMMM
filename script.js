import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getDatabase, ref, push, query, orderByChild, limitToLast, get } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js";
import { wordList } from './words.js';

const firebaseConfig = {
    apiKey: "AIzaSyDPj2_dReuka9hBpCfjrqQIPRrakzH-ocw",
    authDomain: "milimm-b51ea.firebaseapp.com",
    projectId: "milimm-b51ea",
    storageBucket: "milimm-b51ea.firebasestorage.app",
    messagingSenderId: "122431416046",
    appId: "1:122431416046:web:993ea5ab5b8832ec8db5ff",
    measurementId: "G-6EVVMQ4NRY",
    databaseURL: "https://milimm-b51ea-default-rtdb.europe-west1.firebasedatabase.app"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

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
const startScreen = document.getElementById('start-screen');
const startBtn = document.getElementById('start-btn');
const gameHeader = document.getElementById('game-header');
const gamePage = document.getElementById('game-page');

const foreignWordEl = document.getElementById('foreign-word');
const inputContainer = document.getElementById('input-container');
const scoreDisplay = document.getElementById('score-display');
const timerDisplay = document.getElementById('timer-display');
const skipBtn = document.getElementById('skip-btn');
const resultsModal = document.getElementById('results-modal');
const finalScoreDisplay = document.getElementById('final-score-display');
const finalCorrectDisplay = document.getElementById('final-correct');
const restartBtn = document.getElementById('restart-btn');

const leaderboardContainer = document.getElementById('leaderboard-container');
const highScoreForm = document.getElementById('high-score-form');
const playerNameInput = document.getElementById('player-name-input');
const submitScoreBtn = document.getElementById('submit-score-btn');

// --- LEADERBOARD LOGIC (Realtime Database) ---

// Shared function to fetch and generate leaderboard HTML
async function fetchLeaderboardHTML() {
    try {
        const scoresRef = ref(db, 'scores');
        const q = query(scoresRef, orderByChild('score'), limitToLast(10));
        const snapshot = await get(q);

        if (!snapshot.exists()) {
            return '<div class="loader">אין עדיין תוצאות. היה הראשון!</div>';
        }

        let scores = [];
        snapshot.forEach((childSnapshot) => {
            scores.push(childSnapshot.val());
        });

        scores.reverse();

        let html = '<table class="leaderboard-table"><thead><tr><th>#</th><th>שם</th><th>ניקוד</th></tr></thead><tbody>';

        scores.forEach((data, index) => {
            html += `
                <tr>
                    <td class="rank-cell">${index + 1}</td>
                    <td>${data.name}</td>
                    <td class="score-cell">${data.score}</td>
                </tr>
            `;
        });

        html += '</tbody></table>';
        return html;

    } catch (e) {
        console.error("Error fetching leaderboard: ", e);
        return `<div class="loader" style="color:red; font-size:0.8rem; direction:ltr;">Error: ${e.message}</div>`;
    }
}

async function loadLeaderboard() {
    leaderboardContainer.innerHTML = '<div class="loader">טוען נתונים...</div>';
    const html = await fetchLeaderboardHTML();
    leaderboardContainer.innerHTML = html;
}

function renderHighScoreForm() {
    highScoreForm.innerHTML = `
        <p class="congrats-text">כל הכבוד! נכנסת לטבלת השיאנים!</p>
        <div class="input-group">
            <input type="text" id="player-name-input" placeholder="הכנס את שמך" maxlength="15">
            <button id="submit-score-btn" class="btn primary small-btn">שמור</button>
        </div>
    `;
    const btn = document.getElementById('submit-score-btn');
    if (btn) btn.addEventListener('click', submitHighScore);
}

async function checkHighScore(score) {
    highScoreForm.classList.add('hidden');
    // Clear previous content/errors and restore form if hidden
    highScoreForm.innerHTML = '';

    if (score === 0) return;

    try {
        const scoresRef = ref(db, 'scores');
        const q = query(scoresRef, orderByChild('score'), limitToLast(10));
        const snapshot = await get(q);

        let isHighScore = false;

        // FIX: use numChildren() for RTDB
        if (!snapshot.exists() || snapshot.numChildren() < 10) {
            isHighScore = true;
        } else {
            let lowestScore = Infinity;
            let count = 0;
            snapshot.forEach(child => {
                count++;
                if (count === 1) lowestScore = child.val().score;
            });

            if (score > lowestScore) {
                isHighScore = true;
            }
        }

        if (isHighScore) {
            highScoreForm.classList.remove('hidden');
            renderHighScoreForm();
            setTimeout(() => {
                const input = document.getElementById('player-name-input');
                if (input) input.focus();
            }, 500);
        }

    } catch (e) {
        console.error("Error checking high score: ", e);
        highScoreForm.classList.remove('hidden');
        renderHighScoreForm();
    }
}

async function submitHighScore() {
    const input = document.getElementById('player-name-input');
    const btn = document.getElementById('submit-score-btn');

    if (!input || !btn) return;

    const name = input.value.trim();
    if (!name) return;

    btn.disabled = true;
    btn.innerText = 'שומר...';

    try {
        const scoresRef = ref(db, 'scores');
        await push(scoresRef, {
            name: name,
            score: gameState.score,
            date: new Date().toISOString()
        });

        // Show success and RELOAD leaderboard immediately in place of the form
        highScoreForm.innerHTML = '<div class="loader">התוצאה נשמרה! מעדכן טבלה...</div>';

        // Fetch new table
        const tableHtml = await fetchLeaderboardHTML();
        highScoreForm.innerHTML = '<p class="congrats-text">התוצאה נשמרה!</p>' + tableHtml;

    } catch (e) {
        console.error("Error saving score: ", e);
        alert("שגיאה בשמירה: " + e.message);
        btn.innerText = 'שגיאה';
        btn.disabled = false;
    }
}

// --- GAME LOGIC ---

function showStartScreen() {
    startScreen.classList.add('active');
    startScreen.classList.remove('hidden');
    gameHeader.classList.add('hidden');
    gamePage.classList.add('hidden');
    resultsModal.classList.add('hidden');

    loadLeaderboard();
}

function initGame() {
    gameState.score = 0;
    gameState.correctCount = 0;
    gameState.timeLeft = GAME_DURATION;
    gameState.isPlaying = false;

    startScreen.classList.remove('active');
    startScreen.classList.add('hidden');

    gameHeader.classList.remove('hidden');
    gamePage.classList.remove('hidden');
    resultsModal.classList.add('hidden');
    document.getElementById('missed-word-container').classList.add('hidden');

    // Reset form
    highScoreForm.classList.add('hidden');
    renderHighScoreForm();

    const input = document.getElementById('player-name-input');
    if (input) input.value = '';

    gameState.availableIndices = wordList.map((_, i) => i);

    updateScore();
    updateTimer();

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
        timerDisplay.style.color = '#F56565'; // Lighter Red for dark bg? Or just rely on text-shadow. 
        // In new CSS text is white, so maybe make it red or yellow.
        timerDisplay.style.color = '#FEB2B2';
    } else {
        timerDisplay.style.color = 'white';
    }
}

function updateScore() {
    scoreDisplay.innerText = gameState.score;
}

function nextWord() {
    if (gameState.availableIndices.length === 0) {
        endGame();
        return;
    }

    const randPos = Math.floor(Math.random() * gameState.availableIndices.length);
    const wordIndex = gameState.availableIndices[randPos];
    gameState.currentWordIndex = wordIndex;

    gameState.availableIndices.splice(randPos, 1);

    const wordObj = wordList[wordIndex];
    renderWord(wordObj);
}

// Global variable for current word length/structure
let currentCorrectWord = "";

function renderWord(wordObj) {
    foreignWordEl.innerText = wordObj.foreign;
    foreignWordEl.classList.remove('fade-in');
    void foreignWordEl.offsetWidth;
    foreignWordEl.classList.add('fade-in');

    inputContainer.innerHTML = '';

    // Clean Hebrew word (remove spaces for checking)
    currentCorrectWord = wordObj.hebrew.replace(/ /g, '');
    const fullHebrewWithSpaces = wordObj.hebrew;

    // Reset Global Input
    const globalInput = document.getElementById('global-input');
    globalInput.value = '';
    globalInput.maxLength = currentCorrectWord.length;
    globalInput.focus();

    const parts = fullHebrewWithSpaces.split(' ');
    let charIndex = 0;

    parts.forEach((part, partIndex) => {
        const groupEl = document.createElement('div');
        groupEl.className = 'word-group';

        for (let i = 0; i < part.length; i++) {
            const letter = part[i];

            // Visual Box only (div or readonly input)
            const box = document.createElement('div');
            box.className = 'letter-input';
            box.dataset.letter = letter;
            box.dataset.globalIndex = charIndex; // track position in global string

            // Allow clicking box to focus global input
            box.addEventListener('click', () => {
                document.getElementById('global-input').focus();
            });

            groupEl.appendChild(box);
            charIndex++;
        }
        inputContainer.appendChild(groupEl);
    });
}

// Global Input Listener
const globalInput = document.getElementById('global-input');
if (globalInput) {
    globalInput.addEventListener('input', (e) => {
        const val = e.target.value;
        const boxes = document.querySelectorAll('.letter-input');

        // Update visual boxes
        boxes.forEach((box, idx) => {
            if (val[idx]) {
                box.innerText = val[idx];
                box.classList.add('filled'); // Optional styling
            } else {
                box.innerText = '';
                box.classList.remove('filled');
            }
        });

        // Check if full
        if (val.length === currentCorrectWord.length) {
            checkWord(val);
        }
    });

    // Handle Enter key if needed, or just let auto-check handle it
}

function checkWord(currentVal) {
    // Reconstruct correct value from visual boxes datasets just to be safe, or use global var
    // Using global `currentCorrectWord` is safer

    if (currentVal === currentCorrectWord) {
        success();
    } else {
        const boxes = document.querySelectorAll('.letter-input');
        boxes.forEach(box => box.classList.add('shake'));
        setTimeout(() => {
            boxes.forEach(box => box.classList.remove('shake'));
            // Clear input on fail? Or let user backspace? 
            // Usually in these games, on fail you clear it.
            globalInput.value = '';
            boxes.forEach(box => box.innerText = '');
        }, 500);
    }
}

function success() {
    gameState.score++;
    gameState.correctCount++;
    updateScore();

    const boxes = document.querySelectorAll('.letter-input');
    boxes.forEach(b => b.classList.add('correct'));

    setTimeout(() => {
        nextWord();
    }, 200);
}

function skipWord() {
    if (!gameState.isPlaying) return;
    gameState.timeLeft -= SKIP_PENALTY;
    updateTimer();

    // Visual feedback
    const boxes = document.querySelectorAll('.letter-input');
    let idx = 0;
    // Fill with correct letters
    const correctChars = currentCorrectWord.split('');

    boxes.forEach(box => {
        box.innerText = box.dataset.letter;
        box.classList.add('correct');
        box.style.borderColor = "#fc8181";
    });

    const wasPlaying = gameState.isPlaying;
    gameState.isPlaying = false;

    // Keep focus
    document.getElementById('global-input').focus();

    // Timeout decreased to 800ms - balanced reading time
    setTimeout(() => {
        if (wasPlaying) gameState.isPlaying = true;
        nextWord();
    }, 800);
}

function endGame() {
    gameState.isPlaying = false;
    clearInterval(gameState.timerInterval);

    finalScoreDisplay.innerText = gameState.score;
    finalCorrectDisplay.innerText = gameState.correctCount;
    resultsModal.classList.remove('hidden');

    // Show missed word if time ran out while playing
    const missedContainer = document.getElementById('missed-word-container');
    const missedReveal = document.getElementById('missed-word-reveal');

    if (gameState.currentWordIndex !== -1 && gameState.timeLeft <= 0) {
        // If we simply ran out of time
        const wordObj = wordList[gameState.currentWordIndex];
        // Check if user already finished it? Hard to say, usually endGame called by timer.
        // We'll just show what the current word was.
        missedReveal.innerText = `${wordObj.foreign} = ${wordObj.hebrew}`;
        missedContainer.classList.remove('hidden');
    } else {
        missedContainer.classList.add('hidden');
    }

    checkHighScore(gameState.score);
}

// Event Listeners
skipBtn.addEventListener('click', (e) => {
    // Prevent button default focus stealing behavior to help keep keyboard open
    e.preventDefault();
    skipWord();
});
restartBtn.addEventListener('click', initGame);
startBtn.addEventListener('click', initGame);
if (submitScoreBtn) submitScoreBtn.addEventListener('click', submitHighScore);

// Initial Load
showStartScreen();
