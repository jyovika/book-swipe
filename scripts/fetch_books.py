"""Build books.json from Open Library. Run from the repo root: python3 scripts/fetch_books.py

Fetched once and committed, so the app never calls an API at runtime
(Open Library blocks IPs that send bursts of requests).
"""
import json
import time
import urllib.request

SUBJECTS = ["thriller", "murder"]
PER_SUBJECT = 40
DELAY_S = 1.0  # Open Library's documented limit is about 1 request/second.
HEADERS = {"User-Agent": "book-swipe-script/1.0"}


def get_json(url):
    time.sleep(DELAY_S)
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=20) as res:
        return json.load(res)


def main():
    seen, books = set(), []
    for subject in SUBJECTS:
        url = (f"https://openlibrary.org/search.json?subject={subject}&language=eng"
               f"&limit={PER_SUBJECT}&fields=key,title,author_name,cover_i")
        for doc in get_json(url)["docs"]:
            # Subjects overlap, and a card is useless without a cover.
            if not doc.get("cover_i") or doc["key"] in seen:
                continue
            seen.add(doc["key"])
            try:
                work = get_json(f"https://openlibrary.org{doc['key']}.json")
            except Exception as err:
                print(f"skip {doc['title']}: {err}")
                continue
            desc = work.get("description")
            desc = desc.get("value") if isinstance(desc, dict) else desc
            if not desc:
                continue
            books.append({
                "id": doc["key"].removeprefix("/works/"),
                "title": doc["title"],
                "author": ", ".join(doc.get("author_name", [])),
                "cover": f"https://covers.openlibrary.org/b/id/{doc['cover_i']}-L.jpg",
                "synopsis": desc.strip(),
            })
            print(f"{len(books):3} {doc['title']}")

    assert books, "no books fetched"
    assert len({b["id"] for b in books}) == len(books), "duplicate ids"
    with open("books.json", "w") as f:
        json.dump(books, f, indent=1, ensure_ascii=False)
    print(f"wrote {len(books)} books to books.json")


if __name__ == "__main__":
    main()
