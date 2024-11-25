const canvas = document.getElementById("piano-keyboard");
const ctx = canvas.getContext("2d");

// Dimensions of a white key
const keyWidth = 40;
const keyHeight = 150;

function createBlackKeyPosition(position) {
  let blackKeyX = 30;
  let blackKeyWidth = keyWidth * 0.6;
  let blackKeyHeight = keyHeight * 0.6;
  return {
    x: blackKeyX + keyWidth * position,
    y: 0,
    width: blackKeyWidth,
    height: blackKeyHeight,
  };
}

let blackKeyPositions = [
  createBlackKeyPosition(0),
  createBlackKeyPosition(1),
  createBlackKeyPosition(2),
  createBlackKeyPosition(4),
  createBlackKeyPosition(5),
  createBlackKeyPosition(7),
  createBlackKeyPosition(8),
  createBlackKeyPosition(9),
  createBlackKeyPosition(11),
  createBlackKeyPosition(12),
  createBlackKeyPosition(14),
  createBlackKeyPosition(15),
  createBlackKeyPosition(16),
];

let keyStates = [];

// Initialize white key states
for (let i = 0; i < 19; i++) {
  keyStates.push(false);
}

// Initialize black key states
for (let i = 0; i < blackKeyPositions.length; i++) {
  keyStates.push(false);
}

// Function to draw a white key
function drawWhiteKey(x, y, isPressed = false) {
  ctx.fillStyle = isPressed ? "purple" : "white";
  ctx.fillRect(x + 1, y + 1, keyWidth, keyHeight);
  ctx.strokeStyle = "black";
  ctx.strokeRect(x + 1, y + 1, keyWidth, keyHeight);
}

// Function to draw a black key
function drawBlackKey(x, y, width, height, isPressed = false) {
  ctx.fillStyle = isPressed ? "purple" : "black";
  ctx.fillRect(x, y, width, height);
  ctx.strokeStyle = "black";
  ctx.strokeRect(x, y, width, height);
}

function redrawKeyboard() {
  // Draw the white keys of two octaves
  let x = 0;
  let keyIndex = 0;
  for (let i = 0; i < 19; i++) {
    drawWhiteKey(x, 0, keyStates[keyIndex]);
    x += keyWidth;
    keyIndex++;
  }

  // Draw the black keys
  for (let i = 0; i < blackKeyPositions.length; i++) {
    drawBlackKey(
      blackKeyPositions[i].x,
      blackKeyPositions[i].y,
      blackKeyPositions[i].width,
      blackKeyPositions[i].height,
      keyStates[keyIndex]
    );
    keyIndex++;
  }
}

redrawKeyboard();

canvas.addEventListener("click", (event) => {
  const rect = canvas.getBoundingClientRect();
  const clickX = event.clientX - rect.left;
  const clickY = event.clientY - rect.top;

  // Check if a black key was clicked first
  for (let i = 0; i < blackKeyPositions.length; i++) {
    const blackKey = blackKeyPositions[i];
    if (
      clickX >= blackKey.x &&
      clickX <= blackKey.x + blackKey.width &&
      clickY >= blackKey.y &&
      clickY <= blackKey.y + blackKey.height
    ) {
      keyStates[19 + i] = !keyStates[19 + i];
      redrawKeyboard();
      return;
    }
  }

  // Check if a white key was clicked
  let keyIndex = 0;
  for (let x = 0; x < canvas.width; x += keyWidth) {
    if (
      clickX >= x &&
      clickX <= x + keyWidth &&
      clickY >= 0 &&
      clickY <= keyHeight
    ) {
      keyStates[keyIndex] = !keyStates[keyIndex];
      redrawKeyboard();
      return;
    }
    keyIndex++;
  }
});

const downloadButton = document.getElementById("downloadButton");

downloadButton.addEventListener("click", () => {
  const imageData = canvas.toDataURL("image/png");
  const link = document.createElement("a");
  link.href = imageData;
  link.download = "piano_keyboard.png";
  link.click();
});

const copyButton = document.getElementById("copyButton");

const message = document.getElementById("message");

copyButton.addEventListener("click", () => {
  const imageData = canvas.toDataURL("image/png");

  // Create a temporary image element
  const img = new Image();
  img.src = imageData;

  // Wait for the image to load
  img.onload = () => {
    // Create a temporary canvas
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = img.width;
    tempCanvas.height = img.height;
    const tempCtx = tempCanvas.getContext("2d");
    tempCtx.drawImage(img, 0, 0);

    // Copy the image data to the clipboard
    tempCanvas.toBlob((blob) => {
      const item = new ClipboardItem({ "image/png": blob });
      navigator.clipboard
        .write([item])
        .then(() => {
          console.log("Image copied to clipboard");
          // let the user know the image was copied
          message.textContent = "Image copied to clipboard!";
          setTimeout(() => {
            message.textContent = "";
          }, 2000);
        })
        .catch((err) => {
          console.error("Error copying image to clipboard:", err);
        });
    });
  };
});
