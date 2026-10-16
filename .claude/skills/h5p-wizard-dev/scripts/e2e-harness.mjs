// E2E-/Regressionstest für den H5P-Wizard (Headless-Chromium via Playwright).
//
// - Ersetzt externe Ressourcen (JSZip, FileSaver, Templates von ws-lab.de, Font Awesome)
//   durch lokale Dateien bzw. synthetische Template-Pakete -> läuft offline/ohne Proxy-Freigabe.
// - Erzeugt den Prompt für jeden Inhaltstyp und prüft, ob Thema/Anweisung/Basistext ankommen.
// - Packt Test-JSON zu .h5p und prüft das Mapping (CASES unten). Die Pakete landen in OUT/,
//   dort anschließend validate-h5p.py laufen lassen.
//
// Vorbereitung (einmalig, im Scratch-Verzeichnis):
//   npm i --prefix "$OUT" jszip@3 file-saver@2
// Aufruf:
//   node e2e-harness.mjs --html "/pfad/H5P-Wizard (V.x).html" --out "$OUT"
// Exitcode 1, wenn ein Check fehlschlägt (bekannte Bugs sind mit known:true markiert und
// zählen nur mit --strict als Fehler).
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => {
  if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]);
  return acc;
}, []));
const OUT = path.resolve(args.out || '.');
const HTML = path.resolve(args.html || fs.readdirSync(process.cwd()).find(f => /^H5P-Wizard.*\.html$/.test(f)) || '');
if (!fs.existsSync(HTML)) { console.error('Wizard-HTML nicht gefunden: --html angeben'); process.exit(2); }
const require = createRequire(path.join(OUT, 'package.json'));
const JSZip = require('jszip');
const NM = path.join(OUT, 'node_modules');
const PW = ['/opt/node-tools/node_modules/playwright/index.mjs', 'playwright'];
let chromium;
for (const p of PW) { try { ({ chromium } = await import(p)); break; } catch { /* next */ } }
if (!chromium) { console.error('Playwright nicht gefunden'); process.exit(2); }

// Synthetische Templates: Paket mit h5p.json + leeren Bibliotheksordnern in "typischen" Versionen.
const DEPS = {
  'fill-in-the-blanks': ['H5P.Blanks 1.14'],
  'advanced-blanks': ['H5P.AdvancedBlanks 1.2'],
  'drag-the-words': ['H5P.DragText 1.10'],
  'mark-the-words': ['H5P.MarkTheWords 1.11'],
  'multiple-choice': ['H5P.MultiChoice 1.16'],
  'question-set': ['H5P.QuestionSet 1.20', 'H5P.MultiChoice 1.16', 'H5P.TrueFalse 1.8', 'H5P.Blanks 1.14', 'H5P.DragText 1.10', 'H5P.MarkTheWords 1.11'],
  'single-choice-set': ['H5P.SingleChoiceSet 1.11'],
  'true-false': ['H5P.TrueFalse 1.8'],
  'dialog-cards': ['H5P.Dialogcards 1.9'],
  'flashcards': ['H5P.Flashcards 1.7'],
  'sort-paragraphs': ['H5P.SortParagraphs 0.11'],
  'guess-the-answer': ['H5P.GuessTheAnswer 1.5', 'H5P.Image 1.1'],
  'summary': ['H5P.Summary 1.10'],
  'interactive-video': ['H5P.InteractiveVideo 1.28', 'H5P.MultiChoice 1.16', 'H5P.TrueFalse 1.8'],
  'h5p-column': ['H5P.Column 1.16', 'H5P.AdvancedText 1.1', 'H5P.MultiChoice 1.16', 'H5P.TrueFalse 1.8', 'H5P.Blanks 1.14', 'H5P.Summary 1.10', 'H5P.SingleChoiceSet 1.11'],
  'accordion': ['H5P.Accordion 1.0', 'H5P.AdvancedText 1.1'],
  'crossword': ['H5P.Crossword 0.4'],
  'timeline': ['H5P.Timeline 1.1'],
};
async function makeTemplate(url) {
  const key = Object.keys(DEPS).find(k => url.includes(k));
  const deps = (DEPS[key] || ['H5P.Unknown 1.0']).map(s => { const [m, v] = s.split(' '); const [a, b] = v.split('.'); return { machineName: m, majorVersion: a, minorVersion: b }; });
  const zip = new JSZip();
  zip.file('h5p.json', JSON.stringify({ title: 'Tpl', language: 'de', mainLibrary: deps[0].machineName, embedTypes: ['iframe'], license: 'U', preloadedDependencies: deps }));
  zip.file('content/content.json', JSON.stringify({ l10n: { checkAnswer: 'Überprüfen' } }));
  for (const d of deps) zip.file(`${d.machineName}-${d.majorVersion}.${d.minorVersion}/library.json`, '{}');
  return zip.generateAsync({ type: 'nodebuffer' });
}

