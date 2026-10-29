// Gera os PNGs, o PDF do carrossel e o banner a partir dos HTMLs desta pasta.
// Uso: node docs/divulgacao/linkedin/gerar.js   (precisa do Playwright com o Chromium)
let chromium;
try { ({ chromium } = require('playwright')); } catch {
  console.error('Instale o Playwright: npm i -D playwright && npx playwright install chromium'); process.exit(1);
}
const path = require('path');
const dir = __dirname;

(async () => {
  const b = await chromium.launch();
  // Carrossel: 9 slides de 1080x1350, um PNG por slide e um PDF para post de documento
  const p = await b.newPage({ viewport: { width: 1080, height: 1350 } });
  await p.goto('file://' + path.join(dir, 'carrossel.html'), { waitUntil: 'networkidle' });
  await p.evaluate(() => document.fonts.ready);
  const slides = await p.$$('.slide');
  for (let i = 0; i < slides.length; i++) {
    await slides[i].screenshot({ path: path.join(dir, 'slides', `slide-${String(i + 1).padStart(2, '0')}.png`) });
  }
  // Conferência: nenhum conteúdo pode invadir o rodapé
  const folgas = await p.evaluate(() => [...document.querySelectorAll('.slide')].map((s, i) => {
    const pe = s.querySelector('.foot').getBoundingClientRect().top;
    let max = s.getBoundingClientRect().top;
    s.querySelectorAll('*').forEach(el => { if (!el.closest('.foot')) { const r = el.getBoundingClientRect(); if (r.height) max = Math.max(max, r.bottom); } });
    return [i + 1, Math.round(pe - max)];
  }));
  const invadidos = folgas.filter(([, f]) => f < 0);
  if (invadidos.length) console.warn('Slides invadindo o rodapé:', invadidos);
  await p.pdf({ path: path.join(dir, 'carrossel-agenda-whatsapp.pdf'), width: '1080px', height: '1350px', printBackground: true, preferCSSPageSize: true });

  // Banner único de 1200x627 (renderizado em 2x)
  const q = await b.newPage({ viewport: { width: 1200, height: 627 }, deviceScaleFactor: 2 });
  await q.goto('file://' + path.join(dir, 'banner.html'), { waitUntil: 'networkidle' });
  await q.evaluate(() => document.fonts.ready);
  await (await q.$('.banner')).screenshot({ path: path.join(dir, 'banner-1200x627.png') });
  await b.close();
  console.log('OK: slides/, carrossel-agenda-whatsapp.pdf e banner-1200x627.png');
})();
