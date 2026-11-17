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
  "Nickel, t'as tout bon ! 🔥 Continue comme ça.",
  "Exactement ça — tu progresses vraiment, ça se voit.",
  "Bien joué, t'as pris la bonne méthode du premier coup.",
  "Parfait, c'est tout bon ✨",
  "Super, ce point-là tu le maîtrises carrément.",
  "Impeccable, on sent que tu t'es entraînée. Fière de toi.",
  "Oui ! C'est ça. Tu gères plus que tu ne le crois.",
];

const ENCOURAGEMENTS_RATEES = [
  "Pas grave du tout, on regarde pourquoi ensemble et tu vas y arriver.",
  "C'est une erreur super fréquente, pas un problème de niveau — on reprend le raisonnement.",
  "Presque ! Regarde l'explication et retente une question comme celle-ci, tu vas la choper.",
  "Normal de bloquer là, c'est un point technique. On décortique ensemble.",
  "Ce n'est pas réussi, mais c'est en comprenant l'erreur qu'on progresse le plus vite. Promis.",
  "Pas la bonne réponse, mais le raisonnement n'est pas loin. On y retourne ?",
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

// ---------- Points d'expérience (XP) ----------
function computeXP(sessions) {
  // 10 XP par bonne réponse, +25 XP bonus pour chaque quiz final passé
  let xp = 0;
  sessions.forEach(s => {
    xp += (s.bonnes_reponses || 0) * 10;
    if (s.theme && s.theme.startsWith("Quiz final")) xp += 25;
  });
  return xp;
}

function xpLevel(xp) {
  // Palier simple : niveau = racine, pour une progression qui ralentit un peu
  const level = Math.max(1, Math.floor(Math.sqrt(xp / 50)) + 1);
  const xpForNext = 50 * Math.pow(level, 2);
  return { level, xpForNext };
}

// ---------- Petite animation de validation (feedback immédiat) ----------
function triggerSuccessAnimation() {
  const el = document.createElement("div");
  el.className = "success-burst";
  el.textContent = "✨";
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 900);
}

// ---------- Série de jours (streak non punitif, un jour de grâce) ----------
function computeStreak(sessions) {
  const activeDays = new Set(sessions.map(s => new Date(s.created_at).toDateString()));
  const todayStr = new Date().toDateString();
  let streak = 0, graceUsed = false;
  const cursor = new Date();
  while (true) {
    const dayStr = cursor.toDateString();
    if (activeDays.has(dayStr)) {
      streak++;
    } else if (dayStr === todayStr) {
      // journée pas encore faite : on ne casse rien, on regarde juste hier
    } else if (!graceUsed) {
      graceUsed = true; // un jour sauté toléré, la série continue sans compter ce jour-là
    } else {
      break;
    }
    cursor.setDate(cursor.getDate() - 1);
  }
  return { streak, graceUsed };
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
    if (correctCount === ex.parts.length) triggerSuccessAnimation();
    container.querySelector("#mp-check-btn").disabled = true;
    const fb = container.querySelector("#mp-feedback");
    fb.innerHTML = `<p style="font-weight:700;">${correctCount}/${ex.parts.length} — ${correctCount === ex.parts.length ? encouragementBonne() : encouragementRatee()}</p>` + feedbackHtml +
      `<br><a href="#" onclick="askAI('Je ne comprends pas cet exercice type bac : ${ex.contexte.replace(/"/g, "'").replace(/'/g, "\\'")}'); return false;">Pas clair ? Demander à l'IA</a>`;
    onFinish(correctCount, ex.parts.length);
  });
}

// ---------- Pensée du jour (citation) et phrase clé personnelle ----------
// Citations bibliques (Nouveau Testament, traduction Segond 1910, domaine public)
// et pensées inspirantes originales — change une fois par jour, pas à chaque page.
const CITATIONS_DU_JOUR = [
  { texte: "Je puis tout par celui qui me fortifie.", source: "Philippiens 4:13" },
  { texte: "Que votre cœur ne se trouble point. Croyez en Dieu, et croyez en moi.", source: "Jean 14:1" },
  { texte: "L'amour est patient, il est plein de bonté ; l'amour n'est point envieux.", source: "1 Corinthiens 13:4" },
  { texte: "Ne vous inquiétez de rien ; en toute chose, faites connaître vos besoins par la prière.", source: "Philippiens 4:6" },
  { texte: "Tout est possible à celui qui croit.", source: "Marc 9:23" },
  { texte: "La foi, c'est la ferme assurance des choses qu'on espère.", source: "Hébreux 11:1" },
  { texte: "Demandez, et vous recevrez, afin que votre joie soit parfaite.", source: "Jean 16:24" },
  { texte: "Que personne ne méprise ta jeunesse ; mais sois un modèle pour les fidèles.", source: "1 Timothée 4:12" },
  { texte: "Fortifiez-vous et ayez du courage.", source: "Deutéronome 31:6" },
  { texte: "Chaque jour porte en lui une graine que seul ton effort fait grandir.", source: "pensée du jour" },
  { texte: "Le travail bien fait ne crie jamais, il se voit simplement, plus tard, dans ce qui tient debout.", source: "pensée du jour" },
  { texte: "On ne devient pas patient en attendant que ça devienne facile, mais en continuant pendant que c'est encore difficile.", source: "pensée du jour" },
  { texte: "Ce que tu apprends aujourd'hui, tu ne l'apprends plus jamais à zéro demain.", source: "pensée du jour" },
  { texte: "Avancer un peu chaque jour vaut mieux que tout vouloir d'un coup.", source: "pensée du jour" },
];

// Phrases clés personnelles pour Nina — mantras du jour, liés à son métier et à son chemin.
const PHRASES_CLE_NINA = [
  "Répète-toi : j'aime ce métier, et je suis en train de devenir bonne dans ce métier.",
  "Je n'ai pas besoin d'être parfaite aujourd'hui, j'ai juste besoin d'avancer un peu.",
  "Chaque exercice raté m'apprend quelque chose que je n'aurais pas appris sinon.",
  "Je travaille pour la Nina de l'année prochaine, celle qui aura son bac.",
  "Je suis capable de comprendre ça, même si ça prend du temps.",
  "Mon métier a de la valeur, et moi aussi.",
  "Je n'ai pas à me comparer : je avance à mon rythme, et c'est le bon rythme pour moi.",
  "Aujourd'hui, je fais un petit pas. Demain, j'en ferai un autre.",
  "Je suis fière du chemin déjà parcouru, même quand je ne le vois pas encore.",
  "Pourquoi je fais ça ? Parce que j'aime ce métier et que je mérite de réussir.",
];

function dayOfYearSeed() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const diff = now - start;
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function pickDaily(arr, offset = 0) {
  return arr[(dayOfYearSeed() + offset) % arr.length];
}

function renderPenseeDuJour(elId) {
  const el = document.getElementById(elId);
  if (!el) return;
  const c = pickDaily(CITATIONS_DU_JOUR);
  el.innerHTML = `<p class="citation-texte">« ${c.texte} »</p><p class="citation-source">— ${c.source}</p>`;
}

function renderPhraseCle(elId) {
  const el = document.getElementById(elId);
  if (!el) return;
  const p = pickDaily(PHRASES_CLE_NINA, 7); // décalage pour ne pas tomber sur le même index que la citation
  el.textContent = p;
}

// ---------- Lien de recherche YouTube (toujours valide, pas de lien fabriqué) ----------
function youtubeSearchLink(query) {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
}
