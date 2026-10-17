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
  'multiple-choice': ['H5P.MultiChoice 1.16', 'H5P.Question 1.4'],
  'question-set': ['H5P.QuestionSet 1.20', 'H5P.MultiChoice 1.16', 'H5P.TrueFalse 1.8', 'H5P.Blanks 1.14', 'H5P.DragText 1.10', 'H5P.MarkTheWords 1.11'],
  'single-choice-set': ['H5P.SingleChoiceSet 1.11'],
  'true-false': ['H5P.TrueFalse 1.8'],
  'dialog-cards': ['H5P.Dialogcards 1.9'],
  'flashcards': ['H5P.Flashcards 1.7'],
  'sort-paragraphs': ['H5P.SortParagraphs 0.11'],
  'guess-the-answer': ['H5P.GuessTheAnswer 1.5', 'H5P.Image 1.1'],
  'summary': ['H5P.Summary 1.10'],
  'interactive-video': ['H5P.InteractiveVideo 1.28', 'H5P.MultiChoice 1.16', 'H5P.TrueFalse 1.8', 'H5P.Summary 1.10'],
  'h5p-column': ['H5P.Column 1.16', 'H5P.AdvancedText 1.1', 'H5P.MultiChoice 1.16', 'H5P.TrueFalse 1.8', 'H5P.Blanks 1.14', 'H5P.Summary 1.10', 'H5P.SingleChoiceSet 1.11'],
  'accordion': ['H5P.Accordion 1.0', 'H5P.AdvancedText 1.1'],
  'crossword': ['H5P.Crossword 0.4'],
  'timeline': ['H5P.Timeline 1.1'],
};
// Template-Inhalte wie aus einem deutschen WordPress-Export: Beschriftungen (sollen erhalten bleiben)
// plus Beispielinhalte und Medien (dürfen NICHT ins Ergebnis gelangen)
const IMG = { library: 'H5P.Image 1.1', params: { file: { path: 'images/template.jpg', mime: 'image/jpeg' } }, subContentId: 'tpl-img', metadata: {} };
const TPL_CONTENT = {
  'multiple-choice': { question: '<p>Template-Frage</p>', answers: [{ text: 'T', correct: true }], media: { type: IMG }, UI: { checkAnswerButton: 'Überprüfen' }, behaviour: { randomAnswers: false, enableRetry: true }, confirmCheck: { header: 'Beenden?' } },
  'question-set': { introPage: { showIntroPage: true, title: 'Beispiel-Quiz' }, poolSize: 2, texts: { finishButton: 'Beenden' },
    endGame: { showResultPage: true, showAnimations: false, skippable: false, successVideo: { path: 'v.mp4' } },
    questions: [{ library: 'H5P.MultiChoice 1.16', params: { question: '<p>B</p>', UI: { checkAnswerButton: 'Überprüfen' }, media: { type: IMG } }, subContentId: 'tpl-q1', metadata: { title: 'Alt' } }] },
  'dialog-cards': { title: '<p>Beispiel-Titel</p>', description: '<p>Beispiel</p>', dialogs: [{ text: 'a', answer: 'b' }], answer: 'Umdrehen', next: 'Weiter', mode: 'normal' },
};
// Zusätzliche Bibliotheksordner ohne Eintrag in h5p.json (Exporte enthalten teils mehrere Versionen)
const EXTRA_FOLDERS = { 'multiple-choice': ['H5P.Question-1.5'] };
async function makeTemplate(url) {
  const key = Object.keys(DEPS).find(k => url.includes(k));
  const deps = (DEPS[key] || ['H5P.Unknown 1.0']).map(s => { const [m, v] = s.split(' '); const [a, b] = v.split('.'); return { machineName: m, majorVersion: a, minorVersion: b }; });
  const zip = new JSZip();
  zip.file('h5p.json', JSON.stringify({ title: 'Tpl', language: 'de', mainLibrary: deps[0].machineName, embedTypes: ['iframe'], license: 'U', preloadedDependencies: deps }));
  zip.file('content/content.json', JSON.stringify(TPL_CONTENT[key] || {}));
  for (const d of deps) zip.file(`${d.machineName}-${d.majorVersion}.${d.minorVersion}/library.json`, '{}');
  for (const f of EXTRA_FOLDERS[key] || []) zip.file(`${f}/library.json`, '{}');
  return zip.generateAsync({ type: 'nodebuffer' });
}

