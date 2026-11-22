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
  } catch (err) {
    $('status').textContent = `Couldn't load books: ${err.message}`;
  }
}

main();
