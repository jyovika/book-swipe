const $ = (id) => document.getElementById(id);
let books = [];
let i = 0;
const liked = [];

function show(book) {
  // Hide until the new cover loads, so the previous book's cover never sits on this one.
  $('cover').style.visibility = 'hidden';
  $('cover').src = book.cover;
  // Covers are slow (Open Library redirects to archive.org), so fetch the next one now.
  if (books[i + 1]) new Image().src = books[i + 1].cover;
  $('cover').alt = `Cover of ${book.title}`;
  $('title').textContent = book.title;
  $('author').textContent = book.author;
  $('synopsis').textContent = book.synopsis;
  $('synopsis').scrollTop = 0;
  $('status').textContent = `Book ${i + 1} of ${books.length}`;
}

function decide(yes) {
  if (yes) liked.push(books[i]);
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

async function main() {
  try {
    const res = await fetch('books.json');
    if (!res.ok) throw new Error(`books.json returned ${res.status}`);
    books = await res.json();
    if (books.length === 0) {
      $('status').textContent = 'No books in books.json.';
      return;
    }
    $('card').hidden = false;
    $('choices').hidden = false;
    $('cover').onload = () => { $('cover').style.visibility = 'visible'; };
    show(books[0]);
    $('yes').onclick = () => decide(true);
    $('no').onclick = () => decide(false);
    enableSwipe($('card'));
  } catch (err) {
    $('status').textContent = `Couldn't load books: ${err.message}`;
  }
}

main();
