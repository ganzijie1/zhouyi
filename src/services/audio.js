let muted = false;
let tones;

const frequencies = { action: 360, success: 660, failure: 180 };

function toneUrl(frequency) {
  const sampleRate = 8000;
  const samples = Math.round(sampleRate * 0.08);
  const buffer = new ArrayBuffer(44 + samples * 2);
  const view = new DataView(buffer);
  const write = (offset, value) => [...value].forEach((character, index) => view.setUint8(offset + index, character.charCodeAt(0)));
  write(0, 'RIFF'); view.setUint32(4, 36 + samples * 2, true); write(8, 'WAVEfmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); write(36, 'data'); view.setUint32(40, samples * 2, true);
  for (let index = 0; index < samples; index++) {
    const envelope = Math.min(1, index / 40) * Math.max(0, 1 - index / samples);
    view.setInt16(44 + index * 2, Math.sin((index * frequency * Math.PI * 2) / sampleRate) * envelope * 5000, true);
  }
  return URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
}

function prepareTones() {
  if (tones || typeof window === 'undefined' || typeof window.Audio !== 'function') return;
  tones = new Map(Object.entries(frequencies).map(([kind, frequency]) => {
    const audio = new window.Audio(toneUrl(frequency));
    audio.preload = 'auto';
    audio.volume = 0.12;
    audio.load?.();
    return [kind, audio];
  }));
}

export function configureAudio(nextMuted) {
  muted = Boolean(nextMuted);
  prepareTones();
}

export function playTone(kind = 'action') {
  if (muted || typeof window === 'undefined') return;
  prepareTones();
  const audio = tones?.get(kind) ?? tones?.get('action');
  if (!audio) return;
  audio.currentTime = 0;
  const playback = audio.play();
  playback?.catch(() => {});
}
