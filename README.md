# Arabiska — Palestinian dialect readers

Illustrated short readers in **spoken Palestinian Arabic (Jerusalem)**. Deliberately
*not* fus7a, and written without tashkeel.

## The books

| # | Title | Theme | Grammar focus |
|---|-------|-------|---------------|
| 1 | كعك القدس · *ka3ek il-2uds* | market, buying, greetings | `بـ` present, `عم`, `رح`, `ما` vs `مش` |
| 2 | وين راحت مشمش؟ · *ween raa7at Mishmish?* | asking questions, the neighbourhood | question words, `عند` = have, pronoun endings, imperatives |
| 3 | الجمعة عند تيتا · *ij-jum3a 3ind Teta* | family, food, remembering | past tense, `كان` + present = "used to" |
| 4 | قطاف الزيتون · *qtaaf iz-zeetoun* | olive harvest on the family's land | `بدّي / لازم / ممكن` + bare present, attached object pronouns, comparatives |
| 5 | العيد · *il-3eed* | Eid morning, house-to-house visits, eidiyye | `إذا` vs `لو` ("if"), sound vs broken plurals |
| 6 | جمعة في القدس القديمة · *jum3a fil-quds il-qadiime* | first Friday at Al-Aqsa with Seedo | `عشان` (so that), reported speech with `إنه/إنها`, `ما رح` (won't) |

Each book is A5, 13–14 pages: cover, a key page, seven story pages, a glossary,
dialect notes, and — from book 4 onward — an exercise page asking you to *produce*
dialect rather than just read it. Story pages give the Arabic large and alone at the
top; the Jerusalem pronunciation and the English sit in small type at the foot of the
page, so you can cover them with a hand and read the Arabic first.

Glossaries are curated, not exhaustive — skip everyday words a reader already has from
context or an earlier book (`bass`, `leesh`, `lamma`, `zgheer`, `qahwe`...) and spend the
space on the words that are actually a step up.

Books share a cast — Sami, a boy in Jerusalem; his cat Mishmish; Teta in Beit Hanina —
so new books should reuse them.

## Dialect conventions

Jerusalem Palestinian, no fus7a, no tashkeel. Vocabulary is Jerusalem-first, with
Jordanian/Lebanese/Syrian variants only where genuinely interchangeable. Palestinian
`مش` throughout, not Syrian `مو`; negation is `ما` + verb, not `ما...ش` (southern/Gazan)
— the difference is explained in book 2.

### Chat-alphabet key

| symbol | letter | | symbol | letter |
|---|---|---|---|---|
| `7` | ح | | `8` | غ |
| `5` | خ | | `q` | ق |
| `3` | ع | | `aa ee oo` | long ا ي و |
| `2` | ء *(hamza only)* | | | |

Emphatics (ص ط ض ظ) are written plainly as s, t, d, z for readability.

> **Books 1–3 as published use an older key** — ق written `2` and غ written `gh`.
> Everything from book 4 on uses the table above. Retrofitting 1–3 is a
> find-and-replace in `src/*.html` plus each book's key page.

Note that ق is *pronounced* as a glottal stop in Jerusalem city speech even though it
is transliterated `q` — keep saying so in the notes pages.

### Usage rulings (verified by a native Jerusalem speaker)

- **`ناس` takes the *hiyye* / feminine-singular form.** `في ناس بتشتري خضرة` is
  correct — ناس is a collective noun. Plural agreement (`بيشتروا`) is also heard and
  isn't wrong, but feminine singular is the default.
- **Don't use `عم`.** Rarely used by Jerusalem speakers. Use the plain `بـ` form for
  the progressive: `في ناس بتشتري`, not `في ناس عم بتشتري`. At most it gets a one-line
  recognition footnote — never a grammar section, never in the story text.

Books 1–3 as shipped still use `عم` (book 1 has a section on it). Not worth retrofitting.

## Rebuilding the PDFs

```powershell
.\build.ps1
```

Renders every `src\*.html` to `pdf\`. It drives headless Chrome, which shapes Arabic
script correctly and embeds a font subset, so the PDFs render the same everywhere.
No dependencies to install.

## Layout

```
src/
  book.css                      shared stylesheet — restyle all books at once
  01-kaak-al-quds.html
  02-ween-rahat-mishmish.html
  03-il-jumaa-3ind-teta.html
  04-qtaf-iz-zeetoun.html
  05-il-3eed.html
  06-jum3a-fil-quds-il-qadiime.html
pdf/                            generated output
build.ps1
```

Illustrations are hand-written inline SVG — no image files, nothing to link.

## Adding a book

Copy an existing HTML file and replace the content. Structure per page:

```html
<section class="page">
  <div class="illus"> <svg viewBox="0 0 400 240"> … </svg> </div>
  <div class="story-ar">
    <p>…</p>
    <p class="say">«…»</p>        <!-- dialogue, rendered in terracotta -->
  </div>
  <div class="help">
    <div class="translit lat"><span>…</span></div>
    <p class="en lat">…</p>
  </div>
  <div class="folio">2</div>
</section>
```

Two things to watch:

1. **Arabic quoted inside an English sentence must be wrapped in `<bdi>`** — otherwise
   the bidi algorithm reorders the surrounding Latin text and the line comes out
   scrambled. This applies in glossary definitions and the notes pages.
2. **Pages do not reflow.** `.page` is a fixed A5 box with `overflow: hidden`, so
   anything too long is silently clipped. Keep glossary tables to about 20 rows,
   or 15 if the definitions wrap. Always eyeball the result after editing:

   ```powershell
   # screenshot the rendered HTML to check for clipping
   & "C:\Program Files\Google\Chrome\Application\chrome.exe" --headless --disable-gpu `
       --screenshot=check.png --window-size=620,1700 src\01-kaak-al-quds.html
   ```
