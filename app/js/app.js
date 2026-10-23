// Arabiska — daily practice loop.
// No build step: plain script, loaded after the Supabase UMD bundle.

const SUPABASE_URL = "https://gdwvycndaqxydluvqdia.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_PnGf7MRx1nBFcRKo0O4dPQ_L03B64vI";
// Daily 21:00 Stockholm reminder — see worker/src/index.js for the send side.
const REMINDER_WORKER_URL = "https://arabiska-reminder.samfarkhooi.workers.dev";
const REMINDER_VAPID_PUBLIC_KEY = "BOzsjyY0y_jXzY4OvVIDOu-GepDrxTBl-qrq5nJDe4g-hImfS9ZuqxV4auYCDRIrwMwqugK79R9_oJPq0REwUUM";
const REMINDER_SUBSCRIBE_SECRET = "9cKHgeJdVvQpELiV2kqdIlRajQfOiwom";
const REMINDERS_KEY = "arabiska-reminders-enabled";
// Total cards in a set (due reviews + new words) — the batch that has to be
// finished for the day to "count" (see finishInitialSetIfPending()).
const SET_SIZE = 10;

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

function masteredCount() {
  return Object.values(state.progressById).filter((p) => p.mastered).length;
}

function remainingCount() {
  return state.vocab.length - masteredCount();
}

// A day only "counts" once the whole set is finished (see
// finishInitialSetIfPending()) — answering one card isn't enough. Counts
// backward from today; if today isn't finished yet (the day isn't over),
// that alone doesn't break the streak — it just starts counting from
// yesterday instead. state.dailyLog is the freshest source for *today*
// since it's updated in-memory as the user plays, ahead of what logHistory
// (fetched once at load) would show.
function computeStreak() {
  const activeDays = new Set(
    state.logHistory.filter((r) => r.set_completed).map((r) => r.day)
  );
  const todayKey = todayStr();
  if (state.dailyLog.set_completed) activeDays.add(todayKey);

  const cursor = new Date();
  if (!activeDays.has(todayKey)) cursor.setDate(cursor.getDate() - 1);

  let streak = 0;
  while (activeDays.has(cursor.toLocaleDateString("en-CA"))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ---------- In-progress set persistence ----------
//
// Lets closing and reopening the app mid-set pick back up on the same card
// instead of rebuilding (and reshuffling) from scratch. Scoped by user +
// day so a stale save never leaks into tomorrow's set.
function queueStorageKey(userId) {
  return `arabiska_queue_${userId}`;
}

function saveQueueState() {
  const itemIds = (state.current ? [state.current, ...state.queue] : state.queue).map((i) => i.id);
  if (itemIds.length === 0) {
    clearQueueState();
    return;
  }
  localStorage.setItem(
    queueStorageKey(state.user.id),
    JSON.stringify({
      day: todayStr(),
      itemIds,
      initialSetPending: state.initialSetPending,
      // The in-progress card's own type/direction, so reopening mid-card (the
      // process got killed in the background) doesn't reroll en2ar vs ar2en —
      // that would let the still-fresh memory of the other direction give the
      // answer away.
      currentType: state.current ? currentExerciseType : null,
      currentDirection: state.current ? currentDirection : null,
    })
  );
}

function clearQueueState() {
  localStorage.removeItem(queueStorageKey(state.user.id));
}

function loadQueueState() {
  try {
    const raw = localStorage.getItem(queueStorageKey(state.user.id));
    if (!raw) return null;
    const saved = JSON.parse(raw);
    if (saved.day !== todayStr()) return null;
    const byId = new Map(state.vocab.map((v) => [v.id, v]));
    const queue = saved.itemIds.map((id) => byId.get(id)).filter(Boolean);
    return queue.length
      ? {
          queue,
          initialSetPending: !!saved.initialSetPending,
          currentType: saved.currentType || null,
          currentDirection: saved.currentDirection || null,
        }
      : null;
  } catch {
    return null;
  }
}

const $ = (sel) => document.querySelector(sel);
const screens = {
  loading: $("#screen-loading"),
  login: $("#screen-login"),
  checkEmail: $("#screen-check-email"),
  dashboard: $("#screen-dashboard"),
  session: $("#screen-session"),
  continue: $("#screen-continue"),
  done: $("#screen-done"),
};

function show(name) {
  for (const key in screens) screens[key].hidden = key !== name;
}

// ---------- Theme ----------
//
// Harbor Night is the default (set in the CSS itself) — this is a manual
// light/dark toggle, not tied to the OS theme. The inline script in <head>
// applies a saved "light" preference before first paint so it doesn't flash
// dark first; this just keeps the toggle button and meta theme-color in
// sync with it afterward.

const THEME_KEY = "arabiska-theme";
const THEME_COLOR = { dark: "#141D24", light: "#DCE6EC" };
const themeToggleBtn = $("#theme-toggle");

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  themeToggleBtn.textContent = theme === "light" ? "🌙" : "☀️";
  themeToggleBtn.setAttribute("aria-label", theme === "light" ? "Switch to dark mode" : "Switch to light mode");
  $("#meta-theme-color").setAttribute("content", THEME_COLOR[theme]);
}

themeToggleBtn.addEventListener("click", () => {
  const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
  try {
    localStorage.setItem(THEME_KEY, next);
  } catch (e) {}
  applyTheme(next);
});

applyTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark");

// ---------- Push reminders ----------
//
// A Cloudflare Worker (worker/src/index.js) sends one push at 21:00
// Stockholm time on any day the set isn't done yet. This is just the
// subscribe side: register the service worker, get a PushSubscription, and
// hand it to the worker along with the signed-in user's id.

function urlBase64ToUint8Array(base64url) {
  const padding = "=".repeat((4 - (base64url.length % 4)) % 4);
  const base64 = (base64url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

const remindersBtn = $("#enable-reminders-btn");

function updateRemindersBtn() {
  const enabled = localStorage.getItem(REMINDERS_KEY) === "1";
  remindersBtn.textContent = enabled ? "🔔 Reminders on" : "🔔 Remind me if I forget";
  remindersBtn.disabled = enabled;
}

async function enableReminders() {
  try {
    const registration = await navigator.serviceWorker.register("sw.js");
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return;

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(REMINDER_VAPID_PUBLIC_KEY),
    });

    await fetch(`${REMINDER_WORKER_URL}/subscribe`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Subscribe-Secret": REMINDER_SUBSCRIBE_SECRET,
      },
      body: JSON.stringify({ subscription, userId: state.user.id }),
    });

    localStorage.setItem(REMINDERS_KEY, "1");
    updateRemindersBtn();
  } catch (e) {
    console.error("enableReminders failed", e);
  }
}

