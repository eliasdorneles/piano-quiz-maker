const PICKER_KEY_WIDTH = 40;
const PICKER_KEY_HEIGHT = 150;
const MINI_KEY_WIDTH = 5;
const MINI_KEY_HEIGHT = 22;

const state = {
  rootPc: 0,
  octaves: 2,
  lyrics: "",
  annotations: [], // { start, end, mask } — mask is a BigInt over semitones from root
};

const rootNoteSelect = document.getElementById("rootNote");
const octavesSelect = document.getElementById("octaves");
const lyricsInput = document.getElementById("lyricsInput");
const pickerCanvas = document.getElementById("chordPicker");
const clearKeysButton = document.getElementById("clearKeysButton");
const addChordButton = document.getElementById("addChordButton");
const preview = document.getElementById("preview");
const message = document.getElementById("message");
const copyLinkButton = document.getElementById("copyLinkButton");

const modalBackdrop = document.getElementById("modalBackdrop");
const modalKeyboard = document.getElementById("modalKeyboard");
const deleteChordButton = document.getElementById("deleteChordButton");
const closeModalButton = document.getElementById("closeModalButton");

let pickerLayout = null;
let pickerKeyStates = [];
let modalLayout = null;
let modalKeyStates = [];
let modalAnnotation = null; // annotation currently open in the modal

function octavesToKeyCount(octaves) {
  return octaves * 12 + 1;
}

function maskFromKeyStates(keyStates) {
  let mask = 0n;
  for (let i = 0; i < keyStates.length; i++) {
    if (keyStates[i]) {
      mask |= 1n << BigInt(i);
    }
  }
  return mask;
}

function keyStatesFromMask(mask, totalKeys) {
  const keyStates = [];
  for (let i = 0; i < totalKeys; i++) {
    keyStates.push(Boolean((mask >> BigInt(i)) & 1n));
  }
  return keyStates;
}

// Resize a keyboard canvas to fit its layout content.
function sizeKeyboardCanvas(canvas, layout) {
  const lastWhite = layout.whiteKeys[layout.whiteKeys.length - 1];
  canvas.width = lastWhite.x + layout.keyWidth + 2;
  canvas.height = layout.keyHeight + 2;
}

function drawPicker() {
  Piano.drawKeyboard(pickerCanvas, pickerLayout, pickerKeyStates);
}

function rebuildPicker() {
  pickerLayout = Piano.buildLayout(
    state.rootPc,
    octavesToKeyCount(state.octaves),
    PICKER_KEY_WIDTH,
    PICKER_KEY_HEIGHT
  );
  sizeKeyboardCanvas(pickerCanvas, pickerLayout);
  // Keep existing key picks, clamped to the new key count and resized.
  pickerKeyStates = keyStatesFromMask(
    maskFromKeyStates(pickerKeyStates),
    pickerLayout.totalKeys
  );
}

function clearPicker() {
  pickerKeyStates = keyStatesFromMask(0n, pickerLayout.totalKeys);
  drawPicker();
}

function showMessage(text) {
  message.textContent = text;
  setTimeout(() => {
    if (message.textContent === text) {
      message.textContent = "";
    }
  }, 2000);
}

// ---------- URL encoding ----------

