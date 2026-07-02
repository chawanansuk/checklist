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
  let currentView = "list"; // 'list' | 'calendar' | 'done'
  const REDUCED_MOTION =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
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
      order: typeof t.order === "number" ? t.order : 0,
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
      accent: s.accent || "green",
      fontSize: s.fontSize || "normal",
      density: s.density || "comfortable",
      defaultLead: typeof s.defaultLead === "number" ? s.defaultLead : 0,
      weekStart: s.weekStart === 0 ? 0 : 1,
      sort: s.sort || "date",
      quietOn: Boolean(s.quietOn),
      quietFrom: s.quietFrom || "21:00",
      quietTo: s.quietTo || "07:00",
      reminderRepeat: s.reminderRepeat === "once" ? "once" : "daily",
      lastBackupAt: typeof s.lastBackupAt === "number" ? s.lastBackupAt : 0,
      lastBackupPromptAt: typeof s.lastBackupPromptAt === "number" ? s.lastBackupPromptAt : 0,
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
    const r = document.documentElement;
    if (settings.theme === "auto") r.removeAttribute("data-theme");
    else r.dataset.theme = settings.theme;
    setAttr(r, "data-accent", settings.accent, "green");
    setAttr(r, "data-font", settings.fontSize, "normal");
    setAttr(r, "data-density", settings.density, "comfortable");
  }
  function setAttr(el, name, val, dflt) {
    if (val === dflt) el.removeAttribute(name);
    else el.setAttribute(name, val);
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
    settingsBtn: $("settingsBtn"), bell: $("bellBtn"), ring: $("todayRing"),
    form: $("quickAddForm"), title: $("titleInput"), date: $("dateInput"),
    time: $("timeInput"), repeat: $("repeatInput"), tag: $("tagInput"),
    fab: $("fabAdd"), addSheet: $("addSheet"), sheetClose: $("sheetClose"),
    sheetMsg: $("sheetMsg"), toolbar: $("toolbar"),
    navList: $("navList"), navCal: $("navCal"), navDone: $("navDone"),
    listView: $("listView"), calView: $("calView"),
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
    setAccent: $("setAccent"), setFont: $("setFont"), setDensity: $("setDensity"),
    setQuietOn: $("setQuietOn"), setQuietFrom: $("setQuietFrom"), setQuietTo: $("setQuietTo"),
    setReminderRepeat: $("setReminderRepeat"),
    importDialog: $("importDialog"), pasteArea: $("pasteArea"), importTag: $("importTag"),
    importLead: $("importLead"), importBE: $("importBE"), importPreview: $("importPreview"),
  };

  // ---------- Rendering ----------
  function render() {
    els.today.textContent = fmtFullToday(new Date());
    renderSummary();
    renderStats();
    const isCal = currentView === "calendar";
    els.listView.hidden = isCal;
    els.calView.hidden = !isCal;
    els.toolbar.hidden = isCal;
    els.fab.hidden = currentView === "done";
    if (isCal) {
      els.tagFilter.hidden = true;
      renderCalendar();
    } else {
      renderTagFilter();
      if (currentView === "list") renderOpen();
      else renderDone();
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
    renderRing(dueToday);

    // App-icon badge (installed PWA on supporting platforms).
    try {
      if (navigator.setAppBadge) {
        if (open.length) navigator.setAppBadge(open.length);
        else navigator.clearAppBadge && navigator.clearAppBadge();
      }
    } catch {
      /* unsupported */
    }
  }

  /** Small progress ring in the header: today's completed / due-today total. */
  function renderRing(dueTodayOpen) {
    const today = todayISO();
    const doneToday = tasks.filter(
      (x) => x.done && x.doneAt && toISODate(new Date(x.doneAt)) === today,
    ).length;
    const total = doneToday + dueTodayOpen;
    if (!total) {
      els.ring.hidden = true;
      return;
    }
    const R = 19;
    const C = 2 * Math.PI * R;
    const pct = doneToday / total;
    els.ring.hidden = false;
    els.ring.innerHTML =
      `<svg viewBox="0 0 46 46" width="46" height="46">` +
      `<circle cx="23" cy="23" r="${R}" fill="none" stroke="var(--line)" stroke-width="4"/>` +
      `<circle cx="23" cy="23" r="${R}" fill="none" stroke="var(--primary)" stroke-width="4" ` +
      `stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - pct)}"/>` +
      `</svg><span class="ring__label">${doneToday}/${total}</span>`;
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
      if (tag && activeTag !== tag) styleTag(b, tag);
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
    const ord = (a, b) => (a.order || 0) - (b.order || 0);
    if (settings.sort === "important") return (a, b) => imp(a, b) || dt(a, b) || ord(a, b) || tm(a, b);
    if (settings.sort === "created") return (a, b) => (b.createdAt || "").localeCompare(a.createdAt || "");
    // date: manual order (from drag) takes precedence within a day, then importance.
    return (a, b) => dt(a, b) || ord(a, b) || imp(a, b) || tm(a, b);
  }

  const repeatLabel = (r) =>
    ({ daily: "ทุกวัน", weekly: "ทุกสัปดาห์", monthly: "ทุกเดือน", yearly: "ทุกปี" }[r] || "");

  function groupHeader(label, overdue = false, count = null) {
    const h = document.createElement("div");
    h.className = "group__label" + (overdue ? " group__label--overdue" : "");
    h.textContent = count != null ? `${label} · ${count}` : label;
    return h;
  }

  // Known activity categories -> a hue for their coloured badge.
  const CAT_HUE = {
    สอบ: 4, ส่งงาน: 28, เตรียม: 210, กิจกรรม: 145,
    การเรียน: 190, วันหยุด: 285, หมายเหตุ: 45, "แต่งกาย": 320,
  };
  function catBadge(cat) {
    const b = document.createElement("span");
    b.className = "task__badge";
    b.textContent = cat;
    const hue = CAT_HUE[cat] != null ? CAT_HUE[cat] : tagHue(cat);
    b.style.background = `hsl(${hue} 65% 50% / 0.18)`;
    b.style.color = `hsl(${hue} 60% ${effectiveDark() ? 74 : 36}%)`;
    return b;
  }

  function taskEl(task) {
    const today = todayISO();
    const overdue = !task.done && task.date && dayDiff(task.date, today) > 0;
    // Split a leading "[category]" out of the note into its own badge.
    let noteBody = task.note || "";
    let cat = null;
    const cm = noteBody.match(/^\s*\[([^\]]+)\]\s*/);
    if (cm) {
      cat = cm[1].split("/")[0].trim();
      noteBody = noteBody.slice(cm[0].length);
    }

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
      // Brief strike/fade animation before the list re-renders.
      if (!task.done && !REDUCED_MOTION && !el.classList.contains("task--completing")) {
        el.classList.add("task--completing");
        setTimeout(() => toggleDone(task.id), 260);
      } else {
        toggleDone(task.id);
      }
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
    if (cat) meta.appendChild(catBadge(cat));
    if (task.time) meta.appendChild(plain("🕒 " + task.time));
    if (task.repeat && task.repeat !== "none") meta.appendChild(badge("↻ " + repeatLabel(task.repeat), "repeat"));
    if (task.tag) meta.appendChild(badge("# " + task.tag, "tag", task.tag));
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

    if (noteBody.trim()) {
      const note = document.createElement("div");
      note.className = "task__note";
      note.textContent = noteBody.trim();
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
    el.dataset.id = task.id;

    // Drag handle to reorder within the list view (open tasks only).
    if (currentView === "list" && !task.done) {
      const grip = document.createElement("button");
      grip.className = "task__grip";
      grip.textContent = "⠿";
      grip.setAttribute("aria-label", "ลากจัดลำดับ");
      grip.title = "ลากเพื่อจัดลำดับ";
      el.appendChild(grip);
      attachReorder(grip, task);
    }

    if (!task.done) attachSwipe(el, task);
    return el;
  }

  function attachReorder(grip, task) {
    grip.style.touchAction = "none";
    grip.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const card = grip.closest(".task");
      const listEl = els.list;
      card.classList.add("task--dragging");
      let moved = false;

      const move = (ev) => {
        moved = true;
        const y = ev.clientY;
        const sibs = [...listEl.querySelectorAll(".task:not(.task--dragging)")];
        let before = null;
        for (const s of sibs) {
          const r = s.getBoundingClientRect();
          if (y < r.top + r.height / 2) {
            before = s;
            break;
          }
        }
        if (before) listEl.insertBefore(card, before);
        else if (sibs.length) listEl.insertBefore(card, sibs[sibs.length - 1].nextSibling);
      };
      const up = () => {
        document.removeEventListener("pointermove", move);
        document.removeEventListener("pointerup", up);
        card.classList.remove("task--dragging");
        if (moved) commitOrder(task.date);
      };
      document.addEventListener("pointermove", move);
      document.addEventListener("pointerup", up);
    });
  }

  /** Renumber `order` for all open tasks sharing `date`, by their DOM order. */
  function commitOrder(date) {
    const ids = [...els.list.querySelectorAll(".task")].map((el) => el.dataset.id);
    let n = 0;
    ids.forEach((id) => {
      const t = tasks.find((x) => x.id === id);
      if (t && t.date === date && !t.done) t.order = n++;
    });
    save();
    render();
  }
  /** Deterministic, theme-safe colour for a tag (translucent bg + mid-tone text). */
  function tagHue(tag) {
    let h = 0;
    for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) % 360;
    return h;
  }
  function styleTag(elm, tag) {
    const hue = tagHue(tag);
    elm.style.background = `hsl(${hue} 60% 50% / 0.16)`;
    elm.style.color = `hsl(${hue} 55% ${effectiveDark() ? 72 : 38}%)`;
  }

  function badge(text, kind, tag) {
    const b = document.createElement("span");
    b.className = "task__badge task__badge--" + kind;
    b.textContent = text;
    if (kind === "tag" && tag) styleTag(b, tag);
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
      const empty = emptyState("📝", "ยังไม่มีงานค้าง", "กดปุ่ม ＋ ด้านล่างเพื่อเพิ่มงานแรก");
      const cta = document.createElement("button");
      cta.className = "empty__cta";
      cta.textContent = "＋ เพิ่มงานแรก";
      cta.onclick = () => openSheet();
      empty.appendChild(cta);
      els.list.appendChild(empty);
      return;
    }
    const cmp = comparator();
    const overdue = list.filter((x) => x.date && dayDiff(x.date, today) > 0).sort(cmp);
    const todayList = list.filter((x) => x.date === today).sort(cmp);
    let upcoming = list.filter((x) => x.date && dayDiff(x.date, today) < 0).sort(cmp);
    const inbox = list.filter((x) => !x.date).sort(cmp);

    // Evening: surface tomorrow's tasks in a highlighted "prep tonight" section.
    const tmr = toISODate(new Date(Date.now() + 86_400_000));
    let prep = [];
    if (new Date().getHours() >= 17) {
      prep = upcoming.filter((x) => x.date === tmr);
      upcoming = upcoming.filter((x) => x.date !== tmr);
    }
    if (prep.length) {
      const h = groupHeader("🎒 เย็นนี้เตรียมของพรุ่งนี้", false, prep.length);
      h.classList.add("group__label--prep");
      els.list.appendChild(h);
      prep.forEach((t) => els.list.appendChild(taskEl(t)));
    }

    if (overdue.length) {
      els.list.appendChild(groupHeader("เลยกำหนด", true, overdue.length));
      overdue.forEach((t) => els.list.appendChild(taskEl(t)));
    }
    if (todayList.length) {
      els.list.appendChild(groupHeader("วันนี้", false, todayList.length));
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
        els.list.appendChild(groupHeader("ถัดไป", false, upcoming.length));
        upcoming.forEach((t) => els.list.appendChild(taskEl(t)));
      }
    }
    if (inbox.length) {
      els.list.appendChild(groupHeader("📥 ไม่มีกำหนด", false, inbox.length));
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
    addBtn.onclick = () => openSheet(calSelected);
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

  function snoozeTask(id, days) {
    const t = tasks.find((x) => x.id === id);
    if (!t || t.done) return;
    const prev = t.date;
    const d = new Date();
    d.setDate(d.getDate() + days);
    t.date = toISODate(d);
    t.notifiedAt = null;
    save();
    render();
    scheduleTriggers();
    showToast(days === 1 ? "เลื่อนไปพรุ่งนี้แล้ว" : `เลื่อนไปอีก ${days} วันแล้ว`, "เลิกทำ", () => {
      t.date = prev;
      save();
      render();
    });
  }

  /* Touch swipe on open tasks: right = done, left = snooze to tomorrow.
   * Vertical scrolling stays intact — we only take over once the gesture
   * is clearly horizontal. */
  function attachSwipe(el, task) {
    let startX = 0;
    let startY = 0;
    let dx = 0;
    let active = false;
    let horizontal = false;
    const reset = () => {
      el.style.transform = "";
      el.classList.remove("task--swipe-right", "task--swipe-left");
    };
    el.addEventListener(
      "touchstart",
      (e) => {
        if (e.target.closest(".task__grip")) return; // let the drag handle win
        const t0 = e.touches[0];
        startX = t0.clientX;
        startY = t0.clientY;
        dx = 0;
        active = true;
        horizontal = false;
        el.style.transition = "none";
      },
      { passive: true },
    );
    el.addEventListener(
      "touchmove",
      (e) => {
        if (!active) return;
        const t0 = e.touches[0];
        dx = t0.clientX - startX;
        const dy = t0.clientY - startY;
        if (!horizontal) {
          if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.5) horizontal = true;
          else if (Math.abs(dy) > 12) {
            active = false;
            reset();
            return;
          } else return;
        }
        el.style.transform = `translateX(${dx}px)`;
        el.classList.toggle("task--swipe-right", dx > 40);
        el.classList.toggle("task--swipe-left", dx < -40);
      },
      { passive: true },
    );
    el.addEventListener("touchend", () => {
      if (!active) return;
      active = false;
      el.style.transition = "";
      reset();
      const THRESHOLD = 80;
      if (horizontal && dx > THRESHOLD) toggleDone(task.id);
      else if (horizontal && dx < -THRESHOLD) snoozeTask(task.id, 1);
    });
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
  function toMin(hhmm) {
    const [h, m] = (hhmm || "0:0").split(":").map(Number);
    return h * 60 + (m || 0);
  }
  function inQuietHours(d) {
    if (!settings.quietOn) return false;
    const now = d.getHours() * 60 + d.getMinutes();
    const from = toMin(settings.quietFrom);
    const to = toMin(settings.quietTo);
    return from < to ? now >= from && now < to : now >= from || now < to;
  }

  function checkDue() {
    const today = todayISO();
    const now = Date.now();
    // During quiet hours, hold notifications (they fire once the window ends).
    if (inQuietHours(new Date())) return;
    let fired = null;
    tasks.forEach((t) => {
      if (t.done || !t.date) return;
      const due = dueDateTimeMs(t);
      if (due == null) return;
      const notifyAt = due - (t.leadHours || 0) * 3_600_000;
      const alreadyNotified =
        settings.reminderRepeat === "once" ? Boolean(t.notifiedAt) : t.notifiedAt === today;
      if (now >= notifyAt && !alreadyNotified) {
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
  const DAY_MS = 86_400_000;

  function download(content, filename, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportData() {
    download(
      JSON.stringify(tasks, null, 2),
      `mychecklist-backup-${todayISO()}.json`,
      "application/json",
    );
    settings.lastBackupAt = Date.now();
    saveSettings();
  }

  /** Nudge (at most every 3 days) when there is real data and no backup for 7+ days. */
  function maybePromptBackup() {
    if (tasks.length < 5) return;
    const now = Date.now();
    if (now - settings.lastBackupAt < 7 * DAY_MS) return;
    if (now - settings.lastBackupPromptAt < 3 * DAY_MS) return;
    settings.lastBackupPromptAt = now;
    saveSettings();
    showToast("เกิน 7 วันแล้วที่ยังไม่ได้สำรองข้อมูล", "สำรองเลย", exportData);
  }

  // ---------- Calendar export (.ics) ----------
  function icsEscape(s) {
    return String(s)
      .replace(/\\/g, "\\\\")
      .replace(/;/g, "\\;")
      .replace(/,/g, "\\,")
      .replace(/\r?\n/g, "\\n");
  }

  /** Open, dated tasks as VEVENTs (floating local time; repeats become RRULE). */
  function buildICS() {
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const RR = { daily: "DAILY", weekly: "WEEKLY", monthly: "MONTHLY", yearly: "YEARLY" };
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//MyChecklist//TH",
      "CALSCALE:GREGORIAN",
      "X-WR-CALNAME:MyChecklist",
    ];
    tasks
      .filter((t) => !t.done && t.date)
      .forEach((t) => {
        const d = t.date.replace(/-/g, "");
        lines.push("BEGIN:VEVENT");
        lines.push(`UID:${t.id}@mychecklist`);
        lines.push(`DTSTAMP:${stamp}`);
        if (t.time) lines.push(`DTSTART:${d}T${t.time.replace(":", "")}00`);
        else lines.push(`DTSTART;VALUE=DATE:${d}`);
        lines.push(`SUMMARY:${icsEscape(t.title + (t.tag ? ` [${t.tag}]` : ""))}`);
        if (t.note) lines.push(`DESCRIPTION:${icsEscape(t.note)}`);
        if (RR[t.repeat]) lines.push(`RRULE:FREQ=${RR[t.repeat]}`);
        if (t.leadHours) {
          lines.push(
            "BEGIN:VALARM",
            "ACTION:DISPLAY",
            `DESCRIPTION:${icsEscape(t.title)}`,
            `TRIGGER:-PT${t.leadHours}H`,
            "END:VALARM",
          );
        }
        lines.push("END:VEVENT");
      });
    lines.push("END:VCALENDAR");
    return lines.join("\r\n");
  }

  function exportICS() {
    const n = tasks.filter((t) => !t.done && t.date).length;
    if (!n) return showToast("ไม่มีงานค้างที่มีวันกำหนดให้ส่งออก");
    download(buildICS(), "mychecklist.ics", "text/calendar");
    showToast(`ส่งออก ${n} งาน — นำไป import ใน Google Calendar ได้เลย`);
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

  // ---------- Import activities from pasted text ----------
  const TH_MON = {
    "ม.ค.": 1, มกราคม: 1, "ก.พ.": 2, กุมภาพันธ์: 2, "มี.ค.": 3, มีนาคม: 3,
    "เม.ย.": 4, เมษายน: 4, "พ.ค.": 5, พฤษภาคม: 5, "มิ.ย.": 6, มิถุนายน: 6,
    "ก.ค.": 7, กรกฎาคม: 7, "ส.ค.": 8, สิงหาคม: 8, "ก.ย.": 9, กันยายน: 9,
    "ต.ค.": 10, ตุลาคม: 10, "พ.ย.": 11, พฤศจิกายน: 11, "ธ.ค.": 12, ธันวาคม: 12,
  };
  let importParsed = [];

  function parseAnyDate(str, be) {
    str = (str || "").trim();
    let m;
    if ((m = str.match(/(\d{4})-(\d{1,2})-(\d{1,2})/)))
      return `${m[1]}-${p2(+m[2])}-${p2(+m[3])}`;
    if ((m = str.match(/(\d{1,2})[/.](\d{1,2})[/.](\d{4})/))) {
      let y = +m[3];
      if (be && y > 2400) y -= 543;
      return `${y}-${p2(+m[2])}-${p2(+m[1])}`;
    }
    if ((m = str.match(/(\d{1,2})\s*([ก-๙.]+)\s*(\d{4})/))) {
      const mon = TH_MON[m[2]];
      if (!mon) return null;
      let y = +m[3];
      if (be && y > 2400) y -= 543;
      return `${y}-${p2(mon)}-${p2(+m[1])}`;
    }
    return null;
  }

  function parseImport(text, be) {
    const items = [];
    text.split(/\r?\n/).forEach((raw) => {
      const line = raw.trim();
      if (!line || line.startsWith("วันที่")) return;
      let cols;
      if (line.includes("\t")) cols = line.split("\t");
      else if (line.includes("|")) cols = line.split(/\s*\|\s*/);
      else cols = line.split(/\s{2,}/);
      cols = cols.map((c) => c.trim());

      let date = parseAnyDate(cols[0], be);
      let title = "";
      let detail = "";
      let cat = "";
      if (date) {
        title = cols[1] || "";
        detail = cols[2] || "";
        cat = cols[3] || "";
      } else {
        const dm = line.match(/\d{1,2}\s*[ก-๙.]+\s*\d{4}|\d{4}-\d{1,2}-\d{1,2}/);
        if (dm) {
          date = parseAnyDate(dm[0], be);
          title = line.replace(dm[0], "").replace(/[|\t]+/g, " ").trim();
        }
      }
      if (!date || !title) return;
      const important = /สอบ|ส่งงาน|test|quiz|exam/i.test(`${cat} ${title} ${detail}`);
      items.push({
        sel: true,
        date,
        title,
        note: (cat ? `[${cat}] ` : "") + detail,
        important,
      });
    });
    return items;
  }

  function renderImportPreview() {
    const box = els.importPreview;
    box.innerHTML = "";
    if (!importParsed.length) {
      box.innerHTML = `<p class="hint">ไม่พบรายการที่อ่านได้ — ตรวจว่ามีคอลัมน์วันที่ + หัวข้อ</p>`;
      return;
    }
    importParsed.forEach((it, i) => {
      const row = document.createElement("label");
      row.className = "import-row";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = it.sel;
      cb.onchange = () => (importParsed[i].sel = cb.checked);
      const txt = document.createElement("div");
      txt.className = "import-row__txt";
      txt.innerHTML =
        `<b>${escapeHTML(it.title)}</b>${it.important ? " ⭐" : ""}` +
        `<span class="import-row__date">${relLabel(it.date)}${it.note ? " · " + escapeHTML(it.note) : ""}</span>`;
      row.append(cb, txt);
      box.appendChild(row);
    });
    const go = document.createElement("button");
    go.type = "button";
    go.className = "btn btn--primary import-go";
    const n = importParsed.filter((x) => x.sel).length;
    go.textContent = `นำเข้า ${n} งาน`;
    go.onclick = doImport;
    box.appendChild(go);
  }
  const escapeHTML = (s) =>
    s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  function doImport() {
    const tag = els.importTag.value.trim();
    const lead = parseInt(els.importLead.value, 10) || 0;
    const chosen = importParsed.filter((x) => x.sel);
    if (!chosen.length) return;
    chosen.forEach((it, i) => {
      tasks.push({
        id: `imp-${it.date.replace(/-/g, "")}-${i}-${uid()}`,
        title: it.title,
        date: it.date,
        time: "",
        repeat: "none",
        leadHours: it.important ? lead : 0,
        tag,
        note: it.note,
        subtasks: [],
        important: it.important,
        done: false,
        doneAt: null,
        notifiedAt: null,
        createdAt: new Date().toISOString(),
      });
    });
    save();
    render();
    scheduleTriggers();
    els.importDialog.close();
    showToast(`นำเข้า ${chosen.length} งานแล้ว`);
  }

  // ---------- Settings ----------
  function markAccent() {
    els.setAccent.querySelectorAll(".swatch").forEach((s) =>
      s.classList.toggle("is-on", s.dataset.accent === settings.accent),
    );
  }
  function openSettings() {
    els.setTheme.value = settings.theme;
    els.setLead.value = String(settings.defaultLead);
    els.setWeekStart.value = String(settings.weekStart);
    els.setFont.value = settings.fontSize;
    els.setDensity.value = settings.density;
    els.setQuietOn.checked = settings.quietOn;
    els.setQuietFrom.value = settings.quietFrom;
    els.setQuietTo.value = settings.quietTo;
    els.setReminderRepeat.value = settings.reminderRepeat;
    markAccent();
    els.settingsDialog.showModal();
  }

  // ---------- View switch (bottom nav) ----------
  function switchView(v) {
    currentView = v;
    const navs = { list: els.navList, calendar: els.navCal, done: els.navDone };
    Object.entries(navs).forEach(([key, btn]) => {
      btn.classList.toggle("bottomnav__btn--active", key === v);
      btn.setAttribute("aria-selected", key === v);
    });
    render();
  }

  // ---------- Quick-add bottom sheet ----------
  function openSheet(dateISO) {
    els.date.value = dateISO != null ? dateISO : todayISO();
    els.sheetMsg.textContent = "";
    els.addSheet.showModal();
    els.title.focus();
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
      // Sheet stays open for rapid entry; date/tag keep their values.
      els.title.value = "";
      els.time.value = "";
      els.repeat.value = "none";
      els.title.focus();
      els.sheetMsg.textContent = "✓ เพิ่มแล้ว";
      setTimeout(() => (els.sheetMsg.textContent = ""), 1400);
    });
    document.querySelectorAll(".chip[data-quick]").forEach((c) =>
      c.addEventListener("click", () => setQuick(c.dataset.quick)),
    );

    els.fab.addEventListener("click", () =>
      openSheet(currentView === "calendar" ? calSelected : undefined),
    );
    els.sheetClose.addEventListener("click", () => els.addSheet.close());
    els.navList.addEventListener("click", () => switchView("list"));
    els.navCal.addEventListener("click", () => switchView("calendar"));
    els.navDone.addEventListener("click", () => switchView("done"));
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
    els.setAccent.querySelectorAll(".swatch").forEach((s) =>
      s.addEventListener("click", () => {
        settings.accent = s.dataset.accent;
        saveSettings();
        applyTheme();
        markAccent();
        render();
      }),
    );
    els.setFont.addEventListener("change", () => {
      settings.fontSize = els.setFont.value;
      saveSettings();
      applyTheme();
    });
    els.setDensity.addEventListener("change", () => {
      settings.density = els.setDensity.value;
      saveSettings();
      applyTheme();
    });
    els.setQuietOn.addEventListener("change", () => {
      settings.quietOn = els.setQuietOn.checked;
      saveSettings();
    });
    els.setQuietFrom.addEventListener("change", () => {
      settings.quietFrom = els.setQuietFrom.value || "21:00";
      saveSettings();
    });
    els.setQuietTo.addEventListener("change", () => {
      settings.quietTo = els.setQuietTo.value || "07:00";
      saveSettings();
    });
    els.setReminderRepeat.addEventListener("change", () => {
      settings.reminderRepeat = els.setReminderRepeat.value;
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
    $("icsBtn").addEventListener("click", exportICS);
    els.importBtn.addEventListener("click", () => els.importFile.click());

    // Import-from-paste dialog
    $("pasteImportBtn").addEventListener("click", () => {
      els.settingsDialog.close();
      importParsed = [];
      els.importPreview.innerHTML = "";
      els.importDialog.showModal();
    });
    $("importPreviewBtn").addEventListener("click", () => {
      importParsed = parseImport(els.pasteArea.value, els.importBE.checked);
      renderImportPreview();
    });
    $("importCancelBtn").addEventListener("click", () => els.importDialog.close());
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
      // Offer a refresh when a new version of the app takes over.
      const hadController = Boolean(navigator.serviceWorker.controller);
      let promptedUpdate = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (!hadController || promptedUpdate) return;
        promptedUpdate = true;
        showToast("มีเวอร์ชันใหม่", "รีเฟรช", () => location.reload());
      });
    }

    // Ask the browser to protect our localStorage from eviction.
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persist().catch(() => {});
    }
    maybePromptBackup();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
