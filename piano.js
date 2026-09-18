// Shared piano keyboard rendering module.
// Exposes window.Piano with layout building, drawing, and hit-testing.
//
// A layout is defined by a root pitch class (0 = C .. 11 = B) and a total
// number of keys (semitones counted from the root, inclusive). Each key has
// a semitone offset from the root; whites and blacks are drawn in that order.

(function () {
  const PRESSED_COLOR = "purple";

  // Build the layout of keys for a keyboard.
  // rootPc: pitch class of the first (leftmost) key, 0 = C .. 11 = B.
  // keyCount: total number of keys (semitones from root, inclusive).
  function buildLayout(rootPc, keyCount, keyWidth, keyHeight) {
    const whiteKeys = [];
    const blackKeys = [];

    // We walk semitone by semitone; a semitone is a black key if the pitch
    // class being entered is one of C#, D#, F#, G#, A#.
    for (let semitone = 0; semitone < keyCount; semitone++) {
      const pitchClass = (rootPc + semitone) % 12;
      const isBlack =
        pitchClass === 1 ||
        pitchClass === 3 ||
        pitchClass === 6 ||
        pitchClass === 8 ||
        pitchClass === 10;

      if (isBlack) {
        // x is centered on the boundary between the previous white key and
        // the next one, like a real piano.
        const prevWhite = whiteKeys[whiteKeys.length - 1];
        const x = prevWhite.x + keyWidth * 0.75;
        blackKeys.push({
          semitone,
          x,
          y: 0,
          width: keyWidth * 0.6,
          height: keyHeight * 0.6,
        });
      } else {
        whiteKeys.push({
          semitone,
          x: whiteKeys.length * keyWidth,
          y: 0,
          width: keyWidth,
          height: keyHeight,
        });
      }
    }

    return {
      rootPc,
      keyCount,
      keyWidth,
      keyHeight,
      whiteKeys,
      blackKeys,
      totalKeys: keyCount,
    };
  }

  function drawKeyboard(canvas, layout, keyStates, pressedColor) {
    const ctx = canvas.getContext("2d");
    const pressed = pressedColor || PRESSED_COLOR;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const key of layout.whiteKeys) {
      ctx.fillStyle = keyStates[key.semitone] ? pressed : "white";
      ctx.fillRect(key.x + 1, key.y + 1, layout.keyWidth - 2, layout.keyHeight - 2);
      ctx.strokeStyle = "black";
      ctx.strokeRect(key.x + 1, key.y + 1, layout.keyWidth - 2, layout.keyHeight - 2);
    }

    for (const key of layout.blackKeys) {
      ctx.fillStyle = keyStates[key.semitone] ? pressed : "black";
      ctx.fillRect(key.x, key.y, key.width, key.height);
      ctx.strokeStyle = "black";
      ctx.strokeRect(key.x, key.y, key.width, key.height);
    }
  }

  // Returns the semitone offset of the key at the given position, or null.
  // Black keys are checked first since they overlap white keys.
  function hitTestKey(layout, clickX, clickY) {
    for (const key of layout.blackKeys) {
      if (
        clickX >= key.x &&
        clickX <= key.x + key.width &&
        clickY >= key.y &&
        clickY <= key.y + key.height
      ) {
        return key.semitone;
      }
    }

    for (const key of layout.whiteKeys) {
      if (
        clickX >= key.x &&
        clickX <= key.x + layout.keyWidth &&
        clickY >= 0 &&
        clickY <= layout.keyHeight
      ) {
        return key.semitone;
      }
    }

    return null;
  }

  // Wire click-to-toggle on a canvas. onChange is called with the toggled
  // semitone after each redraw.
  function attachToggleClick(canvas, layout, keyStates, onChange) {
    canvas.addEventListener("click", (event) => {
      const rect = canvas.getBoundingClientRect();
      const clickX = event.clientX - rect.left;
      const clickY = event.clientY - rect.top;
      const semitone = hitTestKey(layout, clickX, clickY);
      if (semitone === null) {
        return;
      }
      keyStates[semitone] = !keyStates[semitone];
      drawKeyboard(canvas, layout, keyStates);
      if (onChange) {
        onChange(semitone);
      }
    });
  }

  window.Piano = {
    buildLayout,
    drawKeyboard,
    hitTestKey,
    attachToggleClick,
  };
})();
