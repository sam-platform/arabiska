// Arabiska — daily practice loop.
// No build step: plain script, loaded after the Supabase UMD bundle.

const SUPABASE_URL = "https://gdwvycndaqxydluvqdia.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_PnGf7MRx1nBFcRKo0O4dPQ_L03B64vI";
const REVIEWS_PER_SESSION = 30;

// ---------- Level ----------
//
// The 6 books only actually cover roughly A1 (book 1-2: present tense,
// greetings) through B1 (book 5-6: conditionals, reported speech) — there's
// no B2+ content yet, so the ceiling here is real, not a placeholder. A tier
// counts as "cleared" once most of its words are attempted *and* holding up
// well (ease_factor, the same SM-2 number Hard/Good/Easy already drives).
const CEFR_BY_BOOK = { 1: "A1", 2: "A1", 3: "A2", 4: "A2", 5: "B1", 6: "B1" };
const CEFR_ORDER = ["A1", "A2", "B1"];
const TIER_COVERAGE_THRESHOLD = 0.7;
const TIER_EASE_THRESHOLD = 2.3;

// Hand-authored extras (idioms, everyday words not in any book) carry their
// own explicit `cefr` tag instead of being derived from a book number.
function tierOf(item) {
  return item.cefr || CEFR_BY_BOOK[item.book];
}

function estimateLevel() {
  let cleared = null;
  for (const tier of CEFR_ORDER) {
    const tierItems = state.vocab.filter((v) => tierOf(v) === tier);
    const attempted = tierItems.filter((v) => state.progressById[v.id]);
    const coverage = attempted.length / tierItems.length;
    const avgEase = attempted.length
      ? attempted.reduce((sum, v) => sum + state.progressById[v.id].ease_factor, 0) / attempted.length
      : 0;
    if (coverage >= TIER_COVERAGE_THRESHOLD && avgEase >= TIER_EASE_THRESHOLD) {
      cleared = tier;
    } else {
      break; // tiers are sequential — stop at the first one not yet solid
    }
  }
  return cleared;
}

function renderLevelBadge() {
  const level = estimateLevel();
  const el = $("#level-badge");
  if (el) el.textContent = level ? `Level: ${level}` : "Level: getting started";
}

function levelSummaryText() {
  const level = estimateLevel();
  const ceiling = CEFR_ORDER[CEFR_ORDER.length - 1];
  const current = level ? `Estimated level: ${level}` : "Estimated level: getting started";
  return `${current} (book content currently goes up to ${ceiling})`;
}

// New-word pace reacts to the same Hard/Good/Easy feedback that drives
// scheduling: doing well (high average ease) opens the throttle, struggling
// closes it — rather than a flat count regardless of how it's going.
//
// TEMPORARY: the caps below are inflated while the level estimate is still
// catching up to where the user actually places — book content has been
// running far easier than their real level, so coverage needs to climb fast.
// Once estimateLevel() stops lagging, drop these back down to roughly
// { fast: 10, steady: 6, slow: 3 }.
const NEW_WORD_PACE = { fast: 30, steady: 20, slow: 12 };
function computeNewBudget(dailyLog) {
  const graded = Object.values(state.progressById).filter((p) => p.repetitions >= 1);
  const avgEase = graded.length
    ? graded.reduce((sum, p) => sum + p.ease_factor, 0) / graded.length
    : 2.5;
  const base = avgEase >= 2.8 ? NEW_WORD_PACE.fast : avgEase >= 2.3 ? NEW_WORD_PACE.steady : NEW_WORD_PACE.slow;
  return Math.max(0, base - dailyLog.new_items_count);
}

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const $ = (sel) => document.querySelector(sel);
const screens = {
  loading: $("#screen-loading"),
  login: $("#screen-login"),
  checkEmail: $("#screen-check-email"),
  session: $("#screen-session"),
  continue: $("#screen-continue"),
  done: $("#screen-done"),
};

