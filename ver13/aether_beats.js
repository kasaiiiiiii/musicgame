// ==========================================
// PLAYLIST
// ==========================================
const PLAYLIST = [
    { id: 'track_01', title: '乾杯をしよう',     url: '../Musics/KanpaiSyo.mp3'   },
    { id: 'track_02', title: '駆動ガール',       url: '../Musics/KudoGirl.mp3'    },
    { id: 'track_03', title: '精霊流し',         url: '../Musics/SereiNagasi.mp3' },
    { id: 'track_04', title: 'トーキョータワー', url: '../Musics/TokyoTower.mp3'  },
];

// ==========================================
// LOCAL STORAGE — SCORES
// ==========================================
const STORAGE_KEY = 'aether_beats_scores_v1';

function getScores(trackId, diff) {
    try {
        const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
        return data[trackId]?.[diff] ?? [];
    } catch (e) { return []; }
}

function saveScore(trackId, diff, score) {
    if (score <= 0) return;
    try {
        const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
        if (!data[trackId])       data[trackId] = {};
        if (!data[trackId][diff]) data[trackId][diff] = [];
        const scores = data[trackId][diff];
        scores.push(Math.floor(score));
        scores.sort((a, b) => b - a);
        data[trackId][diff] = scores.slice(0, 5);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {}
}

// ==========================================
// PSEUDO-RANDOM NUMBER GENERATOR
// ==========================================
function cyrb128(str) {
    let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
    for (let i = 0, k; i < str.length; i++) {
        k = str.charCodeAt(i);
        h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
        h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
        h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
        h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
    }
    h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
    h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
    h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
    h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
    return (h1 ^ h2 ^ h3 ^ h4) >>> 0;
}
function mulberry32(a) {
    return function () {
        let t = a += 0x6D2B79F5;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}
let seededRandom = Math.random;

// ==========================================
// CONFIG
// ==========================================
const config = {
    lanes: 4,
    keys: ['d', 'f', 'j', 'k'],
    difficulty: {
        easy:   { speed: 600,  threshold: 2.2,  minInterval: 0.35 },
        normal: { speed: 850,  threshold: 1.7,  minInterval: 0.25 },
        hard:   { speed: 1150, threshold: 1.35, minInterval: 0.16 },
        expert: { speed: 1450, threshold: 1.1,  minInterval: 0.11 },
    },
    colors: {
        bg:         '#0a0a0c',
        laneLine:   '#1a3a40',
        targetLine: '#b87333',
        targetGlow: '#ff5500',
        noteCore:   '#00f3ff',
        noteBorder: '#b5a642',
    },
};

// ==========================================
// STATE
// ==========================================
let state = {
    currentDiff:    'normal',
    speedMultiplier: 1.0,
    bgmVolume:       0.8,
    seVolume:        0.8,
    visualQuality:   'high', // ★ これを追加 ('high' または 'low')
    isPaused:        false,
    selectedTrack:   null,
    isPlaying:       false,
    score:           0,
    combo:           0,
    maxCombo:        0,
    notes:           [],
    audioCtx:        null,
    bgmGainNode:     null,
    seGainNode:      null,
    source:          null,
    buffer:          null,
    startTime:       0,
    gears:           [],
    particles:       [],
    keyState:        [false, false, false, false],
    objectUrlToRevoke: null,
    // Enhanced
    judgeCounts: { perfect: 0, great: 0, good: 0, miss: 0 },
    shockwaves:  [],   // { x, y, life, color }
    titlePhase:  'title', // 'title' | 'booting' | 'menu'
};

// ==========================================
// CANVAS
// ==========================================
const canvas        = document.getElementById('gameCanvas');
const ctx           = canvas.getContext('2d');
const judgeContainer = document.getElementById('judge-container');

let titleStars = [];

// ==========================================
// UTILITY
// ==========================================
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ==========================================
// INIT
// ==========================================
window.onload = () => {
    resize();
    window.addEventListener('resize', resize);
    initGears();
    initTitleStars();
    setDifficulty('normal');
    renderTrackList();
    setupSettings();
    requestAnimationFrame(gameLoop);
    initTitleScreen();
};

function resize() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
}

function initTitleStars() {
    titleStars = Array.from({ length: 90 }, () => ({
        x:       Math.random() * window.innerWidth,
        y:       Math.random() * window.innerHeight,
        speed:   0.2 + Math.random() * 1.2,
        size:    0.5 + Math.random() * 1.8,
        opacity: Math.random() * 0.7 + 0.15,
        color:   Math.random() > 0.7 ? 'rgba(184,115,51,' : 'rgba(0,243,255,',
    }));
}

// ==========================================
// TITLE SCREEN
// ==========================================
function initTitleScreen() {
    document.getElementById('menu-container').classList.add('hidden');

    const handler = () => {
        if (state.titlePhase !== 'title') return;
        state.titlePhase = 'booting';
        document.removeEventListener('keydown', handler);
        document.getElementById('title-screen').removeEventListener('click',      handler);
        document.getElementById('title-screen').removeEventListener('touchstart', handler);
        beginTitleTransition();
    };
    document.addEventListener('keydown', handler);
    document.getElementById('title-screen').addEventListener('click',      handler);
    document.getElementById('title-screen').addEventListener('touchstart', handler);
}

async function beginTitleTransition() {
    const titleScreen = document.getElementById('title-screen');
    const bootScreen  = document.getElementById('boot-screen');
    const overlay     = document.getElementById('transition-overlay');

    // 1. White flash
    overlay.style.transition = 'opacity 0.07s';
    overlay.style.opacity    = '1';
    await sleep(70);
    overlay.style.transition = 'opacity 0.6s';
    overlay.style.opacity    = '0';

    // 2. Title glitches out
    titleScreen.style.animation = 'titleGlitchOut 0.45s ease-out forwards';
    await sleep(450);
    titleScreen.style.display = 'none';

    // 3. Boot screen
    bootScreen.style.display = 'flex';
    await sleep(10);
    bootScreen.style.opacity = '1';

    const lines = [
        { t: '▸ AETHER BEATS SYSTEM v15.0.0',           cls: 'header' },
        { t: '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',  cls: 'header' },
        { t: '> Scanning hardware interfaces...',        cls: '' },
        { t: '  AUDIO SUBSYSTEM ............. [  OK  ]', cls: 'ok' },
        { t: '  RHYTHM PROCESSOR ............ [  OK  ]', cls: 'ok' },
        { t: '  VISUAL RENDERER ............. [  OK  ]', cls: 'ok' },
        { t: '  JUDGMENT ENGINE ............. [  OK  ]', cls: 'ok' },
        { t: '> Initializing note highway...',           cls: '' },
        { t: '  LANE MATRIX  4 x 1 .......... [  OK  ]', cls: 'ok' },
        { t: '  HIT WINDOW   ±80ms .......... [  OK  ]', cls: 'ok' },
        { t: '> Loading music database...',              cls: '' },
        { t: `  ${PLAYLIST.length} TRACKS FOUND ........................ [  OK  ]`, cls: 'ok' },
        { t: '> Running self-diagnostics...',            cls: '' },
        { t: '  COMBO ENGINE ................ [  OK  ]', cls: 'ok' },
        { t: '  PARTICLE SYSTEM ............. [  OK  ]', cls: 'ok' },
        { t: '> All systems nominal.',                   cls: 'ok' },
        { t: '',                                          cls: '' },
        { t: '▸ ENGAGE MUSIC SEQUENCE',                  cls: 'header' },
    ];

    const container = document.getElementById('boot-lines');
    container.innerHTML = '';

    for (let i = 0; i < lines.length; i++) {
        const delayMs = i < 2 ? 40 : (i < 8 ? 90 : 110);
        await sleep(delayMs);
        const div = document.createElement('div');
        div.className   = `boot-line ${lines[i].cls}`;
        div.textContent = lines[i].t || '\u00A0';
        div.style.opacity = '0';
        container.appendChild(div);
        requestAnimationFrame(() => requestAnimationFrame(() => {
            div.style.transition = 'opacity 0.12s';
            div.style.opacity    = '1';
        }));
    }

    await sleep(200);
    const cursorLine = document.createElement('div');
    cursorLine.className   = 'boot-line';
    cursorLine.innerHTML   = '> <span class="boot-cursor"></span>';
    cursorLine.style.opacity = '0';
    container.appendChild(cursorLine);
    requestAnimationFrame(() => requestAnimationFrame(() => {
        cursorLine.style.transition = 'opacity 0.1s';
        cursorLine.style.opacity    = '1';
    }));

    await sleep(700);

    // 4. Flash → reveal menu
    overlay.style.transition   = 'opacity 0.1s';
    overlay.style.opacity      = '1';
    bootScreen.style.transition = 'opacity 0.1s';
    bootScreen.style.opacity   = '0';
    await sleep(110);

    bootScreen.style.display = 'none';
    const menu = document.getElementById('menu-container');
    menu.classList.remove('hidden');
    menu.style.opacity   = '0';
    menu.style.transform = 'translateY(28px)';

    overlay.style.transition = 'opacity 0.7s';
    overlay.style.opacity    = '0';
    await sleep(30);
    menu.style.transition = 'opacity 0.65s ease-out, transform 0.65s ease-out';
    menu.style.opacity    = '1';
    menu.style.transform  = 'translateY(0)';
    setTimeout(() => {
        menu.style.transition = '';
        menu.style.opacity    = '';
        menu.style.transform  = '';
    }, 700);

    state.titlePhase = 'menu';
}

// ==========================================
// NEW FEATURES: PREVIEW & CONFETTI
// ==========================================
let previewAudio = null;
let previewTimeout = null;

function playPreview(url) {
    stopPreview();
    previewAudio = new Audio(url);
    previewAudio.volume = 0.4;
    // ブラウザの自動再生制限によるエラーを回避
    previewAudio.play().catch(e => console.log("Preview auto-play prevented"));
    
    // 15秒後に自動停止
    previewTimeout = setTimeout(() => stopPreview(), 15000);
}

function stopPreview() {
    if (previewAudio) {
        previewAudio.pause();
        previewAudio.currentTime = 0;
        previewAudio = null;
    }
    if (previewTimeout) {
        clearTimeout(previewTimeout);
        previewTimeout = null;
    }
}

function triggerGoldConfetti() {
    for (let i = 0; i < 150; i++) {
        const conf = document.createElement('div');
        conf.className = 'confetti';
        conf.style.left = (Math.random() * 100) + 'vw';
        conf.style.animationDelay = (Math.random() * 2) + 's';
        conf.style.backgroundColor = Math.random() > 0.5 ? '#FFD700' : '#FDB813'; // ゴールド2色
        document.body.appendChild(conf);
        
        // アニメーション終了後にDOMから削除
        setTimeout(() => conf.remove(), 4000);
    }
}

// ==========================================
// AUDIO
// ==========================================
async function initAudioContext() {
    if (!state.audioCtx) {
        // ↓ここを変更します！（かっこの中に { sampleRate: 44100 } を追加）
        state.audioCtx    = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 44100 });
        state.bgmGainNode = state.audioCtx.createGain();
        state.seGainNode  = state.audioCtx.createGain();
        state.bgmGainNode.connect(state.audioCtx.destination);
        state.seGainNode.connect(state.audioCtx.destination);
        state.bgmGainNode.gain.value = state.bgmVolume;
        state.seGainNode.gain.value  = state.seVolume;
    }
    if (state.audioCtx.state === 'suspended' && !state.isPaused) await state.audioCtx.resume();
}

