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
  'question-set': ['H5P.QuestionSet 1.20', 'H5P.MultiChoice 1.16', 'H5P.TrueFalse 1.8', 'H5P.Blanks 1.14', 'H5P.DragText 1.10', 'H5P.MarkTheWords 1.11', 'H5P.Essay 1.5'],
  'single-choice-set': ['H5P.SingleChoiceSet 1.11'],
  'true-false': ['H5P.TrueFalse 1.8'],
  'dialog-cards': ['H5P.Dialogcards 1.9'],
  'flashcards': ['H5P.Flashcards 1.7'],
  'sort-paragraphs': ['H5P.SortParagraphs 0.11'],
  'guess-the-answer': ['H5P.GuessTheAnswer 1.5', 'H5P.Image 1.1'],
  'summary': ['H5P.Summary 1.10'],
  'interactive-video': ['H5P.InteractiveVideo 1.28', 'H5P.MultiChoice 1.16', 'H5P.TrueFalse 1.8', 'H5P.Summary 1.10', 'H5P.Text 1.1', 'H5P.Blanks 1.14', 'H5P.DragText 1.10'],
  'h5p-column': ['H5P.Column 1.16', 'H5P.AdvancedText 1.1', 'H5P.MultiChoice 1.16', 'H5P.TrueFalse 1.8', 'H5P.Blanks 1.14', 'H5P.Summary 1.10', 'H5P.SingleChoiceSet 1.11',
    'H5P.DragText 1.10', 'H5P.MarkTheWords 1.11', 'H5P.Essay 1.5', 'H5P.Dialogcards 1.9', 'H5P.GuessTheAnswer 1.5', 'H5P.Accordion 1.0'],
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

// Fach wählen: ab V.1.0 natives <select id="fach">, davor eigenes Auswahlfeld
async function selectFach(pg, fach) {
  if (await pg.$('select#fach')) await pg.selectOption('#fach', fach);
  else { await pg.click('#fach-display'); await pg.click(`.custom-select-option[data-value="${fach}"]`); }
}