function show(name) {
  for (const key in screens) screens[key].hidden = key !== name;
}

function todayStr() {
  // local calendar day, not UTC
  return new Date().toLocaleDateString("en-CA");
}

// ---------- Mascot ----------
//
// One donkey, moved between screens via appendChild (not cloned), so its mood
// and idle animations carry over rather than restarting. Reactions (happy/sad)
// are one-shot CSS animations retriggered by removing+re-adding the class.

const MASCOT = document.createElement("div");
MASCOT.className = "mascot";
MASCOT.dataset.mood = "idle";
MASCOT.innerHTML = `
  <svg viewBox="0 0 200 200">
    <g id="mascot-wrap">
      <g id="mascot-tail">
        <path d="M42 150 q-20 10 -12 34" stroke="#5A4A3A" stroke-width="7" fill="none" stroke-linecap="round"/>
        <circle cx="28" cy="186" r="8" fill="#5A4A3A"/>
      </g>
      <ellipse cx="100" cy="178" rx="54" ry="28" fill="#B9A78C"/>
      <g id="mascot-ear-left">
        <ellipse cx="60" cy="38" rx="17" ry="40" fill="#B9A78C" transform="rotate(-16 60 38)"/>
        <ellipse cx="61" cy="42" rx="8" ry="27" fill="#E2A468" transform="rotate(-16 61 42)"/>
      </g>
      <g id="mascot-ear-right">
        <ellipse cx="140" cy="38" rx="17" ry="40" fill="#B9A78C" transform="rotate(16 140 38)"/>
        <ellipse cx="139" cy="42" rx="8" ry="27" fill="#E2A468" transform="rotate(16 139 42)"/>
      </g>
      <ellipse cx="100" cy="102" rx="59" ry="53" fill="#B9A78C"/>
      <path d="M76 58 q6 -18 12 -3 q6 -20 12 2 q6 -20 12 -2 q6 15 12 3"
            fill="none" stroke="#5A4A3A" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
      <ellipse cx="100" cy="132" rx="40" ry="30" fill="#EFE3CC"/>
      <g fill="#5A4A3A">
        <ellipse cx="87" cy="136" rx="3.2" ry="4.4"/>
        <ellipse cx="113" cy="136" rx="3.2" ry="4.4"/>
      </g>
      <g id="mascot-eye-left">
        <circle cx="76" cy="93" r="12" fill="#FFFFFF"/>
        <circle cx="78" cy="94" r="6.4" fill="#2B2620"/>
      </g>
      <g id="mascot-eye-right">
        <circle cx="124" cy="93" r="12" fill="#FFFFFF"/>
        <circle cx="122" cy="94" r="6.4" fill="#2B2620"/>
      </g>
      <path d="M86 116 q14 9 28 0" class="mascot-mouth mouth-idle" stroke="#5A4A3A" stroke-width="4.5" fill="none" stroke-linecap="round"/>
      <path d="M80 112 q20 20 40 0" class="mascot-mouth mouth-happy" stroke="#5A4A3A" stroke-width="4.5" fill="none" stroke-linecap="round"/>
      <path d="M84 124 q16 -10 32 0" class="mascot-mouth mouth-sad" stroke="#5A4A3A" stroke-width="4.5" fill="none" stroke-linecap="round"/>
    </g>
  </svg>
`;

function mountMascot(slotId, mood) {
  const slot = document.getElementById(slotId);
  if (slot && !slot.contains(MASCOT)) slot.appendChild(MASCOT);
  setMascotMood(mood || "idle");
}

function setMascotMood(mood, react) {
  MASCOT.dataset.mood = mood;
  if (react) {
    MASCOT.classList.remove("react-happy", "react-sad");
    void MASCOT.offsetWidth; // reflow so the animation restarts even for the same mood twice in a row
    MASCOT.classList.add("react-" + react);
  }
}

