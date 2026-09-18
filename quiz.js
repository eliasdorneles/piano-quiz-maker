const canvas = document.getElementById("piano-keyboard");

// Same keyboard as before: root C from octave 3 (pitch 36), 32 semitones.
const layout = Piano.buildLayout(12 * 3, 32, 40, 150);

const keyStates = [];
for (let i = 0; i < layout.totalKeys; i++) {
  keyStates.push(false);
}

Piano.attachToggleClick(canvas, layout, keyStates);
Piano.drawKeyboard(canvas, layout, keyStates);

const downloadButton = document.getElementById("downloadButton");

downloadButton.addEventListener("click", () => {
  const imageData = canvas.toDataURL("image/png");
  const link = document.createElement("a");
  link.href = imageData;
  link.download = "piano_keyboard.png";
  link.click();
});

const copyButton = document.getElementById("copyButton");

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
          notify("Keyboard image copied to clipboard!", "success");
        })
        .catch((err) => {
          console.error("Error copying image to clipboard:", err);
          notify("Couldn't copy the image. Try downloading instead.", "error");
        });
    });
  };
});