const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', e => pageErrors.push(e.message));
// ab V.1.0.1 ist die Server-Vorlage nur mit ?vorlagen=server wählbar (ältere Versionen ignorieren den Zusatz)
await page.goto('file://' + HTML + '?vorlagen=server');
await page.selectOption('#schulart', 'Gymnasium');
await selectFach(page, 'Biologie');
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
  // Ab V.0.11: fester Aufbau und ein packbares Beispiel je Typ (Vertrag Prompt <-> Packer)
  const missingSections = ['ROLLE', 'AUFTRAG', 'DIDAKTIK', 'AUSGABEFORMAT', 'SELBSTPRÜFUNG', 'AUSGABE'].filter(h => !new RegExp('## \\d+\\. ' + h).test(p));
  record(`prompt:${t.value}: Aufbau Rolle→Ausgabe`, missingSections.length === 0, missingSections.join(', '));
  const ex = p.match(/✅ BEISPIEL[^\n]*\n```json\n([\s\S]*?)\n```/);
  if (!ex) record(`beispiel-packbar:${t.value}`, false, 'kein ✅ BEISPIEL im Prompt');
  else {
    let r;
    try { r = await pack('beispiel-' + t.id, t.id, ex[1]); } catch (e) { r = { error: e.message }; }
    const ok = !r.error && !r.packBtnDisabled && !!r.content;
    record(`beispiel-packbar:${t.value}`, ok, ok ? (r.validation || '').trim() : (r.error || r.validation || r.status || ''));
  }
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
  // ----- Phase 4: neue Typen und Bausteine -----
  ['essay', 't-essay', { taskDescription: 'Erkläre die Photosynthese.', keywords: [{ keyword: 'Licht', alternatives: ['Sonnenlicht'], points: 2, feedbackMissed: 'Was braucht die Pflanze?' }, 'Chlorophyll'], sampleSolution: 'Pflanzen nutzen Licht.\nSie bilden Zucker.' },
    r => { const c = r.content || {}; const ok = r.h5p?.mainLibrary === 'H5P.Essay' && c.keywords?.length === 2 && c.keywords[0].options.points === 2 && c.keywords[0].alternatives[0] === 'Sonnenlicht'
      && /<p>Pflanzen nutzen Licht.<\/p><p>Sie bilden Zucker.<\/p>/.test(c.solution?.sample || '') && c.behaviour?.minimumLength > 0 && c.checkAnswer === 'Überprüfen'; return ok ? null : 'Essay: ' + JSON.stringify(c).slice(0, 300); }],
  ['find-the-words', 't-ftw', { taskDescription: 'Finde die Begriffe.', words: ['Chlorophyll', 'Größe', 'Blatt grün', 'X'] },
    r => { const c = r.content || {}; const o = c.behaviour?.orientations || {}; const ok = r.h5p?.mainLibrary === 'H5P.FindTheWords' && c.wordList === 'CHLOROPHYLL,GROESSE,BLATTGRUEN' && o.diagonal === false && o.vertical === true && c.l10n?.check === 'Überprüfen';
      return ok ? null : 'Find the Words: ' + JSON.stringify(c).slice(0, 300); }, false, () => { document.getElementById('ftw-easy').checked = true; }],
  ['page-neue-bausteine', 't-page', { blocks: [
      { type: 'drag', taskDescription: 'Ziehe.', textField: 'Die *Sonne* scheint.' }, { type: 'mark', taskDescription: 'Verben', textField: 'Er *läuft*.' },
      { type: 'essay', taskDescription: 'Erkläre.', keywords: [{ keyword: 'Licht' }] }, { type: 'cards', cards: [{ text: 'A', answer: 'B' }] },
      { type: 'guess', taskDescription: 'Warum?', solutionText: 'Darum.' }, { type: 'accordion', panels: [{ title: 'T', text: 'Text' }] }] },
    r => { const libs = (r.content?.content || []).map(b => b.content.library.split(' ')[0]); const want = ['H5P.DragText', 'H5P.MarkTheWords', 'H5P.Essay', 'H5P.Dialogcards', 'H5P.GuessTheAnswer', 'H5P.Accordion'];
      const deps = (r.h5p?.preloadedDependencies || []).map(d => d.machineName); return (want.every((w, i) => libs[i] === w) && want.every(w => deps.includes(w))) ? null : 'Bausteine: ' + libs.join(', ') + ' | deps: ' + deps.join(', '); }],
  ['quiz-mit-essay', 't-qs', { questions: [{ type: 'mc', text: 'F', answers: [{ text: 'a', correct: true }, { text: 'b', correct: false }] }, { type: 'essay', taskDescription: 'Begründe.', keywords: [{ keyword: 'Grund' }] }] },
    r => { const q = r.content?.questions?.[1]; return (q?.library?.startsWith('H5P.Essay') && q.params?.keywords?.[0]?.keyword === 'Grund') ? null : 'Essay im Quiz fehlt: ' + JSON.stringify(q).slice(0, 200); }],
  ['video-neue-interaktionen', 't-video', { interactions: [{ time: 20, type: 'text', text: 'Merke: X.' }, { time: 60, type: 'blanks', text: 'Die *Sonne* ist ein Stern.' }, { time: 120, type: 'drag', textField: 'Der *Mond* kreist.' }] },
    r => { const it = r.content?.interactiveVideo?.assets?.interactions || []; const libs = it.map(i => i.action.library.split(' ')[0]);
      const ok = libs.join(',') === 'H5P.Text,H5P.Blanks,H5P.DragText' && /\*Sonne\*/.test(it[1].action.params.questions[0]) && /Merke/.test(it[0].action.params.text); return ok ? null : 'Video: ' + libs.join(', '); }, false,
    () => { document.getElementById('youtube-url').value = 'https://youtu.be/dQw4w9WgXcQ'; }],
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
  ['eingebaut-praesentation', 't-cp', { title: 'Präsentation', slides: [
      { title: 'Start', text: 'Leitfrage?' },
      { title: 'Inhalt', text: 'Punkt eins\nPunkt zwei\n- Punkt drei' },
      { title: 'Teste dich', text: 'Kurz', task: { type: 'tf', question: 'Q', correct: 'true' } },
      { title: 'Quiz', task: { type: 'mc', question: 'F', answers: [{ text: 'a', correct: true }, { text: 'b', correct: false }] } }] },
    r => { const c = r.content || {}, d = r.h5p?.preloadedDependencies || []; const sl = c.presentation?.slides || [];
      const libs = sl.flatMap(x => x.elements.map(e => e.action.library.split(' ')[0]));
      const ok = r.h5p?.mainLibrary === 'H5P.CoursePresentation' && sl.length === 4 && /<h1>Start<\/h1>/.test(sl[0].elements[0].action.params.text)
        && /<ul><li>Punkt eins<\/li>.*<li>Punkt drei<\/li><\/ul>/.test(sl[1].elements[1].action.params.text) && sl[2].elements.length === 3 && sl[3].elements[1].width === 94
        && libs.includes('H5P.TrueFalse') && libs.includes('H5P.MultiChoice') && sl[0].keywords?.[0]?.main === 'Start' && c.override?.hideSummarySlide === false
        && c.l10n?.slide === 'Folie' && c.l10n?.slides === 'Folien' && d.some(x => x.machineName === 'H5P.TrueFalse') && r.files?.length === 2;
      return ok ? null : 'Präsentation fehlerhaft: ' + JSON.stringify({ main: r.h5p?.mainLibrary, deps: d.map(x => x.machineName), c: JSON.stringify(c).slice(0, 400) }); }, false, USE_BUILTIN],
  ['eingebaut-praesentation-alle-aufgaben', 't-cp', { title: 'Alle', slides: [{ title: 'Start', text: 'Los' },
      { title: 'MC', task: { type: 'mc', question: 'F', answers: [{ text: 'a', correct: true }, { text: 'b', correct: false }] } },
      { title: 'TF', task: { type: 'tf', question: 'A', correct: 'false', feedback: 'weil' } },
      { title: 'Lücken', task: { type: 'blanks', taskDescription: 'Fülle', text: 'Die *Sonne* scheint.' } },
      { title: 'Ziehen', task: { type: 'drag', taskDescription: 'Ziehe', textField: 'Der *Mond* kreist.' } },
      { title: 'Markieren', task: { type: 'mark', taskDescription: 'Markiere', textField: 'Die *Erde* ist rund.' } },
      { title: 'SCS', task: { type: 'scs', questions: [{ question: 'Q', answers: ['r', 'f'] }] } },
      { title: 'Summary', task: { type: 'summary', statements: [['r', 'f', 'f']] } },
      { title: 'Karten', text: 'Lerne', task: { type: 'cards', cards: [{ text: 'A', answer: 'B' }] } }] },
    r => { const libs = (r.content?.presentation?.slides || []).flatMap(x => x.elements.map(e => e.action.library.split(' ')[0]));
      const want = ['H5P.MultiChoice', 'H5P.TrueFalse', 'H5P.Blanks', 'H5P.DragText', 'H5P.MarkTheWords', 'H5P.SingleChoiceSet', 'H5P.Summary', 'H5P.Dialogcards'];
      const miss = want.filter(w => !libs.includes(w)); return miss.length ? 'fehlt: ' + miss.join(', ') : null; }, false, USE_BUILTIN],
  ['eingebaut-buch', 't-book', { title: 'Buch', description: 'Kurzbeschreibung', chapters: [
      { title: 'Kapitel A', blocks: [{ type: 'text', text: 'Hallo' }, { type: 'tf', question: 'Q', correct: 'true' }] },
      { title: 'Kapitel B', blocks: [{ type: 'mc', question: 'F', answers: [{ text: 'a', correct: true }, { text: 'b', correct: false }] }] }] },
    r => { const c = r.content || {}, d = r.h5p?.preloadedDependencies || []; const ch = c.chapters || [];
      const ok = r.h5p?.mainLibrary === 'H5P.InteractiveBook' && ch.length === 2 && ch.every(x => /^H5P\.Column /.test(x.library)) && ch[0].metadata?.title === 'Kapitel A'
        && (ch[0].params?.content || []).length === 2 && c.showCoverPage === true && /Kurzbeschreibung/.test(c.bookCover?.coverDescription || '')
        && d.some(x => x.machineName === 'H5P.Column') && d.some(x => x.machineName === 'H5P.MultiChoice') && r.files?.length === 2;
      return ok ? null : 'Buch fehlerhaft: ' + JSON.stringify({ main: r.h5p?.mainLibrary, deps: d.map(x => x.machineName), c: JSON.stringify(c).slice(0, 300) }); }, false,
    // eigene Column-Version aus dem vorigen Fall zurücksetzen: Interactive Book 1.15 erlaubt nur Column 1.22
    () => { const s = document.getElementById('tpl-source'); if (s.value !== 'builtin') { s.value = 'builtin'; s.dispatchEvent(new Event('change')); } const i = document.querySelector('input.lib-ver[data-lib="H5P.Column"]'); i.value = ''; i.dispatchEvent(new Event('change', { bubbles: true })); }],
  // ----- V.1.4: Bingo und Structure Strip -----
  ['eingebaut-bingo', 't-bingo', { taskDescription: 'Hör zu & markiere.', items: [{ word: 'Chloro*phyll*', clue: 'Grüner Farbstoff' }, { word: 'Sauer\nstoff', clue: 'Gas, das frei wird' }, { word: 'Licht', clue: 'Energiequelle' }, { word: 'Wasser', clue: 'H2O' }] },
    r => { const c = r.content || {}; const ok = r.h5p?.mainLibrary === 'H5P.Bingo' && c.mode === 'words' && c.words === 'Chlorophyll\nSauer stoff\nLicht\nWasser' && c.size === 3
      && c.behaviour?.joker === true && c.behaviour?.shuffleOnRetry === true && c.taskDescription === '<div>Hör zu &amp; markiere.</div>' && c.tryAgain === 'Wiederholen' && r.files?.length === 2
      && /Vorleseliste herunterladen/.test(r.status || '') && /Begriffe für ein 3 × 3-Spielfeld/.test(r.validation || '');
      return ok ? null : 'Bingo: ' + JSON.stringify({ main: r.h5p?.mainLibrary, c, status: r.status, v: r.validation }).slice(0, 400); }, false,
    () => { const s = document.getElementById('tpl-source'); if (s.value !== 'builtin') { s.value = 'builtin'; s.dispatchEvent(new Event('change')); } document.getElementById('bingo-size').value = '3'; document.getElementById('bingo-joker').checked = true; }],
  ['bingo-wortliste-ohne-hinweise', 't-bingo', { words: ['Alpha', 'Beta', 'Gamma', 'Delta'] },
    r => { const c = r.content || {}; return (c.words === 'Alpha\nBeta\nGamma\nDelta' && c.behaviour?.joker === false && c.size === 4 && !/Vorleseliste herunterladen/.test(r.status || '') && /ohne "clue"/.test(r.validation || '') && /mehrfach vor/.test(r.validation || ''))
      ? null : 'Wortliste: ' + JSON.stringify({ c, status: r.status, v: r.validation }).slice(0, 300); }, false,
    () => { document.getElementById('bingo-size').value = '4'; }],
  ['bingo-validierung-sperrt', 't-bingo', { items: [{ word: 'A', clue: 'x' }] },
    r => (r.packBtnDisabled && /Mindestens 3 Begriffe/.test(r.validation || '')) ? null : 'zu wenige Begriffe nicht gesperrt: ' + r.validation],
  ['eingebaut-structure-strip', 't-strip', { taskDescription: 'Erörtere <X>.', sections: [
      { title: 'Einleitung', hints: ['Anlass nennen', 'Satzanfang: „Immer wieder …“'], weight: 1 }, { title: 'Hauptteil', hints: 'Argumente', weight: '3' }, { title: 'Schluss', weight: 0 }] },
    r => { const c = r.content || {}, s = c.sections || []; const ok = r.h5p?.mainLibrary === 'H5P.StructureStrip' && s.length === 3 && s[0].description === '<ul><li>Anlass nennen</li><li>Satzanfang: „Immer wieder …“</li></ul>'
      && s[1].description === '<div>Argumente</div>' && s[1].weight === 3 && s[2].weight === 1 && !('description' in s[2]) && s[0].colorBackground && s[0].colorText === '#1c1c1c'
      && c.taskDescription === '<div>Erörtere &lt;X&gt;.</div>' && c.behaviour?.textLengthMin === 1300 && c.behaviour?.textLengthMax === 3000 && c.behaviour?.feedbackMode === 'whileTyping'
      && c.l10n?.checkAnswer === 'Überprüfen' && r.files?.length === 2 && /keine Hinweise/.test(r.validation || '');
      return ok ? null : 'Structure Strip: ' + JSON.stringify({ main: r.h5p?.mainLibrary, c, v: r.validation }).slice(0, 500); }, false,
    () => { document.getElementById('strip-live').checked = true; }],
  ['eingebaut-speak-the-words', 't-speak', { questions: [{ question: 'Wie sagt man *Hund*?', acceptedAnswers: ['dog', 'the dog!', 'Dog', '„a dog“'] }, { question: 'Wie viele Tage?', answer: 'seven' }] },
    r => { const c = r.content || {}, q = c.questions || [], d = r.h5p?.preloadedDependencies || [];
      const ok = r.h5p?.mainLibrary === 'H5P.SpeakTheWordsSet' && q.length === 2 && /^H5P\.SpeakTheWords \d+\.\d+$/.test(q[0].library) && q[0].params.question === 'Wie sagt man Hund?'
        && JSON.stringify(q[0].params.acceptedAnswers) === '["dog","the dog","Dog","a dog"]' && JSON.stringify(q[1].params.acceptedAnswers) === '["seven"]' && q[0].params.inputLanguage === 'de-DE'
        && q[0].params.l10n?.speakLabel === 'Drücken um zu sprechen' && c.l10n?.finishButtonLabel === 'Beenden' && d.some(x => x.machineName === 'H5P.SpeakTheWords') && r.files?.length === 2
        && /Satzzeichen/.test(r.validation || '');
      return ok ? null : 'Speak the Words: ' + JSON.stringify({ main: r.h5p?.mainLibrary, deps: d.map(x => x.machineName), c, v: r.validation }).slice(0, 500); }],
  ['speak-sprache-nach-fach', 't-speak', { questions: [{ question: 'Say it', acceptedAnswers: ['hello'] }] },
    r => r.content?.questions?.[0]?.params?.inputLanguage === 'fr-FR' ? null : 'inputLanguage: ' + r.content?.questions?.[0]?.params?.inputLanguage, false,
    () => { const f = document.getElementById('fach'); f.value = 'Französisch'; f.dispatchEvent(new Event('change')); }],
  ['speak-ohne-antworten-gesperrt', 't-speak', { questions: [{ question: 'Q', acceptedAnswers: [] }] },
    r => (r.packBtnDisabled && /keine "acceptedAnswers"/.test(r.validation || '')) ? null : 'nicht gesperrt: ' + r.validation, false,
    () => { const f = document.getElementById('fach'); f.value = 'Biologie'; f.dispatchEvent(new Event('change')); }],
];
for (const [name, typeId, json, check, known, setup] of CASES) {
  let r;
  try { r = await pack(name, typeId, json, setup); } catch (e) { r = { error: e.message }; }
  const err = r.error ? r.error : check(r);
  record(`pack:${name}`, !err, err || '', !!known);
}

