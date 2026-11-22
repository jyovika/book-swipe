function show(book) {
  const cover = document.getElementById('cover');
  cover.src = book.cover;
  cover.alt = `Cover of ${book.title}`;
  document.getElementById('title').textContent = book.title;
  document.getElementById('author').textContent = book.author;
  document.getElementById('synopsis').textContent = book.synopsis;
}

async function main() {
  const status = document.getElementById('status');
  try {
    const res = await fetch('books.json');
    if (!res.ok) throw new Error(`books.json returned ${res.status}`);
    const books = await res.json();
    if (books.length === 0) {
      status.textContent = 'No books in books.json.';
      return;
    }
    let i = 0;
    status.textContent = `Book 1 of ${books.length}`;
    document.getElementById('card').hidden = false;
    const next = document.getElementById('next');
    next.hidden = false;
    show(books[i]);
    next.onclick = () => {
      i = (i + 1) % books.length;
      status.textContent = `Book ${i + 1} of ${books.length}`;
      show(books[i]);
    };
  } catch (err) {
    status.textContent = `Couldn't load books: ${err.message}`;
  }
}

main();
