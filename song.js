const PICKER_KEY_WIDTH = 40;
const PICKER_KEY_HEIGHT = 150;
const MINI_KEY_WIDTH = 5;
const MINI_KEY_HEIGHT = 22;

// Annotations store notes as absolute pitches: a BigInt whose bit p is set
// when pitch p is played, with pitch = 12 * octave + pitchClass (C0 = 0).
// Notes are octave-aware; the root note select only decides the pitch class
// of the leftmost key of the keyboard window (which auto-fits the content).

// Default window start: octave 3 (e.g. C3 = pitch 36 for root C).
const BASE_OCTAVE = 3;
const MAX_OCTAVES = 4;

const state = {
  rootPc: 0,
  octaves: 2, // preferred window size; grows if the notes need more room
  lyrics: "",
  annotations: [], // { start, end, mask } — mask is a BigInt over absolute pitches
  pendingSel: null, // { start, end } — text selection the next chord attaches to
  view: false, // true when the current URL is a view-only share link
};

const rootNoteSelect = document.getElementById("rootNote");
const octavesSelect = document.getElementById("octaves");
const lyricsInput = document.getElementById("lyricsInput");
const pickerCanvas = document.getElementById("chordPicker");
const clearKeysButton = document.getElementById("clearKeysButton");
const addChordButton = document.getElementById("addChordButton");
const preview = document.getElementById("preview");
const copyLinkButton = document.getElementById("copyLinkButton");
const editSongButton = document.getElementById("editSongButton");
const pageTitle = document.getElementById("pageTitle");
const viewerTitle = document.getElementById("viewerTitle");
const previewHeading = document.getElementById("previewHeading");
const editorOnlyElements = document.querySelectorAll(".editor-only");

const modalBackdrop = document.getElementById("modalBackdrop");
const modalKeyboard = document.getElementById("modalKeyboard");
const deleteChordButton = document.getElementById("deleteChordButton");
const closeModalButton = document.getElementById("closeModalButton");

let pickerLayout = null;
let pickerMask = 0n; // absolute pitches currently picked on the picker keyboard
let modalLayout = null;
let modalMask = 0n; // pitch classes of the annotation open in the modal
let modalAnnotation = null;

function octavesToKeyCount(octaves) {
  return octaves * 12 + 1;
}

function pitchOf(layout, semitone) {
  return layout.rootPitch + semitone;
}

// The pitch class of the leftmost key is the "First note" select; the octave
// is chosen so the lowest annotated note fits (BASE_OCTAVE when empty).
function windowStartPitch() {
  const base = 12 * BASE_OCTAVE + state.rootPc;
  let minPitch = Infinity;
  for (const ann of state.annotations) {
    for (let p = 0; p < 128; p++) {
      if ((ann.mask >> BigInt(p)) & 1n) {
        minPitch = Math.min(minPitch, p);
      }
    }
  }
  if (minPitch === Infinity) {
    return base;
  }
  // Largest pitch with the selected root pitch class that is <= minPitch,
  // but never below pitch 0.
  while (((minPitch - state.rootPc) % 12 + 12) % 12 !== 0) {
    minPitch--;
  }
  return Math.max(minPitch, 0);
}

// Octaves actually drawn: the preferred size, extended to fit all notes.
function windowOctaves() {
  const start = windowStartPitch();
  let maxPitch = 0;
  for (const ann of state.annotations) {
    for (let p = 127; p >= 0; p--) {
      if ((ann.mask >> BigInt(p)) & 1n) {
        maxPitch = p;
        break;
      }
    }
  }
  let octaves = state.octaves;
  while (maxPitch >= start + octavesToKeyCount(octaves) && octaves < MAX_OCTAVES) {
    octaves++;
  }
  return octaves;
}

