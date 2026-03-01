/** 内联的 Trace 可视化页面 HTML（单文件、无外部依赖） */
export const TRACE_VIEWER_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>GraceBot Trace</title>
  <style>
    :root {
      --bg: #0f0f12;
      --surface: #1a1a20;
      --border: #2a2a32;
      --text: #e4e4e7;
      --muted: #71717a;
      --gateway: #22c55e;
      --kernel: #3b82f6;
      --agent: #a855f7;
      --reply: #f59e0b;
      --error: #ef4444;
    }
    * { box-sizing: border-box; }
    body {
      font-family: "JetBrains Mono", "SF Mono", Consolas, monospace;
      background: var(--bg);
      color: var(--text);
      margin: 0;
      padding: 1rem;
      font-size: 13px;
      line-height: 1.5;
    }
    h1 { font-size: 1.25rem; margin: 0 0 1rem; color: var(--muted); }
    .toolbar {
      display: flex;
      gap: 0.75rem;
      align-items: center;
      margin-bottom: 1rem;
      flex-wrap: wrap;
    }
    select {
      background: var(--surface);
      border: 1px solid var(--border);
      color: var(--text);
      padding: 0.4rem 0.75rem;
      border-radius: 6px;
      font: inherit;
      min-width: 200px;
    }
    .trace-id { color: var(--muted); font-size: 0.85em; }
    .toolbar label.checkbox { display: flex; align-items: center; gap: 0.4rem; cursor: pointer; user-select: none; }
    .toolbar input[type="checkbox"] { accent-color: var(--kernel); }
    .live-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--gateway); animation: pulse 1.5s ease-in-out infinite; }
    @keyframes pulse { 0%,100%{ opacity: 1 } 50%{ opacity: 0.4 } }
    .traces { display: flex; flex-direction: column; gap: 1.5rem; }
    .trace-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 8px;
      overflow: hidden;
    }
    .trace-card h2 {
      margin: 0;
      padding: 0.6rem 1rem;
      font-size: 0.9rem;
      background: var(--border);
      display: flex; align-items: center; justify-content: space-between;
    }
    .trace-card .meta { color: var(--muted); font-size: 0.85em; }
    .spans { padding: 0.5rem; }
    .span {
      display: grid;
      grid-template-columns: 140px 1fr 80px 80px;
      gap: 0.5rem 1rem;
      align-items: center;
      padding: 0.4rem 0.6rem;
      border-radius: 6px;
      margin-bottom: 2px;
      font-size: 12px;
    }
    .span:hover { background: rgba(255,255,255,0.04); }
    .span.phase-gateway { border-left: 3px solid var(--gateway); }
    .span.phase-kernel { border-left: 3px solid var(--kernel); }
    .span.phase-agent { border-left: 3px solid var(--agent); }
    .span.phase-reply { border-left: 3px solid var(--reply); }
    .span.has-error { border-left-color: var(--error); }
    .span .phase { color: var(--muted); }
    .span .name { word-break: break-all; }
    .span .duration { text-align: right; color: var(--muted); }
    .span .time { color: var(--muted); font-size: 0.9em; }
    .span .attrs {
      grid-column: 1 / -1;
      font-size: 0.85em;
      color: var(--muted);
      margin-top: 0.2rem;
    }
    .span .error-msg { color: var(--error); margin-top: 0.2rem; }
    .empty { color: var(--muted); padding: 2rem; text-align: center; }
    .loading { color: var(--muted); padding: 1rem; }
  </style>