if ("serviceWorker" in navigator && "PushManager" in window) {
  remindersBtn.hidden = false;
  updateRemindersBtn();
  remindersBtn.addEventListener("click", enableReminders);
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
    sb.from("daily_log").select("*"),
  ]);

  // Hand-authored extras go first so they surface soon via the normal
  // new-item pacing, rather than waiting until all 243 book words are done.
  const vocab = [...extraVocab, ...bookVocab];
  const progressById = {};
  for (const row of progressRes.data || []) progressById[row.item_id] = row;

  const logHistory = logRes.data || [];
  const dailyLog = logHistory.find((r) => r.day === todayStr()) || {
    day: todayStr(),
    new_items_count: 0,
    reviewed_items_count: 0,
    set_completed: false,
  };

  state = { user, vocab, progressById, queue: [], dailyLog: { ...dailyLog }, logHistory, current: null, forcedType: {} };

  const resume = loadQueueState();
  if (resume) {
    state.queue = resume.queue;
    state.initialSetPending = resume.initialSetPending;
    if (resume.currentType) {
      state.forcedType[resume.queue[0].id] = { type: resume.currentType, direction: resume.currentDirection };
    }
    renderLevelBadge();
    nextCard();
    return;
  }

  renderDashboard();
}

function renderDashboard() {
  const streak = computeStreak();
  const doneToday = !!state.dailyLog.set_completed;
  $("#dash-streak").textContent = streak;
  $("#dash-fire").classList.toggle("lit", doneToday);
  $("#dash-mastered").textContent = masteredCount();
  $("#dash-remaining").textContent = remainingCount();
  $("#dash-level").textContent = estimateLevel() || "New";
  mountMascot("slot-dashboard", doneToday ? "happy" : "idle");
  show("dashboard");
}