// Pressed-state array derived from an absolute-pitch mask for a given layout.
function keyStatesForPitches(mask, layout) {
  const keyStates = [];
  for (let semitone = 0; semitone < layout.totalKeys; semitone++) {
    const pitch = BigInt(pitchOf(layout, semitone));
    keyStates.push(Boolean((mask >> pitch) & 1n));
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
  Piano.drawKeyboard(
    pickerCanvas,
    pickerLayout,
    keyStatesForPitches(pickerMask, pickerLayout)
  );
}

function buildWindowLayout(keyWidth, keyHeight) {
  return Piano.buildLayout(
    windowStartPitch(),
    octavesToKeyCount(windowOctaves()),
    keyWidth,
    keyHeight
  );
}

function rebuildPicker() {
  pickerLayout = buildWindowLayout(PICKER_KEY_WIDTH, PICKER_KEY_HEIGHT);
  sizeKeyboardCanvas(pickerCanvas, pickerLayout);
}

// ---------- Notifications ----------
// notify() lives in notify.js (shared with the quiz page).

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

function encodeSong(song, view = false) {
  const anns = song.annotations
    .map((a) => `${a.start},${a.end},${a.mask.toString(16)}`)
    .join("|");
  const lyrics = bytesToBase64url(new TextEncoder().encode(song.lyrics));
  return `#3${view ? "v" : ""}.${song.rootPc},${song.octaves}.${anns}.${lyrics}`;
}

// ---------- URL encoding ----------

function decodeSong(hash) {
  const parts = hash.replace(/^#/, "").split(".");
  const version = parts[0];
  const view = version.endsWith("v");
  const base = version.replace(/v$/, "");
  if (parts.length !== 4 || base !== "3") {
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

  return { rootPc, octaves, lyrics, annotations, view };
}

function updateHash() {
  const url = location.origin + location.pathname + encodeSong(state);
  history.replaceState(null, "", url);
}

// ---------- View mode ----------

function applyViewMode() {
  for (const el of editorOnlyElements) {
    el.classList.toggle("hidden", state.view);
  }
  pageTitle.classList.toggle("hidden", state.view);
  viewerTitle.classList.toggle("hidden", !state.view);
  editSongButton.classList.toggle("hidden", !state.view);
  previewHeading.textContent = state.view ? "Song" : "Preview";
  deleteChordButton.classList.toggle("hidden", state.view);
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

// Splits the pending selection into sub-ranges that don't overlap existing
// annotations, so both can render without swallowing each other.
function selectionPieces(sortedAnnotations) {
  const sel = state.pendingSel;
  if (!sel || sel.start >= sel.end) {
    return [];
  }
  let pieces = [{ start: sel.start, end: sel.end }];
  for (const ann of sortedAnnotations) {
    const next = [];
    for (const piece of pieces) {
      if (piece.end <= ann.start || piece.start >= ann.end) {
        next.push(piece);
        continue;
      }
      if (piece.start < ann.start) {
        next.push({ start: piece.start, end: ann.start });
      }
      if (ann.end < piece.end) {
        next.push({ start: ann.end, end: piece.end });
      }
    }
    pieces = next;
  }
  return pieces;
}

function renderPreview() {
  preview.textContent = "";
  const text = state.lyrics;
  if (text === "") {
    return;
  }
  const layout = buildWindowLayout(MINI_KEY_WIDTH, MINI_KEY_HEIGHT);
  const sorted = [...state.annotations].sort((a, b) => a.start - b.start);

  // Annotations sharing the exact same span become one annotated word with
  // several mini diagrams stacked side by side.
  const groups = [];
  for (const ann of sorted) {
    const last = groups[groups.length - 1];
    if (last && last.start === ann.start && last.end === ann.end) {
      last.anns.push(ann);
    } else {
      groups.push({ type: "annotation", start: ann.start, end: ann.end, anns: [ann] });
    }
  }

  const items = groups
    .concat(
      selectionPieces(
        [...state.annotations].sort((a, b) => a.start - b.start)
      ).map((piece) => ({ type: "selection", ...piece }))
    )
    .sort((a, b) => a.start - b.start || (a.type === "annotation" ? -1 : 1));

  let cursor = 0;
  for (const item of items) {
    if (item.start > text.length || item.end > text.length) {
      continue;
    }
    if (item.start > cursor) {
      preview.append(text.slice(cursor, item.start));
    }
    const anchorStart = Math.max(item.start, cursor);
    if (anchorStart >= item.end) {
      continue; // fully swallowed by a previous segment
    }

    if (item.type === "selection") {
      const selSpan = document.createElement("span");
      selSpan.className = "pending-selection";
      selSpan.textContent = text.slice(anchorStart, item.end);
      preview.append(selSpan);
      cursor = item.end;
      continue;
    }

    const wordSpan = document.createElement("span");
    wordSpan.className = "annotated-word";

    for (const ann of item.anns) {
      const mini = document.createElement("canvas");
      mini.className = "mini-diagram";
      sizeKeyboardCanvas(mini, layout);
      Piano.drawKeyboard(
        mini,
        layout,
        keyStatesForPitches(ann.mask, layout)
      );
      mini.addEventListener("click", () => openModal(ann));
      wordSpan.appendChild(mini);
    }
    wordSpan.appendChild(document.createTextNode(text.slice(anchorStart, item.end)));
    preview.append(wordSpan);
    cursor = Math.max(cursor, item.end);
  }
  preview.append(text.slice(cursor));
}

function removeAnnotation(ann) {
  const index = state.annotations.indexOf(ann);
  if (index !== -1) {
    state.annotations.splice(index, 1);
  }
}

// ---------- Pending selection tracking ----------

function refreshPendingSelection() {
  const start = lyricsInput.selectionStart;
  const end = lyricsInput.selectionEnd;
  const next = start < end ? { start, end } : null;
  const changed =
    (state.pendingSel === null) !== (next === null) ||
    (next !== null &&
      (state.pendingSel.start !== next.start || state.pendingSel.end !== next.end));
  state.pendingSel = next;
  if (changed) {
    renderPreview();
  }
}

// ---------- Modal ----------

function openModal(ann) {
  modalAnnotation = ann;
  modalLayout = buildWindowLayout(PICKER_KEY_WIDTH, PICKER_KEY_HEIGHT);
  sizeKeyboardCanvas(modalKeyboard, modalLayout);
  modalMask = ann.mask;
  Piano.drawKeyboard(
    modalKeyboard,
    modalLayout,
    keyStatesForPitches(modalMask, modalLayout)
  );
  modalBackdrop.classList.remove("hidden");
}

function attachModalClick() {
  modalKeyboard.addEventListener("click", (event) => {
    if (!modalAnnotation || state.view) {
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
    modalMask ^= 1n << BigInt(pitchOf(modalLayout, semitone));
    Piano.drawKeyboard(
      modalKeyboard,
      modalLayout,
      keyStatesForPitches(modalMask, modalLayout)
    );
  });
}

function closeModal() {
  if (modalAnnotation && !state.view) {
    modalAnnotation.mask = modalMask;
    if (modalMask === 0n) {
      removeAnnotation(modalAnnotation);
    }
    modalAnnotation = null;
    renderPreview();
    updateHash();
  }
  modalBackdrop.classList.add("hidden");
}

// ---------- Modal buttons ----------

deleteChordButton.addEventListener("click", () => {
  if (modalAnnotation) {
    removeAnnotation(modalAnnotation);
    modalAnnotation = null;
    modalBackdrop.classList.add("hidden");
    renderPreview();
    updateHash();
    notify("Chord removed.");
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
  notify(
    `Keyboard now starts on ${["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"][state.rootPc]}. Existing chords kept their notes.`,
    "success"
  );
});

octavesSelect.addEventListener("change", () => {
  state.octaves = Number(octavesSelect.value);
  onSongSettingsChanged();
  notify(`Keyboard range set to ${state.octaves} octaves.`, "success");
});

lyricsInput.addEventListener("input", () => {
  const oldText = state.lyrics;
  const newText = lyricsInput.value;
  shiftAnnotations(oldText, newText);
  state.lyrics = newText;
  refreshPendingSelection();
  renderPreview();
  updateHash();
});

lyricsInput.addEventListener("selectionchange", refreshPendingSelection);
// Fallbacks for browsers that don't fire selectionchange on textareas yet.
lyricsInput.addEventListener("mouseup", refreshPendingSelection);
lyricsInput.addEventListener("keyup", refreshPendingSelection);

clearKeysButton.addEventListener("click", () => {
  pickerMask = 0n;
  drawPicker();
});

addChordButton.addEventListener("click", () => {
  const sel = state.pendingSel;
  if (!sel) {
    notify("Select a word in the lyrics first.", "error");
    return;
  }
  if (pickerMask === 0n) {
    notify("Pick at least one key first.", "error");
    return;
  }
  state.annotations.push({ start: sel.start, end: sel.end, mask: pickerMask });
  pickerMask = 0n;
  drawPicker();
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
  copyWithFallback(
    location.origin + location.pathname + encodeSong(state, true),
    () => notify("View-only link copied to clipboard!", "success")
  );
});

editSongButton.addEventListener("click", () => {
  state.view = false;
  history.replaceState(
    null,
    "",
    location.origin + location.pathname + encodeSong(state)
  );
  applyViewMode();
  notify("Editing enabled — share links stay view-only.", "success");
});

// Picker clicks toggle absolute pitches.
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
    pickerMask ^= 1n << BigInt(pitchOf(pickerLayout, semitone));
    drawPicker();
    refreshPendingSelection();
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
    state.view = song.view;
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
  applyViewMode();
  if (loadedSong) {
    notify(
      state.view
        ? "Song loaded (view only) — use “Edit song” to make changes."
        : "Song loaded from link.",
      "success"
    );
  } else if (location.hash) {
  } else if (location.hash) {
    notify("That link didn't look valid — started a new song.", "error");
  }
}


init();
