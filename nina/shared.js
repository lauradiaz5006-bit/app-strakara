// Espace Nina — logique partagée (Supabase, chronomètre, encouragements, chat IA)

const SUPABASE_URL = "https://dsckgwjbserojugrhzpp.supabase.co";
const SUPABASE_KEY = "sb_publishable_9GnhFXe4GzRg4-xl-EE5lw__DeRpjoa";
const TUTOR_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/nina-tutor`;

// ---------- Supabase REST helpers ----------
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

async function logSession(theme, dureeSecondes, bonnesReponses, totalQuestions, matiere = "maths") {
  return sbInsert("nina_sessions", {
    matiere,
    theme,
    duree_secondes: Math.round(dureeSecondes),
    bonnes_reponses: bonnesReponses,
    total_questions: totalQuestions,
  });
}

async function logNote(note, objectif, commentaire, matiere = "maths") {
  return sbInsert("nina_notes", { matiere, note, objectif, commentaire });
}

async function getSessions(matiere = null) {
  return sbSelect("nina_sessions", matiere
    ? `matiere=eq.${matiere}&order=created_at.desc&limit=100`
    : `order=created_at.desc&limit=200`);
}

async function getNotes(matiere = "maths") {
  return sbSelect("nina_notes", `matiere=eq.${matiere}&order=created_at.desc&limit=50`);
}

// ---------- Chronomètre ----------
class Chrono {
  constructor(displayEl) {
    this.displayEl = displayEl;
    this.seconds = 0;
    this.timer = null;
  }
  start() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.seconds++;
      this._render();
    }, 1000);
  }
  stop() {
    clearInterval(this.timer);
    this.timer = null;
  }
  reset() {
    this.stop();
    this.seconds = 0;
    this._render();
  }
  _render() {
    if (!this.displayEl) return;
    const m = Math.floor(this.seconds / 60).toString().padStart(2, "0");
    const s = (this.seconds % 60).toString().padStart(2, "0");
    this.displayEl.textContent = `${m}:${s}`;
  }
}

// ---------- Encouragements ----------
const ENCOURAGEMENTS_BONNES = [
  "Nickel, continue comme ça !",
  "Exactement ça — tu progresses vraiment.",
  "Bien joué, tu as pris la bonne méthode.",
  "Parfait, c'est tout bon.",
  "Super, tu maîtrises ce point.",
  "Impeccable, on sent que tu t'es entraînée.",
];

const ENCOURAGEMENTS_RATEES = [
  "Pas grave, on regarde pourquoi ensemble et tu vas y arriver.",
  "C'est une erreur fréquente, pas un problème de niveau — on reprend le raisonnement.",
  "Presque ! Regarde l'explication et retente une question comme celle-ci.",
  "Normal de bloquer là, c'est un point technique. On décortique.",
  "Ce n'est pas réussi mais c'est en comprenant l'erreur qu'on progresse le plus vite.",
];

function randomFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function encouragementBonne() {
  return randomFrom(ENCOURAGEMENTS_BONNES);
}

function encouragementRatee() {
  return randomFrom(ENCOURAGEMENTS_RATEES);
}

// ---------- Copier pour une IA externe ----------
function copyForAI(lessonTitle, lessonText, question, matiere = "maths") {
  const prompt = `Je suis en Terminale Bac Pro ERA, j'ai du mal avec ce point de ${matiere} : "${lessonTitle}".\n\nVoici le cours :\n${lessonText}\n\nMa question / ce qui me bloque : ${question || "(explique-moi ce point autrement, avec un exemple très simple)"}`;
  navigator.clipboard?.writeText(prompt).then(
    () => alert("Copié ! Colle ça dans Claude ou ChatGPT."),
    () => alert("Impossible de copier automatiquement — sélectionne le texte du cours à la main."),
  );
}

// ---------- Chat IA intégré ----------
let _aiChatSendFn = null;