function beginPractice() {
  const now = Date.now();
  const due = [];
  const unseen = [];
  for (const item of state.vocab) {
    const p = state.progressById[item.id];
    if (!p) {
      unseen.push(item);
    } else if (!p.mastered && new Date(p.due_at).getTime() <= now) {
      due.push(item);
    }
  }

  const reviewItems = due.slice(0, SET_SIZE);
  const newItems = unseen.slice(0, SET_SIZE - reviewItems.length);

  state.queue = shuffle([...reviewItems, ...newItems]);
  state.initialSetPending = true;
  renderLevelBadge();
  nextCard();
}

// Marks today's daily_log row as set_completed once the day's initial batch
// (due reviews + new words, including anything requeued after a wrong
// answer — see the `requeue` push in submitRating()) has been fully
// drained. Extra "Keep practicing" rounds afterward don't re-trigger this —
// initialSetPending is already false by the time that button exists.
async function finishInitialSetIfPending() {
  if (!state.initialSetPending) return;
  state.initialSetPending = false;
  if (state.dailyLog.set_completed) return;
  state.dailyLog.set_completed = true;
  await sb.from("daily_log").upsert({
    user_id: state.user.id,
    day: todayStr(),
    set_completed: true,
  });
}

$("#start-practice-btn").addEventListener("click", beginPractice);
$("#continue-home-btn").addEventListener("click", (e) => {
  e.preventDefault();
  renderDashboard();
});
$("#done-home-btn").addEventListener("click", () => renderDashboard());

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
// Which exercise type the card currently on screen was rendered as — recorded
// so a wrong answer can force the *same* type on its requeued reappearance
// (see the forcedType stash in submitRating()). Otherwise a hard word-order
// miss could resurface as easy multiple-choice recognition instead.
let currentExerciseType = null;
// Which way a multiple-choice card is quizzing: "ar2en" shows the Arabic and
// asks for the English meaning (the original direction), "en2ar" shows the
// English and asks to pick the matching Arabic. Randomized per card so both
// directions of recognition get practiced; irrelevant for word order, which
// is already English-shown/Arabic-built in one fixed direction.
let currentDirection = null;

function isWordOrderEligible(item) {
  const words = item.ar.trim().split(/\s+/);
  return words.length >= 2 && !item.ar.includes("/");
}

// Vocab `en` fields carry grammar notes and usage asides alongside the
// translation — sometimes the Arabic word itself (e.g. "boy · pl. ⁦ولاد⁩
// wlaad"), sometimes pure English filler (e.g. "I swear, seriously (filler
// for emphasis)"). Fine as a learning aid on its own, but not as a
// multiple-choice option, where only the core translation belongs.
function cleanEn(en) {
  let clean = en;
  // Drop anything after a "·"/"—" separator — grammar tails ("· pl. ⁦ولاد⁩
  // wlaad"), usage asides ("· also 'for ages'"), and idiom explanations
  // ("— let bygones be bygones...") alike. Keeping those in would make the
  // multiple-choice option needlessly long and, for idioms especially, an
  // obvious giveaway next to short single-word distractors.
  const segments = clean.split(/ · | — /);
  if (segments.length > 1) clean = segments[0];
  // Parenthetical asides go — grammar markers, usage notes — except a
  // "lit. ..." literal-translation gloss, worth keeping on its own even when
  // the rest of the same parens is filler (e.g. "(polite request, lit. \"God
  // keep you\")" keeps just the gloss).
  clean = clean.replace(/\s*\(([^()]*)\)/g, (_, inner) => {
    const lit = inner.match(/lit\.\s*("(?:[^"\\]|\\.)*"|[^,)]*)/i);
    return lit ? ` (lit. ${lit[1].trim()})` : "";
  });
  clean = clean.replace(/[؀-ۿ⁦-⁩]/g, "");
  clean = clean.replace(/\s{2,}/g, " ").trim();
  // Collapse "/"-separated alternatives left identical once their markers
  // are gone (e.g. "this (m.) / this (f.)" -> "this / this" -> "this").
  const parts = clean.split(" / ").map((p) => p.trim());
  return parts.filter((p, i) => p !== parts[i - 1]).join(" / ");
}

