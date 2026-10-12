// ---------- Storage ----------
const STORAGE_KEY = "flashcards-data-v2";
const OLD_STORAGE_KEY = "flashcards-data-v1"; // before folders existed

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function defaultData() {
  const deckId = uid();
  return {
    version: 2,
    currentDeckId: deckId,
    folders: [
      {
        id: uid(),
        name: "My folder",
        collapsed: false,
        decks: [{ id: deckId, name: "My first deck", cards: [] }]
      }
    ]
  };
}

function validDeck(d) {
  return !!d && typeof d.id === "string" && typeof d.name === "string" && Array.isArray(d.cards) &&
    d.cards.every(function (c) {
      return !!c && typeof c.id === "string" && typeof c.front === "string" && typeof c.back === "string";
    });
}

// Accepts the current format, or the older format (decks with no folders),
// and returns valid current-format data. Returns null if the input is unusable.
function normalizeData(parsed) {
  if (!parsed || typeof parsed !== "object") return null;

  if (Array.isArray(parsed.folders)) {
    const ok = parsed.folders.every(function (f) {
      return !!f && typeof f.id === "string" && typeof f.name === "string" &&
        Array.isArray(f.decks) && f.decks.every(validDeck);
    });
    if (!ok) return null;
    return {
      version: 2,
      currentDeckId: typeof parsed.currentDeckId === "string" ? parsed.currentDeckId : null,
      folders: parsed.folders.map(function (f) {
        return { id: f.id, name: f.name, collapsed: !!f.collapsed, decks: f.decks };
      })
    };
  }

  if (Array.isArray(parsed.decks) && parsed.decks.every(validDeck)) {
    return {
      version: 2,
      currentDeckId: typeof parsed.currentDeckId === "string" ? parsed.currentDeckId : null,
      folders: [{ id: uid(), name: "My decks", collapsed: false, decks: parsed.decks }]
    };
  }

  return null;
}

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const current = normalizeData(JSON.parse(raw));
      if (current) return current;
    }
    // First visit since folders were added: move saved decks into a folder.
    const old = localStorage.getItem(OLD_STORAGE_KEY);
    if (old) {
      const migrated = normalizeData(JSON.parse(old));
      if (migrated) return migrated;
    }
  } catch (e) {
    // fall through to the default
  }
  return defaultData();
}

let warnedAboutStorage = false;

function saveData() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    if (!warnedAboutStorage) {
      warnedAboutStorage = true;
      alert("Could not save. Your browser may be blocking storage.");
    }
  }
}

// ---------- State ----------
let data = loadData();
let queue = [];          // card ids still to study this round
let sessionTotal = 0;
let showingBack = false;
let editingId = null;
let emptyAction = null;

function findDeck(id) {
  for (let i = 0; i < data.folders.length; i++) {
    const folder = data.folders[i];
    for (let j = 0; j < folder.decks.length; j++) {
      if (folder.decks[j].id === id) return { folder: folder, deck: folder.decks[j] };
    }
  }
  return null;
}

function currentDeck() {
  const found = findDeck(data.currentDeckId);
  return found ? found.deck : null;
}

// Make sure a real deck is selected whenever one exists.
function ensureCurrent() {
  if (findDeck(data.currentDeckId)) return;
  data.currentDeckId = null;
  for (let i = 0; i < data.folders.length; i++) {
    if (data.folders[i].decks.length > 0) {
      data.currentDeckId = data.folders[i].decks[0].id;
      return;
    }
  }
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = a[i]; a[i] = a[j]; a[j] = tmp;
  }
  return a;
}

ensureCurrent();

// ---------- Elements ----------
const $ = function (id) { return document.getElementById(id); };

const sidebarEl = $("sidebar");
const scrimEl = $("scrim");
const folderTree = $("folderTree");
const deckTitle = $("deckTitle");
const moveSelect = $("moveSelect");
const deckView = $("deckView");
const emptyState = $("emptyState");
const studyView = $("studyView");
const manageView = $("manageView");
const cardEl = $("card");
const cardLabel = $("cardLabel");
const cardText = $("cardText");
const progressEl = $("progress");
const barFill = $("barFill");
const flipBtn = $("flipBtn");
const againBtn = $("againBtn");
const gotItBtn = $("gotItBtn");
const cardForm = $("cardForm");
const frontInput = $("frontInput");
const backInput = $("backInput");

