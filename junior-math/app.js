(function () {
  "use strict";

  var MODES = {
    daily: { label: "隨堂測驗", source: "generated", defaultCount: 8 },
    exam: { label: "考卷測試", source: "generated", defaultCount: 12 },
    past_exam: { label: "歷屆會考", source: "cap", defaultCount: 10 }
  };
  var TERMS = ["國一上", "國一下", "國二上", "國二下", "國三上", "國三下"];
  var DIFFICULTIES = ["easy", "medium", "hard"];
  var DIFFICULTY_LABELS = { easy: "易", medium: "中", hard: "難" };
  var SCHEMA = "bobo-math-html-v1";
  var OUTBOX_KEY = "bobo_math_html_outbox_v1";
  var SUMMARY_KEY = "bobo_math_html_summaries_v1";
  var EVENT_ENDPOINT = "";
  var isDemo = document.body.getAttribute("data-demo-mode") || "";
  var assetPrefix = isDemo ? "../" : "";
  var app = { mode: null, config: null, state: null, questions: [], current: null };

  function byId(id) { return document.getElementById(id); }
  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char];
    });
  }
  function sortById(a, b) { return String(a.qid).localeCompare(String(b.qid)); }
  function arrayFrom(value) { return Array.prototype.slice.call(value || []); }
  function getUnit(unitId) { return (window.BOBO_UNIT_CATALOG || []).find(function (unit) { return unit.unitId === unitId; }); }
  function getItems(source) { return source === "cap" ? (window.BOBO_CAP_ITEMS || []) : (window.BOBO_GENERATED_ITEMS || []); }
  function modeLabel(mode) { return MODES[mode] ? MODES[mode].label : "數學任務"; }
  function unitLabel(unitId) {
    var unit = getUnit(unitId);
    return unit ? unit.courseName + "（" + unitId + "）" : (unitId || "未分派單元");
  }
  function randomToken() {
    try { if (window.crypto && crypto.randomUUID) return crypto.randomUUID(); } catch (error) { /* offline fallback */ }
    return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
  }
  function hashString(value) {
    var hash = 2166136261;
    for (var i = 0; i < value.length; i += 1) { hash ^= value.charCodeAt(i); hash = Math.imul(hash, 16777619); }
    return (hash >>> 0).toString(16).padStart(8, "0");
  }
  function seededRandom(seed) {
    var state = parseInt(hashString(seed), 16) || 1;
    return function () { state = (Math.imul(1664525, state) + 1013904223) >>> 0; return state / 4294967296; };
  }
  function shuffle(items, seed) {
    var output = items.slice();
    var random = seededRandom(seed);
    for (var i = output.length - 1; i > 0; i -= 1) {
      var j = Math.floor(random() * (i + 1));
      var swap = output[i]; output[i] = output[j]; output[j] = swap;
    }
    return output;
  }
  function encodeConfig(config) {
    var json = JSON.stringify(config);
    return btoa(unescape(encodeURIComponent(json))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function decodeConfig(value) {
    try {
      var padded = value.replace(/-/g, "+").replace(/_/g, "/");
      while (padded.length % 4) padded += "=";
      return JSON.parse(decodeURIComponent(escape(atob(padded))));
    } catch (error) { return null; }
  }
  function readHashConfig() {
    var match = location.hash.match(/assignment=([^&]+)/);
    return match ? decodeConfig(match[1]) : null;
  }
  function validateAssignmentConfig(config) {
    if (!config || !MODES[config.mode]) return "連結缺少合法任務設定。";
    if (!Array.isArray(config.unitIds)) return "任務單元設定無效。";
    var distinctCount = new Set(config.unitIds).size;
    if (config.mode === "exam" && (config.unitIds.length < 2 || config.unitIds.length > 3 || distinctCount !== config.unitIds.length)) return "考卷測試任務無效：必須設定 2–3 個不同的康軒單元。";
    if (config.mode === "daily" && config.unitIds.length !== 1) return "隨堂測驗任務無效：只能設定一個康軒單元。";
    if (TERMS.indexOf(config.gradeTerm) === -1) return "任務學期設定無效。";
    if (config.difficultyFilter && config.difficultyFilter !== "mixed" && DIFFICULTIES.indexOf(config.difficultyFilter) === -1) return "任務難度設定無效。";
    return "";
  }
  function saveOutboxEvent(event) {
    var events = [];
    try { events = JSON.parse(localStorage.getItem(OUTBOX_KEY) || "[]"); } catch (error) { events = []; }
    if (!events.some(function (row) { return row.eventId === event.eventId; })) events.push(event);
    localStorage.setItem(OUTBOX_KEY, JSON.stringify(events));
  }
  function readOutbox() {
    try { return JSON.parse(localStorage.getItem(OUTBOX_KEY) || "[]"); } catch (error) { return []; }
  }
  function sha1Hex(value) {
    if (!window.crypto || !crypto.subtle || !window.TextEncoder) return Promise.resolve(hashString(value));
    return crypto.subtle.digest("SHA-1", new TextEncoder().encode(value)).then(function (buffer) {
      return Array.prototype.map.call(new Uint8Array(buffer), function (byte) { return byte.toString(16).padStart(2, "0"); }).join("").slice(0, 16);
    }).catch(function () { return hashString(value); });
  }
  function completeClean(event) {
    return Boolean(event.response.correct) && !Object.keys(event.assist).some(function (key) { return event.assist[key]; });
  }
  function currentAnswerCount(qid) {
    return readOutbox().filter(function (event) { return event.item && event.item.qid === qid; }).length + 1;
  }
  function makeEvent(question, chosen, correct, elapsedMs, assist) {
    var attemptNo = currentAnswerCount(question.qid);
    var base = app.state.sessionId + "|" + question.qid + "|" + attemptNo;
    return sha1Hex(base).then(function (eventId) {
      return {
        schemaVersion: "bobo-event-v1",
        eventId: eventId,
        ts: new Date().toISOString(),
        student: "bobo",
        surface: "html",
        sessionId: app.state.sessionId,
        assignmentId: app.config.assignmentId,
        mode: app.mode,
        item: {
          qid: question.qid,
          provenance: question.provenance,
          sourceMatrixId: question.sourceMatrixId || null,
          originQid: question.originQid || null,
          role: question.role || "primary",
          unitId: question.unitId || null,
          officialContentCode: question.provenance === "generated" ? (question.officialContentCode || null) : null
        },
        response: { chosen: chosen || null, correct: Boolean(correct), elapsedMs: Number.isFinite(elapsedMs) ? elapsedMs : null, attemptNo: attemptNo },
        assist: {
          hintOpened: Boolean(assist.hintOpened),
          conceptOpened: Boolean(assist.conceptOpened),
          solutionViewed: Boolean(assist.solutionViewed),
          answerRevealed: Boolean(assist.answerRevealed)
        }
      };
    });
  }
  function persistState() {
    if (!app.config || !app.state) return;
    localStorage.setItem(SCHEMA + ":assignment:" + app.config.assignmentId, JSON.stringify(app.state));
  }
  function restoreState(config) {
    var key = SCHEMA + ":assignment:" + config.assignmentId;
    try {
      var stored = JSON.parse(localStorage.getItem(key) || "null");
      if (stored && stored.sessionId && Array.isArray(stored.items)) return stored;
    } catch (error) { /* show a fresh offline task */ }
    return { sessionId: randomToken(), started: false, complete: false, index: 0, items: [], selected: {}, answered: {}, assist: {}, flagged: {}, retryAdded: {}, startedAt: null, shownAt: null, result: null, confirmPending: false };
  }
  function showOnly(id) {
    ["start-screen", "question-screen", "result-screen", "practice-error"].forEach(function (name) { byId(name).classList.toggle("is-hidden", name !== id); });
  }
  function setError(message) { byId("practice-error").innerHTML = "<strong>這份任務目前無法開始</strong><br>" + escapeHtml(message) + "<br><br>請回到入口重新選一個有足夠題目的範圍。"; showOnly("practice-error"); }
  function questionKey(question) { return question.qid + "|" + (question.role || "primary") + "|" + (question.originQid || ""); }
  function questionByKey(key) { return app.questions.find(function (question) { return questionKey(question) === key; }); }
  function makeQuestionList(config) {
    var source = config.mode === "past_exam" ? "cap" : "generated";
    var unitIds = Array.from(new Set(config.unitIds || []));
    var pool = getItems(source).filter(function (item) {
      if (item.practiceGradeTerm !== config.gradeTerm) return false;
      if (!config.unitIds || !config.unitIds.length || unitIds.indexOf(item.unitId) === -1) return false;
      if (source === "cap" && config.yearFilter && config.yearFilter !== "mixed" && item.year !== config.yearFilter) return false;
      if (config.difficultyFilter && config.difficultyFilter !== "mixed" && item.difficulty !== config.difficultyFilter) return false;
      return true;
    }).sort(sortById);
    if (source === "cap") {
      if (pool.length < 5) throw new Error("所選範圍目前只有 " + pool.length + " 題可用歷屆原題，未達至少 5 題門檻。");
      return shuffle(pool, config.seed).slice(0, Math.min(config.questionCount, pool.length));
    }
    if (config.mode === "daily") {
      if (pool.length < 8) throw new Error("所選康軒單元目前只有 " + pool.length + " 道可用生成題，未達隨堂至少 8 題門檻。");
      return shuffle(pool, config.seed).slice(0, Math.min(config.questionCount, pool.length));
    }
    var buckets = {};
    pool.forEach(function (item) { (buckets[item.unitId] || (buckets[item.unitId] = [])).push(item); });
    var selected = [];
    unitIds.forEach(function (unitId) {
      var bucket = shuffle(buckets[unitId] || [], config.seed + "|" + unitId);
      if (bucket.length >= 3) selected = selected.concat(bucket.slice(0, 3));
    });
    var chosenKeys = new Set(selected.map(function (item) { return item.qid; }));
    selected = selected.concat(shuffle(pool.filter(function (item) { return !chosenKeys.has(item.qid); }), config.seed + "|fill"));
    if (selected.length < 12) throw new Error("所選考卷單元合計只有 " + selected.length + " 道可用生成題，未達至少 12 題門檻。");
    return selected.slice(0, Math.min(config.questionCount, selected.length));
  }
  function prepareQuestions() {
    try { app.questions = makeQuestionList(app.config); } catch (error) { setError(error.message); return false; }
    app.state.items = app.questions.map(function (question) { return questionKey(question); });
    if (app.state.started || app.state.complete) {
      var baseQuestions = app.questions.slice();
      app.questions = app.state.items.map(function (key) {
        var known = baseQuestions.find(function (item) { return questionKey(item) === key; });
        if (known) return known;
        var parts = key.split("|");
        var retry = (window.BOBO_GENERATED_ITEMS || []).find(function (item) { return item.qid === parts[0]; }) || (window.BOBO_CAP_ITEMS || []).find(function (item) { return item.qid === parts[0]; });
        return retry ? Object.assign({}, retry, { role: parts[1] || "primary", originQid: parts[2] || null }) : null;
      }).filter(Boolean);
    }
    return true;
  }
  function dailyRetryQuestions(question) {
    var existing = new Set(app.questions.map(function (item) { return item.qid; }));
    var fromTemplate = question.sourceMatrixId ? (window.BOBO_GENERATED_ITEMS || []).filter(function (item) {
      return item.sourceMatrixId === question.sourceMatrixId && item.qid !== question.qid && item.unitId === question.unitId && !existing.has(item.qid);
    }).sort(sortById) : [];
    var picked = fromTemplate.slice(0, 2).map(function (item) {
      return Object.assign({}, item, { role: "retry_variant", originQid: question.qid });
    });
    if (picked.length < 2 && question.knowledgePointId) {
      var pickedIds = new Set(picked.map(function (item) { return item.qid; }));
      var fromSameKp = (window.BOBO_GENERATED_ITEMS || []).concat(window.BOBO_CAP_ITEMS || []).filter(function (item) {
        return item.knowledgePointId === question.knowledgePointId && item.qid !== question.qid && !existing.has(item.qid) && !pickedIds.has(item.qid);
      }).sort(sortById).slice(0, 2 - picked.length).map(function (item) {
        return Object.assign({}, item, { role: "retry_variant", originQid: question.qid });
      });
      picked = picked.concat(fromSameKp);
    }
    return picked;
  }
  function renderStart() {
    byId("practice-mode").textContent = modeLabel(app.mode);
    byId("start-title").textContent = modeLabel(app.mode);
    byId("start-scope").textContent = app.config.gradeTerm + "｜" + app.config.unitIds.map(unitLabel).join("、");
    byId("start-meta").innerHTML = "<span class=\"status-pill\">" + app.questions.length + " 題起始題目</span><span class=\"status-pill\">離線可作答</span>" + (app.mode === "past_exam" ? "<span class=\"source-pill\">歷屆會考原題</span>" : "");
    showOnly("start-screen");
  }
  function renderPractice() {
    var question = app.questions[app.state.index];
    app.current = question;
    if (!question) { finishRound(); return; }
    byId("practice-mode").textContent = modeLabel(app.mode);
    byId("practice-progress").textContent = "第 " + (app.state.index + 1) + " / " + app.questions.length + " 題";
    byId("question-source").textContent = question.provenance === "cap" ? ("歷屆會考原題 · " + question.year + " 年第 " + question.number + " 題") : (question.role === "retry_variant" ? "錯後變式" : "原創生成題");
    byId("question-unit").textContent = unitLabel(question.unitId);
    var difficultyPill = byId("question-difficulty");
    if (difficultyPill) {
      if (question.difficulty && DIFFICULTY_LABELS[question.difficulty]) { difficultyPill.textContent = DIFFICULTY_LABELS[question.difficulty]; difficultyPill.classList.remove("is-hidden"); } else { difficultyPill.classList.add("is-hidden"); }
    }
    byId("question-text").textContent = question.text || "（本題以整題圖片呈現）";
    var image = byId("question-image");
    if (question.image) { image.src = assetPrefix + question.image; image.classList.remove("is-hidden"); } else { image.removeAttribute("src"); image.classList.add("is-hidden"); }
    var selected = app.state.selected[questionKey(question)] || "";
    var answered = Boolean(app.state.answered[questionKey(question)]);
    byId("options").innerHTML = (question.options || []).map(function (option, index) {
      var letter = "ABCD"[index];
      return "<button class=\"option-button " + (selected === letter ? "is-selected" : "") + "\" data-option=\"" + letter + "\" " + (answered ? "disabled" : "") + ">" + escapeHtml(option) + "</button>";
    }).join("");
    arrayFrom(document.querySelectorAll(".option-button")).forEach(function (button) { button.addEventListener("click", function () { chooseOption(button.getAttribute("data-option")); }); });
    byId("assist-panel").classList.toggle("is-hidden", app.mode !== "daily" || !answered && false);
    byId("exam-nav").classList.toggle("is-hidden", app.mode === "daily");
    byId("submit-button").textContent = app.mode === "daily" ? (answered ? "下一題" : "確認答案") : "交卷";
    byId("answer-status").classList.toggle("is-hidden", !answered || app.mode !== "daily");
    byId("submit-note").textContent = app.mode === "daily" ? "答錯或使用任何幫助後，會安排同題型預生成變式。" : (app.state.confirmPending ? "仍有未作答題，再按一次「交卷」確認。" : "作答中不顯示正解、提示或詳解。");
    if (answered && app.mode === "daily") {
      var answerRecord = app.state.answered[questionKey(question)];
      byId("answer-status").textContent = answerRecord.correct ? (answerRecord.clean ? "答對" : "答對，但本次使用了幫助") : "答錯";
      byId("answer-status").className = "answer-status " + (answerRecord.correct ? "is-correct" : "is-wrong");
      renderAssistContent(question);
    } else { byId("assist-content").classList.add("is-hidden"); }
    if (!app.state.shownAt) { app.state.shownAt = Date.now(); persistState(); }
    showOnly("question-screen");
  }
  function chooseOption(letter) {
    if (!app.current || app.state.answered[questionKey(app.current)]) return;
    app.state.selected[questionKey(app.current)] = letter;
    app.state.confirmPending = false;
    persistState(); renderPractice();
  }
  function renderAssistContent(question) {
    var key = questionKey(question), assist = app.state.assist[key] || {};
    var support = window.BOBO_CONTENT_SUPPORT && window.BOBO_CONTENT_SUPPORT[question.sourceMatrixId];
    var content = app.state.assistContent || "";
    if (assist.conceptOpened) content = support && support.reviewed ? support.concept : "本題暫無此層內容。";
    if (assist.hintOpened) content = support && support.reviewed ? support.hint : "本題暫無此層內容。";
    if (assist.solutionViewed || assist.answerRevealed) content = "完整解法：\n" + (question.solution || "本題暫無逐步詳解。") + "\n\n正解：" + question.answer;
    byId("assist-content").textContent = content;
    byId("assist-content").classList.toggle("is-hidden", !content);
  }
  function openAssist(kind) {
    if (!app.current || app.mode !== "daily") return;
    var key = questionKey(app.current), assist = app.state.assist[key] || (app.state.assist[key] = { hintOpened: false, conceptOpened: false, solutionViewed: false, answerRevealed: false });
    assist[kind] = true;
    if (kind === "solutionViewed") assist.answerRevealed = true;
    app.state.assistContent = "";
    persistState(); renderPractice();
  }
  async function submitDaily() {
    var question = app.current, key = questionKey(question), selected = app.state.selected[key];
    if (app.state.answered[key]) { app.state.index += 1; app.state.shownAt = Date.now(); persistState(); renderPractice(); return; }
    if (!selected) { byId("submit-note").textContent = "請先選一個答案。"; return; }
    var assist = app.state.assist[key] || { hintOpened: false, conceptOpened: false, solutionViewed: false, answerRevealed: false };
    var correct = selected === question.answer;
    var event = await makeEvent(question, selected, correct, Date.now() - app.state.shownAt, assist);
    saveOutboxEvent(event);
    var clean = completeClean(event);
    app.state.answered[key] = { correct: correct, clean: clean, eventId: event.eventId };
    if (!clean && !app.state.retryAdded[question.qid]) {
      var retries = dailyRetryQuestions(question);
      app.state.retryAdded[question.qid] = retries.length;
      retries.forEach(function (retry) { app.questions.push(retry); app.state.items.push(questionKey(retry)); });
    }
    app.state.shownAt = null; persistState(); renderPractice();
  }
  function unansweredCount() { return app.questions.filter(function (question) { return !app.state.selected[questionKey(question)]; }).length; }
  function renderResult() {
    var result = app.state.result || { events: [] }, events = result.events || [];
    var correct = events.filter(function (event) { return event.response.correct; }).length;
    var clean = events.filter(completeClean).length;
    byId("practice-mode").textContent = modeLabel(app.mode);
    byId("result-title").textContent = app.mode === "daily" ? "這輪修補完成" : "交卷完成";
    byId("result-summary").innerHTML = "<div class=\"stat-box\"><strong>" + correct + " / " + events.length + "</strong><small>答對題數</small></div><div class=\"stat-box\"><strong>" + clean + "</strong><small>乾淨答對</small></div><div class=\"stat-box\"><strong>" + Math.round((Date.now() - app.state.startedAt) / 1000) + " 秒</strong><small>本回合耗時</small></div>";
    byId("result-details").innerHTML = events.map(function (event) {
      var q = app.questions.find(function (item) { return item.qid === event.item.qid && (item.role || "primary") === event.item.role; }) || app.questions.find(function (item) { return item.qid === event.item.qid; });
      var title = event.item.provenance === "cap" ? (event.item.qid + " · 歷屆會考原題") : event.item.qid;
      return "<details open class=\"detail-row " + (event.response.correct ? "correct" : "wrong") + "\"><summary>" + escapeHtml(title) + "｜" + (event.response.correct ? "答對" : "答錯") + "</summary><div class=\"detail-body\">正解：" + escapeHtml(q ? q.answer : "") + "\n" + escapeHtml(q && q.solution ? q.solution : "本題暫無逐步詳解。") + "</div></details>";
    }).join("") + (app.mode === "past_exam" ? "<p class=\"inline-note\">弱點推薦只回指康軒單元，這些歷屆原題不會自動變成 retry 題。</p>" : "");
    showOnly("result-screen");
  }
  async function submitExam() {
    var missing = unansweredCount();
    if (missing && !app.state.confirmPending) { app.state.confirmPending = true; persistState(); renderPractice(); return; }
    var events = [];
    for (var i = 0; i < app.questions.length; i += 1) {
      var question = app.questions[i], key = questionKey(question), selected = app.state.selected[key] || null;
      var event = await makeEvent(question, selected, selected === question.answer, null, { hintOpened: false, conceptOpened: false, solutionViewed: false, answerRevealed: false });
      saveOutboxEvent(event); events.push(event);
    }
    app.state.result = { events: events };
    finishRound();
  }
  function finishRound() {
    if (!app.state.result) {
      app.state.result = { events: readOutbox().filter(function (event) { return event.assignmentId === app.config.assignmentId && event.sessionId === app.state.sessionId; }) };
    }
    app.state.complete = true;
    var events = app.state.result.events || [];
    var summary = {
      schemaVersion: "bobo-event-v1",
      assignmentId: app.config.assignmentId,
      sessionId: app.state.sessionId,
      mode: app.mode,
      gradeTerm: app.config.gradeTerm,
      unitIds: app.config.unitIds,
      questionCount: events.length,
      cleanCorrect: events.filter(completeClean).length,
      retryCount: events.filter(function (event) { return !completeClean(event); }).length,
      elapsedMs: Math.max(0, Date.now() - app.state.startedAt),
      weakUnits: Array.from(new Set(events.filter(function (event) { return !completeClean(event); }).map(function (event) { return event.item.unitId; }).filter(Boolean))),
      completedAt: new Date().toISOString()
    };
    app.state.result.summary = summary;
    var summaries = [];
    try { summaries = JSON.parse(localStorage.getItem(SUMMARY_KEY) || "[]"); } catch (error) { summaries = []; }
    if (!summaries.some(function (item) { return item.assignmentId === summary.assignmentId; })) summaries.push(summary);
    localStorage.setItem(SUMMARY_KEY, JSON.stringify(summaries));
    persistState(); renderResult();
  }
  function startRound() {
    app.state.started = true; app.state.startedAt = Date.now(); app.state.shownAt = Date.now(); app.state.confirmPending = false; persistState(); renderPractice();
  }
  function wirePractice() {
    app.config = readHashConfig();
    if (!app.config && isDemo) {
      var all = window.BOBO_UNIT_CATALOG || [];
      var term;
      if (isDemo === "exam") {
        var examTerms = TERMS.map(function (candidateTerm) {
          var candidates = all.filter(function (unit) { return unit.gradeTerm === candidateTerm && unit.examEligible; });
          return { term: candidateTerm, candidates: candidates, total: candidates.reduce(function (sum, unit) { return sum + unit.generatedAvailable; }, 0) };
        }).filter(function (group) { return group.candidates.length >= 2 && group.total >= 12; }).sort(function (a, b) { return b.total - a.total; });
        var bestExam = examTerms[0];
        term = bestExam && bestExam.candidates[0];
      } else {
        var readyKey = isDemo === "daily" ? "dailyReady" : "pastExamReady";
        term = all.find(function (unit) { return unit[readyKey]; });
      }
      var units = isDemo === "exam" ? all.filter(function (unit) { return unit.gradeTerm === (term && term.gradeTerm) && unit.examEligible; }).sort(function (a, b) { return b.generatedAvailable - a.generatedAvailable; }).slice(0, 3) : [term];
      app.config = { assignmentId: "demo-" + isDemo, mode: isDemo, gradeTerm: term ? term.gradeTerm : "國一上", unitIds: units.filter(Boolean).map(function (unit) { return unit.unitId; }), questionCount: isDemo === "daily" ? 8 : (isDemo === "past_exam" ? 5 : 12), yearFilter: "mixed", seed: "demo-seed-" + isDemo };
    }
    var configError = validateAssignmentConfig(app.config);
    if (configError) { setError(configError); return; }
    app.mode = app.config.mode;
    app.state = restoreState(app.config);
    if (!prepareQuestions()) return;
    byId("start-button").addEventListener("click", startRound);
    byId("submit-button").addEventListener("click", function () { if (app.mode === "daily") submitDaily(); else submitExam(); });
    byId("prev-button").addEventListener("click", function () { if (app.state.index > 0) { app.state.index -= 1; app.state.shownAt = Date.now(); app.state.confirmPending = false; persistState(); renderPractice(); } });
    byId("next-button").addEventListener("click", function () { if (app.state.index < app.questions.length - 1) { app.state.index += 1; app.state.shownAt = Date.now(); persistState(); renderPractice(); } });
    byId("mark-button").addEventListener("click", function () { var key = questionKey(app.current); app.state.flagged[key] = !app.state.flagged[key]; persistState(); byId("mark-button").textContent = app.state.flagged[key] ? "已標記再檢查" : "標記再檢查"; });
    arrayFrom(document.querySelectorAll("[data-assist]")).forEach(function (button) { button.addEventListener("click", function () { openAssist(button.getAttribute("data-assist")); }); });
    if (app.state.complete) { renderResult(); return; }
    if (!app.state.started) renderStart(); else renderPractice();
  }
  function optionText(value) { return String(value == null ? "" : value); }
  function wireBuilder() {
    var mode = "daily", termSelect = byId("term-select"), unitSelect = byId("unit-select"), multi = byId("multi-unit-select"), countSelect = byId("count-select"), yearSelect = byId("year-select"), difficultySelect = byId("difficulty-select");
    TERMS.forEach(function (term) { termSelect.appendChild(new Option(term, term)); });
    var initialUnit = (window.BOBO_UNIT_CATALOG || []).find(function (unit) { return unit.dailyReady; }) || (window.BOBO_UNIT_CATALOG || [])[0];
    termSelect.value = initialUnit ? initialUnit.gradeTerm : "國一上";
    function unitsForTerm() { return (window.BOBO_UNIT_CATALOG || []).filter(function (unit) { return unit.gradeTerm === termSelect.value; }); }
    function refill() {
      var units = unitsForTerm(), readyKey = mode === "daily" ? "dailyReady" : mode === "exam" ? "examEligible" : "pastExamReady";
      var ready = units.filter(function (unit) { return unit[readyKey]; });
      byId("builder-title").textContent = modeLabel(mode);
      byId("unit-field").classList.toggle("is-hidden", mode !== "daily");
      byId("multi-unit-field").classList.toggle("is-hidden", mode === "daily");
      byId("year-field").classList.toggle("is-hidden", mode !== "past_exam");
      unitSelect.innerHTML = ready.map(function (unit) { return "<option value=\"" + unit.unitId + "\">" + escapeHtml(unit.courseName) + "（" + unit.generatedAvailable + " 題）</option>"; }).join("");
      multi.innerHTML = ready.map(function (unit) { var count = mode === "past_exam" ? unit.capAvailable : unit.generatedAvailable; return "<option value=\"" + unit.unitId + "\">" + escapeHtml(unit.courseName) + "（" + count + " 題）</option>"; }).join("");
      arrayFrom(multi.options).forEach(function (option, index) { option.selected = mode === "exam" ? index < 3 : index === 0; });
      var counts = mode === "daily" ? [8,9,10,11,12] : mode === "exam" ? [12,13,14,15,16,17,18,19,20] : [5,6,7,8,9,10];
      countSelect.innerHTML = counts.map(function (count) { return "<option value=\"" + count + "\">" + count + " 題</option>"; }).join("");
      countSelect.value = String(MODES[mode].defaultCount);
      var years = new Set();
      (window.BOBO_CAP_ITEMS || []).filter(function (item) { return item.practiceGradeTerm === termSelect.value && ready.some(function (unit) { return unit.unitId === item.unitId; }); }).forEach(function (item) { years.add(item.year); });
      yearSelect.innerHTML = "<option value=\"mixed\">混合歷屆</option>" + Array.from(years).sort().map(function (year) { return "<option value=\"" + year + "\">" + year + " 年</option>"; }).join("");
      byId("capacity-note").textContent = ready.length ? (ready.length + " 個單元可開始") : "目前此學期沒有達門檻的單元";
    }
    arrayFrom(document.querySelectorAll(".mode-card")).forEach(function (card) { card.addEventListener("click", function () { mode = card.getAttribute("data-mode"); arrayFrom(document.querySelectorAll(".mode-card")).forEach(function (other) { other.classList.toggle("is-selected", other === card); }); refill(); }); });
    termSelect.addEventListener("change", refill);
    byId("create-assignment").addEventListener("click", function () {
      var unitIds = mode === "daily" ? [unitSelect.value].filter(Boolean) : arrayFrom(multi.selectedOptions).map(function (option) { return option.value; });
      if (!unitIds.length) { byId("assignment-result").classList.remove("is-hidden"); byId("assignment-result").textContent = "目前範圍沒有可用單元，請換一個學期或縮小選擇。"; return; }
      if (mode === "exam" && (unitIds.length < 2 || unitIds.length > 3 || new Set(unitIds).size !== unitIds.length)) { byId("assignment-result").classList.remove("is-hidden"); byId("assignment-result").textContent = "考卷測試請選 2–3 個不同的單元。"; return; }
      var assignmentId = "math-" + mode + "-" + Date.now().toString(36) + "-" + hashString(randomToken());
      var config = { assignmentId: assignmentId, mode: mode, gradeTerm: termSelect.value, unitIds: unitIds, questionCount: Number(countSelect.value), yearFilter: mode === "past_exam" ? yearSelect.value : null, difficultyFilter: difficultySelect.value, seed: assignmentId + "|seed" };
      var encoded = encodeConfig(config), link = "practice.html#assignment=" + encoded;
      byId("assignment-result").classList.remove("is-hidden");
      byId("assignment-result").innerHTML = "<strong>任務已建立</strong><span>把下面連結交給 Bobo，開啟後直接開始：</span><a class=\"assignment-link\" href=\"" + link + "\">" + escapeHtml(link) + "</a><a class=\"primary-button button-link\" href=\"" + link + "\">開啟任務預覽</a>";
    });
    refill();
  }
  if (document.body.getAttribute("data-page") === "builder") wireBuilder(); else wirePractice();
  window.BOBO_APP = app;
  window.BOBO_EVENT_ENDPOINT = EVENT_ENDPOINT;
})();
