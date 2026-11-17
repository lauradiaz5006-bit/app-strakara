// Espace Cassie — logique partagée (Supabase, étoiles, confettis)

const SUPABASE_URL = "https://dsckgwjbserojugrhzpp.supabase.co";
const SUPABASE_KEY = "sb_publishable_9GnhFXe4GzRg4-xl-EE5lw__DeRpjoa";

async function sbInsert(table, row) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: "POST",
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        "Prefer": "return=representation",
      },
      body: JSON.stringify(row),
    });
    if (!res.ok) throw new Error(await res.text());
    return await res.json();
  } catch (e) {
    console.warn("sbInsert a échoué", e);
    return null;
  }
}

async function sbSelect(table, query = "") {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`,
      },
    });
    if (!res.ok) throw new Error(await res.text());
    return await res.json();
  } catch (e) {
    console.warn("sbSelect a échoué", e);
    return [];
  }
}

async function logCassieSession(jeu, dureeSecondes, bonnesReponses, totalQuestions) {
  return sbInsert("cassie_sessions", {
    jeu,
    duree_secondes: Math.round(dureeSecondes),
    bonnes_reponses: bonnesReponses,
    total_questions: totalQuestions,
  });
}

async function getCassieSessions(limit = 200) {
  return sbSelect("cassie_sessions", `order=created_at.desc&limit=${limit}`);
}

// Étoiles : 1 étoile par session où au moins 70% de bonnes réponses, 2 étoiles si 100%.
function starsForSession(bonnes, total) {
  if (total === 0) return 0;
  const ratio = bonnes / total;
  if (ratio >= 1) return 2;
  if (ratio >= 0.7) return 1;
  return 0;
}

async function getTotalStars() {
  const sessions = await getCassieSessions();
  return sessions.reduce((sum, s) => sum + starsForSession(s.bonnes_reponses, s.total_questions), 0);
}

async function getTodayMinutes() {
  const sessions = await getCassieSessions();
  const today = new Date().toDateString();
  const todaySessions = sessions.filter(s => new Date(s.created_at).toDateString() === today);
  const totalSec = todaySessions.reduce((sum, s) => sum + (s.duree_secondes || 0), 0);
  return Math.round(totalSec / 60);
}

// ---------- Confettis / bravo ----------
function triggerConfetti() {
  const colors = ["#FFD93D", "#6BCB77", "#4D96FF", "#FF6B6B", "#FF9F45"];
  for (let i = 0; i < 24; i++) {
    const piece = document.createElement("div");
    piece.className = "confetti-piece";
    piece.style.left = Math.random() * 100 + "vw";
    piece.style.background = colors[Math.floor(Math.random() * colors.length)];
    piece.style.animationDelay = (Math.random() * 0.3) + "s";
    piece.style.transform = `rotate(${Math.random() * 360}deg)`;
    document.body.appendChild(piece);
    setTimeout(() => piece.remove(), 1800);
  }
}

function playSuccessSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const notes = [523.25, 659.25, 783.99]; // Do-Mi-Sol
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      osc.type = "sine";
      gain.gain.setValueAtTime(0.15, ctx.currentTime + i * 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.1 + 0.3);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.1);
      osc.stop(ctx.currentTime + i * 0.1 + 0.3);
    });
  } catch (e) { /* silence si audio indisponible */ }
}

// ---------- Utilitaires jeux ----------
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Génère 3 réponses fausses plausibles autour de la bonne réponse (pour QCM)
function fakeAnswersAround(correct, min = 0, max = 200) {
  const set = new Set([correct]);
  while (set.size < 4) {
    const delta = randInt(-6, 6);
    const candidate = correct + delta;
    if (candidate !== correct && candidate >= min && candidate <= max) set.add(candidate);
  }
  return shuffle([...set]);
}

// ---------- Moteur de jeu générique (QCM) ----------
// generateQuestion() doit renvoyer { text, correct, options } où options contient
// 4 valeurs (dont correct), déjà mélangées.
function runQuizGame(rootEl, jeuNom, generateQuestion, totalQuestions = 8) {
  let index = 0;
  let bonnesReponses = 0;
  const results = []; // true/false par question
  const startTime = Date.now();

  function renderDots() {
    const dots = Array.from({ length: totalQuestions }, (_, i) => {
      let cls = "progress-dot";
      if (results[i] === true) cls += " done-ok";
      else if (results[i] === false) cls += " done-ko";
      else if (i === index) cls += " current";
      return `<div class="${cls}"></div>`;
    }).join("");
    return `<div class="progress-row">${dots}</div>`;
  }

  function renderQuestion() {
    const q = generateQuestion();
    rootEl.innerHTML = `
      ${renderDots()}
      <div class="question-card">
        <p class="question-text">${q.text}</p>
        <div class="answers-grid">
          ${q.options.map((opt, i) => `<button class="answer-btn" data-i="${i}">${opt}</button>`).join("")}
        </div>
      </div>
    `;
    rootEl.querySelectorAll(".answer-btn").forEach((btn, i) => {
      btn.addEventListener("click", () => handleAnswer(q, i, btn));
    });
  }

  function handleAnswer(q, i, btn) {
    rootEl.querySelectorAll(".answer-btn").forEach(b => b.disabled = true);
    const chosen = q.options[i];
    const isCorrect = chosen === q.correct;
    btn.classList.add(isCorrect ? "correct" : "incorrect");
    if (!isCorrect) {
      rootEl.querySelectorAll(".answer-btn").forEach(b => {
        if (b.textContent == q.correct) b.classList.add("correct");
      });
    }
    if (isCorrect) {
      bonnesReponses++;
      playSuccessSound();
      triggerConfetti();
    }
    results[index] = isCorrect;
    index++;
    setTimeout(() => {
      if (index < totalQuestions) {
        renderQuestion();
      } else {
        finish();
      }
    }, isCorrect ? 800 : 1400);
  }

  async function finish() {
    const dureeSecondes = (Date.now() - startTime) / 1000;
    const stars = starsForSession(bonnesReponses, totalQuestions);
    await logCassieSession(jeuNom, dureeSecondes, bonnesReponses, totalQuestions);
    const starsDisplay = "⭐".repeat(stars) || "💪";
    let message;
    if (bonnesReponses === totalQuestions) message = "Parfait ! Tu as tout bon !";
    else if (bonnesReponses >= totalQuestions * 0.7) message = "Super travail, continue comme ça !";
    else message = "Bien joué d'avoir essayé, on retente ?";
    rootEl.innerHTML = `
      <div class="bravo-screen">
        <h2>${message}</h2>
        <div class="stars">${starsDisplay}</div>
        <p style="font-size:1.2rem; font-weight:700;">${bonnesReponses} / ${totalQuestions} bonnes réponses</p>
        <button class="btn-gros" onclick="location.reload()">Rejouer</button>
        <br/><a class="back-link" href="index.html">← Retour à l'accueil</a>
      </div>
    `;
  }

  renderQuestion();
}