const browser = await chromium.launch(fs.existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {})
  .catch(() => chromium.launch());
const ctx = await browser.newContext({ acceptDownloads: true });
await ctx.addInitScript(() => {
  // Die Altfälle prüfen den Server-Vorlagen-Modus; die eingebauten Vorlagen haben eigene Fälle
  try { if (!localStorage.getItem('h5pWizard.tplSource')) localStorage.setItem('h5pWizard.tplSource', 'server'); } catch (e) { /* ohne Speicher */ }
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
const SINGLE_ITEM_TYPES = ['Guess the Answer'];
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
  // Interactive Video bettet den Basistext als Transkript ein – gleiche Prüfung
  record(`prompt:${t.value}: Thema/Anweisung/Basistext enthalten`, miss.length === 0, miss.length ? 'fehlt: ' + miss.join(', ') : '');
  if (SINGLE_ITEM_TYPES.includes(t.value)) {
    const m = p.match(/\*\*Anzahl:\*\*[^\n]*/);
    record(`prompt:${t.value}: keine Mengenangabe für Einzelaufgabe`, !m, m ? m[0] : '');
  }
  if (t.value === 'Sort the Paragraphs') {
    record('prompt:Sort the Paragraphs: Menge in Absätzen', /Exakt \d+ Absätze/.test(p), '');
    record('prompt:Sort the Paragraphs: Beispiel ohne Nummerierung', !/"1\. /.test(p), '');
  }
  if (t.value === 'Multiple Choice') record('prompt:Multiple Choice: Format mit "questions"-Array', /\{"questions":\[/.test(p), '');
  record(`prompt:${t.value}: korrekter Artikel der Schulart`, !/an der Gymnasium/.test(p), '');
}

// ---------- 2) Packing ----------
async function pack(name, typeId, json, setup) {
  await selectType(typeId);
  if (setup) await page.evaluate(setup);
  await page.evaluate(() => navigateTo(5));
  await page.fill('#fname', 'Test Übung');
  await page.fill('#jsonIn', typeof json === 'string' ? json : JSON.stringify(json));
  const validation = await page.$eval('#jsonValidationStatus', e => e.textContent);
  if (await page.$eval('#packBtn', b => b.disabled)) return { packBtnDisabled: true, validation };
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 10000 }).catch(() => null), page.click('#packBtn')]);
  const status = await page.$eval('#packStatus', e => e.textContent);
  if (!dl) return { status, validation };
  const file = path.join(OUT, `pack-${name}.h5p`);
  await dl.saveAs(file);
  const zip = await JSZip.loadAsync(fs.readFileSync(file));
  return { status, validation, file, filename: dl.suggestedFilename(), h5p: JSON.parse(await zip.file('h5p.json').async('string')), content: JSON.parse(await zip.file('content/content.json').async('string')), files: Object.keys(zip.files) };
}