// ---------- Auth ----------
//
// Sign-in is a typed 6-digit code, not a link. Two reasons a link doesn't work
// for an installed PWA: tapping it opens Safari, which doesn't share storage
// with the home-screen app, so the resulting session is invisible to it; and
// even just long-pressing a link to copy it makes iOS prefetch it for a
// preview, which silently consumes the one-time token before the user ever
// uses it. A manually-typed code has nothing to tap or preview.

let pendingEmail = null;

async function handleAuthScreen() {
  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    startSession(session.user);
  } else {
    mountMascot("slot-login", "idle");
    show("login");
  }
}

$("#login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = $("#login-email").value.trim();
  if (!email) return;
  $("#login-submit").disabled = true;
  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin + window.location.pathname },
  });
  $("#login-submit").disabled = false;
  if (error) {
    $("#login-error").textContent = error.message;
    $("#login-error").hidden = false;
    return;
  }
  pendingEmail = email;
  $("#check-email-address").textContent = email;
  show("checkEmail");
});

$("#otp-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const token = $("#otp-input").value.trim();

  $("#otp-submit").disabled = true;
  const { error } = await sb.auth.verifyOtp({ email: pendingEmail, token, type: "email" });
  $("#otp-submit").disabled = false;
  if (error) {
    $("#otp-error").textContent = "That code didn't work — check you typed it right, or request a new one.";
    $("#otp-error").hidden = false;
    return;
  }
  // onAuthStateChange picks up the resulting SIGNED_IN session and starts the app.
});

$("#otp-back").addEventListener("click", (e) => {
  e.preventDefault();
  pendingEmail = null;
  $("#otp-input").value = "";
  $("#otp-error").hidden = true;
  show("login");
});

sb.auth.onAuthStateChange((event, session) => {
  if (event === "SIGNED_IN" && session) startSession(session.user);
});

// ---------- SRS (simplified SM-2) ----------

function grade(progressRow, rating) {
  // progressRow: { repetitions, ease_factor, interval_days } or null (first time)
  const p = progressRow || { repetitions: 0, ease_factor: 2.5, interval_days: 0 };
  let { repetitions, ease_factor: ease, interval_days: interval } = p;

  if (rating === "again") {
    return { repetitions: 0, ease_factor: Math.max(1.3, ease - 0.2), interval_days: 0, requeue: true };
  }
  if (rating === "hard") {
    return { repetitions, ease_factor: Math.max(1.3, ease - 0.15), interval_days: Math.max(1, interval * 1.2), requeue: false };
  }
  if (rating === "good") {
    repetitions += 1;
    interval = repetitions === 1 ? 1 : repetitions === 2 ? 6 : Math.round(interval * ease);
    return { repetitions, ease_factor: ease, interval_days: interval, requeue: false };
  }
  // easy
  repetitions += 1;
  interval = repetitions === 1 ? 4 : Math.round(interval * ease * 1.3);
  return { repetitions, ease_factor: ease + 0.15, interval_days: interval, requeue: false };
}

// ---------- Session building ----------

let state = null; // { user, vocab, progressById, queue, dailyLog, current }