function playTapSound() {
    if (!state.audioCtx || state.audioCtx.state !== 'running') return;
    const osc  = state.audioCtx.createOscillator();
    const gain = state.audioCtx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(600, state.audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(100, state.audioCtx.currentTime + 0.03);
    gain.gain.setValueAtTime(0.5, state.audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, state.audioCtx.currentTime + 0.05);
    osc.connect(gain); gain.connect(state.seGainNode);
    osc.start(); osc.stop(state.audioCtx.currentTime + 0.05);
}

function playPerfectSound() {
    if (!state.audioCtx || state.audioCtx.state !== 'running') return;
    const osc  = state.audioCtx.createOscillator();
    const gain = state.audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(900, state.audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1200, state.audioCtx.currentTime + 0.04);
    gain.gain.setValueAtTime(0.3, state.audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, state.audioCtx.currentTime + 0.08);
    osc.connect(gain); gain.connect(state.seGainNode);
    osc.start(); osc.stop(state.audioCtx.currentTime + 0.08);
}

// ==========================================
// SETTINGS
// ==========================================
function setupSettings() {
    document.getElementById('speed-slider').addEventListener('input', e => {
        state.speedMultiplier = parseFloat(e.target.value);
        document.getElementById('speed-display').textContent = `x${state.speedMultiplier.toFixed(1)}`;
    });
    document.getElementById('bgm-vol-slider').addEventListener('input', e => {
        state.bgmVolume = parseFloat(e.target.value);
        document.getElementById('bgm-vol-display').textContent = Math.round(state.bgmVolume * 100) + '%';
        if (state.bgmGainNode) state.bgmGainNode.gain.value = state.bgmVolume;
    });
    const seSlider = document.getElementById('se-vol-slider');
    seSlider.addEventListener('input', e => {
        state.seVolume = parseFloat(e.target.value);
        document.getElementById('se-vol-display').textContent = Math.round(state.seVolume * 100) + '%';
        if (state.seGainNode) state.seGainNode.gain.value = state.seVolume;
    });
    seSlider.addEventListener('change', () => playTapSound());

    const qualityToggle = document.getElementById('quality-toggle');
    if (qualityToggle) {
        qualityToggle.addEventListener('change', e => {
            // チェックされていれば 'high'、外れていれば 'low'
            state.visualQuality = e.target.checked ? 'high' : 'low';
        });
    }
}

async function openSettings() {
    await initAudioContext();
    document.getElementById('settings-modal').classList.remove('hidden');
    if (state.isPlaying && state.audioCtx?.state === 'running') {
        await state.audioCtx.suspend();
        state.isPaused = true;
    }
}

async function closeSettings() {
    document.getElementById('settings-modal').classList.add('hidden');
    if (state.isPlaying && state.isPaused && state.audioCtx?.state === 'suspended') {
        await state.audioCtx.resume();
        state.isPaused = false;
    }
}

// ==========================================
    // CREDITS UI
    // ==========================================
    async function openCredits() {
        if (typeof playTapSound === 'function') playTapSound();
        // 設定ボタンと同様、オーディオコンテキストを初期化
        await initAudioContext();
        
        document.getElementById('credits-screen').classList.remove('hidden');
        
        // ゲームプレイ中なら一時停止する
        if (state.isPlaying && state.audioCtx?.state === 'running') {
            await state.audioCtx.suspend();
            state.isPaused = true;
        }
    }

    async function closeCredits() {
        if (typeof playTapSound === 'function') playTapSound();
        
        document.getElementById('credits-screen').classList.add('hidden');
        
        // ゲームが一時停止中なら再開する
        if (state.isPlaying && state.isPaused && state.audioCtx?.state === 'suspended') {
            await state.audioCtx.resume();
            state.isPaused = false;
        }
    }

// ==========================================
// TRACK LIST / LEADERBOARD
// ==========================================
function renderTrackList() {
    const list = document.getElementById('track-list');
    list.innerHTML = '';
    document.getElementById('track-count').textContent = `${PLAYLIST.length} TRACKS`;
    PLAYLIST.forEach(track => {
        const btn = document.createElement('button');
        btn.className = 'btn-steampunk w-full p-3 flex items-center gap-3 rounded text-left group';
        btn.innerHTML = `<span class="font-bold truncate text-sm text-white group-hover:text-cyan-300 transition-colors">${track.title}</span>`;
        btn.onclick = () => selectTrack(track, btn);
        list.appendChild(btn);
    });
}

function updateLeaderboardDisplay() {
    if (!state.selectedTrack) return;
    const diffDisplay = document.getElementById('leaderboard-diff');
    diffDisplay.textContent = state.currentDiff.toUpperCase();
    const colors = {
        easy:   'text-[#00ff88]',
        normal: 'text-[#00f3ff]',
        hard:   'text-[#ffaa00]',
        expert: 'text-[#ff0044]',
    };
    diffDisplay.className = `text-sm font-bold tracking-wider ${colors[state.currentDiff]}`;

    const listEl = document.getElementById('leaderboard-list');
    listEl.innerHTML = '';
    const scores = getScores(state.selectedTrack.id, state.currentDiff);
    if (scores.length === 0) {
        listEl.innerHTML = '<div class="text-center text-gray-500 text-xs py-4">NO RECORDS YET</div>';
        return;
    }
    const ranks = ['1ST', '2ND', '3RD', '4TH', '5TH'];
    scores.forEach((score, i) => {
        const row = document.createElement('div');
        row.className = `flex justify-between border-b border-gray-800/50 pb-1 pt-1 ${i === 0 ? 'text-yellow-400 font-bold' : 'text-gray-400'}`;
        const r = document.createElement('span');
        r.innerHTML = i === 0 ? `👑 ${ranks[i]}` : ranks[i];
        const s = document.createElement('span');
        s.textContent = score.toString().padStart(7, '0');
        row.appendChild(r); row.appendChild(s); listEl.appendChild(row);
    });
}

function setDifficulty(diff) {
    state.currentDiff = diff;
    ['easy', 'normal', 'hard', 'expert'].forEach(id => {
        document.getElementById(`diff-${id}`)?.classList.toggle('active', id === diff);
    });
    if (state.selectedTrack) updateLeaderboardDisplay();
}

async function selectTrack(track, btnEl) {
    document.querySelectorAll('#track-list button').forEach(b => b.classList.remove('active'));
    if (btnEl) btnEl.classList.add('active');

    // 【追加】楽曲を選んだら試聴再生
    playPreview(track.url);

    document.getElementById('selected-title').textContent = track.title;
    const statusEl = document.getElementById('selected-status');
    const startBtn = document.getElementById('start-btn');
    startBtn.disabled    = true;
    statusEl.textContent = 'DOWNLOADING AUDIO DATA...';
    statusEl.className   = 'text-xs font-mono mt-1 text-orange-400';
    startBtn.textContent = 'PROCESSING...';
    state.selectedTrack  = track;
    updateLeaderboardDisplay();

    const jacketImg = document.getElementById('jacket-image');
    const noImgText = document.getElementById('no-image-text');
    jacketImg.classList.add('hidden');
    noImgText.classList.remove('hidden');

    const fileNameFull = track.id.startsWith('local_') ? track.title : track.url.split('/').pop();
    const baseName     = fileNameFull.split('.').slice(0, -1).join('.') || fileNameFull;
    if (baseName) {
        const imgJpg = new Image();
        imgJpg.src    = `../Images/${baseName}.jpg`;
        imgJpg.onload = () => { jacketImg.src = imgJpg.src; jacketImg.classList.remove('hidden'); noImgText.classList.add('hidden'); };
        imgJpg.onerror = () => {
            const imgPng = new Image();
            imgPng.src    = `../Images/${baseName}.png`;
            imgPng.onload = () => { jacketImg.src = imgPng.src; jacketImg.classList.remove('hidden'); noImgText.classList.add('hidden'); };
        };
    }

    await initAudioContext();
    try {
        const response = await fetch(track.url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        state.buffer = await state.audioCtx.decodeAudioData(await response.arrayBuffer());
        statusEl.textContent = 'DATA READY. WAITING FOR ENGAGE.';
        statusEl.className   = 'text-xs font-mono mt-1 text-cyan-400';
        startBtn.disabled    = false;
        startBtn.textContent = '4. ENGAGE SYSTEM';
    } catch (err) {
        console.error(err);
        statusEl.textContent = 'ERROR: FAILED TO LOAD AUDIO.';
        statusEl.className   = 'text-xs font-mono mt-1 text-red-500';
        startBtn.textContent = 'SYSTEM ERROR';
    }
}

document.getElementById('local-file-input').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    if (state.objectUrlToRevoke) URL.revokeObjectURL(state.objectUrlToRevoke);
    const url = URL.createObjectURL(file);
    state.objectUrlToRevoke = url;
    selectTrack({ id: 'local_' + file.name, title: file.name, url }, null);
    e.target.value = '';
});

