const loadingPanelEl = document.getElementById("loadingPanel");
const loadingStatusEl = document.getElementById("loadingStatus");

const statusEl = document.getElementById("status");
const lineInfoEl = document.getElementById("lineInfo");
const loopInfoEl = document.getElementById("loopInfo");
const currentChantEl = document.getElementById("currentChant");
const nextChantEl = document.getElementById("nextChant");
const countdownEl = document.getElementById("countdown");
const progressBarEl = document.getElementById("progressBar");
const sequenceInfoEl = document.getElementById("sequenceInfo");

let chantData = {
  startAtMs: null,
  items: [],
  totalLoopDurationMs: 0,
};

let serverTimeOffsetMs = 0;

function pad(num) {
  return String(num).padStart(2, "0");
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

  if (!items.length) {
    throw new Error("chants.txt has no chant lines.");
  }

  items.sort((a, b) => a.offsetSeconds - b.offsetSeconds);

  const totalLoopDurationMs = items[items.length - 1].offsetSeconds * 1000;

  if (totalLoopDurationMs <= 0) {
    throw new Error("Total loop duration is invalid.");
  }

  return {
    startAtMs: startAt.getTime(),
    items,
    totalLoopDurationMs,
  };
}

async function fetchTextWithServerTime(url) {
  const requestStart = Date.now();
  const response = await fetch(`${url}?v=${Date.now()}`, { cache: "no-store" });
  const requestEnd = Date.now();

  if (!response.ok) {
    throw new Error(`Could not load ${url} (${response.status})`);
  }

  const text = await response.text();

  const dateHeader = response.headers.get("date");
  if (dateHeader) {
    const serverDateMs = new Date(dateHeader).getTime();

    if (!Number.isNaN(serverDateMs)) {
      const estimatedClientReceiveMs = (requestStart + requestEnd) / 2;
      serverTimeOffsetMs = serverDateMs - estimatedClientReceiveMs;
    }
  }

  return text;
}

function getSyncedNowMs() {
  return Date.now() + serverTimeOffsetMs;
}

async function loadChants() {
  loadingStatusEl.textContent = "Reading chant file…";

  const text = await fetchTextWithServerTime("chants.txt");

  loadingStatusEl.textContent = "Preparing synchronized chant sequence…";

  chantData = parseChantsFile(text);

  sequenceInfoEl.textContent =
    `Total lines: ${chantData.items.length} | ` +
    `Loop duration: ${formatDuration(chantData.totalLoopDurationMs)} | ` +
    `Global sync active`;
}

function showReadyState() {
  loadingStatusEl.textContent = "Loaded. All devices follow the same timeline.";
}

function showErrorState(message) {
  loadingStatusEl.textContent = message;
  statusEl.textContent = "Error";
}

function updateView() {
  if (!chantData.startAtMs || !chantData.items.length) {
    return;
  }

  const nowMs = getSyncedNowMs();
  const elapsedMs = nowMs - chantData.startAtMs;

  if (elapsedMs < 0) {
    statusEl.textContent = "Waiting to start";
    currentChantEl.textContent = "Get ready";
    nextChantEl.textContent = chantData.items[0]?.text || "—";
    countdownEl.textContent = formatDuration(Math.abs(elapsedMs));
    lineInfoEl.textContent = `Starts at ${new Date(chantData.startAtMs).toLocaleString()}`;
    loopInfoEl.textContent = `00:00 / ${formatDuration(chantData.totalLoopDurationMs)}`;
    progressBarEl.style.width = "0%";
    return;
  }

  const loopElapsedMs = elapsedMs % chantData.totalLoopDurationMs;
  const loopElapsedSeconds = loopElapsedMs / 1000;

  let currentIndex = -1;

  for (let i = 0; i < chantData.items.length; i++) {
    if (loopElapsedSeconds >= chantData.items[i].offsetSeconds) {
      currentIndex = i;
    } else {
      break;
    }
  }

  if (currentIndex === -1) {
    currentIndex = 0;
  }

  const currentItem = chantData.items[currentIndex];
  const nextItem =
    chantData.items[(currentIndex + 1) % chantData.items.length];

  const currentStartMs = currentItem.offsetSeconds * 1000;
  const nextStartMs =
    currentIndex === chantData.items.length - 1
      ? chantData.totalLoopDurationMs
      : chantData.items[currentIndex + 1].offsetSeconds * 1000;

  const segmentDurationMs = nextStartMs - currentStartMs;
  const passedInSegmentMs = loopElapsedMs - currentStartMs;
  const remainingMs = nextStartMs - loopElapsedMs;

  const percent =
    segmentDurationMs > 0
      ? Math.max(0, Math.min(100, (passedInSegmentMs / segmentDurationMs) * 100))
      : 100;

  currentChantEl.textContent = currentItem.text;
  nextChantEl.textContent = nextItem ? nextItem.text : "—";
  countdownEl.textContent = formatDuration(remainingMs);
  progressBarEl.style.width = `${percent}%`;

  statusEl.textContent = "Synchronized live";
  lineInfoEl.textContent = `Line ${currentIndex + 1} of ${chantData.items.length}`;
  loopInfoEl.textContent =
    `${formatDuration(loopElapsedMs)} / ${formatDuration(chantData.totalLoopDurationMs)}`;
}

async function init() {
  try {
    await loadChants();
    showReadyState();
    updateView();

    setInterval(updateView, 200);

    setInterval(async () => {
      try {
        await loadChants();
      } catch (error) {
        console.error("Reload failed:", error);
        showErrorState(error.message);
      }
    }, 30000);
  } catch (error) {
    console.error(error);
    showErrorState(error.message);
  }
}

init();