// ---------- 2b) Bingo: Vorleseliste als Begleitdatei ----------
if (await page.$('#t-bingo')) {
  let err = null;
  try {
    const r = await pack('bingo-vorleseliste', 't-bingo', { items: [{ word: 'Merkur', clue: 'Innerster Planet' }, { word: 'Venus', clue: 'Zweiter Planet' }, { word: 'Erde', clue: '' }] });
    const btn = await page.$('#packStatus button[data-extra]');
    if (!r.content || !btn) err = 'kein Knopf „Vorleseliste herunterladen“: ' + r.status;
    else {
      const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 10000 }), btn.click()]);
      const file = path.join(OUT, 'bingo-vorleseliste.txt');
      await dl.saveAs(file);
      const txt = fs.readFileSync(file, 'utf8');
      if (!/Vorleseliste\.txt$/.test(dl.suggestedFilename())) err = 'Dateiname: ' + dl.suggestedFilename();
      else if (!/\[ \] 1\. Innerster Planet\r\n\s+Lösung: Merkur/.test(txt) || !/\(kein Hinweis\)/.test(txt) || !/Alle Begriffe: Erde · Merkur · Venus/.test(txt)) err = 'Inhalt: ' + txt.slice(0, 300);
    }
  } catch (e) { err = e.message; }
  record('pack:bingo-vorleseliste', !err, err || '');
}