// ==========================================
// NOTE GENERATION
// ==========================================
function generateNotes() {
    seededRandom = mulberry32(cyrb128(state.selectedTrack.id + '_' + state.currentDiff));
    const channelData = state.buffer.getChannelData(0);
    const sampleRate  = state.buffer.sampleRate;
    const windowSize  = Math.floor(sampleRate * 0.02);
    const diffCfg     = config.difficulty[state.currentDiff];
    state.notes = [];
    let energies = [], sumEnergy = 0;

    for (let i = 0; i < channelData.length; i += windowSize) {
        let sum = 0;
        for (let j = 0; j < windowSize && i + j < channelData.length; j++) sum += channelData[i + j] * channelData[i + j];
        const e = Math.sqrt(sum / windowSize);
        energies.push(e); sumEnergy += e;
    }

    const avgEnergy      = sumEnergy / energies.length;
    const threshold      = avgEnergy * diffCfg.threshold;
    const strongThreshold = threshold * 1.5;
    let lastTime  = 0, lastLane = Math.floor(seededRandom() * config.lanes);
    let stairDir  = 1, isStair  = false, stairCount = 0;

    for (let i = 1; i < energies.length - 1; i++) {
        const time = (i * windowSize) / sampleRate;
        const e    = energies[i];
        if (e > threshold && e > energies[i - 1] && e > energies[i + 1]) {
            if (time - lastTime > diffCfg.minInterval) {
                if (e > strongThreshold && state.currentDiff !== 'easy' && seededRandom() > 0.15) {
                    const l1 = Math.floor(seededRandom() * config.lanes);
                    const l2 = (l1 + 1 + Math.floor(seededRandom() * (config.lanes - 1))) % config.lanes;
                    state.notes.push({ time, lane: l1, hit: false, missed: false });
                    state.notes.push({ time, lane: l2, hit: false, missed: false });
                    lastLane = l2; isStair = false;
                } else {
                    let nextLane = lastLane;
                    if (time - lastTime < diffCfg.minInterval * 1.8) {
                        if (!isStair) {
                            isStair    = true;
                            stairDir   = lastLane === 0 ? 1 : (lastLane === config.lanes - 1 ? -1 : (seededRandom() > 0.5 ? 1 : -1));
                            stairCount = 0;
                        }
                        nextLane = lastLane + stairDir;
                        if (nextLane < 0 || nextLane >= config.lanes) {
                            stairDir *= -1; nextLane = lastLane + stairDir * 2;
                            if (nextLane < 0) nextLane = 1;
                            if (nextLane >= config.lanes) nextLane = config.lanes - 2;
                        }
                        stairCount++;
                        if (stairCount > 5) isStair = false;
                    } else {
                        isStair  = false;
                        nextLane = Math.floor(seededRandom() * config.lanes);
                        if (nextLane === lastLane && seededRandom() > 0.4) nextLane = (nextLane + 1) % config.lanes;
                    }
                    state.notes.push({ time, lane: nextLane, hit: false, missed: false });
                    lastLane = nextLane;
                }
                lastTime = time;
            }
        }
    }
}

