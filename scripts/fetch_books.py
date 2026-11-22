"""Build books.json and covers/ from Open Library. Run from the repo root: python3 scripts/fetch_books.py

Fetched once and committed, so the app never calls Open Library at runtime
(Open Library blocks IPs that send bursts of requests).
"""
import json
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path

# Open Library's "thriller" tag also covers horror, sci-fi and romance, so search
# mystery/suspense subjects and exclude the genres that leak in.
QUERY = (
    'subject:("murder mystery" OR "detective and mystery stories" OR "psychological thriller"'
    ' OR "suspense fiction" OR "murder" OR "serial murderers") subject:fiction'
    ' -subject:"true crime" -subject:"juvenile fiction" -subject:horror -subject:"science fiction"'
    ' -subject:romance -subject:fantasy -subject:biography -subject:autobiography language:eng'
)
SEARCH_LIMIT = 150  # candidates, most-read first; many get filtered out below
MAX_BOOKS = 60
MAX_PER_AUTHOR = 3  # otherwise half the list is Agatha Christie
DELAY_S = 1.0  # Open Library's documented limit is about 1 request/second.
HEADERS = {"User-Agent": "book-swipe-script/1.0"}
COVERS_DIR = Path("covers")
ENGLISH_WORDS = {"the", "a", "an", "of", "and", "to", "in", "is", "for", "on", "at",
                 "with", "my", "who", "there", "they", "were", "what", "from", "by"}


def get(url, attempts=3):
    req = urllib.request.Request(url, headers=HEADERS)
    for attempt in range(1, attempts + 1):
        time.sleep(DELAY_S * attempt)  # back off a little more on each retry
        try:
            with urllib.request.urlopen(req, timeout=90) as res:  # Open Library can be slow
                return res.read()
        except OSError as err:  # dropped connections and timeouts (URLError is an OSError)
            if attempt == attempts:
                raise
            print(f"  retrying after: {err}")


def get_json(url):
    return json.loads(get(url))


def words(title):
    return set(re.findall(r"\w+", title.lower()))


def english_title(work_title, edition_title):
    """Use the English edition's title when the work's title is in another language.

    shortcut: guesses by word overlap and common English words; fine for a 60-book list,
    upgrade if odd titles show up.
    """
    if not edition_title or words(work_title) & ENGLISH_WORDS:
        return work_title
    # No shared words means a translation (Das Parfum -> Perfume), not a reissue
    # ("Lights Out" -> "Lights Out Collector's Edition").
    return work_title if words(work_title) & words(edition_title) else edition_title.strip()


def looks_foreign(title):
    """Accented letters and no common English word: a title we couldn't translate (El túnel)."""
    return not title.isascii() and not words(title) & ENGLISH_WORDS


def clean_synopsis(text):
    """Strip Open Library editors' extras: "See also"/"Contains" link lists and Markdown links."""
    text = text.replace("\r\n", "\n")
    text = re.split(r"\n\s*-{3,}\s*\n", text)[0]  # everything after a --- separator is extras
    text = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", text)  # [label](url) -> label
    text = re.sub(r"^\s*\[\d+\]:.*$", "", text, flags=re.M)  # [1]: url footnote lines
    text = re.sub(r"\(\[source\]\[\d+\]\)|\[\d+\]", "", text)  # footnote markers
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def main():
    params = urllib.parse.urlencode({
        "q": QUERY,
        "sort": "readinglog",
        "limit": SEARCH_LIMIT,
        "fields": "key,title,author_name,cover_i,editions,editions.title",
    })
    docs = get_json(f"https://openlibrary.org/search.json?{params}")["docs"]
    COVERS_DIR.mkdir(exist_ok=True)

    books, seen_titles, per_author = [], set(), {}
    for doc in docs:
        if len(books) >= MAX_BOOKS:
            break
        # First author only: later entries are often translators or duplicate records.
        author = (doc.get("author_name") or [""])[0]
        edition = ((doc.get("editions") or {}).get("docs") or [{}])[0].get("title")
        title = english_title(doc["title"], edition)
        # A card is useless without a cover; skip repeat editions and over-represented authors.
        if (not doc.get("cover_i") or title.lower() in seen_titles or looks_foreign(title)
                or per_author.get(author, 0) >= MAX_PER_AUTHOR):
            continue
        try:
            work = get_json(f"https://openlibrary.org{doc['key']}.json")
        except Exception as err:
            print(f"skip {title}: {err}")
            continue
        desc = work.get("description")
        desc = clean_synopsis((desc.get("value") if isinstance(desc, dict) else desc) or "")
        if len(desc) < 80:  # too short to help you decide
            continue
        book_id = doc["key"].removeprefix("/works/")
        # Covers are stored in the repo: Open Library's cover links redirect to archive.org
        # and take seconds to load, while GitHub Pages serves local files instantly.
        cover = COVERS_DIR / f"{book_id}.jpg"
        if not cover.exists():  # reruns skip covers already downloaded
            try:
                cover.write_bytes(get(f"https://covers.openlibrary.org/b/id/{doc['cover_i']}-L.jpg"))
            except Exception as err:
                print(f"skip {title}: cover failed: {err}")
                continue
        seen_titles.add(title.lower())
        per_author[author] = per_author.get(author, 0) + 1
        books.append({
            "id": book_id,
            "title": title,
            "author": author,
            "cover": cover.as_posix(),
            "synopsis": desc,
        })
        print(f"{len(books):3} {title} ({author})")

    assert books, "no books fetched"
    assert len({b["id"] for b in books}) == len(books), "duplicate ids"
    with open("books.json", "w") as f:
        json.dump(books, f, indent=1, ensure_ascii=False)
    # Remove covers of books that dropped out of the list on this run.
    keep = {b["cover"] for b in books}
    for old in COVERS_DIR.glob("*.jpg"):
        if old.as_posix() not in keep:
            old.unlink()
    print(f"wrote {len(books)} books to books.json, covers in {COVERS_DIR}/")


if __name__ == "__main__":
    main()
