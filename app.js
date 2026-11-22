// The publishable key is meant to be public; Row Level Security limits it to reading and adding rows.
const SUPABASE_URL = 'https://mwwxdtgocjsueejrvayd.supabase.co';
const SUPABASE_KEY = 'sb_publishable_QwfTOefMWM9lDf1uD4Ozig_jn9iRSxa';
const ROUND = 1;
// No 0/O or 1/I, so a code read aloud or off a screen can't be mistyped.
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const $ = (id) => document.getElementById(id);

// Adds a row. By default an identical existing row is skipped, so re-swiping a book is harmless;
// pass ignoreDuplicates=false to get an error instead (used to avoid reusing a session code).
async function insert(table, row, ignoreDuplicates = true) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      'Content-Type': 'application/json',
      Prefer: `${ignoreDuplicates ? 'resolution=ignore-duplicates,' : ''}return=minimal`,
    },
    body: JSON.stringify(row),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res;
}

async function sessionExists(code) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/sessions?code=eq.${encodeURIComponent(code)}&select=code`, {
    headers: { apikey: SUPABASE_KEY },
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return (await res.json()).length > 0;
}

async function createSession() {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
    try {
      await insert('sessions', { code }, false);
      return code;
    } catch (err) {
      if (!err.message.startsWith('409')) throw err; // 409: code already taken, try another
    }
  }
  throw new Error('could not find a free session code, try again');
}

let session = null;
let player = null;
let books = [];
let i = 0;
const liked = [];

function show(book) {
  // Hide until the new cover loads, so the previous book's cover never sits on this one.
  $('cover').style.visibility = 'hidden';
  $('cover').src = book.cover;
  // Fetch the next cover now so it's ready before the next swipe.
  if (books[i + 1]) new Image().src = books[i + 1].cover;
  $('cover').alt = `Cover of ${book.title}`;
  $('title').textContent = book.title;
  $('author').textContent = book.author;
  $('synopsis').textContent = book.synopsis;
  $('synopsis').scrollTop = 0;
  $('status').textContent = `Session ${session} · ${player} · Book ${i + 1} of ${books.length}`;
}

function decide(yes) {
  if (yes) liked.push(books[i]);
  const title = books[i].title;
  insert('swipes', { session_code: session, round: ROUND, player, book_id: books[i].id, liked: yes })
    .catch((err) => { $('status').textContent = `Couldn't save your swipe on "${title}": ${err.message}`; });
  i += 1;
  if (i < books.length) {
    show(books[i]);
  } else {
    $('card').hidden = true;
    $('choices').hidden = true;
    $('status').textContent = `Done! You liked ${liked.length} of ${books.length} books.`;
  }
}

const SWIPE_THRESHOLD = 40; // px of sideways drag that counts as a decision

function enableSwipe(card) {
  let startX = null;
  let startY = 0;
  card.addEventListener('pointerdown', (e) => {
    startX = e.clientX;
    startY = e.clientY;
    card.style.transition = 'none';
    card.setPointerCapture(e.pointerId);
  });
  card.addEventListener('pointermove', (e) => {
    if (startX === null) return;
    const dx = e.clientX - startX;
    card.style.transform = `translateX(${dx}px) rotate(${dx / 20}deg)`;
  });
  const end = (e) => {
    if (startX === null) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    startX = null;
    card.style.transition = 'transform 0.2s';
    card.style.transform = '';
    // pointercancel means the synopsis box took over to scroll, so it never counts as a swipe.
    const sideways = Math.abs(dx) > SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy);
    if (e.type === 'pointerup' && sideways) decide(dx > 0);
  };
  card.addEventListener('pointerup', end);
  card.addEventListener('pointercancel', end);
}

function startSwiping(code, name) {
  session = code;
  player = name;
  $('join').hidden = true;
  $('card').hidden = false;
  $('choices').hidden = false;
  show(books[0]);
}

function setupJoin() {
  $('join').hidden = false;
  $('status').textContent = 'Enter your name, then start a session or join one.';
  const name = () => {
    const n = $('name').value.trim();
    if (!n) $('status').textContent = 'Enter your name first.';
    return n;
  };
  const run = async (button, action) => {
    button.disabled = true; // stops a double tap creating two sessions
    try {
      await action();
    } catch (err) {
      $('status').textContent = `Couldn't reach the server: ${err.message}`;
    } finally {
      button.disabled = false;
    }
  };
  $('start').onclick = () => run($('start'), async () => {
    const n = name();
    if (!n) return;
    startSwiping(await createSession(), n);
  });
  $('join-btn').onclick = () => run($('join-btn'), async () => {
    const n = name();
    const code = $('code').value.trim().toUpperCase();
    if (!n) return;
    if (!code) { $('status').textContent = 'Enter the session code from your partner.'; return; }
    if (!(await sessionExists(code))) { $('status').textContent = `No session with code ${code}. Check it and try again.`; return; }
    startSwiping(code, n);
  });
}

async function main() {
  try {
    const res = await fetch('books.json');
    if (!res.ok) throw new Error(`books.json returned ${res.status}`);
    books = await res.json();
    if (books.length === 0) {
      $('status').textContent = 'No books in books.json.';
      return;
    }
    $('cover').onload = () => { $('cover').style.visibility = 'visible'; };
    $('yes').onclick = () => decide(true);
    $('no').onclick = () => decide(false);
    enableSwipe($('card'));
    setupJoin();
  } catch (err) {
    $('status').textContent = `Couldn't start: ${err.message}`;
  }
}

main();