// ==========================================
// GAME START
// ==========================================
document.getElementById('start-btn').addEventListener('click', async () => {
    if (!state.buffer) return;

    // 【追加】ゲーム開始時に試聴を止める
    stopPreview();

    await initAudioContext();
    generateNotes();

    state.score       = 0;
    state.combo       = 0;
    state.maxCombo    = 0;
    state.particles   = [];
    state.shockwaves  = [];
    state.judgeCounts = { perfect: 0, great: 0, good: 0, miss: 0 };
    updateHUD();

    // Menu fade out
    const menu = document.getElementById('menu-container');
    menu.style.transition = 'opacity 0.35s, transform 0.35s';
    menu.style.opacity    = '0';
    menu.style.transform  = 'scale(0.96)';
    await sleep(350);
    menu.classList.add('hidden');
    menu.style.transition = '';
    menu.style.opacity    = '';
    menu.style.transform  = '';

    triggerEngageEffect();

    const leadTime   = 2.0;
    state.startTime  = state.audioCtx.currentTime + leadTime;
    state.source     = state.audioCtx.createBufferSource();
    state.source.buffer = state.buffer;
    state.source.connect(state.bgmGainNode);
    state.source.start(state.startTime);
    state.source.onended = () => endGame();
    state.isPlaying  = true;
    state.isPaused   = false;

    await showCountdown();
});