// ---------- 2a) Vertragstest mit zusätzlichen Optionen (Video, Quiz, Page) ----------
for (const [name, typeId, setup, check] of [
  ['Video mit allen Interaktionen', 't-video', () => ['blanks', 'drag', 'text'].forEach(t => { const c = document.getElementById('iv-allow-' + t); if (c) c.checked = true; }),
    r => (r.content?.interactiveVideo?.assets?.interactions || []).length === 5],
  ['Quiz mit Essay', 't-qs', () => { const c = document.getElementById('qs-allow-essay'); if (c) c.checked = true; },
    r => (r.content?.questions || []).some(q => q.library.startsWith('H5P.Essay'))],
  ['Präsentation mit allen Aufgabentypen', 't-cp', () => document.querySelectorAll('#opts-cp input[id^=cp-allow-]').forEach(c => { c.checked = true; }),
    r => (r.content?.presentation?.slides || []).length === 3],
  ['Page mit allen Bausteinen', 't-page', () => document.querySelectorAll('#page-block-list input[type=checkbox]').forEach(c => { c.checked = true; c.dispatchEvent(new Event('change')); }),
    r => (r.content?.content || []).length === 13],
]) {
  try {
    await selectType(typeId);
    await page.evaluate(setup);
    await page.evaluate(() => navigateTo(4));
    await page.click('#genBtn');
    const p = await page.evaluate(() => window.__prompts.at(-1));
    const m = p.match(/✅ BEISPIEL[^\n]*\n```json\n([\s\S]*?)\n```/);
    if (!m) { record('beispiel-packbar:' + name, false, 'kein Beispiel'); continue; }
    const r = await pack('beispiel-extra-' + typeId, typeId, m[1]);
    const ok = !r.packBtnDisabled && !!r.content && check(r);
    record('beispiel-packbar:' + name, ok, ok ? (r.validation || '').trim() : (r.validation || r.status || JSON.stringify(r.content).slice(0, 150)));
  } catch (e) { record('beispiel-packbar:' + name, false, e.message.split('\n')[0]); }
}

