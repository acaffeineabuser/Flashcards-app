// ---------- Storage ----------
const STORAGE_KEY = "flashcards-data-v1";

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function defaultData() {
  const id = uid();
  return { currentDeckId: id, decks: [{ id: id, name: "My first deck", cards: [] }] };
}

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.decks) && parsed.decks.length > 0) {
        if (!parsed.decks.some(function (d) { return d.id === parsed.currentDeckId; })) {
          parsed.currentDeckId = parsed.decks[0].id;
        }
        return parsed;
      }
    }
  } catch (e) {
    // fall through to default
  }
  return defaultData();
}

function saveData() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    alert("Could not save. Your browser may be blocking storage.");
  }
}

// ---------- State ----------
let data = loadData();
let queue = [];          // card ids still to study this round
let sessionTotal = 0;
let showingBack = false;
let editingId = null;

function currentDeck() {
  return data.decks.find(function (d) { return d.id === data.currentDeckId; }) || data.decks[0];
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = a[i]; a[i] = a[j]; a[j] = tmp;
  }
  return a;
}

// ---------- Elements ----------
const $ = function (id) { return document.getElementById(id); };

const deckSelect = $("deckSelect");
const studyView = $("studyView");
const manageView = $("manageView");
const cardEl = $("card");
const cardLabel = $("cardLabel");
const cardText = $("cardText");
const progressEl = $("progress");
const flipBtn = $("flipBtn");
const againBtn = $("againBtn");
const gotItBtn = $("gotItBtn");

// ---------- Decks ----------
function renderDecks() {
  deckSelect.innerHTML = "";
  data.decks.forEach(function (deck) {
    const opt = document.createElement("option");
    opt.value = deck.id;
    opt.textContent = deck.name + " (" + deck.cards.length + ")";
    if (deck.id === data.currentDeckId) opt.selected = true;
    deckSelect.appendChild(opt);
  });
}

deckSelect.addEventListener("change", function () {
  data.currentDeckId = deckSelect.value;
  saveData();
  cancelEdit();
  startSession();
  renderManage();
});

$("newDeckBtn").addEventListener("click", function () {
  const name = prompt("Name for the new deck:");
  if (!name || !name.trim()) return;
  const deck = { id: uid(), name: name.trim(), cards: [] };
  data.decks.push(deck);
  data.currentDeckId = deck.id;
  saveData();
  cancelEdit();
  renderDecks();
  startSession();
  renderManage();
});

$("renameDeckBtn").addEventListener("click", function () {
  const deck = currentDeck();
  const name = prompt("Rename deck:", deck.name);
  if (!name || !name.trim()) return;
  deck.name = name.trim();
  saveData();
  renderDecks();
});

$("deleteDeckBtn").addEventListener("click", function () {
  const deck = currentDeck();
  if (!confirm('Delete the deck "' + deck.name + '" and all its cards?')) return;
  data.decks = data.decks.filter(function (d) { return d.id !== deck.id; });
  if (data.decks.length === 0) {
    data = defaultData();
  } else {
    data.currentDeckId = data.decks[0].id;
  }
  saveData();
  cancelEdit();
  renderDecks();
  startSession();
  renderManage();
});

// ---------- Tabs ----------
function showTab(name) {
  const study = name === "study";
  studyView.classList.toggle("hidden", !study);
  manageView.classList.toggle("hidden", study);
  $("tabStudy").classList.toggle("active", study);
  $("tabManage").classList.toggle("active", !study);
}

$("tabStudy").addEventListener("click", function () { showTab("study"); });
$("tabManage").addEventListener("click", function () { showTab("manage"); });

// ---------- Study ----------
function startSession() {
  const ids = currentDeck().cards.map(function (c) { return c.id; });
  queue = $("shuffleBox").checked ? shuffle(ids) : ids;
  sessionTotal = queue.length;
  showingBack = false;
  renderStudy();
}

function currentCard() {
  if (queue.length === 0) return null;
  return currentDeck().cards.find(function (c) { return c.id === queue[0]; }) || null;
}

function renderStudy() {
  const deck = currentDeck();
  const card = currentCard();

  againBtn.classList.add("hidden");
  gotItBtn.classList.add("hidden");
  flipBtn.classList.remove("hidden");

  if (deck.cards.length === 0) {
    progressEl.textContent = "";
    cardLabel.textContent = "";
    cardText.textContent = "This deck has no cards yet. Open the Cards tab to add some.";
    flipBtn.classList.add("hidden");
    return;
  }

  if (!card) {
    progressEl.textContent = "Round complete";
    cardLabel.textContent = "";
    cardText.textContent = "All done! Press Restart to go through the deck again.";
    flipBtn.classList.add("hidden");
    return;
  }

  const done = sessionTotal - queue.length;
  progressEl.textContent = "Remaining: " + queue.length + " (mastered this round: " + Math.max(done, 0) + ")";
  cardLabel.textContent = showingBack ? "Back" : "Front";
  cardText.textContent = showingBack ? card.back : card.front;

  if (showingBack) {
    flipBtn.classList.add("hidden");
    againBtn.classList.remove("hidden");
    gotItBtn.classList.remove("hidden");
  }
}