</head>
<body>
  <h1>GraceBot Trace</h1>
  <div class="toolbar">
    <label>运行批次</label>
    <select id="runSelect">
      <option value="">加载中...</option>
    </select>
    <label class="checkbox"><input type="checkbox" id="autoRefresh" checked /> 自动刷新</label>
    <span class="trace-id" id="runInfo"></span>
    <span class="trace-id" id="liveHint"></span>
  </div>
  <div id="content" class="traces"></div>

  <script>
    const runSelect = document.getElementById("runSelect");
    const runInfo = document.getElementById("runInfo");
    const liveHint = document.getElementById("liveHint");
    const content = document.getElementById("content");
    const autoRefresh = document.getElementById("autoRefresh");
    const POLL_INTERVAL_MS = 2000;
    let pollTimer = null;

    async function loadRuns() {
      const r = await fetch("/api/trace/runs");
      if (!r.ok) throw new Error("获取运行列表失败");
      const runs = await r.json();
      runSelect.innerHTML = runs.length === 0
        ? '<option value="">无记录</option>'
        : runs.map((r) => '<option value="' + r.name + '">' + r.name + '</option>').join("");
      if (runs.length) runSelect.value = runs[0].name;
      return runs;
    }

    async function loadTrace(run) {
      const r = await fetch("/api/trace?run=" + encodeURIComponent(run));
      if (!r.ok) throw new Error("获取 trace 失败");
      return r.json();
    }

    function formatTime(iso) {
      const d = new Date(iso);
      return d.toLocaleTimeString("zh-CN", { hour12: false }) + "." + (d.getMilliseconds() + "").padStart(3, "0");
    }

    function phaseClass(phase) {
      if (phase.startsWith("gateway")) return "phase-gateway";
      if (phase.startsWith("kernel")) return "phase-kernel";
      if (phase.startsWith("agent")) return "phase-agent";
      if (phase.startsWith("reply")) return "phase-reply";
      return "";
    }

    function renderSpans(spans) {
      const byTrace = {};
      for (const s of spans) {
        if (!byTrace[s.traceId]) byTrace[s.traceId] = [];
        byTrace[s.traceId].push(s);
      }
      for (const tid of Object.keys(byTrace)) {
        const list = byTrace[tid].sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
        const first = new Date(list[0].startTime);
        const last = list[list.length - 1];
        const totalEnd = new Date(last.endTime);
        const totalMs = totalEnd - first;
        const hasError = list.some((s) => s.error);
        let html = '<div class="trace-card">';
        html += '<h2><span>Trace: ' + tid + '</span><span class="meta">' + list.length + ' spans · 总时长 ' + totalMs + ' ms</span></h2>';
        html += '<div class="spans">';
        for (const s of list) {
          const cls = phaseClass(s.phase) + (s.error ? " has-error" : "");
          html += '<div class="span ' + cls + '">';
          html += '<span class="phase">' + s.phase + '</span>';
          html += '<span class="name">' + escapeHtml(s.name) + '</span>';
          html += '<span class="duration">' + s.durationMs + ' ms</span>';
          html += '<span class="time">' + formatTime(s.startTime) + '</span>';
          if (s.attributes && Object.keys(s.attributes).length) {
            html += '<div class="attrs">' + escapeHtml(JSON.stringify(s.attributes)) + '</div>';
          }
          if (s.error) html += '<div class="error-msg">' + escapeHtml(s.error) + '</div>';
          html += '</div>';
        }
        html += '</div></div>';
        content.insertAdjacentHTML("beforeend", html);
      }
    }

    function escapeHtml(s) {
      const div = document.createElement("div");
      div.textContent = s;
      return div.innerHTML;
    }

    async function refresh(isPoll) {
      const run = runSelect.value;
      if (!run) {
        content.innerHTML = '<div class="empty">请选择运行批次</div>';
        return;
      }
      if (!isPoll) {
        content.innerHTML = '<div class="loading">加载中...</div>';
      }
      runInfo.textContent = "logs/" + run + "/trace.jsonl";
      try {
        const spans = await loadTrace(run);
        if (spans.length === 0) {
          if (!isPoll) {
            content.innerHTML = '<div class="empty">该批次暂无 trace 记录（开启自动刷新可实时看到新请求）</div>';
          }
        } else {
          content.innerHTML = "";
          renderSpans(spans);
          if (isPoll && content.lastElementChild) {
            content.lastElementChild.scrollIntoView({ behavior: "smooth", block: "end" });
          }
        }
      } catch (e) {
        if (!isPoll) content.innerHTML = '<div class="empty">加载失败: ' + escapeHtml(e.message) + '</div>';
      }
    }

    function startPolling() {
      if (pollTimer) return;
      liveHint.innerHTML = '<span class="live-dot"></span> 每 ' + (POLL_INTERVAL_MS / 1000) + ' 秒刷新';
      function tick() {
        if (!autoRefresh.checked || !runSelect.value) return;
        refresh(true);
      }
      pollTimer = setInterval(tick, POLL_INTERVAL_MS);
    }

    function stopPolling() {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
      liveHint.textContent = "";
    }

    autoRefresh.addEventListener("change", function() {
      if (this.checked) startPolling();
      else stopPolling();
    });

    runSelect.addEventListener("change", function() {
      stopPolling();
      refresh(false);
      if (autoRefresh.checked) startPolling();
    });

    loadRuns().then(() => {
      refresh(false);
      if (autoRefresh.checked) startPolling();
    }).catch((e) => {
      runSelect.innerHTML = '<option value="">加载失败</option>';
      content.innerHTML = '<div class="empty">' + escapeHtml(e.message) + '</div>';
    });
  </script>
</body>
</html>
`;