// ---------- 2b) Anforderungsbereiche, Leitperspektive, drei Niveaus ----------
try {
  await selectType('t-mc');
  await page.evaluate(() => { document.getElementById('afb-level').value = 'mixed'; document.getElementById('leitperspektive').value = 'BNE'; navigateTo(4); });
  await page.click('#genBtn');
  let p = await page.evaluate(() => window.__prompts.at(-1));
  record('prompt:AFB gemischt mit Operatoren', /40 % AFB I/.test(p) && /beurteilen/.test(p) && /"afb":"I"/.test(p) && !/Bloom/.test(p), '');
  record('prompt:Leitperspektive', /Bildung für nachhaltige Entwicklung/.test(p), '');
  await page.evaluate(() => { const c = document.getElementById('three-levels'); c.checked = true; c.dispatchEvent(new Event('change')); });
  await page.click('#genBtn');
  p = await page.evaluate(() => window.__prompts.at(-1));
  const disabled = await page.$eval('#diff-level', e => e.disabled);
  record('prompt:drei Niveaus', /"niveaus"/.test(p) && /"basis"/.test(p) && /"experte"/.test(p) && disabled, disabled ? '' : 'Anforderungsniveau nicht gesperrt');
  await page.evaluate(() => { const c = document.getElementById('three-levels'); c.checked = false; c.dispatchEvent(new Event('change')); document.getElementById('afb-level').value = ''; document.getElementById('leitperspektive').value = ''; });

  // Vorschau mit AFB-Verteilung
  await page.evaluate(() => navigateTo(5));
  const q = (t, afb) => ({ text: t, afb, answers: [{ text: 'a', correct: true }, { text: 'b', correct: false }] });
  await page.fill('#jsonIn', JSON.stringify({ questions: [q('F1', 'I'), q('F2', 'II'), q('F3', 'III')] }));
  const v = await page.$eval('#jsonValidationStatus', e => e.textContent);
  record('vorschau:AFB-Verteilung', /AFB I\/II\/III: 1\/1\/1/.test(v), v.trim());

  // Drei Niveaus -> drei Dateien
  const lvl = n => ({ questions: [q(n + ' 1', 'I'), q(n + ' 2', 'II')] });
  await page.fill('#jsonIn', JSON.stringify({ niveaus: { basis: lvl('B'), standard: lvl('S'), experte: lvl('E') } }));
  const v3 = await page.$eval('#jsonValidationStatus', e => e.textContent);
  const shown = await page.$eval('#niveau-wrap', e => getComputedStyle(e).display !== 'none');
  const downloads = [];
  const onDl = d => downloads.push(d);
  page.on('download', onDl);
  await page.selectOption('#niveau-select', 'all');
  await page.click('#packBtn');
  await page.waitForFunction(() => /Dateien wurden erstellt|Fehler/.test(document.getElementById('packStatus').textContent), null, { timeout: 15000 });
  await page.waitForTimeout(800);
  page.off('download', onDl);
  const names = downloads.map(d => d.suggestedFilename());
  record('niveaus:drei Dateien', /3 Niveaus erkannt/.test(v3) && shown && names.length === 3 && names.some(n => /Basis/.test(n)) && names.some(n => /Experte/.test(n)), names.join(', ') + ' | ' + v3.trim().slice(0, 80));
  if (downloads[0]) await downloads[0].saveAs(path.join(OUT, 'pack-niveau-basis.h5p'));
} catch (e) { record('afb/niveaus', false, e.message.split('\n')[0]); }

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
  await selectFach(p2, 'Biologie');
  record('darkmode-standard', await p2.evaluate(() => document.documentElement.dataset.theme) === 'dark', '');
  await p2.selectOption('#klasse', '8');
  await p2.evaluate(() => navigateTo(5));
  await p2.fill('#jsonIn', '{"text":"Fülle die Lücken.","questions":["Die *Sonne* scheint."]}');
  const info = (await p2.$eval('#activeTemplateInfo', e => e.textContent)).trim();
  const [dl] = await Promise.all([p2.waitForEvent('download', { timeout: 10000 }).catch(() => null), p2.click('#packBtn', { timeout: 3000 })]);
  let ok = !!dl && /Eingebaute Vorlage/.test(info) && !/nicht geladen/.test(info) && errs2.length === 0;
  if (dl) { const z = await JSZip.loadAsync(fs.readFileSync(await dl.path())); const c = JSON.parse(await z.file('content/content.json').async('string')); ok = ok && c.checkAnswer === 'Überprüfen'; }
  record('ohne-server-standard-eingebaut', ok, ok ? '' : info + ' ' + errs2.join(' | '));
  if (await p2.$('#tpl-source-wrap')) {
    // Server-Option für Nutzer:innen ausgeblendet; früher gespeichertes "server" wird auf eingebaut zurückgesetzt
    const hidden = await p2.$eval('#tpl-source-wrap', e => e.hidden && !e.offsetParent);
    await p2.evaluate(() => localStorage.setItem('h5pWizard.tplSource', 'server'));
    await p2.reload();
    const after = await p2.evaluate(() => [document.getElementById('tpl-source').value, localStorage.getItem('h5pWizard.tplSource'), document.getElementById('tpl-source-wrap').hidden]);
    record('server-vorlage-ausgeblendet', hidden && after[0] === 'builtin' && after[1] === 'builtin' && after[2] === true, JSON.stringify(after));
  }
  await ctx2.close();
} catch (e) { record('ohne-server-standard-eingebaut', false, e.message.split('\n')[0]); }