function flip() {
  if (!currentCard()) return;
  showingBack = !showingBack;
  renderStudy();
}

function answer(gotIt) {
  if (!currentCard() || !showingBack) return;
  const id = queue.shift();
  if (!gotIt) queue.push(id);   // missed cards come back at the end
  showingBack = false;
  renderStudy();
}

cardEl.addEventListener("click", flip);
flipBtn.addEventListener("click", flip);
againBtn.addEventListener("click", function () { answer(false); });
gotItBtn.addEventListener("click", function () { answer(true); });
$("restartBtn").addEventListener("click", startSession);
$("shuffleBox").addEventListener("change", startSession);

document.addEventListener("keydown", function (e) {
  const tag = (e.target.tagName || "").toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return;
  if (studyView.classList.contains("hidden")) return;

  if (e.key === " ") {
    e.preventDefault();
    flip();
  } else if (e.key === "ArrowRight") {
    answer(true);
  } else if (e.key === "ArrowLeft") {
    answer(false);
  }
});

// ---------- Manage cards ----------
const cardForm = $("cardForm");
const frontInput = $("frontInput");
const backInput = $("backInput");

function renderManage() {
  const deck = currentDeck();
  $("cardCount").textContent = deck.cards.length + (deck.cards.length === 1 ? " card" : " cards");

  const list = $("cardList");
  list.innerHTML = "";

  deck.cards.forEach(function (card) {
    const li = document.createElement("li");

    const texts = document.createElement("div");
    texts.className = "texts";
    const front = document.createElement("div");
    front.className = "front-text";
    front.textContent = card.front;
    const back = document.createElement("div");
    back.className = "back-text";
    back.textContent = card.back;
    texts.appendChild(front);
    texts.appendChild(back);

    const actions = document.createElement("div");
    actions.className = "actions";

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.textContent = "Edit";
    editBtn.addEventListener("click", function () { startEdit(card.id); });

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "danger";
    delBtn.textContent = "Delete";
    delBtn.addEventListener("click", function () { deleteCard(card.id); });

    actions.appendChild(editBtn);
    actions.appendChild(delBtn);
    li.appendChild(texts);
    li.appendChild(actions);
    list.appendChild(li);
  });
}

function startEdit(id) {
  const card = currentDeck().cards.find(function (c) { return c.id === id; });
  if (!card) return;
  editingId = id;
  frontInput.value = card.front;
  backInput.value = card.back;
  $("saveCardBtn").textContent = "Save changes";
  $("cancelEditBtn").classList.remove("hidden");
  frontInput.focus();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function cancelEdit() {
  editingId = null;
  cardForm.reset();
  $("saveCardBtn").textContent = "Add card";
  $("cancelEditBtn").classList.add("hidden");
}

function deleteCard(id) {
  if (!confirm("Delete this card?")) return;
  const deck = currentDeck();
  deck.cards = deck.cards.filter(function (c) { return c.id !== id; });
  if (editingId === id) cancelEdit();
  saveData();
  renderDecks();
  renderManage();
  startSession();
}

cardForm.addEventListener("submit", function (e) {
  e.preventDefault();
  const front = frontInput.value.trim();
  const back = backInput.value.trim();
  if (!front || !back) return;

  const deck = currentDeck();
  if (editingId) {
    const card = deck.cards.find(function (c) { return c.id === editingId; });
    if (card) { card.front = front; card.back = back; }
  } else {
    deck.cards.push({ id: uid(), front: front, back: back });
  }

  saveData();
  cancelEdit();
  renderDecks();
  renderManage();
  startSession();
  frontInput.focus();
});

$("cancelEditBtn").addEventListener("click", cancelEdit);

// ---------- Backup ----------
$("exportBtn").addEventListener("click", function () {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "flashcards-backup.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});

$("importBtn").addEventListener("click", function () { $("importFile").click(); });

$("importFile").addEventListener("change", function (e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function () {
    try {
      const parsed = JSON.parse(reader.result);
      const valid = parsed && Array.isArray(parsed.decks) && parsed.decks.length > 0 &&
        parsed.decks.every(function (d) {
          return d && typeof d.id === "string" && typeof d.name === "string" && Array.isArray(d.cards) &&
            d.cards.every(function (c) {
              return c && typeof c.id === "string" && typeof c.front === "string" && typeof c.back === "string";
            });
        });
      if (!valid) throw new Error("bad format");
      if (!confirm("This will replace all current decks and cards with the backup. Continue?")) return;

      if (!parsed.decks.some(function (d) { return d.id === parsed.currentDeckId; })) {
        parsed.currentDeckId = parsed.decks[0].id;
      }
      data = parsed;
      saveData();
      cancelEdit();
      renderDecks();
      renderManage();
      startSession();
    } catch (err) {
      alert("That file doesn't look like a valid flashcards backup.");
    }
  };
  reader.readAsText(file);
  e.target.value = "";
});

// ---------- Init ----------
renderDecks();
renderManage();
startSession();