function bytesToBase64url(bytes) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlToBytes(text) {
  let normalized = text.replace(/-/g, "+").replace(/_/g, "/");
  while (normalized.length % 4 !== 0) {
    normalized += "=";
  }
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function encodeSong(song) {
  const anns = song.annotations
    .map((a) => `${a.start},${a.end},${a.mask.toString(16)}`)
    .join("|");
  const lyrics = bytesToBase64url(new TextEncoder().encode(song.lyrics));
  return `#1.${song.rootPc},${song.octaves}.${anns}.${lyrics}`;
}

function decodeSong(hash) {
  const parts = hash.replace(/^#/, "").split(".");
  if (parts.length !== 4 || parts[0] !== "1") {
    throw new Error("bad format");
  }

  const [rootPc, octaves] = parts[1].split(",").map(Number);
  if (
    !Number.isInteger(rootPc) ||
    rootPc < 0 ||
    rootPc > 11 ||
    !Number.isInteger(octaves) ||
    octaves < 2 ||
    octaves > 4
  ) {
    throw new Error("bad config");
  }

  const annotations = [];
  if (parts[2] !== "") {
    for (const item of parts[2].split("|")) {
      const [start, end, maskHex] = item.split(",");
      const mask = BigInt("0x" + maskHex);
      if (mask < 0n) {
        throw new Error("bad mask");
      }
      annotations.push({ start: Number(start), end: Number(end), mask });
    }
  }

  const lyrics = new TextDecoder().decode(base64urlToBytes(parts[3]));

  return { version: 1, rootPc, octaves, lyrics, annotations };
}

function updateHash() {
  const url = location.origin + location.pathname + encodeSong(state);
  history.replaceState(null, "", url);
}

// ---------- Anchor stability on text edits ----------
//
// One contiguous edit happened: oldText[prefix..oldEnd) was replaced by
// newText[prefix..newEnd). Shift/clip/expand annotations accordingly.

function shiftAnnotations(oldText, newText) {
  const minLen = Math.min(oldText.length, newText.length);
  let prefix = 0;
  while (prefix < minLen && oldText[prefix] === newText[prefix]) {
    prefix++;
  }
  let oldEnd = oldText.length;
  let newEnd = newText.length;
  while (
    oldEnd > prefix &&
    newEnd > prefix &&
    oldText[oldEnd - 1] === newText[newEnd - 1]
  ) {
    oldEnd--;
    newEnd--;
  }
  const delta = newEnd - oldEnd; // inserted minus removed
  const insertionEnd = prefix + (newEnd - prefix);

  // Maps a stable position across the edit: unchanged before the edit,
  // shifted after it, snapped to the insertion end if it was inside the edit.
  const mapPos = (pos) =>
    pos <= prefix ? pos : pos >= oldEnd ? pos + delta : insertionEnd;

  const shifted = [];
  for (const ann of state.annotations) {
    let start;
    let end;
    if (ann.start <= prefix && ann.end >= oldEnd) {
      // Edit fully inside the annotation: let it expand/contract with it.
      start = ann.start;
      end = ann.end + delta;
    } else {
      start = mapPos(ann.start);
      end = mapPos(ann.end);
    }

    if (start < end && start >= 0 && end <= newText.length) {
      shifted.push({ start, end, mask: ann.mask });
    }
  }
  state.annotations = shifted;
}

// ---------- Preview rendering ----------

function renderPreview() {
  preview.textContent = "";
  const text = state.lyrics;
  if (text === "") {
    return;
  }
  const sorted = [...state.annotations].sort((a, b) => a.start - b.start);

  let cursor = 0;
  for (const ann of sorted) {
    if (ann.start > text.length || ann.end > text.length) {
      continue;
    }
    if (ann.start > cursor) {
      preview.append(text.slice(cursor, ann.start));
    }
    const anchorStart = Math.max(ann.start, cursor);
    if (anchorStart >= ann.end) {
      continue; // fully swallowed by a previous annotation
    }

    const wordSpan = document.createElement("span");
    wordSpan.className = "annotated-word";

    const mini = document.createElement("canvas");
    mini.className = "mini-diagram";
    const miniLayout = Piano.buildLayout(
      state.rootPc,
      octavesToKeyCount(state.octaves),
      MINI_KEY_WIDTH,
      MINI_KEY_HEIGHT
    );
    sizeKeyboardCanvas(mini, miniLayout);
    Piano.drawKeyboard(
      mini,
      miniLayout,
      keyStatesFromMask(ann.mask, miniLayout.totalKeys)
    );
    mini.addEventListener("click", () => openModal(ann));

    wordSpan.appendChild(mini);
    wordSpan.appendChild(document.createTextNode(text.slice(anchorStart, ann.end)));
    preview.append(wordSpan);
    cursor = Math.max(cursor, ann.end);
  }
  preview.append(text.slice(cursor));
}

function removeAnnotation(ann) {
  const index = state.annotations.indexOf(ann);
  if (index !== -1) {
    state.annotations.splice(index, 1);
  }
}

// ---------- Modal ----------

function openModal(ann) {
  modalAnnotation = ann;
  modalLayout = Piano.buildLayout(
    state.rootPc,
    octavesToKeyCount(state.octaves),
    PICKER_KEY_WIDTH,
    PICKER_KEY_HEIGHT
  );
  sizeKeyboardCanvas(modalKeyboard, modalLayout);
  modalKeyStates = keyStatesFromMask(ann.mask, modalLayout.totalKeys);
  Piano.drawKeyboard(modalKeyboard, modalLayout, modalKeyStates);
  modalBackdrop.classList.remove("hidden");
}

function attachModalClick() {
  modalKeyboard.addEventListener("click", (event) => {
    if (!modalAnnotation) {
      return;
    }
    const rect = modalKeyboard.getBoundingClientRect();
    const semitone = Piano.hitTestKey(
      modalLayout,
      event.clientX - rect.left,
      event.clientY - rect.top
    );
    if (semitone === null) {
      return;
    }
    modalKeyStates[semitone] = !modalKeyStates[semitone];
    Piano.drawKeyboard(modalKeyboard, modalLayout, modalKeyStates);
  });
}

function closeModal() {
  if (modalAnnotation) {
    modalAnnotation.mask = maskFromKeyStates(modalKeyStates);
    if (modalAnnotation.mask === 0n) {
      removeAnnotation(modalAnnotation);
    }
    modalAnnotation = null;
    renderPreview();
    updateHash();
  }
  modalBackdrop.classList.add("hidden");
}

deleteChordButton.addEventListener("click", () => {
  if (modalAnnotation) {
    removeAnnotation(modalAnnotation);
    modalAnnotation = null;
    modalBackdrop.classList.add("hidden");
    renderPreview();
    updateHash();
    showMessage("Chord removed.");
  }
});

closeModalButton.addEventListener("click", closeModal);

modalBackdrop.addEventListener("click", (event) => {
  if (event.target === modalBackdrop) {
    closeModal();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !modalBackdrop.classList.contains("hidden")) {
    closeModal();
  }
});

// ---------- Event wiring ----------

function onSongSettingsChanged() {
  rebuildPicker();
  drawPicker();
  renderPreview();
  updateHash();
}

rootNoteSelect.addEventListener("change", () => {
  state.rootPc = Number(rootNoteSelect.value);
  onSongSettingsChanged();
});

octavesSelect.addEventListener("change", () => {
  state.octaves = Number(octavesSelect.value);
  onSongSettingsChanged();
});

lyricsInput.addEventListener("input", () => {
  const oldText = state.lyrics;
  const newText = lyricsInput.value;
  shiftAnnotations(oldText, newText);
  state.lyrics = newText;
  renderPreview();
  updateHash();
});

clearKeysButton.addEventListener("click", clearPicker);

addChordButton.addEventListener("click", () => {
  const start = lyricsInput.selectionStart;
  const end = lyricsInput.selectionEnd;
  if (start === end) {
    showMessage("Select a word in the lyrics first.");
    return;
  }
  const mask = maskFromKeyStates(pickerKeyStates);
  if (mask === 0n) {
    showMessage("Pick at least one key first.");
    return;
  }
  state.annotations.push({ start, end, mask });
  clearPicker();
  renderPreview();
  updateHash();
});

function copyWithFallback(text, done) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(() => execCommandCopy(text, done));
  } else {
    execCommandCopy(text, done);
  }
}

