const paper = document.querySelector('#paper');
const keyboard = document.querySelector('#keyboard');
const soundButton = document.querySelector('#sound');

const glyphNames = new Map([...('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789')].map(key => [key, key]));
for (const [key, name] of Object.entries({
  '-': 'hyphen', ',': 'comma', ';': 'semicolon', ':': 'colon',
  "'": 'apostrophe', '.': 'period', ' ': 'space',
  Shift: 'shift', Enter: 'return', Backspace: 'delete'
})) glyphNames.set(key, name);

new p5(p => {
  const margin = 4;
  const entries = [];
  const glyphs = new Map();
  const samples = new Map();
  let audio;
  function unlockAudio() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    if (!audio) {
      audio = new AudioContext();
      for (const name of ['single', 'return', 'ding']) {
        fetch('data/' + name + '.wav')
          .then(response => response.arrayBuffer())
          .then(buffer => audio.decodeAudioData(buffer))
          .then(buffer => samples.set(name, buffer))
          .catch(error => console.warn('Typewriter audio could not load:', name, error));
      }
    }
    if (audio.state === 'suspended') audio.resume().catch(() => {});
  }
  document.addEventListener('pointerdown', unlockAudio);
  document.addEventListener('keydown', unlockAudio);
  const activeSounds = new Set();
  let soundEnabled = true;
  let lastInput = 0;
  let scroll = 0;
  let targetScroll = 0;
  let followCursor = true;
  let cursorX = 0;
  let cursorY = 0;

  p.preload = () => {
    for (const [key, name] of glyphNames) glyphs.set(key, p.loadImage('data/' + name + '.png'));
  };

  p.setup = () => {
    p.createCanvas(paper.clientWidth, paper.clientHeight).parent(paper);
    p.noStroke();
  };

  p.windowResized = () => {
    p.resizeCanvas(paper.clientWidth, paper.clientHeight);
    followCursor = true;
  };

  function play(name) {
    const sample = samples.get(name);
    if (!soundEnabled || !sample) return;
    const voice = audio.createBufferSource();
    voice.buffer = sample;
    voice.connect(audio.destination);
    activeSounds.add(voice);
    voice.onended = () => {
      voice.disconnect();
      activeSounds.delete(voice);
    };
    voice.start();
  }

  function strike(key) {
    if (key === 'ArrowUp' || key === 'ArrowDown') {
      if (key === 'ArrowDown') play('ding');
      followCursor = false;
      targetScroll = p.constrain(targetScroll + (key === 'ArrowDown' ? 45 : -23), 0, cursorY);
      return true;
    }

    if (/^[a-z]$/i.test(key)) key = key.toUpperCase();
    const glyph = glyphs.get(key);
    if (!glyph) return false;
    if (key === 'Backspace') {
      // A delete impression remains on the paper after the previous key is removed.
      const lastKey = entries.findLastIndex(entry => entry.key !== 'Backspace');
      if (lastKey >= 0) entries.splice(lastKey, 1);
    }

    play(key === 'Enter' ? 'return' : 'single');
    entries.push({ key, glyph });
    lastInput = p.millis();
    followCursor = true;
    return true;
  }

  p.draw = () => {
    const now = p.millis();
    p.background(255);
    let x = 0;
    let y = 0;
    let lineHeight = 0;
    const placements = [];
    for (const { key, glyph } of entries) {
      const w = Math.floor(glyph.width / 5);
      const h = Math.floor(glyph.height / 5);
      if (key === 'Enter' || (x > 0 && x + w > p.width)) {
        x = 0;
        y += lineHeight + margin;
        lineHeight = 0;
      }
      placements.push({ glyph, x, y, w, h });
      x += w + margin;
      lineHeight = Math.max(lineHeight, h);
    }
    cursorX = x;
    cursorY = y;
    if (followCursor) targetScroll = Math.max(0, cursorY + 1);
    targetScroll = p.constrain(targetScroll, 0, cursorY + 1);
    scroll = p.lerp(scroll, targetScroll, 0.3);

    for (const { glyph, x, y, w, h } of placements) {
      if (y + h >= scroll && y - scroll < p.height) p.image(glyph, x, y - scroll, w, h);
    }
    if (Math.floor((now - lastInput) / 500) % 2 === 0) {
      p.fill(0);
      p.rect(Math.min(cursorX, p.width - 3), cursorY - scroll, 3, 60);
    }
  };

  document.addEventListener('keydown', event => {
    if (event.metaKey || event.ctrlKey || event.altKey || event.isComposing) return;
    if (event.target.closest('button') && (event.key === 'Enter' || event.key === ' ')) return;
    const handled = strike(event.key === 'Delete' ? 'Backspace' : event.key);
    if (handled) event.preventDefault();
  });

  keyboard.addEventListener('input', event => {
    if (event.inputType === 'deleteContentBackward') strike('Backspace');
    else if (event.inputType === 'insertLineBreak') strike('Enter');
    else for (const key of keyboard.value) strike(key);
    keyboard.value = '';
  });

  paper.addEventListener('click', () => keyboard.focus({ preventScroll: true }));
  paper.addEventListener('wheel', event => {
    event.preventDefault();
    followCursor = false;
    targetScroll = p.constrain(targetScroll + Math.sign(event.deltaY) * 23, 0, cursorY);
  }, { passive: false });

  document.querySelector('#type').addEventListener('click', () => keyboard.focus({ preventScroll: true }));
  soundButton.addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    soundButton.setAttribute('aria-pressed', String(soundEnabled));
    soundButton.textContent = soundEnabled ? 'Sound' : 'Muted';
    if (!soundEnabled) {
      for (const voice of activeSounds) voice.stop();
      activeSounds.clear();
    }
  });
});
