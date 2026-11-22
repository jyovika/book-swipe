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
  const title = books[i].title;
  insert('swipes', { session_code: session, round: ROUND, player, book_id: books[i].id, liked: yes })
    .catch((err) => { $('status').textContent = `Couldn't save your swipe on "${title}": ${err.message}`; });
  i += 1;
  if (i < books.length) {
    show(books[i]);
  } else {
    $('card').hidden = true;
    $('choices').hidden = true;
    waitForMatches();
  }
}

const POLL_MS = 3000;

// Reads this round's swipes from Supabase until both players have swiped every book, then
// lists the books both liked. The database is the source of truth, so it works after a reload too.
async function waitForMatches() {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/swipes?session_code=eq.${session}&round=eq.${ROUND}&select=player,book_id,liked`,
      { headers: { apikey: SUPABASE_KEY } },
    );
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    const pool = new Set(books.map((b) => b.id));
    const byPlayer = {}; // player -> Map(book_id -> liked)
    for (const s of await res.json()) {
      if (pool.has(s.book_id)) (byPlayer[s.player] ??= new Map()).set(s.book_id, s.liked);
    }
    const mine = byPlayer[player] ?? new Map();
    // shortcut: assumes two players; a third person joining is ignored.
    const partner = Object.keys(byPlayer).find((p) => p !== player);
    const theirs = byPlayer[partner] ?? new Map();

    if (mine.size < books.length) {
      $('status').textContent = 'Saving your last swipes…';
    } else if (!partner) {
      $('status').textContent = `You're done! Waiting for your partner to join session ${session}…`;
    } else if (theirs.size < books.length) {
      $('status').textContent = `You're done! Waiting for ${partner} to finish (${theirs.size} of ${books.length})…`;
    } else {
      const matches = books.filter((b) => mine.get(b.id) && theirs.get(b.id));
      showMatches(matches, partner);
      return;
    }
  } catch (err) {
    $('status').textContent = `Connection problem, retrying… (${err.message})`;
  }
  setTimeout(waitForMatches, POLL_MS);
}

function showMatches(matches, partner) {
  $('status').textContent = matches.length
    ? `You and ${partner} both liked ${matches.length} of ${books.length} books:`
    : `You and ${partner} didn't like any of the same books.`;
  $('matches').replaceChildren(...matches.map((b) => {
    const li = document.createElement('li');
    li.textContent = `${b.title} — ${b.author}`;
    return li;
  }));
  $('matches').hidden = false;
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
    // Testing aid: ?n=5 swipes only the first 5 books. Both phones must use the same n.
    const n = Number(new URLSearchParams(location.search).get('n'));
    if (n > 0) books = books.slice(0, n);
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
