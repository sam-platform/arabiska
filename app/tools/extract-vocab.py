"""
Pulls the curated glossary tables out of src/*.html (the printed readers) into
one JSON vocab list for the app's exercise engine.

Run from the app/ folder: python tools/extract-vocab.py
Writes data/vocab.json.
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
SRC = ROOT / "src"
OUT = Path(__file__).resolve().parent.parent / "data" / "vocab.json"

ROW_RE = re.compile(
    r'<tr><td class="a">(.*?)</td><td class="t">(.*?)</td><td class="e">(.*?)</td></tr>'
)
TAG_RE = re.compile(r"<[^>]+>")
TITLE_RE = re.compile(r"<title>(.*?)</title>")


def strip_tags(s: str) -> str:
    return TAG_RE.sub("", s).replace("&amp;", "&").replace("&nbsp;", " ").strip()


def main():
    entries = []
    books = sorted(SRC.glob("*.html"))
    for book_index, path in enumerate(books, start=1):
        html = path.read_text(encoding="utf-8")
        title_match = TITLE_RE.search(html)
        book_title = title_match.group(1) if title_match else path.stem

        seen_in_book = set()
        for match in ROW_RE.finditer(html):
            ar_raw, translit_raw, en_raw = match.groups()
            ar = strip_tags(ar_raw)
            translit = strip_tags(translit_raw)
            en = strip_tags(en_raw)

            # "ولد" vs "ولد / ولاد" style alt-forms: keep the headword only
            # as the primary card front, full text stays in `ar_full`.
            headword = ar.split("/")[0].strip()
            key = headword
            if key in seen_in_book:
                continue
            seen_in_book.add(key)

            entries.append({
                "id": f"b{book_index}-{len(entries)+1:03d}",
                "book": book_index,
                "book_title": book_title,
                "ar": headword,
                "ar_full": ar,
                "translit": translit,
                "en": en,
            })

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(entries, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {len(entries)} vocab entries from {len(books)} books -> {OUT}")


if __name__ == "__main__":
    main()