const dialogEl = $("dialog");
const dialogForm = $("dialogForm");
const dialogTitle = $("dialogTitle");
const dialogMessage = $("dialogMessage");
const dialogInput = $("dialogInput");
const dialogOk = $("dialogOk");
const dialogCancel = $("dialogCancel");

// ---------- Icons (fixed markup, no user text) ----------
const ICONS = {
  chevron: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>',
  folder: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/></svg>',
  edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4z"/></svg>',
  trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/></svg>',
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>'
};

function iconSpan(className, svg) {
  const span = document.createElement("span");
  span.className = className;
  span.innerHTML = svg;
  return span;
}

function iconButton(icon, label, handler) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "icon-btn";
  btn.title = label;
  btn.setAttribute("aria-label", label);
  btn.innerHTML = ICONS[icon];
  btn.addEventListener("click", function (e) {
    e.stopPropagation();
    handler();
  });
  return btn;
}

// ---------- Dialog (naming and confirming) ----------
let dialogResolve = null;

// options: title, message, input (bool), value, placeholder, okLabel, danger, hideCancel
// Resolves with the typed text (input dialogs), true (confirm dialogs), or null if cancelled.
function openDialog(options) {
  return new Promise(function (resolve) {
    dialogResolve = resolve;
    dialogTitle.textContent = options.title;
    dialogMessage.textContent = options.message || "";
    dialogMessage.classList.toggle("hidden", !options.message);
    dialogInput.classList.toggle("hidden", !options.input);
    dialogInput.value = options.value || "";
    dialogInput.placeholder = options.placeholder || "";
    dialogOk.textContent = options.okLabel || "OK";
    dialogOk.classList.toggle("danger-solid", !!options.danger);
    dialogOk.classList.toggle("primary", !options.danger);
    dialogCancel.classList.toggle("hidden", !!options.hideCancel);
    dialogEl.showModal();
    if (options.input) {
      dialogInput.focus();
      dialogInput.select();
    }
  });
}

function closeDialog(result) {
  if (dialogEl.open) dialogEl.close();
  const resolve = dialogResolve;
  dialogResolve = null;
  if (resolve) resolve(result);
}

dialogForm.addEventListener("submit", function (e) {
  e.preventDefault();
  if (dialogInput.classList.contains("hidden")) {
    closeDialog(true);
    return;
  }
  const value = dialogInput.value.trim();
  if (!value) {
    dialogInput.focus();
    return;
  }
  closeDialog(value);
});

dialogCancel.addEventListener("click", function () { closeDialog(null); });

dialogEl.addEventListener("cancel", function (e) {
  e.preventDefault();
  closeDialog(null);
});

// ---------- Sidebar drawer (small screens) ----------
function openSidebar() {
  sidebarEl.classList.add("open");
  scrimEl.classList.add("show");
}

function closeSidebar() {
  sidebarEl.classList.remove("open");
  scrimEl.classList.remove("show");
}

$("menuBtn").addEventListener("click", openSidebar);
scrimEl.addEventListener("click", closeSidebar);

