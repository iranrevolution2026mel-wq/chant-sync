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

function parseChantsFile(text) {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));

  let startAt = null;
  const rawItems = [];

  for (const line of lines) {
    if (line.startsWith("startAt=")) {
      startAt = new Date(line.replace("startAt=", "").trim());
      continue;
    }

    const parts = line.split("|");
    if (parts.length < 2) continue;

    const durationSeconds = Number(parts[0].trim());
    const chantText = parts.slice(1).join("|").trim();

    if (Number.isNaN(durationSeconds) || durationSeconds <= 0) {
      throw new Error(`Invalid duration in line: ${line}`);
    }

    rawItems.push({
      durationSeconds,
      text: chantText,
    });
  }

  if (!startAt || Number.isNaN(startAt.getTime())) {
    throw new Error(
      "Missing or invalid startAt. Example: startAt=2026-03-17T20:00:00+11:00"
    );
  }

  if (!rawItems.length) {
    throw new Error("chants.txt has no valid chant lines.");
  }

  let cumulativeMs = 0;
  const items = rawItems.map((item) => {
    const startMs = cumulativeMs;
    const durationMs = item.durationSeconds * 1000;
    const endMs = startMs + durationMs;
    cumulativeMs = endMs;

    return {
      text: item.text,
      durationMs,
      startMs,
      endMs,
    };
  });

  return {
    startAtMs: startAt.getTime(),
    items,
    totalLoopDurationMs: cumulativeMs,
  };
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

  let currentIndex = chantData.items.findIndex(
    (item) => loopElapsedMs >= item.startMs && loopElapsedMs < item.endMs
  );

  if (currentIndex === -1) {
    currentIndex = chantData.items.length - 1;
  }

  const currentItem = chantData.items[currentIndex];
  const nextItem = chantData.items[(currentIndex + 1) % chantData.items.length];

  const passedInSegmentMs = loopElapsedMs - currentItem.startMs;
  const remainingMs = currentItem.endMs - loopElapsedMs;

  const percent = Math.max(
    0,
    Math.min(100, (passedInSegmentMs / currentItem.durationMs) * 100)
  );

  currentChantEl.textContent = currentItem.text;
  nextChantEl.textContent = nextItem.text;
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