// A short phrase next to three single words (or vice versa) gives the
// answer away by shape alone, without needing any Arabic. Bucket by word
// count and prefer decoys from the correct answer's own bucket, so the
// options are at least superficially comparable; only fall back to the
// rest of the vocab once that bucket runs out of unique candidates.
function wordCount(text) {
  return text.trim().split(/\s+/).length;
}
function lengthBucket(text) {
  const n = wordCount(text);
  return n <= 2 ? "short" : n <= 5 ? "medium" : "long";
}

// Whether the correct answer is in definite ("the x" / "ال‑x") form is
// otherwise a free tell: a decoy in the other form stands out by shape
// alone, without needing to know any Arabic or English. Normalize every
// decoy to match the correct answer's definiteness before it's offered.
function hasDefiniteArticle(text) {
  return /^ال/.test(text) || /^the\s+/i.test(text);
}
function withDefiniteArticle(text) {
  if (hasDefiniteArticle(text)) return text;
  return /[؀-ۿ]/.test(text) ? "ال" + text : "the " + text;
}
function withoutDefiniteArticle(text) {
  if (/^ال/.test(text)) return text.slice(2);
  if (/^the\s+/i.test(text)) return text.replace(/^the\s+/i, "");
  return text;
}
function matchDefiniteness(text, correct) {
  return hasDefiniteArticle(correct) ? withDefiniteArticle(text) : withoutDefiniteArticle(text);
}

// Same tell, different shape: a handful of items are imperatives ("get up!")
// or questions ("what do you want?") and keep that trailing mark in their
// option text, while almost everything else doesn't — so the mark alone
// would single out the correct option. Normalize decoys to match.
function stripTrailingMark(text) {
  return text.replace(/[!؟?]+\s*$/, "").replace(/\s+$/, "");
}
function trailingMarkClass(text) {
  if (/!\s*$/.test(text)) return "bang";
  if (/[؟?]\s*$/.test(text)) return "question";
  return null;
}
function matchTrailingMark(text, correct) {
  const cls = trailingMarkClass(correct);
  const base = stripTrailingMark(text);
  if (!cls) return base;
  if (cls === "bang") return base + "!";
  return /[؀-ۿ]/.test(base) ? base + "؟" : base + "?";
}
function matchDecoyShape(text, correct) {
  return matchTrailingMark(matchDefiniteness(text, correct), correct);
}

// Ranks decoy candidates into four tiers — same part of speech & same
// length bucket first, down to neither matching — so an item's grammatical
// shape (visibly an adjective, say) doesn't give away the answer by being
// the only one of its kind among the options, on top of the existing
// length-shape guard.
function pickDecoys(item, count, textOf) {
  const correct = textOf(item);
  const targetBucket = lengthBucket(correct);
  const candidates = state.vocab
    .filter((v) => v.id !== item.id)
    .map((v) => ({ text: matchDecoyShape(textOf(v), correct), pos: v.pos }))
    .filter((c) => c.text !== correct);

  const tiers = [
    candidates.filter((c) => c.pos === item.pos && lengthBucket(c.text) === targetBucket),
    candidates.filter((c) => c.pos === item.pos && lengthBucket(c.text) !== targetBucket),
    candidates.filter((c) => c.pos !== item.pos && lengthBucket(c.text) === targetBucket),
    candidates.filter((c) => c.pos !== item.pos && lengthBucket(c.text) !== targetBucket),
  ];

  const picked = [];
  const used = new Set();
  for (const tier of tiers) {
    for (const { text } of shuffle(tier)) {
      if (picked.length >= count) break;
      if (!used.has(text)) {
        used.add(text);
        picked.push(text);
      }
    }
  }
  return picked;
}

function pickDistractors(item, count) {
  return pickDecoys(item, count, (v) => cleanEn(v.en));
}