// ---------- Sidebar: folders and decks ----------
function renderSidebar() {
  const focused = document.activeElement;
  const focusKey = focused && focused.dataset ? focused.dataset.key : null;

  folderTree.innerHTML = "";

  if (data.folders.length === 0) {
    const p = document.createElement("p");
    p.className = "tree-empty";
    p.textContent = "No folders yet. Select New folder to create one.";
    folderTree.appendChild(p);
    return;
  }

  data.folders.forEach(function (folder) {
    const group = document.createElement("div");
    group.className = "folder";

    // Folder row
    const row = document.createElement("div");
    row.className = "row folder-row" + (folder.collapsed ? "" : " open");

    const main = document.createElement("button");
    main.type = "button";
    main.className = "row-main";
    main.dataset.key = "f:" + folder.id;
    main.setAttribute("aria-expanded", folder.collapsed ? "false" : "true");
    main.appendChild(iconSpan("chev", ICONS.chevron));
    main.appendChild(iconSpan("folder-ico", ICONS.folder));

    const name = document.createElement("span");
    name.className = "row-name";
    name.textContent = folder.name;
    main.appendChild(name);

    const count = document.createElement("span");
    count.className = "row-count";
    count.textContent = String(folder.decks.length);
    main.appendChild(count);

    const actions = document.createElement("div");
    actions.className = "row-actions";
    actions.appendChild(iconButton("edit", "Rename folder", function () { renameFolder(folder); }));
    actions.appendChild(iconButton("trash", "Delete folder", function () { deleteFolder(folder); }));

    row.appendChild(main);
    row.appendChild(actions);
    group.appendChild(row);

    // Decks in this folder
    const list = document.createElement("div");
    list.className = "deck-list" + (folder.collapsed ? " hidden" : "");

    folder.decks.forEach(function (deck) {
      const isActive = deck.id === data.currentDeckId;

      const drow = document.createElement("div");
      drow.className = "row deck-row" + (isActive ? " active" : "");

      const dmain = document.createElement("button");
      dmain.type = "button";
      dmain.className = "row-main";
      dmain.dataset.key = "d:" + deck.id;
      if (isActive) dmain.setAttribute("aria-current", "true");

      const dname = document.createElement("span");
      dname.className = "row-name";
      dname.textContent = deck.name;
      dmain.appendChild(dname);

      const dcount = document.createElement("span");
      dcount.className = "row-count";
      dcount.textContent = String(deck.cards.length);
      dmain.appendChild(dcount);

      dmain.addEventListener("click", function () { selectDeck(deck.id); });

      const dactions = document.createElement("div");
      dactions.className = "row-actions";
      dactions.appendChild(iconButton("edit", "Rename deck", function () { renameDeck(deck); }));
      dactions.appendChild(iconButton("trash", "Delete deck", function () { deleteDeck(folder, deck); }));

      drow.appendChild(dmain);
      drow.appendChild(dactions);
      list.appendChild(drow);
    });

    const add = document.createElement("button");
    add.type = "button";
    add.className = "add-deck";
    add.innerHTML = ICONS.plus;
    add.appendChild(document.createTextNode("Add deck"));
    add.addEventListener("click", function () { addDeck(folder); });
    list.appendChild(add);

    group.appendChild(list);

    // Expand or collapse without redrawing, so keyboard focus stays put
    main.addEventListener("click", function () {
      folder.collapsed = !folder.collapsed;
      row.classList.toggle("open", !folder.collapsed);
      main.setAttribute("aria-expanded", folder.collapsed ? "false" : "true");
      list.classList.toggle("hidden", folder.collapsed);
      saveData();
    });

    folderTree.appendChild(group);
  });

  if (focusKey) {
    const keyed = folderTree.querySelectorAll("[data-key]");
    for (let i = 0; i < keyed.length; i++) {
      if (keyed[i].dataset.key === focusKey) {
        keyed[i].focus();
        break;
      }
    }
  }
}

function selectDeck(id) {
  data.currentDeckId = id;
  saveData();
  cancelEdit();
  startSession();
  renderAll();
  closeSidebar();
}

async function newFolder() {
  const name = await openDialog({
    title: "New folder",
    input: true,
    placeholder: "Folder name",
    okLabel: "Create folder"
  });
  if (!name) return;
  data.folders.push({ id: uid(), name: name, collapsed: false, decks: [] });
  saveData();
  renderAll();
}

async function renameFolder(folder) {
  const name = await openDialog({
    title: "Rename folder",
    input: true,
    value: folder.name,
    okLabel: "Save"
  });
  if (!name) return;
  folder.name = name;
  saveData();
  renderAll();
}

async function deleteFolder(folder) {
  const n = folder.decks.length;
  const message = n === 0
    ? 'Delete the folder "' + folder.name + '"?'
    : 'Delete the folder "' + folder.name + '" and its ' + n + (n === 1 ? " deck" : " decks") + "? This can't be undone.";
  const ok = await openDialog({ title: "Delete folder?", message: message, okLabel: "Delete folder", danger: true });
  if (!ok) return;
  data.folders = data.folders.filter(function (f) { return f.id !== folder.id; });
  ensureCurrent();
  saveData();
  cancelEdit();
  startSession();
  renderAll();
}

