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

let chantItems = [];
let totalLoopDurationMs = 0;
let pageStartTimeMs = 0;

function formatDuration(ms) {
  if (ms <= 0) return "00:00";
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function parseChantsFile(text) {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));

  const items = [];
  let cumulativeStartMs = 0;

  for (const line of lines) {
    const parts = line.split("|");
    if (parts.length < 2) continue;

    const durationSeconds = Number(parts[0].trim());
    const chantText = parts.slice(1).join("|").trim();

    if (Number.isNaN(durationSeconds) || durationSeconds <= 0) {
      throw new Error(`Invalid duration in line: ${line}`);
    }

    items.push({
      text: chantText,
      durationMs: durationSeconds * 1000,
      startMs: cumulativeStartMs,
      endMs: cumulativeStartMs + durationSeconds * 1000,
    });

    cumulativeStartMs += durationSeconds * 1000;
  }

  if (!items.length) {
    throw new Error("chants.txt is empty or invalid.");
  }

  return {
    items,
    totalLoopDurationMs: cumulativeStartMs,
  };
}

async function loadChants() {
  loadingStatusEl.textContent = "Reading chant file…";

  const response = await fetch(`chants.txt?v=${Date.now()}`);
  if (!response.ok) {
    throw new Error(`Could not load chants.txt (${response.status})`);
  }

  const text = await response.text();

  loadingStatusEl.textContent = "Preparing chant sequence…";

  const parsed = parseChantsFile(text);
  chantItems = parsed.items;
  totalLoopDurationMs = parsed.totalLoopDurationMs;

  sequenceInfoEl.textContent = `Total lines: ${chantItems.length} | Total loop duration: ${formatDuration(totalLoopDurationMs)}`;
}

function showReadyState() {
  loadingStatusEl.textContent = "Loaded. Sequence is running.";
}

function showErrorState(message) {
  loadingStatusEl.textContent = message;
  statusEl.textContent = "Error";
}

function updateView() {
  if (!chantItems.length || totalLoopDurationMs <= 0) {
    return;
  }

  const nowMs = Date.now();
  const elapsedMs = nowMs - pageStartTimeMs;
  const loopElapsedMs = elapsedMs % totalLoopDurationMs;

  let currentIndex = chantItems.findIndex(
    (item) => loopElapsedMs >= item.startMs && loopElapsedMs < item.endMs
  );

  if (currentIndex === -1) {
    currentIndex = chantItems.length - 1;
  }

  const currentItem = chantItems[currentIndex];
  const nextItem = chantItems[(currentIndex + 1) % chantItems.length];

  const passedInCurrentMs = loopElapsedMs - currentItem.startMs;
  const remainingMs = currentItem.endMs - loopElapsedMs;
  const percent = Math.max(
    0,
    Math.min(100, (passedInCurrentMs / currentItem.durationMs) * 100)
  );

  currentChantEl.textContent = currentItem.text;
  nextChantEl.textContent = nextItem.text;
  countdownEl.textContent = formatDuration(remainingMs);
  progressBarEl.style.width = `${percent}%`;

  statusEl.textContent = "Looping live";
  lineInfoEl.textContent = `Line ${currentIndex + 1} of ${chantItems.length}`;
  loopInfoEl.textContent = `${formatDuration(loopElapsedMs)} / ${formatDuration(totalLoopDurationMs)}`;
}

async function init() {
  try {
    await loadChants();
    loadingStatusEl.textContent = "Starting now…";

    pageStartTimeMs = Date.now();

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
