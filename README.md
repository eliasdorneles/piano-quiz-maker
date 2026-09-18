# Piano Keyboard Tool

A simple web-based tool for piano teachers to visualize and share keyboard patterns.

## Pages

- **`index.html`** — Keyboard painter: click keys to toggle their color, then copy the image to your clipboard or download it.
- **`song.html`** — Song annotator: write song lyrics and annotate words with notes/chords shown as inline mini piano diagrams.

## Song Annotator Usage

1. Pick the **root note** and number of **octaves** for the keyboard (once per song).
2. Type your lyrics in the text area.
3. Select a word (or part of a word) in the lyrics.
4. Click keys on the keyboard to pick the notes, then click **Add chord to selection**.
5. A mini piano diagram appears above the word. Click it to see it big, edit the notes, or delete the chord.
6. Use **Copy share link** to save/share the song — the whole song is encoded (compressed, no libraries) in the URL.
7. Shared links open **view-only**: recipients see the lyrics with diagrams and can zoom a
   chord, but can't edit anything. They can click **Edit song** to remix it; copying from
   there again yields a view-only link.

## How it Works

The tool uses HTML canvas to draw the piano keyboard. JavaScript handles the click events and updates the canvas. The shared keyboard rendering lives in `piano.js`; the pages' logic live in `quiz.js` and `song.js`. There are no dependencies, no build step — just open the HTML files in a browser.

## License

This project is licensed under the MIT License.