async function addDeck(folder) {
  const name = await openDialog({
    title: 'New deck in "' + folder.name + '"',
    input: true,
    placeholder: "Deck name",
    okLabel: "Create deck"
  });
  if (!name) return;
  const deck = { id: uid(), name: name, cards: [] };
  folder.decks.push(deck);
  folder.collapsed = false;
  data.currentDeckId = deck.id;
  saveData();
  cancelEdit();
  startSession();
  renderAll();
  closeSidebar();
}

async function renameDeck(deck) {
  const name = await openDialog({
    title: "Rename deck",
    input: true,
    value: deck.name,
    okLabel: "Save"
  });
  if (!name) return;
  deck.name = name;
  saveData();
  renderAll();
}

async function deleteDeck(folder, deck) {
  const n = deck.cards.length;
  const message = n === 0
    ? 'Delete the deck "' + deck.name + '"?'
    : 'Delete the deck "' + deck.name + '" and its ' + n + (n === 1 ? " card" : " cards") + "? This can't be undone.";
  const ok = await openDialog({ title: "Delete deck?", message: message, okLabel: "Delete deck", danger: true });
  if (!ok) return;
  folder.decks = folder.decks.filter(function (d) { return d.id !== deck.id; });
  ensureCurrent();
  saveData();
  cancelEdit();
  startSession();
  renderAll();
}

$("newFolderBtn").addEventListener("click", newFolder);

// ---------- Main area ----------
function renderMain() {
  const found = findDeck(data.currentDeckId);
  const hasDeck = !!found;

  deckView.classList.toggle("hidden", !hasDeck);
  emptyState.classList.toggle("hidden", hasDeck);
  $("moveWrap").classList.toggle("hidden", !hasDeck);

  if (!hasDeck) {
    deckTitle.textContent = "Flashcards";
    document.title = "Flashcards";
    if (data.folders.length === 0) {
      $("emptyTitle").textContent = "No folders yet";
      $("emptyText").textContent = "Create a folder to group your decks by class or topic.";
      $("emptyBtn").textContent = "New folder";
      emptyAction = newFolder;
    } else {
      const first = data.folders[0];
      $("emptyTitle").textContent = "No decks yet";
      $("emptyText").textContent = "Add a deck, then add the cards you want to study.";
      $("emptyBtn").textContent = 'Add deck to "' + first.name + '"';
      emptyAction = function () { addDeck(first); };
    }
    return;
  }

  deckTitle.textContent = found.deck.name;
  document.title = found.deck.name + " - Flashcards";

  moveSelect.innerHTML = "";
  data.folders.forEach(function (f) {
    const opt = document.createElement("option");
    opt.value = f.id;
    opt.textContent = f.name;
    if (f.id === found.folder.id) opt.selected = true;
    moveSelect.appendChild(opt);
  });
}

$("emptyBtn").addEventListener("click", function () {
  if (emptyAction) emptyAction();
});

moveSelect.addEventListener("change", function () {
  const found = findDeck(data.currentDeckId);
  if (!found) return;
  const target = data.folders.find(function (f) { return f.id === moveSelect.value; });
  if (!target || target === found.folder) return;
  found.folder.decks = found.folder.decks.filter(function (d) { return d.id !== found.deck.id; });
  target.decks.push(found.deck);
  target.collapsed = false;
  saveData();
  renderAll();
});

function renderAll() {
  renderSidebar();
  renderMain();
  renderManage();
  renderStudy();
}

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
  const deck = currentDeck();
  const ids = deck ? deck.cards.map(function (c) { return c.id; }) : [];
  queue = $("shuffleBox").checked ? shuffle(ids) : ids;
  sessionTotal = queue.length;
  showingBack = false;
  renderStudy();
}

function currentCard() {
  const deck = currentDeck();
  if (!deck || queue.length === 0) return null;
  return deck.cards.find(function (c) { return c.id === queue[0]; }) || null;
}