async function startSession(user) {
  show("loading");

  const [bookVocab, extraVocab, progressRes, logRes] = await Promise.all([
    fetch("data/vocab.json").then((r) => r.json()),
    fetch("data/extra-vocab.json").then((r) => r.json()),
    sb.from("progress").select("*"),
    sb.from("daily_log").select("*").eq("day", todayStr()).maybeSingle(),
  ]);

  // Hand-authored extras go first so they surface soon via the normal
  // new-item pacing, rather than waiting until all 243 book words are done.
  const vocab = [...extraVocab, ...bookVocab];
  const progressById = {};
  for (const row of progressRes.data || []) progressById[row.item_id] = row;

  const dailyLog = logRes.data || { day: todayStr(), new_items_count: 0, reviewed_items_count: 0 };

  const now = Date.now();
  const due = [];
  const unseen = [];
  for (const item of vocab) {
    const p = progressById[item.id];
    if (!p) {
      unseen.push(item);
    } else if (new Date(p.due_at).getTime() <= now) {
      due.push(item);
    }
  }

  state = { user, vocab, progressById, queue: [], dailyLog: { ...dailyLog }, current: null };

  const newBudget = computeNewBudget(dailyLog);
  const newItems = unseen.slice(0, newBudget);
  const reviewItems = due.slice(0, REVIEWS_PER_SESSION);

  state.queue = shuffle([...reviewItems, ...newItems]);
  renderLevelBadge();

  if (state.queue.length === 0) {
    renderContinuePrompt();
  } else {
    nextCard();
  }
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------- Card UI ----------
//
// Every item is quizzed, new or not — guessing cold and getting corrected is
// the teaching moment; showing the meaning first would make it trivial.
// Two shapes: tap the right translation (multiple choice, always available —
// the only option for a word seen for the first time), or rebuild a
// multi-word phrase from a shuffled word bank (review only — only for
// phrases, and only once the word's actually been seen before). Audio is
// always an optional extra tap, never required to answer.

const root = $("#exercise-root");
let exerciseDone = false; // guards against double-submit while feedback is showing

function isWordOrderEligible(item) {
  const words = item.ar.trim().split(/\s+/);
  return words.length >= 2 && !item.ar.includes("/");
}

// Vocab `en` fields carry grammar notes alongside the translation, often
// including the Arabic word itself (e.g. "boy · pl. ⁦ولاد⁩ wlaad") — fine as
// a learning aid on its own, but not as a multiple-choice option. This keeps
// only the leading translation, dropping anything after a "·"/"—" separator
// and any parenthetical aside that still has Arabic in it.
function cleanEn(en) {
  let clean = en;
  // Only drop the "· pl. ⁦ولاد⁩ wlaad"-style tail when it actually carries
  // Arabic — some entries use the same "·"/"—" separators for an all-English
  // aside (idiom entries especially), which should stay intact.
  const segments = clean.split(/ · | — /);
  if (segments.length > 1 && /[؀-ۿ]/.test(segments.slice(1).join(" · "))) {
    clean = segments[0];
  }
  clean = clean.replace(/\([^)]*[؀-ۿ][^)]*\)/g, "");
  clean = clean.replace(/[؀-ۿ⁦-⁩]/g, "");
  return clean.replace(/\s{2,}/g, " ").trim();
}

function pickDistractors(item, count) {
  const correct = cleanEn(item.en);
  const pool = state.vocab.filter((v) => v.id !== item.id && cleanEn(v.en) !== correct);
  const picked = [];
  const used = new Set();
  while (picked.length < count && picked.length < pool.length) {
    const candidate = cleanEn(pool[Math.floor(Math.random() * pool.length)].en);
    if (!used.has(candidate)) {
      used.add(candidate);
      picked.push(candidate);
    }
  }
  return picked;
}

// Single-word decoys drawn from other items' Arabic, for the word-order bank
// — otherwise the bank holds exactly the right words and ordering is the
// only thing being tested, rather than also recognizing which words belong.
function pickWordDecoys(item, target, count) {
  const pool = [];
  const seen = new Set(target);
  for (const v of state.vocab) {
    if (v.id === item.id) continue;
    for (const w of v.ar.trim().split(/\s+/)) {
      if (!w || seen.has(w)) continue;
      seen.add(w);
      pool.push(w);
    }
  }
  return shuffle(pool).slice(0, count);
}

function nextCard() {
  if (state.queue.length === 0) {
    renderContinuePrompt();
    return;
  }
  state.current = state.queue.shift();
  exerciseDone = false;
  const item = state.current;
  const isNew = !state.progressById[item.id];

  $("#card-book").textContent = item.book_title;
  $("#card-progress").textContent = `${state.queue.length} left`;
  mountMascot("slot-session", "idle");

  if (!isNew && isWordOrderEligible(item) && Math.random() < 0.5) {
    renderWordOrder(item);
  } else {
    renderMultipleChoice(item, isNew);
  }

  show("session");
}

