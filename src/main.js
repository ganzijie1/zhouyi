import './styles.css';
import { mountApp } from './ui/app.js';

mountApp(document.querySelector('#app'));

let iconModule;
async function renderIcons() {
  iconModule ??= await import('./ui/icons.js');
  iconModule.renderIcons();
}

document.addEventListener('yijing:icons', renderIcons);
setTimeout(renderIcons, 350);
