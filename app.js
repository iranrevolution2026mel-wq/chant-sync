const statusEl = document.getElementById("status");
const startTimeTextEl = document.getElementById("startTimeText");
const nowTextEl = document.getElementById("nowText");
const currentChantEl = document.getElementById("currentChant");
const nextChantEl = document.getElementById("nextChant");
const countdownEl = document.getElementById("countdown");
const progressBarEl = document.getElementById("progressBar");

let chantData = {
  startAt: null,
  items: [],
};

function pad(num) {
  return String(num).padStart(2, "0");
}

function formatClock(date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function formatDuration(ms) {
  if (ms <= 0) return "00:00";
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${pad(minutes)}:${pad(seconds)}`;
}

function parseTimeToSeconds(mmss) {
  const parts = mmss.trim().split(":");
  if (parts.length !== 2) {
    throw new Error(`Invalid time format: ${mmss}`);
  }

  const minutes = Number(parts[0]);
  const seconds = Number(parts[1]);

  if (Number.isNaN(minutes) || Number.isNaN(seconds)) {
    throw new Error(`Invalid time value: ${mmss}`);
  }

  return minutes * 60 + seconds;
}

function parseChantsFile(text) {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));

  let startAt = null;
  const items = [];

  for (const line of lines) {
    if (line.startsWith("startAt=")) {
      startAt = new Date(line.replace("startAt=", "").trim());
      continue;
    }

    const parts = line.split("|");
    if (parts.length < 2) continue;

    const offsetStr = parts[0].trim();
    const chantText = parts.slice(1).join("|").trim();

    items.push({
      offsetSeconds: parseTimeToSeconds(offsetStr),
      text: chantText,
    });
  }

  if (!startAt || Number.isNaN(startAt.getTime())) {
    throw new Error(
      "Missing or invalid startAt in chants.txt. Example: startAt=2026-03-20T18:00:00+11:00"
    );
  }

  items.sort((a, b) => a.offsetSeconds - b.offsetSeconds);

  return { startAt, items };
}

async function loadChants() {
  try {
    const response = await fetch(`chants.txt?v=${Date.now()}`);
    if (!response.ok) {
      throw new Error(`Could not load chants.txt (${response.status})`);
    }

    const text = await response.text();
    chantData = parseChantsFile(text);

    startTimeTextEl.textContent = chantData.startAt.toLocaleString();
    statusEl.textContent = "Ready";
  } catch (error) {
    statusEl.textContent = "Error";
    currentChantEl.textContent = error.message;
    nextChantEl.textContent = "—";
    countdownEl.textContent = "—";
    console.error(error);
  }
}

function updateView() {
  if (!chantData.startAt || chantData.items.length === 0) {
    return;
  }

  const now = new Date();
  nowTextEl.textContent = now.toLocaleString();

  const elapsedMs = now.getTime() - chantData.startAt.getTime();
  const elapsedSeconds = elapsedMs / 1000;

  if (elapsedMs < 0) {
    statusEl.textContent = "Waiting to start";
    currentChantEl.textContent = "Get ready";
    nextChantEl.textContent = chantData.items[0]?.text || "—";
    countdownEl.textContent = formatDuration(Math.abs(elapsedMs));
    progressBarEl.style.width = "0%";
    return;
  }

  let currentIndex = -1;

  for (let i = 0; i < chantData.items.length; i++) {
    if (elapsedSeconds >= chantData.items[i].offsetSeconds) {
      currentIndex = i;
    } else {
      break;
    }
  }

  if (currentIndex === -1) {
    statusEl.textContent = "Starting";
    currentChantEl.textContent = "Get ready";
    nextChantEl.textContent = chantData.items[0]?.text || "—";
    countdownEl.textContent = formatDuration(
      chantData.items[0].offsetSeconds * 1000 - elapsedMs
    );
    progressBarEl.style.width = "0%";
    return;
  }

  const currentItem = chantData.items[currentIndex];
  const nextItem = chantData.items[currentIndex + 1];

  currentChantEl.textContent = currentItem.text;
  nextChantEl.textContent = nextItem ? nextItem.text : "End of sequence";
  statusEl.textContent = nextItem ? "Live" : "Finished";

  if (!nextItem) {
    countdownEl.textContent = "00:00";
    progressBarEl.style.width = "100%";
    return;
  }

  const currentStartMs = currentItem.offsetSeconds * 1000;
  const nextStartMs = nextItem.offsetSeconds * 1000;
  const segmentDurationMs = nextStartMs - currentStartMs;
  const passedInSegmentMs = elapsedMs - currentStartMs;
  const remainingMs = nextStartMs - elapsedMs;

  countdownEl.textContent = formatDuration(remainingMs);

  const percent = Math.max(
    0,
    Math.min(100, (passedInSegmentMs / segmentDurationMs) * 100)
  );

  progressBarEl.style.width = `${percent}%`;
}

async function init() {
  await loadChants();
  updateView();
  setInterval(updateView, 250);

  // optional: reload the text file every 30 seconds in case you update it
  setInterval(loadChants, 30000);
}

init();