function initAIChat(getLessonContext) {
  const history = [];
  const widget = document.createElement("div");
  widget.id = "ai-tutor-widget";
  widget.innerHTML = `
    <button id="ai-tutor-toggle" aria-label="Poser une question à l'IA">💬 Besoin d'aide ?</button>
    <div id="ai-tutor-panel" class="hidden">
      <div id="ai-tutor-header">Ton prof IA <button id="ai-tutor-close">✕</button></div>
      <div id="ai-tutor-messages"></div>
      <form id="ai-tutor-form">
        <input id="ai-tutor-input" type="text" placeholder="Pose ta question..." autocomplete="off" />
        <button type="submit">Envoyer</button>
      </form>
    </div>`;
  document.body.appendChild(widget);

  const panel = widget.querySelector("#ai-tutor-panel");
  const toggle = widget.querySelector("#ai-tutor-toggle");
  const closeBtn = widget.querySelector("#ai-tutor-close");
  const messagesEl = widget.querySelector("#ai-tutor-messages");
  const form = widget.querySelector("#ai-tutor-form");
  const input = widget.querySelector("#ai-tutor-input");

  toggle.addEventListener("click", () => panel.classList.toggle("hidden"));
  closeBtn.addEventListener("click", () => panel.classList.add("hidden"));

  _aiChatSendFn = (text) => {
    panel.classList.remove("hidden");
    input.value = text;
    form.dispatchEvent(new Event("submit", { cancelable: true }));
  };

  function addMessage(role, text) {
    const div = document.createElement("div");
    div.className = `ai-msg ai-msg-${role}`;
    div.textContent = text;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const message = input.value.trim();
    if (!message) return;
    input.value = "";
    addMessage("user", message);
    history.push({ role: "user", content: message });
    const thinking = document.createElement("div");
    thinking.className = "ai-msg ai-msg-assistant ai-msg-thinking";
    thinking.textContent = "...";
    messagesEl.appendChild(thinking);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    try {
      const res = await fetch(TUTOR_FUNCTION_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          lessonContext: getLessonContext ? getLessonContext() : null,
          history,
        }),
      });
      const data = await res.json();
      thinking.remove();
      const reply = data.reply || "Désolée, petit souci technique. Réessaie dans un instant.";
      addMessage("assistant", reply);
      history.push({ role: "assistant", content: reply });
    } catch (err) {
      thinking.remove();
      addMessage("assistant", "Connexion impossible pour l'instant. Réessaie dans un instant.");
    }
  });
}

function askAI(question) {
  if (_aiChatSendFn) _aiChatSendFn(question);
}

// ---------- Exercice multi-questions façon annale (contexte + a) b) c) ) ----------
function parseUserNumberShared(str) {
  if (!str) return NaN;
  return parseFloat(str.toString().replace(",", "."));
}
function closeEnoughShared(a, b, tol = 0.05) {
  return Math.abs(a - b) <= tol;
}

function renderMultiPartExercise(container, ex, onFinish) {
  container.innerHTML = `
    <div class="exercise">
      <p style="font-size:0.85rem; color:var(--prune-doux, #8E6383); margin-top:0;">Durée conseillée : ${ex.dureeConseillee || "10 min"}</p>
      <div class="question">${ex.contexte}</div>
      ${ex.parts.map((p, i) => `
        <div style="margin:14px 0;">
          <p style="margin-bottom:6px;"><strong>${String.fromCharCode(97 + i)})</strong> ${p.question}</p>
          <input ${p.isText ? 'type="text"' : 'type="number" step="any"'} id="mp-answer-${i}" placeholder="Ta réponse" />
        </div>
      `).join("")}
      <button class="primary" id="mp-check-btn">Vérifier toutes mes réponses</button>
      <div id="mp-feedback"></div>
    </div>`;

  container.querySelector("#mp-check-btn").addEventListener("click", () => {
    let correctCount = 0;
    const feedbackHtml = ex.parts.map((p, i) => {
      const input = container.querySelector(`#mp-answer-${i}`);
      let correct;
      if (p.isText) {
        correct = input.value.trim().toLowerCase() === p.expected;
      } else {
        correct = closeEnoughShared(parseUserNumberShared(input.value), p.expected);
      }
      if (correct) correctCount++;
      input.disabled = true;
      return `<p class="feedback ${correct ? "ok" : "ko"}" style="margin:8px 0;"><strong>${String.fromCharCode(97 + i)}) ${correct ? "✓" : "✗"}</strong> ${p.explanation}</p>`;
    }).join("");
    container.querySelector("#mp-check-btn").disabled = true;
    const fb = container.querySelector("#mp-feedback");
    fb.innerHTML = `<p style="font-weight:700;">${correctCount}/${ex.parts.length} — ${correctCount === ex.parts.length ? encouragementBonne() : encouragementRatee()}</p>` + feedbackHtml +
      `<br><a href="#" onclick="askAI('Je ne comprends pas cet exercice type bac : ${ex.contexte.replace(/"/g, "'").replace(/'/g, "\\'")}'); return false;">Pas clair ? Demander à l'IA</a>`;
    onFinish(correctCount, ex.parts.length);
  });
}