function speak(text) {
  if (!("speechSynthesis" in window)) return;
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = "ar";
  speechSynthesis.cancel();
  speechSynthesis.speak(utter);
}

function renderMultipleChoice(item, isNew) {
  const correctText = cleanEn(item.en);
  const options = shuffle([correctText, ...pickDistractors(item, 3)]);

  root.innerHTML = `
    ${isNew ? '<span class="new-badge">NEW</span>' : ""}
    <div class="ar-word" dir="rtl">${item.ar_full}</div>
    <button class="speak-btn" type="button" data-action="speak">🔊</button>
    <div class="mc-options">
      ${options.map((opt) => `<button class="mc-option" type="button" data-text="${escapeAttr(opt)}">${opt}</button>`).join("")}
    </div>
  `;
  root.querySelector('[data-action="speak"]').addEventListener("click", () => speak(item.ar_full));

  root.querySelectorAll(".mc-option").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (exerciseDone) return;
      exerciseDone = true;
      const correct = btn.dataset.text === correctText;
      root.querySelectorAll(".mc-option").forEach((b) => {
        b.disabled = true;
        if (b.dataset.text === correctText) b.classList.add("correct");
        else if (b === btn) b.classList.add("wrong");
      });
      setMascotMood(correct ? "happy" : "sad", correct ? "happy" : "sad");
      if (correct) {
        showRatingPrompt();
      } else {
        setTimeout(() => submitRating("again"), 900);
      }
    });
  });
}

// Wrong answers are unambiguous — just reschedule soon and move on. A
// correct answer is ambiguous (lucky guess vs. knew it cold), so that's
// where self-rating actually adds information to the SM-2 schedule.
function showRatingPrompt() {
  const wrap = document.createElement("div");
  wrap.innerHTML = `
    <p class="rate-prompt">How well did you know that?</p>
    <div class="rate-row">
      <button class="rate-hard" type="button" data-rate="hard">Hard</button>
      <button class="rate-good" type="button" data-rate="good">Good</button>
      <button class="rate-easy" type="button" data-rate="easy">Easy</button>
    </div>
  `;
  root.appendChild(wrap);
  wrap.querySelectorAll("[data-rate]").forEach((btn) => {
    btn.addEventListener("click", () => submitRating(btn.dataset.rate));
  });
}

// A fresh random count each time (3-6) rather than a fixed number, so the
// bank size itself isn't a tell.
function randomDecoyCount() {
  return 3 + Math.floor(Math.random() * 4);
}

