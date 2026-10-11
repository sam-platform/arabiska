// Arabiska — daily practice loop.
// No build step: plain script, loaded after the Supabase UMD bundle.

const SUPABASE_URL = "https://gdwvycndaqxydluvqdia.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_PnGf7MRx1nBFcRKo0O4dPQ_L03B64vI";
const NEW_ITEMS_PER_DAY = 6;
const REVIEWS_PER_SESSION = 30;

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const $ = (sel) => document.querySelector(sel);
const screens = {
  loading: $("#screen-loading"),
  login: $("#screen-login"),
  checkEmail: $("#screen-check-email"),
  session: $("#screen-session"),
  done: $("#screen-done"),
};

function show(name) {
  for (const key in screens) screens[key].hidden = key !== name;
}

function todayStr() {
  // local calendar day, not UTC
  return new Date().toLocaleDateString("en-CA");
}

// ---------- Auth ----------
//
// Installed home-screen PWAs on iOS don't share storage with Safari, so tapping
// the magic-link email opens Safari and signs *that* in — never the installed
// app. Instead, the user copies the link and pastes it back into the app, which
// pulls the token out of it and verifies it in-place (no custom email template
// needed, which the Supabase free tier doesn't allow anyway).

let pendingEmail = null;

async function handleAuthScreen() {
  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    startSession(session.user);
  } else {
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
  const pasted = $("#otp-input").value.trim();
  const match = pasted.match(/token=([^&\s]+)/);
  const token = match ? decodeURIComponent(match[1]) : pasted;

  $("#otp-submit").disabled = true;
  const { error } = await sb.auth.verifyOtp({ email: pendingEmail, token, type: "email" });
  $("#otp-submit").disabled = false;
  if (error) {
    $("#otp-error").textContent = "That didn't work — check you copied the whole link, or request a new one.";
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

  const [vocabRes, progressRes, logRes] = await Promise.all([
    fetch("data/vocab.json").then((r) => r.json()),
    sb.from("progress").select("*"),
    sb.from("daily_log").select("*").eq("day", todayStr()).maybeSingle(),
  ]);

  const vocab = vocabRes;
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

  const newBudget = Math.max(0, NEW_ITEMS_PER_DAY - dailyLog.new_items_count);
  const newItems = unseen.slice(0, newBudget);
  const reviewItems = due.slice(0, REVIEWS_PER_SESSION);

  const queue = shuffle([...reviewItems, ...newItems]);

  state = { user, vocab, progressById, queue, dailyLog: { ...dailyLog }, current: null };

  if (queue.length === 0) {
    renderDone();
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

function nextCard() {
  if (state.queue.length === 0) {
    renderDone();
    return;
  }
  state.current = state.queue.shift();
  const item = state.current;
  const isNew = !state.progressById[item.id];

  $("#card-ar").textContent = item.ar_full;
  $("#card-translit").textContent = item.translit;
  $("#card-en").textContent = item.en;
  $("#card-new-badge").hidden = !isNew;
  $("#card-book").textContent = item.book_title;
  $("#card-reveal-area").hidden = false;
  $("#card-answer").hidden = true;
  $("#card-rate-row").hidden = true;
  $("#card-progress").textContent = `${state.queue.length} left`;

  show("session");
}

$("#card-reveal-btn").addEventListener("click", () => {
  $("#card-answer").hidden = false;
  $("#card-rate-row").hidden = false;
  $("#card-reveal-area").hidden = true;
});

$("#card-speak-btn").addEventListener("click", () => {
  speak(state.current.ar_full);
});

function speak(text) {
  if (!("speechSynthesis" in window)) return;
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = "ar";
  speechSynthesis.cancel();
  speechSynthesis.speak(utter);
}

document.querySelectorAll("[data-rate]").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const rating = btn.dataset.rate;
    await submitRating(rating);
  });
});

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
  nextCard();
}

function renderDone() {
  $("#done-reviewed").textContent = state.dailyLog.reviewed_items_count;
  $("#done-new").textContent = state.dailyLog.new_items_count;
  show("done");
}

// ---------- Boot ----------

handleAuthScreen();