const browser = await chromium.launch(fs.existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {})
  .catch(() => chromium.launch());
const ctx = await browser.newContext({ acceptDownloads: true });
await ctx.addInitScript(() => {
  window.__prompts = [];
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: t => { window.__prompts.push(t); return Promise.resolve(); } } });
});
await ctx.route('**/*', async route => {
  const u = route.request().url();
  if (u.startsWith('file:')) return route.continue();
  if (/jszip(\.min)?\.js/i.test(u)) return route.fulfill({ path: path.join(NM, 'jszip/dist/jszip.min.js'), contentType: 'text/javascript' });
  if (/filesaver(\.min)?\.js/i.test(u)) return route.fulfill({ path: path.join(NM, 'file-saver/dist/FileSaver.min.js'), contentType: 'text/javascript' });
  if (u.endsWith('.h5p')) return route.fulfill({ body: await makeTemplate(u), contentType: 'application/zip', headers: { 'access-control-allow-origin': '*' } });
  return route.fulfill({ body: '', status: 200 });
});

const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', e => pageErrors.push(e.message));
await page.goto('file://' + HTML);
await page.selectOption('#schulart', 'Gymnasium');
await page.click('#fach-display');
await page.click('.custom-select-option[data-value="Biologie"]');
await page.selectOption('#klasse', '8');
const typeCount = await page.$$eval('input[name="type"]', e => e.length);
await page.waitForFunction(n => document.querySelectorAll('.type-grid label.has-template').length >= n - 1, typeCount, { timeout: 30000 })
  .catch(() => console.warn('WARN: nicht alle Templates im Cache'));

async function selectType(id) {
  await page.evaluate(id => { const el = document.getElementById(id); el.checked = true; el.dispatchEvent(new Event('change')); }, id);
}

const results = [];
const record = (name, ok, detail, known = false) => results.push({ name, ok, detail, known });

// ---------- 1) Prompts ----------
const SINGLE_ITEM_TYPES = ['True False', 'Guess the Answer'];
const TYPES = await page.$$eval('input[name="type"]', els => els.filter(e => getComputedStyle(e.nextElementSibling).display !== 'none').map(e => ({ id: e.id, value: e.value })));
for (const t of TYPES) {
  await selectType(t.id);
  await page.evaluate(() => navigateTo(4));
  await page.fill('#topic', 'THEMA-Photosynthese');
  await page.fill('#task', 'ANWEISUNG-XYZ');
  await page.fill('#ref', 'BASISTEXT-ABC');
  await page.click('#genBtn');
  const p = await page.evaluate(() => window.__prompts.at(-1));
  fs.writeFileSync(path.join(OUT, `prompt-${t.id}.txt`), p);
  const miss = ['THEMA-Photosynthese', 'ANWEISUNG-XYZ', 'BASISTEXT-ABC'].filter(s => !p.includes(s));
  record(`prompt:${t.value}: Thema/Anweisung/Basistext enthalten`, miss.length === 0, miss.length ? 'fehlt: ' + miss.join(', ') : '',
    ['Interactive Video', 'Accordion', 'Crossword', 'Timeline'].includes(t.value));
  if (SINGLE_ITEM_TYPES.includes(t.value)) {
    const m = p.match(/Exakt \d+ Fragen/);
    record(`prompt:${t.value}: keine Mengenangabe für Einzelaufgabe`, !m, m ? m[0] : '', true);
  }
}