function renderWordOrder(item) {
  const target = item.ar.trim().split(/\s+/);
  const decoys = pickWordDecoys(item, target, randomDecoyCount());
  let bank = shuffle([...target, ...decoys]);
  const answer = [];

  root.innerHTML = `
    <div class="en-answer">${cleanEn(item.en)}</div>
    <button class="speak-btn" type="button" data-action="speak">🔊</button>
    <div class="order-answer" id="order-answer" dir="rtl"></div>
    <div class="order-bank" id="order-bank" dir="rtl"></div>
    <button class="btn-primary order-check-btn" type="button" id="order-check-btn" disabled>Check</button>
  `;
  root.querySelector('[data-action="speak"]').addEventListener("click", () => speak(item.ar));

  const answerEl = root.querySelector("#order-answer");
  const bankEl = root.querySelector("#order-bank");
  const checkBtn = root.querySelector("#order-check-btn");

  function renderChips() {
    bankEl.innerHTML = bank
      .map((w, i) => `<button class="word-chip" type="button" data-side="bank" data-idx="${i}">${w}</button>`)
      .join("");
    answerEl.innerHTML = answer
      .map((w, i) => `<button class="word-chip in-answer" type="button" data-side="answer" data-idx="${i}">${w}</button>`)
      .join("");
    checkBtn.disabled = answer.length === 0;

    bankEl.querySelectorAll(".word-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        if (exerciseDone) return;
        const idx = Number(chip.dataset.idx);
        answer.push(bank[idx]);
        bank.splice(idx, 1);
        renderChips();
      });
    });
    answerEl.querySelectorAll(".word-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        if (exerciseDone) return;
        const idx = Number(chip.dataset.idx);
        bank.push(answer[idx]);
        answer.splice(idx, 1);
        renderChips();
      });
    });
  }

  checkBtn.addEventListener("click", () => {
    if (exerciseDone || answer.length === 0) return;
    checkOrder();
  });

  function checkOrder() {
    exerciseDone = true;
    checkBtn.disabled = true;
    const correct = answer.join(" ") === target.join(" ");
    answerEl.classList.add(correct ? "correct" : "wrong");
    if (!correct) {
      answerEl.innerHTML = target
        .map((w) => `<span class="word-chip in-answer">${w}</span>`)
        .join("");
    }
    setMascotMood(correct ? "happy" : "sad", correct ? "happy" : "sad");
    if (correct) {
      setTimeout(() => showRatingPrompt(), 400);
    } else {
      setTimeout(() => submitRating("again"), 1100);
    }
  }

  renderChips();
}

function escapeAttr(s) {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

async function submitRating(rating) {
  const item = state.current;
  const prev = state.progressById[item.id];
  const wasNew = !prev;
  const result = grade(prev, rating);

  const row = {
    user_id: state.user.id,
    item_id: item.id,
    repetitions: result.repetitions,
    ease_factor: result.ease_factor,
    interval_days: result.interval_days,
    due_at: new Date(Date.now() + result.interval_days * 86400000).toISOString(),
    last_result: rating,
    last_reviewed_at: new Date().toISOString(),
  };
  state.progressById[item.id] = row;

  // fire-and-forget-ish, but we await so a flaky connection doesn't silently drop progress
  await sb.from("progress").upsert(row);

  state.dailyLog.reviewed_items_count += 1;
  if (wasNew) state.dailyLog.new_items_count += 1;
  await sb.from("daily_log").upsert({
    user_id: state.user.id,
    day: todayStr(),
    new_items_count: state.dailyLog.new_items_count,
    reviewed_items_count: state.dailyLog.reviewed_items_count,
  });

  if (result.requeue) state.queue.push(item);
  renderLevelBadge();
  nextCard();
}

const EXTRA_REVIEW_BATCH = 10;

// Today's assigned new words + due reviews are a fixed, paced batch — but
// once that's done, there's no reason to force a stop. Anything already
// learned (repetitions > 0, regardless of whether it's actually due yet) is
// fair game for an extra round, repeated for as long as the user wants.
function renderContinuePrompt() {
  const learnedPool = state.vocab.filter((v) => state.progressById[v.id]);
  if (learnedPool.length === 0) {
    renderDone();
    return;
  }
  $("#continue-reviewed").textContent = state.dailyLog.reviewed_items_count;
  $("#continue-new").textContent = state.dailyLog.new_items_count;
  $("#continue-level").textContent = levelSummaryText();
  mountMascot("slot-continue", "happy");
  setMascotMood("happy", "happy");
  show("continue");
}

$("#continue-more-btn").addEventListener("click", () => {
  const pool = shuffle(state.vocab.filter((v) => state.progressById[v.id]));
  state.queue = pool.slice(0, EXTRA_REVIEW_BATCH);
  nextCard();
});

function renderDone() {
  $("#done-reviewed").textContent = state.dailyLog.reviewed_items_count;
  $("#done-new").textContent = state.dailyLog.new_items_count;
  $("#done-level").textContent = levelSummaryText();
  mountMascot("slot-done", "happy");
  setMascotMood("happy", "happy");
  show("done");
}

// ---------- Boot ----------

handleAuthScreen();