// ---------- 5) Barrierefreiheit, Design-Umschalter, gespeicherte Eingaben (ab V.1.0) ----------
if (await page.$('#themeBtn')) {
  try {
    await page.evaluate(() => navigateTo(1));
    // Fortschrittsschritte per Tastatur
    await page.focus('.progress-step[data-step="2"]');
    await page.keyboard.press('Enter');
    record('a11y:Schritt per Tastatur', await page.$eval('#page-2', e => e.classList.contains('active')) && await page.$eval('.progress-step[data-step="2"]', e => e.getAttribute('aria-current') === 'step'), '');
    // Typ-Kacheln: Radios fokussierbar, Pfeiltasten wählen
    await page.focus('#t-blanks');
    await page.keyboard.press('ArrowRight');
    record('a11y:Typwahl mit Pfeiltasten', await page.$eval('#t-complex-blanks', e => e.checked), '');
    // Hilfe-Dialog: Escape schließt, Fokus kehrt zurück
    await page.click('#helpBtn');
    const opened = await page.$eval('#helpModal', e => e.style.display === 'block' && document.activeElement.id === 'closeModal');
    await page.keyboard.press('Escape');
    record('a11y:Hilfe-Dialog mit Escape', opened && await page.$eval('#helpModal', e => e.style.display === 'none' && document.activeElement.id === 'helpBtn'), '');
    // Beschriftungen: jedes sichtbare Formularfeld hat ein Label oder aria-label
    const unlabeled = await page.evaluate(() => Array.from(document.querySelectorAll('input, select, textarea')).filter(el => el.type !== 'hidden' && el.type !== 'file' && el.id
      && !document.querySelector('label[for="' + el.id + '"]') && !el.getAttribute('aria-label') && !el.closest('label')).map(el => el.id));
    record('a11y:Formularfelder beschriftet', unlabeled.length === 0, unlabeled.join(', '));
    // Page-Bausteine per Knopf verschieben
    await selectType('t-page');
    await page.evaluate(() => navigateTo(3));
    const before = await page.$$eval('#page-block-list .page-block-item', els => els.map(e => e.dataset.block));
    await page.click('#page-block-list .page-block-item:first-child .move-btn[data-dir="1"]');
    const after = await page.$$eval('#page-block-list .page-block-item', els => els.map(e => e.dataset.block));
    record('a11y:Bausteine verschieben', after[0] === before[1] && after[1] === before[0], after.slice(0, 3).join(','));
    // Design: Standard dunkel, Umschalten wird gespeichert
    const t0 = await page.evaluate(() => document.documentElement.dataset.theme);
    await page.click('#themeBtn');
    const t1 = await page.evaluate(() => [document.documentElement.dataset.theme, localStorage.getItem('h5pWizard.theme')]);
    await page.click('#themeBtn');
    record('design:umschalten', t0 === 'dark' && t1[0] === 'light' && t1[1] === 'light', JSON.stringify([t0, t1]));
    // Eingaben überstehen ein Neuladen; Knopf löscht sie
    await selectType('t-timeline');
    await page.evaluate(() => navigateTo(4));
    await page.fill('#topic', 'GEMERKT-123');
    await page.fill('#ref', 'NICHT-SPEICHERN');
    await page.waitForTimeout(500);
    await page.reload();
    const restored = await page.evaluate(() => ({ fach: document.getElementById('fach').value, topic: document.getElementById('topic').value, ref: document.getElementById('ref').value,
      type: document.querySelector('input[name="type"]:checked').value, timelineVisible: document.getElementById('opts-timeline').style.display === 'block', order: document.querySelector('#page-block-list .page-block-item').dataset.block }));
    record('eingaben:wiederhergestellt', restored.fach === 'Biologie' && restored.topic === 'GEMERKT-123' && restored.ref === '' && restored.type === 'Timeline' && restored.timelineVisible && restored.order === after[0], JSON.stringify(restored));
    await page.click('#resetFormBtn');
    await page.waitForLoadState('load');
    await page.waitForTimeout(300);
    record('eingaben:löschen', await page.evaluate(() => document.getElementById('topic').value === '' && document.getElementById('fach').value === ''), '');
  } catch (e) { record('a11y/design/eingaben', false, e.message.split('\n')[0]); }
}