function triggerEngageEffect() {
    const overlay = document.getElementById('engage-overlay');
    overlay.style.opacity = '1';
    overlay.innerHTML     = '';
    const ring = document.createElement('div');
    ring.className  = 'engage-ring';
    ring.style.cssText = 'position:absolute;left:50%;top:50%;border-color:var(--neon-cyan);border-width:2px;';
    overlay.appendChild(ring);
    setTimeout(() => { overlay.style.opacity = '0'; overlay.innerHTML = ''; }, 700);
}

async function showCountdown() {
    const items = [
        { t: '3',    color: '#ffaa00' },
        { t: '2',    color: '#ff5500' },
        { t: '1',    color: '#ff0044' },
        { t: 'GO!!', color: '#00f3ff' },
    ];
    for (const item of items) {
        const el = document.createElement('div');
        el.className   = 'countdown-num';
        el.style.color = item.color;
        el.style.textShadow = `0 0 30px ${item.color}, 0 0 60px ${item.color}`;
        el.textContent = item.t;
        document.body.appendChild(el);
        playCountdownBeep(item.t === 'GO!!');
        await sleep(500);
        el.remove();
    }
}

function playCountdownBeep(isGo) {
    if (!state.audioCtx || state.audioCtx.state !== 'running') return;
    const osc  = state.audioCtx.createOscillator();
    const gain = state.audioCtx.createGain();
    osc.type           = isGo ? 'square' : 'sine';
    osc.frequency.value = isGo ? 880 : 440;
    const dur = isGo ? 0.3 : 0.12;
    gain.gain.setValueAtTime(0.4, state.audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, state.audioCtx.currentTime + dur);
    osc.connect(gain); gain.connect(state.seGainNode);
    osc.start(); osc.stop(state.audioCtx.currentTime + dur);
}

// ==========================================
// END GAME
// ==========================================
function endGame() {
    state.isPlaying = false;

    const finalScore = Math.floor(state.score);
    const rank       = calculateRank(state.judgeCounts);
    const total      = state.judgeCounts.perfect + state.judgeCounts.great + state.judgeCounts.good + state.judgeCounts.miss;
    const accuracy   = total > 0
        ? ((state.judgeCounts.perfect * 1.0 + state.judgeCounts.great * 0.7 + state.judgeCounts.good * 0.3) / total * 100).toFixed(1)
        : '0.0';

    document.getElementById('result-track-name').textContent = state.selectedTrack.title;
    document.getElementById('result-diff-badge').textContent = `── ${state.currentDiff.toUpperCase()} ──`;
    document.getElementById('result-combo').textContent      = state.maxCombo;
    document.getElementById('result-accuracy').textContent   = accuracy + '%';
    document.getElementById('result-perfect').textContent    = state.judgeCounts.perfect;
    document.getElementById('result-great').textContent      = state.judgeCounts.great;
    document.getElementById('result-good').textContent       = state.judgeCounts.good;
    document.getElementById('result-miss').textContent       = state.judgeCounts.miss;

    const rankEl = document.getElementById('result-rank');
    rankEl.className    = '';
    rankEl.style.opacity = '0';
    rankEl.textContent  = rank;

    const prevScores  = getScores(state.selectedTrack.id, state.currentDiff);
    const isNewRecord = (prevScores.length === 0 || finalScore > prevScores[0]) && finalScore > 0;
    saveScore(state.selectedTrack.id, state.currentDiff, finalScore);

    document.getElementById('result-highscore-msg').classList.toggle('hidden', !isNewRecord);
    document.getElementById('result-screen').classList.remove('hidden');

    // 【追加】フルコンボ時にコンフェッティを降らせる
    if (state.judgeCounts.miss === 0 && state.maxCombo > 0) {
        triggerGoldConfetti();
    }
    
    animateScoreCount(finalScore);
    setTimeout(() => { rankEl.className = `rank-${rank}`; }, 400);
    if (rank === 'S' || isNewRecord) setTimeout(() => spawnResultParticles(), 600);

    
}

