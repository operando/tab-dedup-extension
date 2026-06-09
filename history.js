const HISTORY_KEY = "closedHistory";
const $ = (id) => document.getElementById(id);

let cache = [];

function fmtTime(ts) {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

function render(filter) {
  const rows = $("rows");
  rows.innerHTML = "";
  const q = (filter || "").trim().toLowerCase();
  const filtered = q
    ? cache.filter(
        (e) =>
          (e.url && e.url.toLowerCase().includes(q)) ||
          (e.title && e.title.toLowerCase().includes(q))
      )
    : cache;
  $("count").textContent = q
    ? `${filtered.length} / ${cache.length} 件`
    : `${cache.length} 件`;

  if (filtered.length === 0) {
    const tr = document.createElement("tr");
    tr.className = "empty";
    const td = document.createElement("td");
    td.colSpan = 3;
    td.textContent = cache.length === 0 ? "履歴はまだありません。" : "該当する履歴はありません。";
    tr.appendChild(td);
    rows.appendChild(tr);
    return;
  }

  const frag = document.createDocumentFragment();
  for (let i = 0; i < filtered.length; i++) {
    const e = filtered[i];
    const tr = document.createElement("tr");
    tr.dataset.index = String(cache.indexOf(e));
    tr.innerHTML = `
      <td class="time">${escapeHtml(fmtTime(e.closedAt))}</td>
      <td>
        <div class="title">${escapeHtml(e.title || "(タイトル無し)")}</div>
        <div class="url"><a href="${escapeHtml(e.url)}" target="_blank" rel="noopener noreferrer" class="url-wrap" title="${escapeHtml(e.url)}">${escapeHtml(e.url)}</a></div>
      </td>
      <td class="actions">
        <button data-action="open">開く</button>
        <button data-action="copy">URLコピー</button>
      </td>
    `;
    frag.appendChild(tr);
  }
  rows.appendChild(frag);
}

async function load() {
  const { [HISTORY_KEY]: list = [] } = await chrome.storage.local.get(HISTORY_KEY);
  cache = list;
  render($("search").value);
}

$("search").addEventListener("input", (e) => render(e.target.value));

$("clear").addEventListener("click", async () => {
  if (!confirm("履歴を全て削除します。よろしいですか?")) return;
  await chrome.storage.local.remove(HISTORY_KEY);
  cache = [];
  render($("search").value);
});

$("export").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(cache, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `tab-dedup-history-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

$("rows").addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;
  const tr = btn.closest("tr");
  const idx = Number(tr.dataset.index);
  const entry = cache[idx];
  if (!entry) return;
  if (btn.dataset.action === "open") {
    await chrome.tabs.create({ url: entry.url, active: false });
  } else if (btn.dataset.action === "copy") {
    try {
      await navigator.clipboard.writeText(entry.url);
      btn.textContent = "コピー済";
      setTimeout(() => (btn.textContent = "URLコピー"), 1200);
    } catch {
      // ignore
    }
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes[HISTORY_KEY]) {
    cache = changes[HISTORY_KEY].newValue || [];
    render($("search").value);
  }
});

load();
