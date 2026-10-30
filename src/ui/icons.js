import createElement from 'lucide/dist/esm/createElement.js';
import FlaskConical from 'lucide/dist/esm/icons/flask-conical.js';
import Gamepad2 from 'lucide/dist/esm/icons/gamepad-2.js';
import Grid3X3 from 'lucide/dist/esm/icons/grid-3x3.js';
import Library from 'lucide/dist/esm/icons/library.js';
import Lightbulb from 'lucide/dist/esm/icons/lightbulb.js';
import Network from 'lucide/dist/esm/icons/network.js';
import RotateCcw from 'lucide/dist/esm/icons/rotate-ccw.js';
import Settings from 'lucide/dist/esm/icons/settings.js';
import Undo2 from 'lucide/dist/esm/icons/undo-2.js';
import Volume2 from 'lucide/dist/esm/icons/volume-2.js';
import VolumeX from 'lucide/dist/esm/icons/volume-x.js';
import X from 'lucide/dist/esm/icons/x.js';

const icons = { 'flask-conical': FlaskConical, 'gamepad-2': Gamepad2, 'grid-3x3': Grid3X3, library: Library, lightbulb: Lightbulb, network: Network, 'rotate-ccw': RotateCcw, settings: Settings, 'undo-2': Undo2, 'volume-2': Volume2, 'volume-x': VolumeX, x: X };

export function renderIcons() {
  document.querySelectorAll('i[data-lucide]').forEach((placeholder) => {
    const definition = icons[placeholder.dataset.lucide];
    if (!definition) return;
    const svg = createElement(definition);
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('width', '24');
    svg.setAttribute('height', '24');
    placeholder.replaceWith(svg);
  });
}