function animateScoreCount(target) {
    const el       = document.getElementById('result-score');
    const duration = 1600;
    const start    = performance.now();
    function tick(now) {
        const p     = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        el.textContent = Math.floor(target * eased).toString().padStart(7, '0');
        if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
}

function calculateRank(j) {
    const total = j.perfect + j.great + j.good + j.miss;
    if (total === 0) return 'D';
    const acc = (j.perfect * 1.0 + j.great * 0.7 + j.good * 0.3) / total;
    if (acc >= 0.93) return 'S';
    if (acc >= 0.75) return 'A';
    if (acc >= 0.55) return 'B';
    if (acc >= 0.35) return 'C';
    return 'D';
}

function spawnResultParticles() {
    const colors = ['#ffd700', '#ff5500', '#00f3ff', '#ff00ff', '#00ff88', '#ffffff'];
    for (let i = 0; i < 80; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 3 + Math.random() * 8;
        state.particles.push({
            x:     canvas.width  * 0.5 + (Math.random() - 0.5) * 200,
            y:     canvas.height * 0.5 + (Math.random() - 0.5) * 150,
            vx:    Math.cos(angle) * speed,
            vy:    Math.sin(angle) * speed - 4,
            life:  1.0,
            color: colors[Math.floor(Math.random() * colors.length)],
            size:  3 + Math.random() * 5,
        });
    }
}

function returnToMenu() {
    if (state.source) { try { state.source.stop(); } catch (e) {} }
    state.isPlaying = false;

    const resultScreen = document.getElementById('result-screen');
    resultScreen.style.transition = 'opacity 0.4s';
    resultScreen.style.opacity    = '0';

    setTimeout(() => {
        resultScreen.classList.add('hidden');
        resultScreen.style.transition = '';
        resultScreen.style.opacity    = '';
        updateLeaderboardDisplay();

        const menu = document.getElementById('menu-container');
        menu.classList.remove('hidden');
        menu.style.opacity   = '0';
        menu.style.transform = 'translateY(20px)';
        requestAnimationFrame(() => {
            menu.style.transition = 'opacity 0.5s, transform 0.5s';
            menu.style.opacity    = '1';
            menu.style.transform  = 'translateY(0)';
            setTimeout(() => {
                menu.style.transition = '';
                menu.style.opacity    = '';
                menu.style.transform  = '';
            }, 520);
        });
    }, 400);
}

// ==========================================
// INPUT HANDLING
// ==========================================
function handleInput(laneIndex) {
    if (!state.isPlaying || state.isPaused) return;
    const currentTime = state.audioCtx.currentTime - state.startTime;
    const laneWidth   = Math.min(canvas.width * 0.22, 120);
    const startX      = (canvas.width - laneWidth * config.lanes) / 2;
    const hitX        = startX + laneIndex * laneWidth + laneWidth / 2;
    const targetY     = canvas.height * 0.85;

    spawnParticles(hitX, targetY, config.colors.noteCore, 6);

    const winPerfect = 0.08, winGreat = 0.15, winGood = 0.22;
    let targetNote = null, minDiff = Infinity;

    for (const note of state.notes) {
        if (note.lane === laneIndex && !note.hit && !note.missed) {
            const diff = Math.abs(note.time - currentTime);
            if (diff < winGood && diff < minDiff) { minDiff = diff; targetNote = note; }
        }
    }

    if (targetNote) {
        targetNote.hit = true;
        let text = '', points = 0, color = '';

        if (minDiff < winPerfect)     { text = 'PERFECT'; points = 1000; color = '#ff00ff'; state.judgeCounts.perfect++; playPerfectSound(); }
        else if (minDiff < winGreat)  { text = 'GREAT';   points = 500;  color = '#00f3ff'; state.judgeCounts.great++;   }
        else                          { text = 'GOOD';    points = 100;  color = '#00ff88'; state.judgeCounts.good++;    }

        state.combo++;
        if (state.combo > state.maxCombo) state.maxCombo = state.combo;
        state.score += points + (state.combo * 10);

        state.shockwaves.push({ x: hitX, y: targetY, life: 1.0, color });
        spawnParticles(hitX, targetY, color, text === 'PERFECT' ? 30 : 18);

        showJudgement(text, color);
        checkComboMilestone(state.combo);
        updateHUD();
    }
}

window.addEventListener('keydown', e => {
    const li = config.keys.indexOf(e.key.toLowerCase());
    if (li !== -1 && !state.keyState[li]) {
        state.keyState[li] = true;
        if (!state.isPaused) { playTapSound(); if (state.isPlaying) handleInput(li); }
    }
});
window.addEventListener('keyup', e => {
    const li = config.keys.indexOf(e.key.toLowerCase());
    if (li !== -1) state.keyState[li] = false;
});
canvas.addEventListener('touchstart', e => {
    e.preventDefault();
    if (state.isPaused) return;
    const rect       = canvas.getBoundingClientRect();
    const laneWidth  = Math.min(canvas.width * 0.22, 120);
    const totalWidth = laneWidth * config.lanes;
    const startX     = (canvas.width - totalWidth) / 2;
    for (let i = 0; i < e.changedTouches.length; i++) {
        const x = e.changedTouches[i].clientX - rect.left;
        if (x >= startX && x <= startX + totalWidth) {
            const li = Math.floor((x - startX) / laneWidth);
            state.keyState[li] = true;
            playTapSound();
            if (state.isPlaying) handleInput(li);
            setTimeout(() => { state.keyState[li] = false; }, 50);
        }
    }
}, { passive: false });

// ==========================================
// VISUAL FEEDBACK
// ==========================================
const MILESTONES = [10, 25, 50, 100, 200, 300, 500];
const MILESTONE_COLORS = { 10: '#00ff88', 25: '#00f3ff', 50: '#ffaa00', 100: '#ff5500', 200: '#ff00ff', 300: '#ffd700', 500: '#ffffff' };

function checkComboMilestone(combo) {
    if (!MILESTONES.includes(combo)) return;
    const color = MILESTONE_COLORS[combo];
    const size  = combo >= 100 ? 'clamp(2rem,6vw,4rem)' : 'clamp(1.5rem,4.5vw,3rem)';
    const label = combo >= 300 ? '★ UNSTOPPABLE ★' : combo >= 100 ? '▸ EXCELLENT ◂' : combo >= 50 ? '▸ CHAIN MASTER ◂' : '▸ KEEP GOING ◂';

    const el = document.getElementById('combo-milestone');
    el.innerHTML = `
        <div style="color:${color};text-shadow:0 0 20px ${color},0 0 40px ${color};font-size:${size};letter-spacing:0.1em">${combo} COMBO!!</div>
        <div style="color:${color};font-size:clamp(0.6rem,1.5vw,0.9rem);font-family:'Share Tech Mono',monospace;letter-spacing:0.3em;opacity:0.7;margin-top:4px">${label}</div>`;
    el.style.animation = 'none';
    el.style.opacity   = '0';
    void el.offsetWidth;
    el.style.animation = 'milestoneAnim 1.8s ease-out forwards';
}

function showMissFlash() {
    const el = document.getElementById('miss-flash');
    el.style.animation = 'none';
    el.style.opacity   = '0';
    void el.offsetWidth;
    el.style.animation = 'missFlashAnim 0.4s ease-out forwards';
}

function showJudgement(text, color) {
    const el = document.createElement('div');
    el.textContent = text;
    el.className   = 'judgement font-black';
    el.style.color       = color;
    el.style.textShadow  = `0 0 20px ${color}, 0 0 40px ${color}`;
    if (text === 'PERFECT') { el.style.fontSize = '4rem'; el.style.letterSpacing = '0.05em'; }
    if (text === 'MISS')    { el.style.fontSize = '3rem'; el.style.filter = 'blur(1px)'; }
    judgeContainer.appendChild(el);
    setTimeout(() => el.remove(), 550);
}

function updateHUD() {
    document.getElementById('score-display').textContent = Math.floor(state.score).toString().padStart(7, '0');
    const comboEl = document.getElementById('combo-display');
    comboEl.textContent = state.combo;
    comboEl.style.transform  = 'scale(1.45)';
    comboEl.style.textShadow = state.combo > 100
        ? '0 0 20px #ffd700, 0 0 40px #ffd700'
        : '0 0 10px var(--neon-cyan)';
    setTimeout(() => {
        comboEl.style.transform  = 'scale(1)';
        comboEl.style.textShadow = '0 0 10px var(--neon-cyan)';
    }, 110);
}

function spawnParticles(x, y, color, count) {
    for (let i = 0; i < count; i++) {
        state.particles.push({
            x, y,
            vx:   (Math.random() - 0.5) * 14,
            vy:   (Math.random() - 0.5) * 14 - 4,
            life: 1.0,
            color,
            size: 2 + Math.random() * 3,
        });
    }
}

// ==========================================
// GEARS
// ==========================================
function initGears() {
    state.gears = Array.from({ length: 15 }, () => ({
        x:     Math.random() * window.innerWidth,
        y:     Math.random() * window.innerHeight,
        r:     40 + Math.random() * 100,
        speed: (Math.random() - 0.5) * 0.005,
        angle: Math.random() * Math.PI * 2,
        color: Math.random() > 0.5 ? 'rgba(184,115,51,0.09)' : 'rgba(181,166,66,0.09)',
        teeth: 6 + Math.floor(Math.random() * 6),
    }));
}

function drawGear(g) {
    ctx.save();
    ctx.translate(g.x, g.y);
    ctx.rotate(g.angle);
    ctx.fillStyle = g.color;
    ctx.beginPath();
    ctx.arc(0, 0, g.r, 0, Math.PI * 2);
    for (let i = 0; i < g.teeth; i++) {
        const a = (i / g.teeth) * Math.PI * 2;
        ctx.rect(
            Math.cos(a) * g.r * 0.9 - g.r * 0.12,
            Math.sin(a) * g.r * 0.9 - g.r * 0.12,
            g.r * 0.24, g.r * 0.24
        );
    }
    ctx.fill();
    ctx.fillStyle = config.colors.bg;
    ctx.beginPath();
    ctx.arc(0, 0, g.r * 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

// ==========================================
// MAIN GAME LOOP
// ==========================================
function gameLoop() {
    // ── Background ──
    ctx.fillStyle = config.colors.bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // ── Title stars (non-playing only) ──
    if (!state.isPlaying) {
        titleStars.forEach(star => {
            if (!state.isPaused) {
                star.y += star.speed;
                if (star.y > canvas.height) { star.y = -2; star.x = Math.random() * canvas.width; }
            }
            ctx.globalAlpha = star.opacity * 0.6;
            ctx.fillStyle   = star.color + '0.8)';
            ctx.beginPath(); ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2); ctx.fill();
        });
        ctx.globalAlpha = 1;
    }

    // ── Gears ──
    // コンボ数に応じてギアのエフェクトを計算 (最大50コンボでMAX)
    if (state.visualQuality === 'high') {
    const comboRatio = Math.min(state.combo / 50, 1.0);
        // スピードは最大3倍に加速
        const gearSpeedMult = 1.0 + (comboRatio * 2.0);
    
        state.gears.forEach(g => {
            // 元の基本スピードを初回だけ保存しておく
            if (g.baseSpeed === undefined) g.baseSpeed = g.speed;
    
            // コンボ倍率をかけて回転させる
            if (!state.isPaused) {
                g.angle += g.baseSpeed * gearSpeedMult;
            }
            drawGear(g);
    }
    
        
        ctx.save();
        ctx.restore();
    });

    // ── Gameplay ──
    if (state.isPlaying) {
        const currentTime = state.audioCtx.currentTime - state.startTime;
        const laneWidth   = Math.min(canvas.width * 0.22, 120);
        const totalWidth  = laneWidth * config.lanes;
        const startX      = (canvas.width - totalWidth) / 2;
        const targetY     = canvas.height * 0.85;
        
        // 【修正ポイント】固定のピクセル速度ではなく、画面の高さ（800pxを基準）に合わせた相対速度に変更！
        const baseSpeed = config.difficulty[state.currentDiff].speed;
        const speed     = (baseSpeed / 800) * canvas.height * state.speedMultiplier;

        // Lane background
        ctx.fillStyle = 'rgba(10,18,22,0.85)';
        ctx.fillRect(startX, 0, totalWidth, canvas.height);

        // Lane dividers
        ctx.strokeStyle = config.colors.laneLine;
        ctx.lineWidth   = 1;
        for (let i = 0; i <= config.lanes; i++) {
            ctx.beginPath();
            ctx.moveTo(startX + i * laneWidth, 0);
            ctx.lineTo(startX + i * laneWidth, canvas.height);
            ctx.stroke();
        }

        // Key-held lane highlight (subtle — only while key is down)
        for (let i = 0; i < config.lanes; i++) {
            if (state.keyState[i]) {
                ctx.fillStyle = 'rgba(0,243,255,0.08)';
                ctx.fillRect(startX + i * laneWidth, 0, laneWidth, targetY);
            }
            // Key labels
            ctx.fillStyle   = 'rgba(255,255,255,0.35)';
            ctx.font        = '20px "Share Tech Mono"';
            ctx.textAlign   = 'center';
            ctx.fillText(config.keys[i].toUpperCase(), startX + i * laneWidth + laneWidth / 2, targetY + 34);
        }

        // Target line
        if (state.visualQuality === 'high') { // ★分岐を追加
            ctx.shadowBlur  = 25; ctx.shadowColor = config.colors.targetGlow;
        }
        ctx.fillStyle   = config.colors.targetLine;
        ctx.fillRect(startX, targetY - 4, totalWidth, 8);
        if (state.visualQuality === 'high') { // ★分岐を追加
            ctx.shadowBlur  = 10; ctx.shadowColor = '#fff';
        }
        ctx.fillStyle   = 'rgba(255,255,255,0.3)';
        ctx.fillRect(startX, targetY - 1, totalWidth, 2);
        ctx.shadowBlur  = 0; // 確実にリセット

        // Notes
        state.notes.forEach(note => {
            if (note.hit) return;
            const yPos = targetY - (note.time - currentTime) * speed;
            const xPos = startX + note.lane * laneWidth + laneWidth / 2;

            if (yPos > canvas.height + 50 && !note.missed) {
                note.missed = true;
                state.combo = 0;
                state.judgeCounts.miss++;
                showJudgement('MISS', '#ff0044');
                showMissFlash();
                updateHUD();
            }

            if (yPos > -50 && yPos < canvas.height + 50 && !note.missed) {
                // Trail (軌跡)
                // ★ 高画質なら5個、低画質なら0個にして処理を軽くする
                const trailCount = (state.visualQuality === 'high') ? 5 : 0; 
                for (let t = 1; t <= trailCount; t++) {
                    const r = laneWidth * (0.21 - t * 0.025);
                    if (r <= 0) continue;
                    ctx.globalAlpha = (6 - t) / 16;
                    ctx.shadowBlur  = 6; ctx.shadowColor = config.colors.noteCore;
                    ctx.beginPath(); ctx.arc(xPos, yPos - t * 11, r, 0, Math.PI * 2);
                    ctx.fillStyle = config.colors.noteCore; ctx.fill();
                }
                ctx.globalAlpha = 1; ctx.shadowBlur = 0;

                // Note body (ノーツ本体)
                if (state.visualQuality === 'high') { // ★分岐を追加
                    ctx.shadowBlur = 15; ctx.shadowColor = config.colors.noteCore;
                }
                ctx.beginPath(); ctx.arc(xPos, yPos, laneWidth * 0.31, 0, Math.PI * 2);
                ctx.fillStyle = config.colors.noteBorder; ctx.fill();
                ctx.beginPath(); ctx.arc(xPos, yPos, laneWidth * 0.20, 0, Math.PI * 2);
                ctx.fillStyle = config.colors.noteCore;   ctx.fill();
                // Inner highlight
                ctx.beginPath(); ctx.arc(xPos - laneWidth * 0.06, yPos - laneWidth * 0.06, laneWidth * 0.07, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fill();
                ctx.shadowBlur = 0; // 確実にリセット
            }
        });

        // Shockwaves
        for (let i = state.shockwaves.length - 1; i >= 0; i--) {
            const s = state.shockwaves[i];
            if (!state.isPaused) s.life -= 0.045;
            if (s.life <= 0) { state.shockwaves.splice(i, 1); continue; }
            const r  = (1 - s.life) * 75;
            const r2 = (1 - s.life) * 120;
            ctx.beginPath(); ctx.arc(s.x, s.y, r2, 0, Math.PI * 2);
            ctx.strokeStyle = s.color; ctx.lineWidth = 1.5;
            ctx.globalAlpha = s.life * 0.4;
            if (state.visualQuality === 'high') { // ★分岐を追加
                ctx.shadowBlur  = 8; ctx.shadowColor = s.color; 
            }
            ctx.stroke();
            ctx.beginPath(); ctx.arc(s.x, s.y, r,  0, Math.PI * 2);
            ctx.lineWidth   = 2.5; ctx.globalAlpha = s.life * 0.8;
            if (state.visualQuality === 'high') { // ★分岐を追加
                ctx.shadowBlur  = 15; 
            }
            ctx.stroke();
            ctx.globalAlpha = 1; ctx.shadowBlur = 0;
        }
    }

    // ── Particles (always) ──
    for (let i = state.particles.length - 1; i >= 0; i--) {
        const p = state.particles[i];
        if (!state.isPaused) { p.x += p.vx; p.y += p.vy; p.vy += 0.22; p.life -= 0.028; }
        if (p.life <= 0) { state.particles.splice(i, 1); continue; }
        ctx.globalAlpha = p.life;
        ctx.fillStyle   = p.color;
        if (state.visualQuality === 'high') { // ★分岐を追加
            ctx.shadowBlur  = 10; ctx.shadowColor = p.color;
        }
        ctx.beginPath(); ctx.arc(p.x, p.y, (p.size || 4) * p.life, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    }

    requestAnimationFrame(gameLoop);
}