function execCommandCopy(text, done) {
  const input = document.createElement("textarea");
  input.value = text;
  input.style.position = "fixed";
  input.style.left = "-9999px";
  document.body.appendChild(input);
  input.select();
  try {
    if (!document.execCommand("copy")) {
      throw new Error("copy failed");
    }
    done();
  } catch (err) {
    prompt("Copy this link:", text);
    done();
  }
  document.body.removeChild(input);
}

copyLinkButton.addEventListener("click", () => {
  updateHash();
  copyWithFallback(location.href, () => showMessage("Link copied to clipboard!"));
});

// Picker clicks toggle keys (wired after the layout exists).
function attachPickerClick() {
  pickerCanvas.addEventListener("click", (event) => {
    const rect = pickerCanvas.getBoundingClientRect();
    const semitone = Piano.hitTestKey(
      pickerLayout,
      event.clientX - rect.left,
      event.clientY - rect.top
    );
    if (semitone === null) {
      return;
    }
    pickerKeyStates[semitone] = !pickerKeyStates[semitone];
    drawPicker();
  });
}

// ---------- Init ----------

function initFromHash() {
  if (!location.hash) {
    return false;
  }
  try {
    const song = decodeSong(location.hash);
    state.rootPc = song.rootPc;
    state.octaves = song.octaves;
    state.lyrics = song.lyrics;
    state.annotations = song.annotations.filter(
      (a) => a.start >= 0 && a.end <= song.lyrics.length && a.start < a.end
    );
    return true;
  } catch (err) {
    console.error("Could not load song from URL:", err);
    return false;
  }
}

function init() {
  const loadedSong = initFromHash();
  rootNoteSelect.value = String(state.rootPc);
  octavesSelect.value = String(state.octaves);
  lyricsInput.value = state.lyrics;
  rebuildPicker();
  attachPickerClick();
  attachModalClick();
  drawPicker();
  renderPreview();
  if (loadedSong) {
    showMessage("Song loaded from link.");
  }
}

init();