// ---------- 2) Packing ----------
async function pack(name, typeId, json, setup) {
  await selectType(typeId);
  if (setup) await page.evaluate(setup);
  await page.evaluate(() => navigateTo(5));
  await page.fill('#fname', 'Test Übung');
  await page.fill('#jsonIn', typeof json === 'string' ? json : JSON.stringify(json));
  if (await page.$eval('#packBtn', b => b.disabled)) return { packBtnDisabled: true, validation: await page.$eval('#jsonValidationStatus', e => e.textContent) };
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 10000 }).catch(() => null), page.click('#packBtn')]);
  const status = await page.$eval('#packStatus', e => e.textContent);
  if (!dl) return { status };
  const file = path.join(OUT, `pack-${name}.h5p`);
  await dl.saveAs(file);
  const zip = await JSZip.loadAsync(fs.readFileSync(file));
  return { status, file, filename: dl.suggestedFilename(), h5p: JSON.parse(await zip.file('h5p.json').async('string')), content: JSON.parse(await zip.file('content/content.json').async('string')), files: Object.keys(zip.files) };
}

// Jeder Fall: [name, typeId, json, check(result) -> Fehlertext|null, known?, setup?]
const CASES = [
  ['mc-mehrere-fragen', 't-mc', { questions: [1, 2, 3].map(i => ({ text: 'F' + i, answers: [{ text: 'a', correct: true }, { text: 'b', correct: false, feedback: 'nein' }] })) },
    r => (r.content && r.h5p.mainLibrary === 'H5P.QuestionSet') || (r.content?.questions?.length === 3) ? null : 'nur 1 von 3 Fragen exportiert', true],
  ['mc-behaviour-type', 't-mc', { text: 'F', answers: [{ text: 'a', correct: true }, { text: 'b', correct: false }] },
    r => r.content?.behaviour?.type ? null : 'behaviour.type fehlt (singleAnswer ist veraltet)', true],
  ['tf-feedback', 't-tf', { question: 'Pflanzen atmen nur nachts.', correct: 'false', feedback: 'Zellatmung läuft immer.' },
    r => r.content?.behaviour?.feedbackOnWrong ? null : 'Feedback nicht in behaviour.feedbackOnWrong', true],
  ['blanks-url-im-text', 't-blanks', '```json\n{"text":"Fülle die Lücken.","questions":["Mehr unter https://example.org: Die *Sonne* scheint."]}\n```',
    r => r.packBtnDisabled ? 'sanitizeJSON zerstört "//" in Strings: ' + r.validation : null, true],
  // Blanks.questions ist ein HTML-Feld: rohes "<" wird vom HTML-Filter als Tag-Anfang behandelt.
  ['blanks-html-escape', 't-blanks', { text: 'Fülle die Lücken.', questions: ['Es gilt 3 < 5 und *Wasser* & Licht.'] },
    r => /3 &lt; 5/.test(r.content?.questions?.[0] || '') ? null : '"<" / "&" in HTML-Feld nicht kodiert', true],
  ['timeline-epochen', 't-timeline', { headline: 'H', intro: 'I', events: [{ startDate: '1919', headline: 'E', text: 't' }], eras: [{ startDate: '1918', endDate: '1933', label: 'Weimarer Republik' }] },
    r => r.content?.timeline?.era?.[0]?.headline === 'Weimarer Republik' ? null : 'Epochen-Titel nicht in era[].headline', true],
  ['complex-blanks-alle-antworten', 't-complex-blanks', { taskDescription: 'T', text: 'In ____ landete Apollo 11.', blanks: [{ correct: '1969', incorrectAnswers: [{ text: '1968', feedback: 'zu früh' }] }] },
    r => ['alternatives', 'all'].includes(r.content?.behaviour?.selectAlternatives) ? null : 'selectAlternatives=' + r.content?.behaviour?.selectAlternatives + ' (erlaubt: alternatives|all)', true,
    () => { const m = document.getElementById('complex-blanks-mode'); m.value = 'selection'; m.dispatchEvent(new Event('change')); document.getElementById('complex-blanks-alternatives').value = 'answers'; }],
  ['questionset-tf-feedback', 't-qs', { questions: [{ type: 'tf', question: 'Q', correct: 'false', feedback: 'Begründung' }, { type: 'mc', text: 'M', answers: [{ text: 'a', correct: true }, { text: 'b', correct: false }] }] },
    r => r.content?.questions?.[0]?.params?.behaviour?.feedbackOnWrong ? null : 'TF-Feedback im QuestionSet geht verloren', true],
  ['sort-taskdescription', 't-sort', { paragraphs: ['A', 'B', 'C'] },
    r => r.content?.taskDescription ? null : 'Pflichtfeld taskDescription fehlt', true],
  ['page-versionen', 't-page', { blocks: [{ type: 'text', text: 'Hallo' }, { type: 'mc', question: 'Q', answers: [{ text: 'a', correct: true }, { text: 'b', correct: false }] }] },
    r => { const col = r.h5p?.preloadedDependencies?.find(d => d.machineName === 'H5P.Column'); const has = r.files?.some(f => f.startsWith(`H5P.Column-${col?.majorVersion}.${col?.minorVersion}/`)); return has ? null : `h5p.json verlangt H5P.Column ${col?.majorVersion}.${col?.minorVersion}, Paket enthält andere Version`; }, true],
  ['crossword-versionen', 't-crossword', { taskDescription: 'Löse', words: [{ answer: 'Blatt', clue: 'grün' }, { answer: 'Wurzel', clue: 'unten' }, { answer: 'Licht', clue: 'hell' }] },
    r => { const d = r.h5p?.preloadedDependencies?.find(d => d.machineName === 'H5P.Crossword'); return r.files?.some(f => f.startsWith(`H5P.Crossword-${d?.majorVersion}.${d?.minorVersion}/`)) ? null : 'Versions-Mismatch h5p.json vs. Bibliotheksordner'; }, true],
  ['dateiname-umlaute', 't-cards', { cards: [{ text: 'Photosynthese', answer: 'Licht → Glucose' }] },
    r => /Ue?bung/i.test(r.filename || '') ? null : 'Dateiname verstümmelt: ' + r.filename, true],
];
for (const [name, typeId, json, check, known, setup] of CASES) {
  let r;
  try { r = await pack(name, typeId, json, setup); } catch (e) { r = { error: e.message }; }
  const err = r.error ? r.error : check(r);
  record(`pack:${name}`, !err, err || '', !!known);
}

record('keine JavaScript-Fehler', pageErrors.length === 0, pageErrors.join(' | '));
await browser.close();

fs.writeFileSync(path.join(OUT, 'e2e-results.json'), JSON.stringify(results, null, 2));
let failed = 0;
for (const r of results) {
  const tag = r.ok ? 'PASS' : (r.known ? 'KNOWN' : 'FAIL');
  if (!r.ok && (!r.known || args.strict)) failed++;
  console.log(`${tag.padEnd(5)} ${r.name}${r.detail ? ' – ' + r.detail : ''}`);
}
console.log(`\n${results.filter(r => r.ok).length}/${results.length} bestanden, ${results.filter(r => !r.ok && r.known).length} bekannte Bugs, ${failed} neue Fehler`);
console.log('Artefakte: ' + OUT);
process.exit(failed ? 1 : 0);
