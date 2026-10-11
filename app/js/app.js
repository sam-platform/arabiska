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
//
// Three exercise shapes. A never-seen item is just taught (shown, not
// tested) — repetitions is already 0, no point quizzing it cold. A seen
// item is quizzed, auto-graded by correctness rather than self-rated: tap
// the right translation (multiple choice, always available), or rebuild a
// multi-word phrase from a shuffled word bank (only for phrases — a bare
// single word has nothing to reorder). Audio is always an optional extra
// tap, never required to answer.

const root = $("#exercise-root");
let exerciseDone = false; // guards against double-submit while feedback is showing

function isWordOrderEligible(item) {
  const words = item.ar.trim().split(/\s+/);
  return words.length >= 2 && !item.ar.includes("/");
}

function pickDistractors(item, count) {
  const pool = state.vocab.filter((v) => v.id !== item.id && v.en !== item.en);
  const picked = [];
  const used = new Set();
  while (picked.length < count && picked.length < pool.length) {
    const candidate = pool[Math.floor(Math.random() * pool.length)];
    if (!used.has(candidate.en)) {
      used.add(candidate.en);
      picked.push(candidate.en);
    }
  }
  return picked;
}

function nextCard() {
  if (state.queue.length === 0) {
    renderDone();
    return;
  }
  state.current = state.queue.shift();
  exerciseDone = false;
  const item = state.current;
  const isNew = !state.progressById[item.id];

  $("#card-book").textContent = item.book_title;
  $("#card-progress").textContent = `${state.queue.length} left`;
  mountMascot("slot-session", "idle");

  if (isNew) {
    renderTeach(item);
  } else if (isWordOrderEligible(item) && Math.random() < 0.5) {
    renderWordOrder(item);
  } else {
    renderMultipleChoice(item);
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

function renderTeach(item) {
  root.innerHTML = `
    <span class="new-badge">NEW</span>
    <div class="ar-word" dir="rtl">${item.ar_full}</div>
    <div class="translit">${item.translit}</div>
    <button class="speak-btn" type="button" data-action="speak">🔊</button>
    <div class="en-answer">${item.en}</div>
    <button class="btn-primary continue-btn" type="button" data-action="teach-continue">Got it</button>
  `;
  root.querySelector('[data-action="speak"]').addEventListener("click", () => speak(item.ar_full));
  root.querySelector('[data-action="teach-continue"]').addEventListener("click", () => {
    setMascotMood("happy", "happy");
    submitRating("good");
  });
}

function renderMultipleChoice(item) {
  const options = shuffle([item.en, ...pickDistractors(item, 3)]);

  root.innerHTML = `
    <div class="ar-word" dir="rtl">${item.ar_full}</div>
    <div class="translit">${item.translit}</div>
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
      const correct = btn.dataset.text === item.en;
      root.querySelectorAll(".mc-option").forEach((b) => {
        b.disabled = true;
        if (b.dataset.text === item.en) b.classList.add("correct");
        else if (b === btn) b.classList.add("wrong");
      });
      setMascotMood(correct ? "happy" : "sad", correct ? "happy" : "sad");
      setTimeout(() => submitRating(correct ? "good" : "again"), 900);
    });
  });
}

function renderWordOrder(item) {
  const target = item.ar.trim().split(/\s+/);
  let bank = shuffle(target);
  // guard against shuffle landing on the already-correct order
  if (bank.join(" ") === target.join(" ") && bank.length > 1) {
    [bank[0], bank[1]] = [bank[1], bank[0]];
  }
  const answer = [];

  root.innerHTML = `
    <div class="en-answer">${item.en}</div>
    <button class="speak-btn" type="button" data-action="speak">🔊</button>
    <div class="order-answer" id="order-answer" dir="rtl"></div>
    <div class="order-bank" id="order-bank" dir="rtl"></div>
  `;
  root.querySelector('[data-action="speak"]').addEventListener("click", () => speak(item.ar));

  const answerEl = root.querySelector("#order-answer");
  const bankEl = root.querySelector("#order-bank");

  function renderChips() {
    bankEl.innerHTML = bank
      .map((w, i) => `<button class="word-chip" type="button" data-side="bank" data-idx="${i}">${w}</button>`)
      .join("");
    answerEl.innerHTML = answer
      .map((w, i) => `<button class="word-chip in-answer" type="button" data-side="answer" data-idx="${i}">${w}</button>`)
      .join("");

    bankEl.querySelectorAll(".word-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        if (exerciseDone) return;
        const idx = Number(chip.dataset.idx);
        answer.push(bank[idx]);
        bank.splice(idx, 1);
        renderChips();
        if (answer.length === target.length) checkOrder();
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

  function checkOrder() {
    exerciseDone = true;
    const correct = answer.join(" ") === target.join(" ");
    answerEl.classList.add(correct ? "correct" : "wrong");
    if (!correct) {
      answerEl.innerHTML = target
        .map((w) => `<span class="word-chip in-answer">${w}</span>`)
        .join("");
    }
    setMascotMood(correct ? "happy" : "sad", correct ? "happy" : "sad");
    setTimeout(() => submitRating(correct ? "good" : "again"), 1100);
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
  nextCard();
}

function renderDone() {
  $("#done-reviewed").textContent = state.dailyLog.reviewed_items_count;
  $("#done-new").textContent = state.dailyLog.new_items_count;
  mountMascot("slot-done", "happy");
  setMascotMood("happy", "happy");
  show("done");
}

// ---------- Boot ----------

handleAuthScreen();
