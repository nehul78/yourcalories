import { demo } from './fake-api.js'; // must come first: it replaces fetch
import { start, welcome } from '../public/js/app.js';
import { GET, setToken } from '../public/js/api.js';

const as = async (id) => { demo.current = id; setToken('demo'); start(await GET('/api/me')); };
document.querySelector('#demo-bar').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-as]');
  if (!b) return;
  document.querySelectorAll('#demo-bar button').forEach((x) => x.classList.toggle('on', x === b));
  if (b.dataset.as === 'new') { demo.current = null; setToken(null); welcome(); } else as(Number(b.dataset.as));
});