// Same approach as pickDistractors, but for the reverse (English shown,
// pick the matching Arabic) direction — decoys come from other items'
// ar_full text instead of their cleaned English.
function pickArabicDistractors(item, count) {
  return pickDecoys(item, count, (v) => v.ar_full);
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

async function nextCard() {
  if (state.queue.length === 0) {
    state.current = null;
    clearQueueState();
    await finishInitialSetIfPending();
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

  const forced = state.forcedType[item.id];
  delete state.forcedType[item.id];
  const useWordOrder = forced ? forced.type === "wordOrder" : !isNew && isWordOrderEligible(item) && Math.random() < 0.5;
  currentExerciseType = useWordOrder ? "wordOrder" : "multipleChoice";
  currentDirection = forced && forced.direction ? forced.direction : Math.random() < 0.5 ? "ar2en" : "en2ar";
  saveQueueState();

  if (useWordOrder) {
    renderWordOrder(item);
  } else {
    renderMultipleChoice(item, isNew, currentDirection);
  }

  show("session");
}

// Safari (iOS in particular) has a long-standing bug where an utterance with
// no other reference gets garbage-collected mid-speech and simply goes
// silent — holding one here is the documented workaround. Picking an actual
// Arabic voice (when the device has one) also matters: `lang` alone is a
// hint some engines ignore, again failing silently rather than erroring.
let activeUtterance = null;

function pickArabicVoice() {
  const voices = speechSynthesis.getVoices();
  return voices.find((v) => v.lang && v.lang.toLowerCase().startsWith("ar")) || null;
}

function speak(text) {
  if (!("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = "ar";
  const voice = pickArabicVoice();
  if (voice) utter.voice = voice;
  activeUtterance = utter;
  speechSynthesis.speak(utter);
}

// Voice lists load asynchronously on some browsers — this nudges Safari to
// populate speechSynthesis.getVoices() before the first tap of the speaker
// button needs it.
if ("speechSynthesis" in window) {
  speechSynthesis.getVoices();
  speechSynthesis.addEventListener("voiceschanged", () => speechSynthesis.getVoices());
}

function renderMultipleChoice(item, isNew, direction) {
  const isReverse = direction === "en2ar";
  const correctText = isReverse ? item.ar_full : cleanEn(item.en);
  const distractors = isReverse ? pickArabicDistractors(item, 3) : pickDistractors(item, 3);
  const options = shuffle([correctText, ...distractors]);
  const optionClass = isReverse ? "mc-option ar-option" : "mc-option";
  const promptHtml = isReverse
    ? `<div class="en-answer">${cleanEn(item.en)}</div>`
    : `<div class="ar-word" dir="rtl">${item.ar_full}</div>`;

  root.innerHTML = `
    ${isNew ? '<span class="new-badge">NEW</span>' : ""}
    ${promptHtml}
    <button class="speak-btn" type="button" data-action="speak">🔊</button>
    <div class="mc-options">
      ${options.map((opt) => `<button class="${optionClass}" type="button" data-text="${escapeAttr(opt)}" ${isReverse ? 'dir="rtl"' : ""}>${opt}</button>`).join("")}
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
        showNextButton();
      }
    });
  });
}

// A wrong answer stays on screen — correct option highlighted, or correct
// word order revealed — until the user taps Next, instead of auto-advancing,
// so there's a moment to actually register the right answer.
function showNextButton() {
  const wrap = document.createElement("div");
  wrap.innerHTML = `<button class="btn-primary" type="button" style="margin-top:14px;">Next</button>`;
  root.appendChild(wrap);
  wrap.querySelector("button").addEventListener("click", () => submitRating("again"), { once: true });
}

// Wrong answers are unambiguous — just reschedule soon and move on. A
// correct answer is ambiguous (lucky guess vs. knew it cold), so that's
// where self-rating actually adds information to the SM-2 schedule.
function showRatingPrompt() {
  const wrap = document.createElement("div");
  wrap.innerHTML = `
    <p class="rate-prompt">How well did you know that?</p>
    <div class="rate-row">
      <button class="rate-good" type="button" data-rate="good">Good</button>
      <button class="rate-easy" type="button" data-rate="easy">Easy</button>
      <button class="rate-mastered" type="button" data-rate="mastered">Mastered</button>
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
  // `pool` keeps each word's position fixed for the whole exercise — only
  // `picked` (which pool slots are already used) changes, so tapping a word
  // never reshuffles the ones still left in the bank.
  const pool = shuffle([...target, ...decoys]);
  const picked = new Array(pool.length).fill(false);
  const answer = []; // indices into `pool`, in the order they were tapped

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
    bankEl.innerHTML = pool
      .map((w, i) => {
        const cls = picked[i] ? "word-chip picked" : "word-chip";
        return `<button class="${cls}" type="button" data-idx="${i}" ${picked[i] ? "disabled" : ""}>${w}</button>`;
      })
      .join("");
    answerEl.innerHTML = answer
      .map((poolIdx, i) => `<button class="word-chip in-answer" type="button" data-idx="${i}">${pool[poolIdx]}</button>`)
      .join("");
    checkBtn.disabled = answer.length === 0;

    bankEl.querySelectorAll(".word-chip:not(.picked)").forEach((chip) => {
      chip.addEventListener("click", () => {
        if (exerciseDone) return;
        const idx = Number(chip.dataset.idx);
        picked[idx] = true;
        answer.push(idx);
        renderChips();
      });
    });
    answerEl.querySelectorAll(".word-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        if (exerciseDone) return;
        const idx = Number(chip.dataset.idx);
        picked[answer[idx]] = false;
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
    const correct = answer.map((i) => pool[i]).join(" ") === target.join(" ");
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
      showNextButton();
    }
  }

  renderChips();
}

function escapeAttr(s) {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

// "Mastered" permanently retires an item as its own flashcard — a way to
// blow through the words that are already far too easy (walla, mar7aba...)
// without waiting on SM-2 to space them out gradually. It still fully
// satisfies the current rep so isWordOrderEligible items keep contributing
// their Arabic to other cards' word banks; only startSession() and the
// continue-prompt pools skip it going forward (see the `mastered` filters
// there).
const MASTERED_INTERVAL_DAYS = 36500; // ~100 years — effectively "never due"

async function submitRating(rating) {
  const item = state.current;
  const prev = state.progressById[item.id];
  const wasNew = !prev;

  let row;
  if (rating === "mastered") {
    row = {
      user_id: state.user.id,
      item_id: item.id,
      repetitions: (prev?.repetitions || 0) + 1,
      ease_factor: Math.max(prev?.ease_factor || 2.5, 2.8),
      interval_days: MASTERED_INTERVAL_DAYS,
      due_at: new Date(Date.now() + MASTERED_INTERVAL_DAYS * 86400000).toISOString(),
      mastered: true,
      last_result: rating,
      last_reviewed_at: new Date().toISOString(),
    };
  } else {
    const result = grade(prev, rating);
    row = {
      user_id: state.user.id,
      item_id: item.id,
      repetitions: result.repetitions,
      ease_factor: result.ease_factor,
      interval_days: result.interval_days,
      due_at: new Date(Date.now() + result.interval_days * 86400000).toISOString(),
      mastered: false,
      last_result: rating,
      last_reviewed_at: new Date().toISOString(),
    };
    if (result.requeue) {
      state.queue.push(item);
      state.forcedType[item.id] = { type: currentExerciseType, direction: currentDirection };
    }
  }
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

  renderLevelBadge();
  nextCard();
}

const EXTRA_REVIEW_BATCH = 10;

// True for anything with progress that isn't permanently retired via
// "Mastered" — the pool eligible for the voluntary extra-practice rounds.
function isExtraPracticeCandidate(v) {
  const p = state.progressById[v.id];
  return !!p && !p.mastered;
}

// Today's assigned new words + due reviews are a fixed, paced batch — but
// once that's done, there's no reason to force a stop. Anything already
// learned (regardless of whether it's actually due yet) is fair game for an
// extra round, repeated for as long as the user wants.
function renderContinuePrompt() {
  const learnedPool = state.vocab.filter(isExtraPracticeCandidate);
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
  const pool = shuffle(state.vocab.filter(isExtraPracticeCandidate));
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