// Schaltet im Wizard auf eingebaute Vorlagen um (läuft im Browser)
const USE_BUILTIN = () => { const s = document.getElementById('tpl-source'); if (s && s.value !== 'builtin') { s.value = 'builtin'; s.dispatchEvent(new Event('change')); } };
// Jeder Fall: [name, typeId, json, check(result) -> Fehlertext|null, known?, setup?]
const CASES = [
  ['mc-mehrere-fragen', 't-mc', { questions: [1, 2, 3].map(i => ({ text: 'F' + i, answers: [{ text: 'a', correct: true }, { text: 'b', correct: false, feedback: 'nein' }] })) },
    r => (r.h5p?.mainLibrary === 'H5P.QuestionSet' && r.content?.questions?.length === 3) ? null : 'nur 1 von 3 Fragen exportiert'],
  ['vorschau-anzahl', 't-mc', { questions: [1, 2, 3].map(i => ({ text: 'F' + i, answers: [{ text: 'a', correct: true }, { text: 'b', correct: false }] })) },
    r => /3 Fragen erkannt/.test(r.validation || '') ? null : 'Vorschau fehlt: ' + r.validation],
  ['validierung-sperrt-export', 't-mc', { questions: [{ text: 'F', answers: [{ text: 'a', correct: false }, { text: 'b', correct: false }] }] },
    r => (r.packBtnDisabled && /keine Antwort mit/.test(r.validation || '')) ? null : 'Frage ohne richtige Antwort wurde nicht gesperrt'],
  ['falscher-typ-erkannt', 't-blanks', { questions: [{ text: 'F1', answers: [{ text: 'a', correct: true }] }] },
    r => (r.packBtnDisabled && /passt das JSON/.test(r.validation || '')) ? null : 'MC-JSON bei Lückentext nicht erkannt: ' + r.validation],
  ['template-merge-mc', 't-mc', { questions: [{ text: 'Neu', answers: [{ text: 'a', correct: true }, { text: 'b', correct: false }] }] },
    r => { const c = r.content || {}; return (c.UI?.checkAnswerButton === 'Überprüfen' && c.confirmCheck?.header === 'Beenden?' && !c.media && c.behaviour?.randomAnswers === false && /Neu/.test(c.question)) ? null : 'Merge fehlerhaft: ' + JSON.stringify(c).slice(0, 200); }],
  ['template-merge-quiz', 't-qs', { questions: [{ type: 'mc', text: 'Wie heißt X?', answers: [{ text: 'a', correct: true }, { text: 'b', correct: false }] }] },
    r => { const c = r.content || {}, q = c.questions?.[0] || {}; const ok = c.texts?.finishButton === 'Beenden' && !c.introPage && !('poolSize' in c) && c.endGame?.showAnimations === false && !c.endGame?.successVideo
      && q.params?.UI?.checkAnswerButton === 'Überprüfen' && !q.params?.media && q.subContentId !== 'tpl-q1' && q.metadata?.title === 'Wie heißt X?'; return ok ? null : 'Merge fehlerhaft: ' + JSON.stringify(c).slice(0, 300); }],
  ['template-merge-karten', 't-cards', { cards: [{ text: 'Vorne', answer: 'Hinten' }] },
    r => { const c = r.content || {}; return (c.answer === 'Umdrehen' && !c.title && !c.description && c.dialogs?.length === 1) ? null : 'Merge fehlerhaft: ' + JSON.stringify(c).slice(0, 200); }],
  ['mc-behaviour-type', 't-mc', { text: 'F', answers: [{ text: 'a', correct: true }, { text: 'b', correct: false }] },
    r => r.content?.behaviour?.type ? null : 'behaviour.type fehlt (singleAnswer ist veraltet)'],
  ['mehrere-versionen-im-template', 't-mc', { questions: [{ text: 'F', answers: [{ text: 'a', correct: true }, { text: 'b', correct: false }] }] },
    r => { const q = r.h5p?.preloadedDependencies?.find(d => d.machineName === 'H5P.Question'); return q && `${q.majorVersion}.${q.minorVersion}` === '1.4' ? null : 'h5p.json-Version ersetzt, obwohl im Template vorhanden: ' + JSON.stringify(q); }],
  ['tf-feedback', 't-tf', { question: 'Pflanzen atmen nur nachts.', correct: 'false', feedback: 'Zellatmung läuft immer.' },
    r => r.content?.behaviour?.feedbackOnWrong ? null : 'Feedback nicht in behaviour.feedbackOnWrong'],
  ['tf-mehrere-aussagen', 't-tf', { questions: [{ question: 'A', correct: 'true', feedback: 'x' }, { question: 'B', correct: false, feedback: 'y' }] },
    r => (r.h5p?.mainLibrary === 'H5P.QuestionSet' && r.content?.questions?.every(q => q.library.startsWith('H5P.TrueFalse')) && r.content.questions[1].params.correct === 'false') ? null : 'mehrere TF-Aussagen nicht als Question Set verpackt'],
  ['blanks-url-im-text', 't-blanks', '```json\n{"text":"Fülle die Lücken.","questions":["Mehr unter https://example.org: Die *Sonne* scheint."]}\n```',
    r => r.packBtnDisabled ? 'sanitizeJSON zerstört "//" in Strings: ' + r.validation : (/https:\/\/example\.org/.test(r.content?.questions?.[0] || '') ? null : 'URL fehlt im Ergebnis')],
  ['json-kommentar-und-komma', 't-blanks', 'Hier ist dein JSON:\n{"text":"Lies // genau.","questions":["Die *Sonne* scheint.",], // Kommentar\n}\nViel Erfolg!',
    r => r.packBtnDisabled ? 'Reparatur fehlgeschlagen: ' + r.validation : (/Lies \/\/ genau/.test(r.content?.text || '') ? null : '"//" im String beschädigt')],
  // Blanks.questions ist ein HTML-Feld: rohes "<" wird vom HTML-Filter als Tag-Anfang behandelt.
  ['blanks-html-escape', 't-blanks', { text: 'Fülle die Lücken.', questions: ['Es gilt 3 < 5 und *Wasser* & Licht.'] },
    r => /3 &lt; 5/.test(r.content?.questions?.[0] || '') ? null : '"<" / "&" in HTML-Feld nicht kodiert'],
  ['timeline-epochen', 't-timeline', { headline: 'H', intro: 'I', events: [{ startDate: '1919', headline: 'E', text: 't' }], eras: [{ startDate: '1918', endDate: '1933', label: 'Weimarer Republik' }] },
    r => r.content?.timeline?.era?.[0]?.headline === 'Weimarer Republik' ? null : 'Epochen-Titel nicht in era[].headline'],
  ['timeline-datumsformat', 't-timeline', { headline: 'H', events: [{ startDate: '9.11.1989', headline: 'Mauerfall' }, { startDate: '44 v. Chr.', headline: 'Caesar' }, { startDate: 1990, headline: 'Einheit' }] },
    r => { const d = r.content?.timeline?.date || []; const got = d.map(e => e.startDate).join('|'); return got === '1989,11,9|-44|1990' ? null : 'Datumsformat: ' + got; }],
  ['complex-blanks-alle-antworten', 't-complex-blanks', { taskDescription: 'T', text: 'In ____ landete Apollo 11.', blanks: [{ correct: '1969', incorrectAnswers: [{ text: '1968', feedback: 'zu früh' }] }] },
    r => r.content?.behaviour?.selectAlternatives === 'all' ? null : 'selectAlternatives=' + r.content?.behaviour?.selectAlternatives + ' (erwartet: all)', false,
    () => { const m = document.getElementById('complex-blanks-mode'); m.value = 'selection'; m.dispatchEvent(new Event('change')); const a = document.getElementById('complex-blanks-alternatives'); a.value = [...a.options].some(o => o.value === 'all') ? 'all' : 'answers'; }],
  ['questionset-tf-feedback', 't-qs', { questions: [{ type: 'tf', question: 'Q', correct: 'false', feedback: 'Begründung' }, { type: 'mc', text: 'M', answers: [{ text: 'a', correct: true }, { text: 'b', correct: false }] }] },
    r => r.content?.questions?.[0]?.params?.behaviour?.feedbackOnWrong ? null : 'TF-Feedback im QuestionSet geht verloren'],
  ['sort-taskdescription', 't-sort', { paragraphs: ['1. A', '2) B', 'C'] },
    r => !r.content?.taskDescription ? 'Pflichtfeld taskDescription fehlt' : (r.content.paragraphs?.join('') === '<p>A</p><p>B</p><p>C</p>' ? null : 'Nummerierung nicht entfernt: ' + r.content.paragraphs?.join(''))],
  ['page-versionen', 't-page', { blocks: [{ type: 'text', text: 'Hallo' }, { type: 'mc', question: 'Q', answers: [{ text: 'a', correct: true }, { text: 'b', correct: false }] }] },
    r => { const col = r.h5p?.preloadedDependencies?.find(d => d.machineName === 'H5P.Column'); const has = r.files?.some(f => f.startsWith(`H5P.Column-${col?.majorVersion}.${col?.minorVersion}/`)); return has ? null : `h5p.json verlangt H5P.Column ${col?.majorVersion}.${col?.minorVersion}, Paket enthält andere Version`; }],
  ['crossword-versionen', 't-crossword', { taskDescription: 'Löse', words: [{ answer: 'Blatt', clue: 'grün' }, { answer: 'Wurzel', clue: 'unten' }, { answer: 'Größe', clue: 'Maß' }] },
    r => { const d = r.h5p?.preloadedDependencies?.find(d => d.machineName === 'H5P.Crossword'); if (!r.files?.some(f => f.startsWith(`H5P.Crossword-${d?.majorVersion}.${d?.minorVersion}/`))) return 'Versions-Mismatch h5p.json vs. Bibliotheksordner'; return r.content?.words?.[2]?.answer === 'GROESSE' ? null : 'Umlaute nicht ersetzt: ' + r.content?.words?.[2]?.answer; }],
  ['video-shorts-url', 't-video', { interactions: [{ time: '1:02:03', type: 'tf', question: 'Q', correct: 'true', feedback: 'f' }] },
    r => { const v = r.content?.interactiveVideo; const path = v?.video?.files?.[0]?.path; const t = v?.assets?.interactions?.[0]?.duration?.from; return path === 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' && t === 3723 ? null : `Video-URL ${path}, Zeit ${t}`; }, false,
    () => { document.getElementById('youtube-url').value = 'https://youtube.com/shorts/dQw4w9WgXcQ?feature=share'; }],
  ['video-zusammenfassung', 't-video', { interactions: [{ time: 30, type: 'mc', question: 'Q', answers: [{ text: 'a', correct: true }, { text: 'b', correct: false }] }], summary: [['Richtig 1', 'Falsch 1a', 'Falsch 1b'], ['Richtig 2', 'Falsch 2a']] },
    r => { const s = r.content?.interactiveVideo?.summary; return (s?.task?.library?.startsWith('H5P.Summary') && s.task.params.summaries.length === 2 && /Richtig 1/.test(s.task.params.summaries[0].summary[0])) ? null : 'Zusammenfassung fehlt: ' + JSON.stringify(s); }, false,
    () => { document.getElementById('youtube-url').value = 'https://youtu.be/dQw4w9WgXcQ'; const c = document.getElementById('iv-summary'); if (c) c.checked = true; }],
  ['dateiname-umlaute', 't-cards', { cards: [{ text: 'Photosynthese', answer: 'Licht → Glucose' }] },
    r => /Ue?bung/i.test(r.filename || '') ? null : 'Dateiname verstümmelt: ' + r.filename],
  ['lizenz-autorin', 't-tf', { questions: [{ question: 'A', correct: 'true' }, { question: 'B', correct: 'false' }] },
    r => { const h = r.h5p || {}; const q = r.content?.questions?.[0]; return (h.license === 'CC BY-SA' && h.licenseVersion === '4.0' && h.authors?.[0]?.name === 'Test Person' && q?.metadata?.license === 'CC BY-SA') ? null : 'Lizenz/Autor:in fehlt: ' + JSON.stringify({ license: h.license, v: h.licenseVersion, a: h.authors, sub: q?.metadata }); }, false,
    () => { const l = document.getElementById('license'); if (l) l.value = 'CC BY-SA|4.0'; const a = document.getElementById('author'); if (a) a.value = 'Test Person'; }],
  // ----- Eingebaute Vorlagen (ohne Bibliotheks-Code) -----
  ['eingebaut-mc', 't-mc', { questions: [{ text: 'F', answers: [{ text: 'a', correct: true }, { text: 'b', correct: false }] }] },
    r => { const d = r.h5p?.preloadedDependencies || []; const ok = r.files?.length === 2 && r.h5p?.mainLibrary === 'H5P.MultiChoice' && d.some(x => x.machineName === 'H5P.MultiChoice')
      && r.content?.UI?.checkAnswerButton === 'Überprüfen' && /Benötigt in Moodle/.test(r.status || ''); return ok ? null : 'eingebaut fehlerhaft: ' + JSON.stringify({ files: r.files, main: r.h5p?.mainLibrary, ui: r.content?.UI, status: r.status }); }, false, USE_BUILTIN],
  ['eingebaut-quiz-tf', 't-tf', { questions: [{ question: 'A', correct: 'true' }, { question: 'B', correct: 'false', feedback: 'x' }] },
    r => { const d = r.h5p?.preloadedDependencies || []; const q = r.content?.questions?.[0]; const ok = r.h5p?.mainLibrary === 'H5P.QuestionSet' && d.some(x => x.machineName === 'H5P.TrueFalse')
      && q?.params?.l10n?.trueText === 'Wahr' && r.content?.texts?.finishButton === 'Beenden' && r.content?.questions?.[1]?.params?.behaviour?.feedbackOnWrong === 'x'; return ok ? null : 'Quiz eingebaut fehlerhaft: ' + JSON.stringify(r.content).slice(0, 300); }, false, USE_BUILTIN],
  ['eingebaut-eigene-version', 't-page', { blocks: [{ type: 'text', text: 'Hallo' }, { type: 'tf', question: 'Q', correct: 'true' }] },
    r => { const d = r.h5p?.preloadedDependencies || []; const col = d.find(x => x.machineName === 'H5P.Column'); return (col && col.majorVersion + '.' + col.minorVersion === '1.18' && d.some(x => x.machineName === 'H5P.TrueFalse') && r.files?.length === 2) ? null : 'Version/Abhängigkeiten: ' + JSON.stringify(d); }, false,
    () => { const s = document.getElementById('tpl-source'); if (s.value !== 'builtin') { s.value = 'builtin'; s.dispatchEvent(new Event('change')); } const i = document.querySelector('input.lib-ver[data-lib="H5P.Column"]'); i.value = '1.18'; i.dispatchEvent(new Event('change', { bubbles: true })); }],
];
for (const [name, typeId, json, check, known, setup] of CASES) {
  let r;
  try { r = await pack(name, typeId, json, setup); } catch (e) { r = { error: e.message }; }
  const err = r.error ? r.error : check(r);
  record(`pack:${name}`, !err, err || '', !!known);
}

// ---------- 3) Korrektur-Prompt, Template-Aktualisierung ----------
try {
  await selectType('t-mc');
  await page.evaluate(() => navigateTo(5));
  await page.fill('#jsonIn', '{"questions":[{"text":"F","answers":[{"text":"a","correct":true},{"text":"b"}]}]');
  const n0 = await page.evaluate(() => window.__prompts.length);
  await page.click('#fixPromptBtn', { timeout: 3000 });
  await page.waitForFunction(n => window.__prompts.length > n, n0, { timeout: 3000 });
  const fix = await page.evaluate(() => window.__prompts.at(-1));
  record('korrektur-prompt', /FEHLER:/.test(fix) && /Ungültiges JSON/.test(fix) && /```json/.test(fix), fix.slice(0, 120));
} catch (e) { record('korrektur-prompt', false, e.message.split('\n')[0]); }
try {
  // ab V.0.10.1 liegt der Button im Bereich "Vorlagen & Bibliotheksversionen" (Server-Modus)
  await page.evaluate(() => { const d = document.getElementById('tpl-settings'); if (d) d.open = true; const s = document.getElementById('tpl-source'); if (s && s.value !== 'server') { s.value = 'server'; s.dispatchEvent(new Event('change')); } });
  await page.click('#refreshTplBtn', { timeout: 3000 });
  await page.waitForFunction(() => /aktuell|aktualisiert/.test(document.getElementById('refreshTplBtn').textContent), null, { timeout: 30000 });
  const t = (await page.$eval('#refreshTplBtn', b => b.textContent)).trim();
  record('templates-aktualisieren', !/nicht erreichbar/.test(t), t);
  record('template-stand-angezeigt', /Stand/.test(await page.$eval('#activeTemplateInfo', e => e.textContent)), '');
} catch (e) { record('templates-aktualisieren', false, e.message.split('\n')[0]); }

// ---------- 4) Eingebaute Vorlagen ohne erreichbaren Server (frischer Browser, Standard-Einstellung) ----------
try {
  const ctx2 = await browser.newContext({ acceptDownloads: true });
  await ctx2.route('**/*', route => route.request().url().startsWith('file:') ? route.continue() : route.fulfill({ status: 404, body: '' }));
  const p2 = await ctx2.newPage();
  const errs2 = [];
  p2.on('pageerror', e => errs2.push(e.message));
  await p2.goto('file://' + HTML);
  await p2.selectOption('#schulart', 'Gymnasium');
  await p2.click('#fach-display');
  await p2.click('.custom-select-option[data-value="Biologie"]');
  await p2.selectOption('#klasse', '8');
  await p2.evaluate(() => navigateTo(5));
  await p2.fill('#jsonIn', '{"text":"Fülle die Lücken.","questions":["Die *Sonne* scheint."]}');
  const info = (await p2.$eval('#activeTemplateInfo', e => e.textContent)).trim();
  const [dl] = await Promise.all([p2.waitForEvent('download', { timeout: 10000 }).catch(() => null), p2.click('#packBtn', { timeout: 3000 })]);
  let ok = !!dl && /Eingebaute Vorlage/.test(info) && !/nicht geladen/.test(info) && errs2.length === 0;
  if (dl) { const z = await JSZip.loadAsync(fs.readFileSync(await dl.path())); const c = JSON.parse(await z.file('content/content.json').async('string')); ok = ok && c.checkAnswer === 'Überprüfen'; }
  record('ohne-server-standard-eingebaut', ok, ok ? '' : info + ' ' + errs2.join(' | '));
  await ctx2.close();
} catch (e) { record('ohne-server-standard-eingebaut', false, e.message.split('\n')[0]); }

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
