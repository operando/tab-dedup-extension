const $ = (id) => document.getElementById(id);

function normalizeUrl(url, { ignoreHash, ignoreQuery }) {
  try {
    const u = new URL(url);
    if (ignoreHash) u.hash = "";
    if (ignoreQuery) u.search = "";
    return u.toString();
  } catch {
    return url;
  }
}

async function queryTabs(currentWindowOnly) {
  const query = currentWindowOnly ? { currentWindow: true } : {};
  const tabs = await chrome.tabs.query(query);
  return tabs.filter((t) => t.url && /^https?:|^file:|^ftp:/.test(t.url));
}

function groupDuplicates(tabs, opts) {
  const groups = new Map();
  for (const tab of tabs) {
    const key = normalizeUrl(tab.url, opts);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(tab);
  }
  return [...groups.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([key, list]) => ({ key, list }));
}

function pickKeeper(list) {
  const active = list.find((t) => t.active);
  if (active) return active;
  const pinned = list.find((t) => t.pinned);
  if (pinned) return pinned;
  return list.reduce((a, b) => (a.id < b.id ? a : b));
}

function getOptions() {
  return {
    ignoreHash: $("ignoreHash").checked,
    ignoreQuery: $("ignoreQuery").checked,
    currentWindowOnly: $("currentWindowOnly").checked,
  };
}

function renderPreview(duplicates) {
  const list = $("preview");
  list.innerHTML = "";
  if (duplicates.length === 0) {
    $("status").textContent = "重複は見つかりませんでした。";
    return;
  }
  const totalDup = duplicates.reduce((sum, g) => sum + (g.list.length - 1), 0);
  $("status").textContent = `${duplicates.length} 種類の重複 / 閉じる対象: ${totalDup} タブ`;
  for (const { key, list: tabs } of duplicates) {
    const li = document.createElement("li");
    li.title = key;
    li.innerHTML = `<span class="count">×${tabs.length}</span> ${escapeHtml(key)}`;
    list.appendChild(li);
  }
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

async function scan() {
  const opts = getOptions();
  const tabs = await queryTabs(opts.currentWindowOnly);
  const duplicates = groupDuplicates(tabs, opts);
  renderPreview(duplicates);
  return duplicates;
}

const HISTORY_KEY = "closedHistory";

async function appendHistory(entries) {
  if (entries.length === 0) return;
  const { [HISTORY_KEY]: existing = [] } = await chrome.storage.local.get(HISTORY_KEY);
  const merged = entries.concat(existing);
  await chrome.storage.local.set({ [HISTORY_KEY]: merged });
}

async function dedup() {
  const opts = getOptions();
  const tabs = await queryTabs(opts.currentWindowOnly);
  const duplicates = groupDuplicates(tabs, opts);
  if (duplicates.length === 0) {
    $("status").textContent = "重複は見つかりませんでした。";
    $("preview").innerHTML = "";
    return;
  }
  const closedAt = Date.now();
  const toClose = [];
  const records = [];
  for (const { key, list } of duplicates) {
    const keeper = pickKeeper(list);
    for (const t of list) {
      if (t.id === keeper.id) continue;
      toClose.push(t.id);
      records.push({
        url: t.url,
        title: t.title || "",
        normalizedUrl: key,
        closedAt,
        keptUrl: keeper.url,
      });
    }
  }
  if (toClose.length > 0) {
    await chrome.tabs.remove(toClose);
    await appendHistory(records);
  }
  $("status").textContent = `${toClose.length} 個の重複タブを閉じました。`;
  $("preview").innerHTML = "";
}

$("scan").addEventListener("click", () => {
  scan().catch((e) => ($("status").textContent = `エラー: ${e.message}`));
});
$("dedup").addEventListener("click", () => {
  dedup().catch((e) => ($("status").textContent = `エラー: ${e.message}`));
});
$("openHistory").addEventListener("click", async (e) => {
  e.preventDefault();
  await chrome.tabs.create({ url: chrome.runtime.getURL("history.html") });
});

for (const id of ["ignoreHash", "ignoreQuery", "currentWindowOnly"]) {
  $(id).addEventListener("change", () => {
    scan().catch((e) => ($("status").textContent = `エラー: ${e.message}`));
  });
}

scan().catch(() => {});