function renderStudy() {
  const deck = currentDeck();

  againBtn.classList.add("hidden");
  gotItBtn.classList.add("hidden");
  flipBtn.classList.remove("hidden");

  if (!deck) return;

  const card = currentCard();

  if (deck.cards.length === 0) {
    progressEl.textContent = "";
    barFill.style.width = "0%";
    cardLabel.textContent = "";
    cardText.textContent = "This deck has no cards yet. Open the Cards tab to add some.";
    flipBtn.classList.add("hidden");
    return;
  }

  if (!card) {
    progressEl.textContent = "Round complete";
    barFill.style.width = "100%";
    cardLabel.textContent = "";
    cardText.textContent = "All done. Select Restart to go through the deck again.";
    flipBtn.classList.add("hidden");
    return;
  }

  const done = sessionTotal - queue.length;
  progressEl.textContent = done + " of " + sessionTotal + " mastered";
  barFill.style.width = (sessionTotal > 0 ? (done / sessionTotal) * 100 : 0) + "%";
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
  if (e.key === "Escape" && !dialogEl.open && sidebarEl.classList.contains("open")) {
    closeSidebar();
    return;
  }
  if (dialogEl.open) return;

  const tag = (e.target.tagName || "").toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return;
  if (!currentDeck() || studyView.classList.contains("hidden")) return;

  if (e.key === " " && tag !== "button") {
    e.preventDefault();
    flip();
  } else if (e.key === "Enter" && e.target === cardEl) {
    e.preventDefault();
    flip();
  } else if (e.key === "ArrowRight") {
    answer(true);
  } else if (e.key === "ArrowLeft") {
    answer(false);
  }
});

// ---------- Cards tab ----------
function renderManage() {
  const deck = currentDeck();
  const list = $("cardList");
  list.innerHTML = "";
  if (!deck) return;

  $("cardCount").textContent = deck.cards.length + (deck.cards.length === 1 ? " card" : " cards");

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
    actions.className = "item-actions";

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "btn small";
    editBtn.textContent = "Edit";
    editBtn.addEventListener("click", function () { startEdit(card.id); });

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "btn small danger";
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
  const deck = currentDeck();
  const card = deck ? deck.cards.find(function (c) { return c.id === id; }) : null;
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

async function deleteCard(id) {
  const deck = currentDeck();
  if (!deck) return;
  const ok = await openDialog({
    title: "Delete card?",
    message: "This card will be removed from the deck.",
    okLabel: "Delete card",
    danger: true
  });
  if (!ok) return;
  deck.cards = deck.cards.filter(function (c) { return c.id !== id; });
  if (editingId === id) cancelEdit();
  saveData();
  renderSidebar();
  renderManage();
  startSession();
}

cardForm.addEventListener("submit", function (e) {
  e.preventDefault();
  const deck = currentDeck();
  if (!deck) return;

  const front = frontInput.value.trim();
  const back = backInput.value.trim();
  if (!front || !back) return;

  if (editingId) {
    const card = deck.cards.find(function (c) { return c.id === editingId; });
    if (card) { card.front = front; card.back = back; }
  } else {
    deck.cards.push({ id: uid(), front: front, back: back });
  }

  saveData();
  cancelEdit();
  renderSidebar();
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
  reader.onload = async function () {
    let imported = null;
    try {
      imported = normalizeData(JSON.parse(reader.result));
    } catch (err) {
      imported = null;
    }

    if (!imported) {
      await openDialog({
        title: "Can't import this file",
        message: "It doesn't look like a flashcards backup. Choose a file you exported from this site.",
        okLabel: "OK",
        hideCancel: true
      });
      return;
    }

    const ok = await openDialog({
      title: "Replace everything?",
      message: "Importing replaces all current folders, decks and cards with the ones in this backup.",
      okLabel: "Replace",
      danger: true
    });
    if (!ok) return;

    data = imported;
    ensureCurrent();
    saveData();
    cancelEdit();
    startSession();
    renderAll();
  };
  reader.readAsText(file);
  e.target.value = "";
});

// ---------- Start ----------
startSession();
renderAll();