// ---------- 6) Bundesland, Erklärungen, Szenario (ab V.1.2) ----------
if (await page.$('#bundesland')) {
  try {
    await page.evaluate(() => navigateTo(1));
    await page.selectOption('#schulart', 'Gymnasium');
    await selectFach(page, 'Biologie');
    await page.selectOption('#klasse', '8');
    await selectType('t-mc');
    await page.evaluate(() => navigateTo(4));
    await page.click('#genBtn');
    let p = await page.evaluate(() => window.__prompts.at(-1));
    record('bundesland:Standard BW im Prompt', await page.$eval('#bundesland', e => e.value) === 'BW' && /am Gymnasium in Baden-Württemberg \(Bildungsplan 2016/.test(p), (p.match(/Du bist[^\n]*/) || [''])[0]);
    // ab V.1.5: G9 aufwachsend ab 2025/26 (Klassen 5 und 6), höhere Klassen G8; keine Genderformen
    const now = new Date(), g9Bis = 6 + ((now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1) - 2025);
    const promptFor = async (schulart, fach, klasse) => {
      await page.evaluate(() => navigateTo(1));
      await page.selectOption('#schulart', schulart); await selectFach(page, fach); await page.selectOption('#klasse', klasse);
      await page.evaluate(() => navigateTo(4)); await page.click('#genBtn');
      return page.evaluate(() => window.__prompts.at(-1));
    };
    const role = t => (t.match(/Du bist[^\n]*\n[^\n#]*/) || [''])[0];
    const p5 = await promptFor('Gymnasium', 'Biologie', '5');
    record('bildungsplan:Gymnasium Klasse 5 = G9', /\(Bildungsplan 2016 in der überarbeiteten Fassung für das neunjährige Gymnasium \(G9\)\)/.test(p5) && /nach dem G9-Plan bis Klasse 4/.test(p5), role(p5));
    const p8 = await promptFor('Gymnasium', 'Biologie', '8');
    record('bildungsplan:Gymnasium Klasse 8 = ' + (8 <= g9Bis ? 'G9' : 'G8'), 8 <= g9Bis ? /\(G9\)/.test(p8) : /achtjährige Gymnasium \(G8, auslaufend\)/.test(p8) && !/G9-Plan/.test(p8), role(p8));
    const pg = await promptFor('Grundschule', 'Deutsch', '3');
    record('bildungsplan:Grundschule Deutsch in Fassung 2024', /\(Bildungsplan 2016 der Grundschule, Fachplan Deutsch in der überarbeiteten Fassung von 2024\)/.test(pg), role(pg));
    const pr = await promptFor('Realschule', 'Mathematik', '7');
    record('bildungsplan:Sekundarstufe I', /\(Gemeinsamer Bildungsplan der Sekundarstufe I 2016 in der aktuell gültigen Fassung, Fachplan Mathematik/.test(pr), role(pr));
    record('sprache:keine Genderformen', !/Geschlechtergerecht|:innen|\*innen|Autor:in|Jede:r/.test(p8) && /generische Maskulinum/.test(p8)
      && await page.$eval('label[for="author"]', e => e.textContent.trim() === 'Autor (optional)')
      && await page.evaluate(() => !/[a-zäöü](:|\*)(in|innen|r)\b/.test(document.body.innerText)), '');
    await page.evaluate(() => navigateTo(1));
    await page.selectOption('#schulart', 'Gymnasium'); await selectFach(page, 'Biologie'); await page.selectOption('#klasse', '8');
    await page.selectOption('#bundesland', 'NW');
    const nw = await page.evaluate(() => ({ schularten: Array.from(document.querySelectorAll('#schulart option')).map(o => o.value), faecher: Array.from(document.querySelectorAll('#fach option')).map(o => o.value),
      schulart: document.getElementById('schulart').value, fach: document.getElementById('fach').value, leitLabel: document.querySelector('label[for="leitperspektive"]').textContent,
      leit: Array.from(document.querySelectorAll('#leitperspektive option')).map(o => o.value) }));
    record('bundesland:NRW Schularten/Fächer', nw.schularten.includes('Berufskolleg') && !nw.schularten.includes('Werkreal-/Hauptschule') && !nw.faecher.includes('BNT') && nw.faecher.includes('Politik')
      && nw.schulart === 'Gymnasium' && nw.fach === 'Biologie' && /Querschnittsthema/.test(nw.leitLabel) && nw.leit.includes('DB'), JSON.stringify(nw).slice(0, 200));
    await page.selectOption('#schulart', 'Gesamtschule');
    await page.evaluate(() => { document.getElementById('leitperspektive').value = 'DB'; navigateTo(4); });
    await page.click('#genBtn');
    p = await page.evaluate(() => window.__prompts.at(-1));
    record('bundesland:NRW im Prompt', /an der Gesamtschule in Nordrhein-Westfalen \(Kernlehrpläne\)/.test(p) && /Querschnittsthema DB \(Demokratiebildung\)/.test(p) && /differenzierende Zugänge/.test(p), (p.match(/Du bist[^\n]*/) || [''])[0]);
    // Erklär-Knopf: klappt Text auf, Escape schließt
    await page.evaluate(() => { document.getElementById('leitperspektive').value = ''; navigateTo(3); });
    await page.click('button[aria-controls="tip-h5p-behaviour"]');
    const tipOpen = await page.$eval('#tip-h5p-behaviour', e => !e.hidden && e.textContent.length > 40);
    await page.keyboard.press('Escape');
    const tipClosed = await page.$eval('#tip-h5p-behaviour', e => e.hidden);
    const tipCount = await page.$$eval('button.info-tip', b => b.length);
    record('erklaerungen:Knopf öffnet/schließt', tipOpen && tipClosed && tipCount >= 10, 'Knöpfe: ' + tipCount);
    // Szenario: Beschreibung wechselt, Tipps im Testmodus aus
    await selectType('t-blanks');
    await page.evaluate(() => { const h = document.getElementById('enable-hints'); h.checked = true; });
    await page.selectOption('#h5p-behaviour', 'test');
    const test = await page.evaluate(() => ({ desc: document.getElementById('scenario-desc').textContent, hintsDisabled: document.getElementById('enable-hints').disabled, hints: document.getElementById('enable-hints').checked }));
    await page.selectOption('#h5p-behaviour', 'practice');
    const practice = await page.evaluate(() => ({ desc: document.getElementById('scenario-desc').textContent, hintsDisabled: document.getElementById('enable-hints').disabled }));
    record('szenario:Beschreibung und Tipps', /Lernstandskontrollen/.test(test.desc) && test.hintsDisabled && !test.hints && /wiederholen/i.test(practice.desc) && !practice.hintsDisabled, JSON.stringify({ test, practice }).slice(0, 200));
    // ab V.1.3: Selbstlernen, Unterrichtsphase, Vorwissen, Kompetenz
    if (await page.$('#unterrichtsphase')) {
      await page.evaluate(() => { document.getElementById('enable-feedback').checked = false; });
      await page.selectOption('#h5p-behaviour', 'selfstudy');
      const self = await page.evaluate(() => ({ fb: document.getElementById('enable-feedback').checked, hints: document.getElementById('enable-hints').checked, desc: document.getElementById('scenario-desc').textContent }));
      await page.selectOption('#unterrichtsphase', 'sicherung');
      await page.fill('#kompetenz', 'KOMPETENZ-XY');
      await page.fill('#vorwissen', 'VORWISSEN-XY');
      await page.evaluate(() => navigateTo(4));
      await page.click('#genBtn');
      const pr = await page.evaluate(() => window.__prompts.at(-1));
      record('selbstlernen:Feedback/Tipps an, Prompt', self.fb && self.hints && /ohne Lehrkraft/.test(self.desc) && /\*\*Selbstlernen:\*\*/.test(pr) && /Tipp zur Lücke/.test(pr), JSON.stringify(self).slice(0, 120));
      record('prompt:Phase, Kompetenz, Vorwissen', /Unterrichtsphase:\*\* Sicherung/.test(pr) && /„KOMPETENZ-XY“/.test(pr) && /„VORWISSEN-XY“/.test(pr), '');
      const r = await pack('selbstlernen-lueckentext', 't-blanks', { text: 'Fülle', questions: ['Die *Sonne:Stern* scheint.'] });
      record('selbstlernen:Wiederholen und Lösungen', r.content?.behaviour?.enableRetry === true && r.content?.behaviour?.enableSolutionsButton === true && /Stern/.test(JSON.stringify(r.content?.questions)), JSON.stringify(r.content?.behaviour || r.validation));
      await page.evaluate(() => { const b = document.getElementById('h5p-behaviour'); b.value = 'practice'; b.dispatchEvent(new Event('change')); ['unterrichtsphase', 'kompetenz', 'vorwissen'].forEach(id => { document.getElementById(id).value = ''; }); });
    }
    await page.evaluate(() => navigateTo(1));
    await page.selectOption('#bundesland', 'BW');
    await page.selectOption('#schulart', 'Gymnasium');
    if (await page.$('#unterrichtsphase')) {
      const bwFaecher = await page.$$eval('#fach option', o => o.map(x => x.value));
      record('fach:BW ohne IMP, mit Informatik/Medienbildung', !bwFaecher.includes('IMP') && bwFaecher.includes('Informatik/Medienbildung'), '');
    }
  } catch (e) { record('bundesland/erklaerungen/szenario', false, e.message.split('\n')[0]); }
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
