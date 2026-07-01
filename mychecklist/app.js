/* MyChecklist — a single-user, offline, no-server checklist PWA.
 * All data lives in localStorage. No accounts, no backend. */

(() => {
  "use strict";

  const STORAGE_KEY = "mychecklist.tasks.v1";
  const CHECK_INTERVAL_MS = 30_000;

  // ---------- Thai date helpers ----------
  const TH_DAYS = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];
  const TH_MONTHS = [
    "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
    "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
  ];
  const TH_MONTHS_SHORT = [
    "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
    "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
  ];

  /** Local YYYY-MM-DD for a Date (not UTC). */
  const toISODate = (d) => {
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  };
  const todayISO = () => toISODate(new Date());
  const parseISO = (s) => {
    const [y, m, d] = s.split("-").map(Number);
    return new Date(y, m - 1, d);
  };
  /** Whole-day difference b - a (by calendar date). */
  const dayDiff = (aISO, bISO) =>
    Math.round((parseISO(bISO) - parseISO(aISO)) / 86_400_000);

  const beYear = (d) => d.getFullYear() + 543;

  const fmtFullToday = (d) =>
    `วัน${TH_DAYS[d.getDay()]}ที่ ${d.getDate()} ${TH_MONTHS[d.getMonth()]} ${beYear(d)}`;

  /** Human label for a due date relative to today. */
  const relLabel = (iso) => {
    const diff = dayDiff(todayISO(), iso);
    if (diff === 0) return "วันนี้";
    if (diff === 1) return "พรุ่งนี้";
    if (diff === -1) return "เมื่อวาน";
    const d = parseISO(iso);
    const base = `${TH_DAYS[d.getDay()]} ${d.getDate()} ${TH_MONTHS_SHORT[d.getMonth()]}`;
    if (diff > 1) return `${base} · อีก ${diff} วัน`;
    return base;
  };

  // ---------- State ----------
  let tasks = load();
  let currentTab = "open"; // 'open' | 'done'
  let activeTag = null; // tag filter
  let searchQuery = ""; // free-text search
  let editingId = null;
  let toastTimer = null;
  let lastAction = null; // for undo

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }
  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  }
  const uid = () =>
    Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  // ---------- Recurrence ----------
  function nextDate(iso, repeat) {
    const d = parseISO(iso);
    switch (repeat) {
      case "daily":
        d.setDate(d.getDate() + 1);
        break;
      case "weekly":
        d.setDate(d.getDate() + 7);
        break;
      case "monthly":
        d.setMonth(d.getMonth() + 1);
        break;
      case "yearly":
        d.setFullYear(d.getFullYear() + 1);
        break;
      default:
        return null;
    }
    return toISODate(d);
  }

  // ---------- DOM refs ----------
  const $ = (id) => document.getElementById(id);
  const els = {
    today: $("todayLabel"),
    summary: $("summaryLabel"),
    bell: $("bellBtn"),
    form: $("quickAddForm"),
    title: $("titleInput"),
    date: $("dateInput"),
    time: $("timeInput"),
    repeat: $("repeatInput"),
    tag: $("tagInput"),
    search: $("searchInput"),
    tabOpen: $("tabOpen"),
    tabDone: $("tabDone"),
    openCount: $("openCount"),
    tagFilter: $("tagFilter"),
    list: $("list"),
    toast: $("toast"),
    exportBtn: $("exportBtn"),
    importBtn: $("importBtn"),
    importFile: $("importFile"),
    dialog: $("editDialog"),
    editForm: $("editForm"),
    editTitle: $("editTitle"),
    editDate: $("editDate"),
    editTime: $("editTime"),
    editRepeat: $("editRepeat"),
    editTag: $("editTag"),
    editNote: $("editNote"),
    deleteBtn: $("deleteBtn"),
    cancelBtn: $("cancelBtn"),
  };

  // ---------- Rendering ----------
  function render() {
    const t = new Date();
    els.today.textContent = fmtFullToday(t);
    renderSummary();
    renderTagFilter();

    if (currentTab === "open") renderOpen();
    else renderDone();
  }

  function matchesSearch(t) {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      (t.title || "").toLowerCase().includes(q) ||
      (t.tag || "").toLowerCase().includes(q) ||
      (t.note || "").toLowerCase().includes(q)
    );
  }

  function openTasks() {
    let list = tasks.filter((x) => !x.done);
    if (activeTag) list = list.filter((x) => (x.tag || "") === activeTag);
    list = list.filter(matchesSearch);
    return list;
  }

  function renderSummary() {
    const today = todayISO();
    const open = tasks.filter((x) => !x.done);
    const overdue = open.filter((x) => dayDiff(x.date, today) > 0).length;
    const dueToday = open.filter((x) => x.date === today).length;
    els.openCount.textContent = String(open.length);
    els.openCount.dataset.zero = open.length === 0 ? "true" : "false";

    let msg;
    if (open.length === 0) msg = "ว่างหมด ไม่มีอะไรค้าง 🎉";
    else {
      const parts = [];
      if (overdue) parts.push(`${overdue} อย่างเลยกำหนด`);
      if (dueToday) parts.push(`วันนี้อีก ${dueToday}`);
      if (!parts.length) parts.push(`${open.length} งานที่รออยู่`);
      msg = parts.join(" · ");
    }
    els.summary.textContent = msg;
  }

  function renderTagFilter() {
    const tags = [...new Set(tasks.filter((x) => x.tag).map((x) => x.tag))].sort();
    if (tags.length === 0) {
      els.tagFilter.hidden = true;
      els.tagFilter.innerHTML = "";
      return;
    }
    els.tagFilter.hidden = false;
    els.tagFilter.innerHTML = "";
    const mk = (label, tag) => {
      const b = document.createElement("button");
      b.className = "chip" + (activeTag === tag ? " is-active" : "");
      b.textContent = label;
      b.onclick = () => {
        activeTag = activeTag === tag ? null : tag;
        render();
      };
      return b;
    };
    els.tagFilter.appendChild(mk("ทั้งหมด", null));
    tags.forEach((tag) => els.tagFilter.appendChild(mk("# " + tag, tag)));
  }

  function taskEl(task) {
    const today = todayISO();
    const overdue = !task.done && dayDiff(task.date, today) > 0;

    const el = document.createElement("div");
    el.className = "task" + (task.done ? " task--done" : "") + (overdue ? " task--overdue" : "");
    el.onclick = (e) => {
      if (e.target.closest(".task__check")) return;
      openEdit(task.id);
    };

    const check = document.createElement("button");
    check.className = "task__check";
    check.setAttribute("aria-label", task.done ? "ยกเลิกเสร็จ" : "ทำเสร็จ");
    check.onclick = (e) => {
      e.stopPropagation();
      toggleDone(task.id);
    };

    const body = document.createElement("div");
    body.className = "task__body";

    const title = document.createElement("div");
    title.className = "task__title";
    title.textContent = task.title;

    const meta = document.createElement("div");
    meta.className = "task__meta";

    if (overdue) {
      const b = document.createElement("span");
      b.className = "task__badge task__badge--overdue";
      b.textContent = `เลยมา ${dayDiff(task.date, today)} วัน`;
      meta.appendChild(b);
    } else if (!task.done) {
      const s = document.createElement("span");
      s.textContent = relLabel(task.date);
      meta.appendChild(s);
    } else if (task.doneAt) {
      const s = document.createElement("span");
      s.textContent = "เสร็จเมื่อ " + relLabel(toISODate(new Date(task.doneAt)));
      meta.appendChild(s);
    }

    if (task.time) {
      const s = document.createElement("span");
      s.textContent = "🕒 " + task.time;
      meta.appendChild(s);
    }
    if (task.repeat && task.repeat !== "none") {
      const b = document.createElement("span");
      b.className = "task__badge task__badge--repeat";
      b.textContent = "↻ " + repeatLabel(task.repeat);
      meta.appendChild(b);
    }
    if (task.tag) {
      const b = document.createElement("span");
      b.className = "task__badge task__badge--tag";
      b.textContent = "# " + task.tag;
      meta.appendChild(b);
    }

    body.append(title, meta);
    if (task.note) {
      const note = document.createElement("div");
      note.className = "task__note";
      note.textContent = task.note;
      body.append(note);
    }
    el.append(check, body);
    return el;
  }

  const repeatLabel = (r) =>
    ({ daily: "ทุกวัน", weekly: "ทุกสัปดาห์", monthly: "ทุกเดือน", yearly: "ทุกปี" }[r] || "");

  function groupHeader(label, overdue = false) {
    const h = document.createElement("div");
    h.className = "group__label" + (overdue ? " group__label--overdue" : "");
    h.textContent = label;
    return h;
  }

  function renderOpen() {
    els.list.innerHTML = "";
    const today = todayISO();
    const list = openTasks().sort(
      (a, b) => a.date.localeCompare(b.date) || (a.time || "").localeCompare(b.time || ""),
    );

    if (list.length === 0) {
      els.list.appendChild(
        emptyState("📝", "ยังไม่มีงานค้าง", "พิมพ์งานด้านบนแล้วกด Enter เพื่อเริ่มเลย"),
      );
      return;
    }

    const overdue = list.filter((x) => dayDiff(x.date, today) > 0);
    const todayList = list.filter((x) => x.date === today);
    const upcoming = list.filter((x) => dayDiff(x.date, today) < 0); // future

    if (overdue.length) {
      els.list.appendChild(groupHeader("เลยกำหนด", true));
      overdue.forEach((t) => els.list.appendChild(taskEl(t)));
    }
    if (todayList.length) {
      els.list.appendChild(groupHeader("วันนี้"));
      todayList.forEach((t) => els.list.appendChild(taskEl(t)));
    }
    if (upcoming.length) {
      // Group upcoming by date.
      let lastDate = null;
      upcoming.forEach((t) => {
        if (t.date !== lastDate) {
          els.list.appendChild(groupHeader(relLabel(t.date)));
          lastDate = t.date;
        }
        els.list.appendChild(taskEl(t));
      });
    }
  }

  function renderDone() {
    els.list.innerHTML = "";
    const list = tasks
      .filter((x) => x.done)
      .filter(matchesSearch)
      .sort((a, b) => (b.doneAt || "").localeCompare(a.doneAt || ""));
    if (list.length === 0) {
      els.list.appendChild(emptyState("✅", "ยังไม่มีงานที่เสร็จ", "ติ๊กวงกลมหน้างานเพื่อทำเครื่องหมายเสร็จ"));
      return;
    }
    list.forEach((t) => els.list.appendChild(taskEl(t)));
  }

  function emptyState(emoji, title, sub) {
    const d = document.createElement("div");
    d.className = "empty";
    d.innerHTML = `<div class="empty__emoji">${emoji}</div><div class="empty__title">${title}</div><div>${sub}</div>`;
    return d;
  }

  // ---------- Actions ----------
  function addTask(data) {
    tasks.push({
      id: uid(),
      title: data.title,
      date: data.date || todayISO(),
      time: data.time || "",
      repeat: data.repeat || "none",
      tag: data.tag || "",
      note: "",
      done: false,
      doneAt: null,
      notifiedAt: null,
      createdAt: new Date().toISOString(),
    });
    save();
    render();
  }

  function toggleDone(id) {
    const t = tasks.find((x) => x.id === id);
    if (!t) return;

    if (!t.done) {
      t.done = true;
      t.doneAt = new Date().toISOString();
      // Spawn next occurrence for repeating tasks.
      if (t.repeat && t.repeat !== "none") {
        const nd = nextDate(t.date, t.repeat);
        if (nd) {
          tasks.push({
            id: uid(),
            title: t.title,
            date: nd,
            time: t.time,
            repeat: t.repeat,
            tag: t.tag,
            done: false,
            doneAt: null,
            notifiedAt: null,
            createdAt: new Date().toISOString(),
          });
        }
      }
      save();
      render();
      showToast("ทำเสร็จแล้ว", "เลิกทำ", () => {
        t.done = false;
        t.doneAt = null;
        // Remove the auto-spawned next occurrence (best effort: newest same-title future).
        if (t.repeat && t.repeat !== "none") {
          const nd = nextDate(t.date, t.repeat);
          const idx = tasks.findIndex(
            (x) => !x.done && x.title === t.title && x.date === nd && x.tag === t.tag,
          );
          if (idx >= 0) tasks.splice(idx, 1);
        }
        save();
        render();
      });
    } else {
      t.done = false;
      t.doneAt = null;
      save();
      render();
    }
  }

  function openEdit(id) {
    const t = tasks.find((x) => x.id === id);
    if (!t) return;
    editingId = id;
    els.editTitle.value = t.title;
    els.editDate.value = t.date;
    els.editTime.value = t.time || "";
    els.editRepeat.value = t.repeat || "none";
    els.editTag.value = t.tag || "";
    els.editNote.value = t.note || "";
    els.dialog.showModal();
  }

  function saveEdit() {
    const t = tasks.find((x) => x.id === editingId);
    if (!t) return;
    t.title = els.editTitle.value.trim() || t.title;
    t.date = els.editDate.value || t.date;
    t.time = els.editTime.value || "";
    t.repeat = els.editRepeat.value;
    t.tag = els.editTag.value.trim();
    t.note = els.editNote.value.trim();
    t.notifiedAt = null; // re-arm notification after edits
    save();
    render();
  }

  function deleteTask(id) {
    const idx = tasks.findIndex((x) => x.id === id);
    if (idx < 0) return;
    const [removed] = tasks.splice(idx, 1);
    save();
    render();
    showToast("ลบงานแล้ว", "เลิกทำ", () => {
      tasks.splice(idx, 0, removed);
      save();
      render();
    });
  }

  // ---------- Toast ----------
  function showToast(message, actionLabel, onAction) {
    clearTimeout(toastTimer);
    els.toast.innerHTML = "";
    const span = document.createElement("span");
    span.textContent = message;
    els.toast.appendChild(span);
    if (actionLabel && onAction) {
      const btn = document.createElement("button");
      btn.className = "toast__action";
      btn.textContent = actionLabel;
      btn.onclick = () => {
        onAction();
        hideToast();
      };
      els.toast.appendChild(btn);
    }
    els.toast.hidden = false;
    toastTimer = setTimeout(hideToast, 5000);
  }
  function hideToast() {
    els.toast.hidden = true;
  }

  // ---------- Notifications ----------
  function updateBellUI() {
    const granted = "Notification" in window && Notification.permission === "granted";
    els.bell.classList.toggle("is-on", granted);
  }

  async function requestNotifications() {
    if (!("Notification" in window)) {
      showToast("เบราว์เซอร์นี้ไม่รองรับการแจ้งเตือน");
      return;
    }
    const perm = await Notification.requestPermission();
    updateBellUI();
    if (perm === "granted") {
      showToast("เปิดการแจ้งเตือนแล้ว");
      scheduleTriggers();
    } else {
      showToast("ยังไม่ได้อนุญาตการแจ้งเตือน");
    }
  }

  /** Fires when a task is due/overdue while the app is open. */
  function checkDue() {
    const today = todayISO();
    const now = new Date();
    const nowHM = `${String(now.getHours()).padStart(2, "0")}:${String(
      now.getMinutes(),
    ).padStart(2, "0")}`;

    let dueMsg = null;
    tasks.forEach((t) => {
      if (t.done) return;
      const isDay = dayDiff(t.date, today) >= 0; // today or overdue
      if (!isDay) return;
      const timeReached = !t.time || t.time <= nowHM || dayDiff(t.date, today) > 0;
      if (timeReached && t.notifiedAt !== today) {
        t.notifiedAt = today;
        dueMsg = t.title;
        systemNotify(t);
      }
    });
    if (dueMsg) {
      save();
      showToast("ถึงกำหนด: " + dueMsg);
      render();
    }
  }

  function systemNotify(task) {
    if ("Notification" in window && Notification.permission === "granted") {
      try {
        new Notification("MyChecklist", {
          body: task.title + (task.time ? " (" + task.time + ")" : ""),
          tag: task.id,
          icon: "icons/icon-192.png",
        });
      } catch {
        /* some browsers require SW for notifications; in-app toast still fires */
      }
    }
  }

  /** Progressive enhancement: schedule OS notifications ahead of time
   *  via the service worker's Notification Triggers (Chrome/Android). */
  async function scheduleTriggers() {
    if (!("serviceWorker" in navigator)) return;
    const reg = await navigator.serviceWorker.ready.catch(() => null);
    if (!reg || !("showTrigger" in Notification.prototype)) return; // unsupported (e.g. iOS)

    const now = Date.now();
    for (const t of tasks) {
      if (t.done || !t.time) continue;
      const when = parseISO(t.date);
      const [h, m] = t.time.split(":").map(Number);
      when.setHours(h, m, 0, 0);
      if (when.getTime() <= now) continue;
      try {
        await reg.showNotification("MyChecklist", {
          tag: "trigger-" + t.id,
          body: t.title,
          icon: "icons/icon-192.png",
          // eslint-disable-next-line no-undef
          showTrigger: new TimestampTrigger(when.getTime()),
        });
      } catch {
        /* ignore unsupported */
      }
    }
  }

  // ---------- Backup ----------
  function exportData() {
    const blob = new Blob([JSON.stringify(tasks, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mychecklist-backup-${todayISO()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importData(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const arr = JSON.parse(reader.result);
        if (!Array.isArray(arr)) throw new Error("bad");
        // Merge by id (imported wins).
        const map = new Map(tasks.map((t) => [t.id, t]));
        arr.forEach((t) => {
          if (t && t.id && t.title) map.set(t.id, t);
        });
        tasks = [...map.values()];
        save();
        render();
        showToast(`กู้ข้อมูลแล้ว ${arr.length} งาน`);
      } catch {
        showToast("ไฟล์ไม่ถูกต้อง");
      }
    };
    reader.readAsText(file);
  }

  // ---------- Quick-date chips ----------
  function setQuick(kind) {
    const d = new Date();
    if (kind === "tomorrow") d.setDate(d.getDate() + 1);
    if (kind === "week") d.setDate(d.getDate() + 7);
    els.date.value = toISODate(d);
  }

  // ---------- Wire up ----------
  function init() {
    els.date.value = todayISO();

    els.form.addEventListener("submit", (e) => {
      e.preventDefault();
      const title = els.title.value.trim();
      if (!title) return;
      addTask({
        title,
        date: els.date.value,
        time: els.time.value,
        repeat: els.repeat.value,
        tag: els.tag.value.trim(),
      });
      els.title.value = "";
      els.time.value = "";
      els.tag.value = "";
      els.repeat.value = "none";
      els.date.value = todayISO();
      els.title.focus();
      scheduleTriggers();
    });

    document.querySelectorAll(".chip[data-quick]").forEach((c) =>
      c.addEventListener("click", () => setQuick(c.dataset.quick)),
    );

    els.search.addEventListener("input", () => {
      searchQuery = els.search.value.trim();
      render();
    });

    els.tabOpen.addEventListener("click", () => switchTab("open"));
    els.tabDone.addEventListener("click", () => switchTab("done"));

    els.bell.addEventListener("click", requestNotifications);

    els.exportBtn.addEventListener("click", exportData);
    els.importBtn.addEventListener("click", () => els.importFile.click());
    els.importFile.addEventListener("change", (e) => {
      if (e.target.files[0]) importData(e.target.files[0]);
      e.target.value = "";
    });

    els.cancelBtn.addEventListener("click", () => els.dialog.close());
    els.deleteBtn.addEventListener("click", () => {
      const id = editingId;
      els.dialog.close();
      deleteTask(id);
    });
    els.editForm.addEventListener("submit", () => saveEdit());

    updateBellUI();
    render();
    checkDue();
    setInterval(checkDue, CHECK_INTERVAL_MS);
    // Re-check when the app regains focus (covers overnight / tab-switch).
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) {
        render();
        checkDue();
      }
    });

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("sw.js").then(() => scheduleTriggers()).catch(() => {});
    }
  }

  function switchTab(tab) {
    currentTab = tab;
    els.tabOpen.classList.toggle("tab--active", tab === "open");
    els.tabDone.classList.toggle("tab--active", tab === "done");
    els.tabOpen.setAttribute("aria-selected", tab === "open");
    els.tabDone.setAttribute("aria-selected", tab === "done");
    render();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
