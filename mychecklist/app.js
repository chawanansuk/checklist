/* MyChecklist v2 — single-user, offline, no-server checklist PWA.
 * localStorage only. Features: list + calendar views, subtasks, inbox
 * (no-date), stats/streak, per-task reminder lead, settings, dark mode. */

(() => {
  "use strict";

  const STORAGE_KEY = "mychecklist.tasks.v1";
  const SETTINGS_KEY = "mychecklist.settings.v1";
  const CHECK_INTERVAL_MS = 30_000;

  // ---------- Thai date helpers ----------
  const TH_DAYS = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];
  const TH_DAYS_MIN = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
  const TH_MONTHS = [
    "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
    "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
  ];
  const TH_MONTHS_SHORT = [
    "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
    "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
  ];

  const p2 = (n) => String(n).padStart(2, "0");
  const toISODate = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
  const todayISO = () => toISODate(new Date());
  const parseISO = (s) => {
    const [y, m, d] = s.split("-").map(Number);
    return new Date(y, m - 1, d);
  };
  const dayDiff = (aISO, bISO) => Math.round((parseISO(bISO) - parseISO(aISO)) / 86_400_000);
  const beYear = (d) => d.getFullYear() + 543;
  const fmtFullToday = (d) =>
    `วัน${TH_DAYS[d.getDay()]}ที่ ${d.getDate()} ${TH_MONTHS[d.getMonth()]} ${beYear(d)}`;

  const relLabel = (iso) => {
    const diff = dayDiff(todayISO(), iso);
    if (diff === 0) return "วันนี้";
    if (diff === 1) return "พรุ่งนี้";
    if (diff === -1) return "เมื่อวาน";
    const d = parseISO(iso);
    const base = `${TH_DAYS_MIN[d.getDay()]} ${d.getDate()} ${TH_MONTHS_SHORT[d.getMonth()]}`;
    if (diff > 1) return `${base} · อีก ${diff} วัน`;
    return base;
  };

  // ---------- State ----------
  let tasks = load();
  let settings = loadSettings();
  let currentTab = "open";
  let currentView = "list"; // 'list' | 'calendar'
  let activeTag = null;
  let searchQuery = "";
  let editingId = null;
  let editSubtasks = [];
  let calMonth = startOfMonth(new Date());
  let calSelected = todayISO();
  let toastTimer = null;

  function load() {
    try {
      const arr = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      if (!Array.isArray(arr)) return [];
      return arr.map(migrate);
    } catch {
      return [];
    }
  }
  function migrate(t) {
    return {
      ...t,
      subtasks: Array.isArray(t.subtasks) ? t.subtasks : [],
      leadHours: typeof t.leadHours === "number" ? t.leadHours : 0,
      important: Boolean(t.important),
      note: t.note || "",
      tag: t.tag || "",
      date: t.date == null ? "" : t.date,
      time: t.time || "",
      repeat: t.repeat || "none",
    };
  }
  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  }
  function loadSettings() {
    let s = {};
    try {
      s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    } catch {
      s = {};
    }
    return {
      theme: s.theme || "auto",
      defaultLead: typeof s.defaultLead === "number" ? s.defaultLead : 0,
      weekStart: s.weekStart === 0 ? 0 : 1,
      sort: s.sort || "date",
    };
  }
  function saveSettings() {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  function startOfMonth(d) {
    return new Date(d.getFullYear(), d.getMonth(), 1);
  }

  // ---------- Theme ----------
  const systemDark = () =>
    window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  const effectiveDark = () =>
    settings.theme === "dark" || (settings.theme === "auto" && systemDark());
  function applyTheme() {
    if (settings.theme === "auto") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.dataset.theme = settings.theme;
  }

  // ---------- Recurrence ----------
  function nextDate(iso, repeat) {
    if (!iso) return null;
    const d = parseISO(iso);
    switch (repeat) {
      case "daily": d.setDate(d.getDate() + 1); break;
      case "weekly": d.setDate(d.getDate() + 7); break;
      case "monthly": d.setMonth(d.getMonth() + 1); break;
      case "yearly": d.setFullYear(d.getFullYear() + 1); break;
      default: return null;
    }
    return toISODate(d);
  }

  // ---------- DOM ----------
  const $ = (id) => document.getElementById(id);
  const els = {
    today: $("todayLabel"), summary: $("summaryLabel"), stats: $("statsLabel"),
    settingsBtn: $("settingsBtn"), bell: $("bellBtn"),
    form: $("quickAddForm"), title: $("titleInput"), date: $("dateInput"),
    time: $("timeInput"), repeat: $("repeatInput"), tag: $("tagInput"),
    viewList: $("viewList"), viewCal: $("viewCal"),
    listView: $("listView"), calView: $("calView"),
    tabOpen: $("tabOpen"), tabDone: $("tabDone"),
    openCount: $("openCount"), doneCount: $("doneCount"),
    sortSelect: $("sortSelect"), search: $("searchInput"),
    tagFilter: $("tagFilter"), list: $("list"),
    calPrev: $("calPrev"), calNext: $("calNext"), calToday: $("calToday"),
    calTitle: $("calTitle"), calGrid: $("calGrid"), calDay: $("calDay"),
    exportBtn: $("exportBtn"), importBtn: $("importBtn"), importFile: $("importFile"),
    toast: $("toast"),
    dialog: $("editDialog"), editForm: $("editForm"),
    editTitle: $("editTitle"), editDate: $("editDate"), editTime: $("editTime"),
    editRepeat: $("editRepeat"), editLead: $("editLead"), editTag: $("editTag"),
    editNote: $("editNote"), editImportant: $("editImportant"),
    subList: $("subList"), subInput: $("subInput"), subAddBtn: $("subAddBtn"),
    deleteBtn: $("deleteBtn"), cancelBtn: $("cancelBtn"),
    settingsDialog: $("settingsDialog"), setTheme: $("setTheme"),
    setLead: $("setLead"), setWeekStart: $("setWeekStart"), clearAllBtn: $("clearAllBtn"),
  };

  // ---------- Rendering ----------
  function render() {
    els.today.textContent = fmtFullToday(new Date());
    renderSummary();
    renderStats();
    if (currentView === "list") {
      els.listView.hidden = false;
      els.calView.hidden = true;
      renderTagFilter();
      currentTab === "open" ? renderOpen() : renderDone();
    } else {
      els.listView.hidden = true;
      els.calView.hidden = false;
      renderCalendar();
    }
  }

  const openList = () => tasks.filter((x) => !x.done);

  function renderSummary() {
    const today = todayISO();
    const open = openList();
    const overdue = open.filter((x) => x.date && dayDiff(x.date, today) > 0).length;
    const dueToday = open.filter((x) => x.date === today).length;
    els.openCount.textContent = String(open.length);
    els.openCount.dataset.zero = open.length === 0 ? "true" : "false";
    const doneN = tasks.filter((x) => x.done).length;
    els.doneCount.textContent = String(doneN);
    els.doneCount.dataset.zero = doneN === 0 ? "true" : "false";

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

  function renderStats() {
    const doneDates = new Set(
      tasks.filter((x) => x.done && x.doneAt).map((x) => toISODate(new Date(x.doneAt))),
    );
    if (doneDates.size === 0) {
      els.stats.textContent = "";
      return;
    }
    // Streak: consecutive days up to today (or yesterday) with a completion.
    let streak = 0;
    const cur = new Date();
    if (!doneDates.has(toISODate(cur))) cur.setDate(cur.getDate() - 1);
    while (doneDates.has(toISODate(cur))) {
      streak++;
      cur.setDate(cur.getDate() - 1);
    }
    // Completed in the last 7 days.
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 6);
    const weekDone = tasks.filter(
      (x) => x.done && x.doneAt && new Date(x.doneAt) >= new Date(toISODate(weekAgo)),
    ).length;

    const parts = [];
    if (streak > 0) parts.push(`🔥 ต่อเนื่อง ${streak} วัน`);
    parts.push(`✅ 7 วันล่าสุด ${weekDone}`);
    els.stats.textContent = parts.join(" · ");
  }

  function renderTagFilter() {
    const tags = [...new Set(tasks.filter((x) => x.tag).map((x) => x.tag))].sort();
    if (!tags.length) {
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

  function matchesSearch(t) {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      (t.title || "").toLowerCase().includes(q) ||
      (t.tag || "").toLowerCase().includes(q) ||
      (t.note || "").toLowerCase().includes(q) ||
      (t.subtasks || []).some((s) => (s.title || "").toLowerCase().includes(q))
    );
  }

  function comparator() {
    const imp = (a, b) => (b.important ? 1 : 0) - (a.important ? 1 : 0);
    const dt = (a, b) => (a.date || "9999-99-99").localeCompare(b.date || "9999-99-99");
    const tm = (a, b) => (a.time || "").localeCompare(b.time || "");
    if (settings.sort === "important") return (a, b) => imp(a, b) || dt(a, b) || tm(a, b);
    if (settings.sort === "created") return (a, b) => (b.createdAt || "").localeCompare(a.createdAt || "");
    return (a, b) => dt(a, b) || imp(a, b) || tm(a, b);
  }

  const repeatLabel = (r) =>
    ({ daily: "ทุกวัน", weekly: "ทุกสัปดาห์", monthly: "ทุกเดือน", yearly: "ทุกปี" }[r] || "");

  function groupHeader(label, overdue = false) {
    const h = document.createElement("div");
    h.className = "group__label" + (overdue ? " group__label--overdue" : "");
    h.textContent = label;
    return h;
  }

  function taskEl(task) {
    const today = todayISO();
    const overdue = !task.done && task.date && dayDiff(task.date, today) > 0;

    const el = document.createElement("div");
    el.className =
      "task" +
      (task.done ? " task--done" : "") +
      (overdue ? " task--overdue" : "") +
      (task.important && !task.done ? " task--important" : "");
    el.onclick = (e) => {
      if (e.target.closest(".task__check") || e.target.closest(".task__star")) return;
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
    body.appendChild(title);

    const meta = document.createElement("div");
    meta.className = "task__meta";
    if (overdue) {
      meta.appendChild(badge(`เลยมา ${dayDiff(task.date, today)} วัน`, "overdue"));
    } else if (!task.done && task.date) {
      meta.appendChild(plain(relLabel(task.date)));
    } else if (!task.done && !task.date) {
      meta.appendChild(badge("ไม่มีกำหนด", "inbox"));
    } else if (task.doneAt) {
      meta.appendChild(plain("เสร็จเมื่อ " + relLabel(toISODate(new Date(task.doneAt)))));
    }
    if (task.time) meta.appendChild(plain("🕒 " + task.time));
    if (task.repeat && task.repeat !== "none") meta.appendChild(badge("↻ " + repeatLabel(task.repeat), "repeat"));
    if (task.tag) meta.appendChild(badge("# " + task.tag, "tag"));
    body.appendChild(meta);

    // Subtask progress
    if (task.subtasks && task.subtasks.length) {
      const doneN = task.subtasks.filter((s) => s.done).length;
      const prog = document.createElement("div");
      prog.className = "task__prog";
      const bar = document.createElement("div");
      bar.className = "task__prog-bar";
      const fill = document.createElement("div");
      fill.className = "task__prog-fill";
      fill.style.width = `${Math.round((doneN / task.subtasks.length) * 100)}%`;
      bar.appendChild(fill);
      const lbl = document.createElement("span");
      lbl.className = "task__prog-lbl";
      lbl.textContent = `☑ ${doneN}/${task.subtasks.length}`;
      prog.append(bar, lbl);
      body.appendChild(prog);
    }

    if (task.note) {
      const note = document.createElement("div");
      note.className = "task__note";
      note.textContent = task.note;
      body.appendChild(note);
    }

    const star = document.createElement("button");
    star.className = "task__star" + (task.important ? " is-on" : "");
    star.textContent = task.important ? "★" : "☆";
    star.title = task.important ? "เอาออกจากงานสำคัญ" : "ทำเครื่องหมายว่าสำคัญ";
    star.onclick = (e) => {
      e.stopPropagation();
      toggleImportant(task.id);
    };

    el.append(check, body, star);
    return el;
  }
  function badge(text, kind) {
    const b = document.createElement("span");
    b.className = "task__badge task__badge--" + kind;
    b.textContent = text;
    return b;
  }
  function plain(text) {
    const s = document.createElement("span");
    s.textContent = text;
    return s;
  }

  function renderOpen() {
    els.list.innerHTML = "";
    const today = todayISO();
    let list = openList().filter(matchesSearch);
    if (activeTag) list = list.filter((x) => (x.tag || "") === activeTag);

    if (list.length === 0) {
      els.list.appendChild(emptyState("📝", "ยังไม่มีงานค้าง", "พิมพ์งานด้านบนแล้วกด Enter เพื่อเริ่มเลย"));
      return;
    }
    const cmp = comparator();
    const overdue = list.filter((x) => x.date && dayDiff(x.date, today) > 0).sort(cmp);
    const todayList = list.filter((x) => x.date === today).sort(cmp);
    const upcoming = list.filter((x) => x.date && dayDiff(x.date, today) < 0).sort(cmp);
    const inbox = list.filter((x) => !x.date).sort(cmp);

    if (overdue.length) {
      els.list.appendChild(groupHeader("เลยกำหนด", true));
      overdue.forEach((t) => els.list.appendChild(taskEl(t)));
    }
    if (todayList.length) {
      els.list.appendChild(groupHeader("วันนี้"));
      todayList.forEach((t) => els.list.appendChild(taskEl(t)));
    }
    if (upcoming.length) {
      if (settings.sort === "date") {
        let last = null;
        upcoming.forEach((t) => {
          if (t.date !== last) {
            els.list.appendChild(groupHeader(relLabel(t.date)));
            last = t.date;
          }
          els.list.appendChild(taskEl(t));
        });
      } else {
        els.list.appendChild(groupHeader("ถัดไป"));
        upcoming.forEach((t) => els.list.appendChild(taskEl(t)));
      }
    }
    if (inbox.length) {
      els.list.appendChild(groupHeader("📥 ไม่มีกำหนด"));
      inbox.forEach((t) => els.list.appendChild(taskEl(t)));
    }
  }

  function renderDone() {
    els.list.innerHTML = "";
    let list = tasks.filter((x) => x.done).filter(matchesSearch);
    if (activeTag) list = list.filter((x) => (x.tag || "") === activeTag);
    list.sort((a, b) => (b.doneAt || "").localeCompare(a.doneAt || ""));
    if (list.length === 0) {
      els.list.appendChild(emptyState("✅", "ยังไม่มีงานที่เสร็จ", "ติ๊กวงกลมหน้างานเพื่อทำเครื่องหมายเสร็จ"));
      return;
    }
    const bar = document.createElement("div");
    bar.className = "cleardone";
    const clearBtn = document.createElement("button");
    clearBtn.textContent = `🧹 ล้างงานที่เสร็จ (${list.length})`;
    clearBtn.onclick = clearCompleted;
    bar.appendChild(clearBtn);
    els.list.appendChild(bar);
    list.forEach((t) => els.list.appendChild(taskEl(t)));
  }

  function emptyState(emoji, title, sub) {
    const d = document.createElement("div");
    d.className = "empty";
    d.innerHTML = `<div class="empty__emoji">${emoji}</div><div class="empty__title">${title}</div><div>${sub}</div>`;
    return d;
  }

  // ---------- Calendar ----------
  function renderCalendar() {
    els.calTitle.textContent = `${TH_MONTHS[calMonth.getMonth()]} ${beYear(calMonth)}`;
    els.calGrid.innerHTML = "";

    const ws = settings.weekStart; // 0 Sun or 1 Mon
    const headOrder = [...Array(7)].map((_, i) => (ws + i) % 7);
    headOrder.forEach((wd) => {
      const h = document.createElement("div");
      h.className = "cal__wd";
      h.textContent = TH_DAYS_MIN[wd];
      els.calGrid.appendChild(h);
    });

    const first = startOfMonth(calMonth);
    const startPad = (first.getDay() - ws + 7) % 7;
    const daysInMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 0).getDate();
    const today = todayISO();

    // counts per date (open tasks)
    const counts = {};
    openList().forEach((t) => {
      if (!t.date) return;
      counts[t.date] = (counts[t.date] || 0) + 1;
    });

    for (let i = 0; i < startPad; i++) {
      const c = document.createElement("div");
      c.className = "cal__cell cal__cell--pad";
      els.calGrid.appendChild(c);
    }
    for (let day = 1; day <= daysInMonth; day++) {
      const iso = `${calMonth.getFullYear()}-${p2(calMonth.getMonth() + 1)}-${p2(day)}`;
      const c = document.createElement("button");
      c.className = "cal__cell";
      if (iso === today) c.classList.add("cal__cell--today");
      if (iso === calSelected) c.classList.add("cal__cell--sel");
      const n = counts[iso] || 0;
      const isOverdue = n > 0 && dayDiff(iso, today) > 0;
      c.innerHTML =
        `<span class="cal__num">${day}</span>` +
        (n ? `<span class="cal__dot ${isOverdue ? "cal__dot--overdue" : ""}">${n}</span>` : "");
      c.onclick = () => {
        calSelected = iso;
        renderCalendar();
      };
      els.calGrid.appendChild(c);
    }

    renderCalDay();
  }

  function renderCalDay() {
    els.calDay.innerHTML = "";
    const head = document.createElement("div");
    head.className = "cal__day-head";
    const d = parseISO(calSelected);
    head.innerHTML = `<span>${TH_DAYS[d.getDay()]} ${d.getDate()} ${TH_MONTHS[d.getMonth()]}</span>`;
    const addBtn = document.createElement("button");
    addBtn.className = "btn btn--ghost";
    addBtn.textContent = "+ เพิ่มในวันนี้";
    addBtn.onclick = () => {
      els.date.value = calSelected;
      switchView("list");
      els.title.focus();
      els.title.scrollIntoView({ behavior: "smooth", block: "center" });
    };
    head.appendChild(addBtn);
    els.calDay.appendChild(head);

    const dayTasks = tasks
      .filter((t) => t.date === calSelected)
      .sort((a, b) => (a.done ? 1 : 0) - (b.done ? 1 : 0) || (a.time || "").localeCompare(b.time || ""));
    if (dayTasks.length === 0) {
      const e = document.createElement("div");
      e.className = "cal__empty";
      e.textContent = "ไม่มีงานในวันนี้";
      els.calDay.appendChild(e);
      return;
    }
    dayTasks.forEach((t) => els.calDay.appendChild(taskEl(t)));
  }

  // ---------- Actions ----------
  function addTask(data) {
    tasks.push({
      id: uid(),
      title: data.title,
      // "" means an inbox (no-date) task; undefined falls back to today.
      date: data.date === "none" ? "" : data.date != null ? data.date : todayISO(),
      time: data.time || "",
      repeat: data.repeat || "none",
      leadHours: settings.defaultLead,
      tag: data.tag || "",
      note: "",
      subtasks: [],
      important: false,
      done: false,
      doneAt: null,
      notifiedAt: null,
      createdAt: new Date().toISOString(),
    });
    save();
    render();
    scheduleTriggers();
  }

  function toggleDone(id) {
    const t = tasks.find((x) => x.id === id);
    if (!t) return;
    if (!t.done) {
      t.done = true;
      t.doneAt = new Date().toISOString();
      if (navigator.vibrate) navigator.vibrate(15);
      if (t.repeat && t.repeat !== "none" && t.date) {
        const nd = nextDate(t.date, t.repeat);
        if (nd) {
          tasks.push({
            id: uid(), title: t.title, date: nd, time: t.time, repeat: t.repeat,
            leadHours: t.leadHours || 0, tag: t.tag, note: t.note || "",
            subtasks: (t.subtasks || []).map((s) => ({ id: uid(), title: s.title, done: false })),
            important: t.important || false, done: false, doneAt: null,
            notifiedAt: null, createdAt: new Date().toISOString(),
          });
        }
      }
      save();
      render();
      showToast("ทำเสร็จแล้ว", "เลิกทำ", () => {
        t.done = false;
        t.doneAt = null;
        if (t.repeat && t.repeat !== "none" && t.date) {
          const nd = nextDate(t.date, t.repeat);
          const idx = tasks.findIndex((x) => !x.done && x.title === t.title && x.date === nd && x.tag === t.tag);
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

  function toggleImportant(id) {
    const t = tasks.find((x) => x.id === id);
    if (!t) return;
    t.important = !t.important;
    save();
    render();
  }

  function clearCompleted() {
    const removed = tasks.filter((x) => x.done);
    if (!removed.length) return;
    tasks = tasks.filter((x) => !x.done);
    save();
    render();
    showToast(`ล้างแล้ว ${removed.length} งาน`, "เลิกทำ", () => {
      tasks = tasks.concat(removed);
      save();
      render();
    });
  }

  // ---------- Edit dialog ----------
  function openEdit(id) {
    const t = tasks.find((x) => x.id === id);
    if (!t) return;
    editingId = id;
    editSubtasks = (t.subtasks || []).map((s) => ({ ...s }));
    els.editTitle.value = t.title;
    els.editDate.value = t.date || "";
    els.editTime.value = t.time || "";
    els.editRepeat.value = t.repeat || "none";
    els.editLead.value = String(t.leadHours || 0);
    els.editTag.value = t.tag || "";
    els.editNote.value = t.note || "";
    els.editImportant.checked = Boolean(t.important);
    renderSubEditor();
    els.dialog.showModal();
  }

  function renderSubEditor() {
    els.subList.innerHTML = "";
    editSubtasks.forEach((s, i) => {
      const row = document.createElement("div");
      row.className = "subitem";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = s.done;
      cb.onchange = () => (editSubtasks[i].done = cb.checked);
      const txt = document.createElement("input");
      txt.type = "text";
      txt.value = s.title;
      txt.className = "subitem__txt";
      txt.oninput = () => (editSubtasks[i].title = txt.value);
      const rm = document.createElement("button");
      rm.type = "button";
      rm.className = "subitem__rm";
      rm.textContent = "✕";
      rm.onclick = () => {
        editSubtasks.splice(i, 1);
        renderSubEditor();
      };
      row.append(cb, txt, rm);
      els.subList.appendChild(row);
    });
  }
  function addSubtask() {
    const v = els.subInput.value.trim();
    if (!v) return;
    editSubtasks.push({ id: uid(), title: v, done: false });
    els.subInput.value = "";
    renderSubEditor();
    els.subInput.focus();
  }

  function saveEdit() {
    const t = tasks.find((x) => x.id === editingId);
    if (!t) return;
    t.title = els.editTitle.value.trim() || t.title;
    t.date = els.editDate.value || "";
    t.time = els.editTime.value || "";
    t.repeat = els.editRepeat.value;
    t.leadHours = parseInt(els.editLead.value, 10) || 0;
    t.tag = els.editTag.value.trim();
    t.note = els.editNote.value.trim();
    t.important = els.editImportant.checked;
    t.subtasks = editSubtasks.filter((s) => (s.title || "").trim());
    t.notifiedAt = null;
    save();
    render();
    scheduleTriggers();
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
  const hideToast = () => (els.toast.hidden = true);

  // ---------- Notifications ----------
  function updateBellUI() {
    const granted = "Notification" in window && Notification.permission === "granted";
    els.bell.classList.toggle("is-on", granted);
  }
  async function requestNotifications() {
    if (!("Notification" in window)) return showToast("เบราว์เซอร์นี้ไม่รองรับการแจ้งเตือน");
    const perm = await Notification.requestPermission();
    updateBellUI();
    showToast(perm === "granted" ? "เปิดการแจ้งเตือนแล้ว" : "ยังไม่ได้อนุญาตการแจ้งเตือน");
    if (perm === "granted") scheduleTriggers();
  }
  function dueDateTimeMs(t) {
    if (!t.date) return null;
    const d = parseISO(t.date);
    if (t.time) {
      const [h, m] = t.time.split(":").map(Number);
      d.setHours(h, m, 0, 0);
    }
    return d.getTime();
  }
  function checkDue() {
    const today = todayISO();
    const now = Date.now();
    let fired = null;
    tasks.forEach((t) => {
      if (t.done || !t.date) return;
      const due = dueDateTimeMs(t);
      if (due == null) return;
      const notifyAt = due - (t.leadHours || 0) * 3_600_000;
      if (now >= notifyAt && t.notifiedAt !== today) {
        t.notifiedAt = today;
        fired = t.title;
        systemNotify(t);
      }
    });
    if (fired) {
      save();
      showToast("ถึงกำหนด: " + fired);
      render();
    }
  }
  function systemNotify(task) {
    if ("Notification" in window && Notification.permission === "granted") {
      try {
        new Notification("MyChecklist", {
          body: task.title + (task.time ? " (" + task.time + ")" : ""),
          tag: task.id, icon: "icons/icon-192.png",
        });
      } catch {}
    }
  }
  async function scheduleTriggers() {
    if (!("serviceWorker" in navigator)) return;
    const reg = await navigator.serviceWorker.ready.catch(() => null);
    if (!reg || !("showTrigger" in Notification.prototype)) return;
    const now = Date.now();
    for (const t of tasks) {
      if (t.done || !t.date) continue;
      const due = dueDateTimeMs(t);
      const at = due - (t.leadHours || 0) * 3_600_000;
      if (at <= now) continue;
      try {
        await reg.showNotification("MyChecklist", {
          tag: "trigger-" + t.id, body: t.title, icon: "icons/icon-192.png",
          showTrigger: new TimestampTrigger(at), // eslint-disable-line no-undef
        });
      } catch {}
    }
  }

  // ---------- Backup ----------
  function exportData() {
    const blob = new Blob([JSON.stringify(tasks, null, 2)], { type: "application/json" });
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
        const map = new Map(tasks.map((t) => [t.id, t]));
        arr.forEach((t) => {
          if (t && t.id && t.title) map.set(t.id, migrate(t));
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

  // ---------- Settings ----------
  function openSettings() {
    els.setTheme.value = settings.theme;
    els.setLead.value = String(settings.defaultLead);
    els.setWeekStart.value = String(settings.weekStart);
    els.settingsDialog.showModal();
  }

  // ---------- View switch ----------
  function switchView(v) {
    currentView = v;
    els.viewList.classList.toggle("viewswitch__btn--active", v === "list");
    els.viewCal.classList.toggle("viewswitch__btn--active", v === "calendar");
    render();
  }
  function switchTab(tab) {
    currentTab = tab;
    els.tabOpen.classList.toggle("tab--active", tab === "open");
    els.tabDone.classList.toggle("tab--active", tab === "done");
    els.tabOpen.setAttribute("aria-selected", tab === "open");
    els.tabDone.setAttribute("aria-selected", tab === "done");
    render();
  }

  function setQuick(kind) {
    if (kind === "none") {
      els.date.value = "";
      return;
    }
    const d = new Date();
    if (kind === "tomorrow") d.setDate(d.getDate() + 1);
    if (kind === "week") d.setDate(d.getDate() + 7);
    els.date.value = toISODate(d);
  }

  // ---------- Init ----------
  function init() {
    applyTheme();
    els.sortSelect.value = settings.sort;
    els.date.value = todayISO();

    els.form.addEventListener("submit", (e) => {
      e.preventDefault();
      const title = els.title.value.trim();
      if (!title) return;
      addTask({ title, date: els.date.value, time: els.time.value, repeat: els.repeat.value, tag: els.tag.value.trim() });
      els.title.value = "";
      els.time.value = "";
      els.tag.value = "";
      els.repeat.value = "none";
      els.date.value = todayISO();
      els.title.focus();
    });
    document.querySelectorAll(".chip[data-quick]").forEach((c) =>
      c.addEventListener("click", () => setQuick(c.dataset.quick)),
    );

    els.viewList.addEventListener("click", () => switchView("list"));
    els.viewCal.addEventListener("click", () => switchView("calendar"));
    els.tabOpen.addEventListener("click", () => switchTab("open"));
    els.tabDone.addEventListener("click", () => switchTab("done"));
    els.sortSelect.addEventListener("change", () => {
      settings.sort = els.sortSelect.value;
      saveSettings();
      render();
    });
    els.search.addEventListener("input", () => {
      searchQuery = els.search.value.trim();
      render();
    });

    els.calPrev.addEventListener("click", () => {
      calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1);
      renderCalendar();
    });
    els.calNext.addEventListener("click", () => {
      calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1);
      renderCalendar();
    });
    els.calToday.addEventListener("click", () => {
      calMonth = startOfMonth(new Date());
      calSelected = todayISO();
      renderCalendar();
    });

    els.bell.addEventListener("click", requestNotifications);
    els.settingsBtn.addEventListener("click", openSettings);
    els.setTheme.addEventListener("change", () => {
      settings.theme = els.setTheme.value;
      saveSettings();
      applyTheme();
    });
    els.setLead.addEventListener("change", () => {
      settings.defaultLead = parseInt(els.setLead.value, 10) || 0;
      saveSettings();
    });
    els.setWeekStart.addEventListener("change", () => {
      settings.weekStart = parseInt(els.setWeekStart.value, 10) || 0;
      saveSettings();
    });
    els.clearAllBtn.addEventListener("click", () => {
      if (confirm("ล้างข้อมูลงานทั้งหมด? (กู้คืนไม่ได้)")) {
        tasks = [];
        save();
        els.settingsDialog.close();
        render();
        showToast("ล้างข้อมูลทั้งหมดแล้ว");
      }
    });

    els.exportBtn.addEventListener("click", exportData);
    els.importBtn.addEventListener("click", () => els.importFile.click());
    els.importFile.addEventListener("change", (e) => {
      if (e.target.files[0]) importData(e.target.files[0]);
      e.target.value = "";
    });

    // Edit dialog
    els.subAddBtn.addEventListener("click", addSubtask);
    els.subInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        addSubtask();
      }
    });
    document.querySelectorAll(".chip[data-snooze]").forEach((c) =>
      c.addEventListener("click", () => {
        const v = c.dataset.snooze;
        if (v === "clear") {
          els.editDate.value = "";
          return;
        }
        const d = new Date();
        d.setDate(d.getDate() + (v === "tomorrow" ? 1 : parseInt(v, 10)));
        els.editDate.value = toISODate(d);
      }),
    );
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

  document.addEventListener("DOMContentLoaded", init);
})();
