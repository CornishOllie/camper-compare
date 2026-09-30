(function () {
  "use strict";
  var SUPABASE_URL = "https://fzmkvpwylvepakksrrxw.supabase.co";
  var SUPABASE_KEY = "sb_publishable_F61fh5y4bn4lURto-w4m-g_PcqAZSNq";
  var TABLE = "camper_scores";
  var CODE_KEY = "recipes-family-code"; // same code as the recipes app
  var ME_KEY = "camper-me";
  var LOCAL_KEY = "camper-local";
  var SCORERS = ["Ollie", "Jenny", "Claude"];

  var $ = function (s) { return document.querySelector(s); };
  var esc = function (t) { return String(t).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
  };

  var ITEMS = [];
  SECTIONS.forEach(function (s) { s.items.forEach(function (it) { it.section = s.id; ITEMS.push(it); }); });

  // state: scores[scorer][itemId][setupId] = 0..3 ; weights[itemId] = 1..3
  var scores = { Ollie: {}, Jenny: {}, Claude: {} };
  var weights = {};
  ITEMS.forEach(function (it) {
    weights[it.id] = it.w;
    scores.Claude[it.id] = {};
    SETUPS.forEach(function (s, i) { if (it.claude && it.claude[i] != null) scores.Claude[it.id][s.id] = it.claude[i]; });
  });
  var me = store.get(ME_KEY);
  var code = store.get(CODE_KEY);
  var sb = null, synced = false, openSections = {};

  // Local fallback so nothing is lost if sync is unavailable.
  try {
    var loc = JSON.parse(store.get(LOCAL_KEY) || "null");
    if (loc) { if (loc.Ollie) scores.Ollie = loc.Ollie; if (loc.Jenny) scores.Jenny = loc.Jenny; if (loc.weights) Object.assign(weights, loc.weights); }
  } catch (e) {}
  function saveLocal() { store.set(LOCAL_KEY, JSON.stringify({ Ollie: scores.Ollie, Jenny: scores.Jenny, weights: weights })); }

  // ---- totals ----
  function totals(scorer) {
    var out = {};
    SETUPS.forEach(function (s) { out[s.id] = { got: 0, max: 0, n: 0, bySec: {} }; });
    ITEMS.forEach(function (it) {
      var w = weights[it.id] || 1;
      SETUPS.forEach(function (s) {
        var v = (scores[scorer][it.id] || {})[s.id];
        var t = out[s.id];
        t.bySec[it.section] = t.bySec[it.section] || { got: 0, max: 0 };
        if (v == null) return;
        t.got += v * w; t.max += 3 * w; t.n++;
        t.bySec[it.section].got += v * w; t.bySec[it.section].max += 3 * w;
      });
    });
    return out;
  }
  var pct = function (t) { return t.max ? Math.round(100 * t.got / t.max) : null; };

  // ---- render ----
  function renderSummary() {
    var html = "";
    var anyMine = function (sc) { return Object.keys(scores[sc]).some(function (k) { return Object.keys(scores[sc][k] || {}).length; }); };
    html += '<div class="setups">';
    SETUPS.forEach(function (s) {
      html += '<div class="setup card" style="--c:var(--' + s.id + ')"><b>' + esc(s.name) + '</b><span class="small muted">' + esc(s.sub) + '</span>' +
        '<div class="small" style="margin-top:6px">£' + s.price.toLocaleString("en-GB") + '</div>';
      SCORERS.forEach(function (sc) {
        var t = totals(sc)[s.id], p = pct(t);
        html += '<div class="total">' + (p == null ? "–" : p + "%") + ' <small>' + sc + (p == null ? "" : ", " + t.n + " scored") + '</small></div>';
      });
      html += "</div>";
    });
    html += "</div>";
    html += '<p class="small muted">Percent of the maximum possible, weighted, over the points each person has scored. Claude\'s scores are a starting suggestion from the facts known on 30 Sep 2026; unknowns are left unscored.</p>';

    // deal-breakers
    html += '<div class="card"><h2>Deal-breakers (pass or fail)</h2><ul class="db">';
    DEALBREAKERS.forEach(function (d) {
      html += "<li><b>" + esc(d.name) + "</b>";
      SETUPS.forEach(function (s) {
        var f = d.facts[s.id], tbc = /^TBC/.test(f);
        html += '<div class="row" style="--c:var(--' + s.id + ')"><span class="lab">' + s.short + '</span><span class="fact' + (tbc ? " tbc" : "") + '">' + esc(f) + "</span></div>";
      });
      html += "</li>";
    });
    html += "</ul></div>";

    // by section
    html += '<div class="card"><h2>By section</h2><div class="scroll"><table><thead><tr><th>Section</th>';
    SETUPS.forEach(function (s) { html += '<th class="n" style="color:var(--' + s.id + ')">' + s.short + "</th>"; });
    html += "</tr></thead><tbody>";
    var T = {}; SCORERS.forEach(function (sc) { T[sc] = totals(sc); });
    SECTIONS.forEach(function (sec) {
      html += "<tr><td>" + esc(sec.name) + "</td>";
      SETUPS.forEach(function (s) {
        var cells = SCORERS.filter(function (sc) { return sc === "Claude" || anyMine(sc); }).map(function (sc) {
          var b = T[sc][s.id].bySec[sec.id]; var p = b && b.max ? Math.round(100 * b.got / b.max) : null;
          return '<span title="' + sc + '">' + sc[0] + " " + (p == null ? "–" : p) + "</span>";
        });
        html += '<td class="n small">' + cells.join("<br>") + "</td>";
      });
      html += "</tr>";
    });
    html += "</tbody></table></div><p class='small muted'>O = Ollie, J = Jenny, C = Claude. Percent of that section's maximum.</p></div>";

    // disagreements
    var dis = [];
    ITEMS.forEach(function (it) {
      SETUPS.forEach(function (s) {
        var o = (scores.Ollie[it.id] || {})[s.id], j = (scores.Jenny[it.id] || {})[s.id];
        if (o != null && j != null && Math.abs(o - j) >= 2) dis.push(esc(it.name) + " (" + s.short + "): Ollie " + o + ", Jenny " + j);
      });
    });
    if (dis.length) html += '<div class="card"><h2>Where you disagree most</h2><ul><li>' + dis.join("</li><li>") + "</li></ul></div>";

    // open questions
    var tbc = 0; ITEMS.forEach(function (it) { SETUPS.forEach(function (s) { if (/^TBC/.test(it.facts[s.id])) tbc++; }); });
    html += '<p class="small muted">' + tbc + ' facts still to confirm, marked in amber on the Score tab.</p>';
    $("#summary").innerHTML = html;
  }

  function renderScore() {
    var html = "";
    if (!me) html += '<div class="banner">Pick "I am Ollie" or "I am Jenny" at the top to start scoring.</div>';
    html += '<div class="key"><span>Score: 0 missing · 1 basic · 2 good · 3 excellent</span><span>Weight: 1 nice · 2 important · 3 essential (shared)</span></div>';
    SECTIONS.forEach(function (sec) {
      var done = 0, all = sec.items.length * SETUPS.length;
      if (me) sec.items.forEach(function (it) { done += Object.keys(scores[me][it.id] || {}).length; });
      html += '<details class="sec" data-sec="' + sec.id + '"' + (openSections[sec.id] ? " open" : "") + '><summary><h2>' + esc(sec.name) + '</h2><span class="small muted">' + (me ? done + "/" + all + " scored" : sec.items.length + " points") + "</span></summary>";
      sec.items.forEach(function (it) {
        html += '<div class="item"><div class="ihead"><div><div class="iname">' + esc(it.name) + '</div><div class="hint">' + esc(it.hint || "") + "</div></div>";
        html += '<div class="weight">Weight';
        [1, 2, 3].forEach(function (w) { html += '<button data-w="' + w + '" data-item="' + it.id + '" aria-pressed="' + (weights[it.id] === w) + '">' + w + "</button>"; });
        html += "</div></div>";
        SETUPS.forEach(function (s) {
          var f = it.facts[s.id] || "TBC.", tbc = /^TBC/.test(f);
          html += '<div class="row" style="--c:var(--' + s.id + ')"><span class="lab">' + s.short + '</span><span class="fact' + (tbc ? " tbc" : "") + '">' + esc(f) + "</span>";
          html += '<div class="scores">';
          var mine = me ? (scores[me][it.id] || {})[s.id] : null;
          [0, 1, 2, 3].forEach(function (v) {
            html += '<button class="sc" ' + (me ? "" : "disabled ") + 'data-item="' + it.id + '" data-setup="' + s.id + '" data-v="' + v + '" aria-pressed="' + (mine === v) + '">' + v + "</button>";
          });
          var oth = SCORERS.filter(function (sc) { return sc !== me; }).map(function (sc) {
            var v = (scores[sc][it.id] || {})[s.id]; return v == null ? null : sc + " " + v;
          }).filter(Boolean);
          if (oth.length) html += '<span class="others">' + oth.join(" · ") + "</span>";
          html += "</div></div>";
        });
        html += "</div>";
      });
      html += "</details>";
    });
    $("#score").innerHTML = html;
  }

  function render() {
    document.querySelectorAll("[data-me]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.me === me)); });
    renderSummary(); renderScore();
  }

  // ---- sync ----
  function banner(msg) { $("#syncBanner").innerHTML = msg ? '<div class="banner">' + msg + "</div>" : ""; }
  var pushTimer = {};
  function push(scorer) {
    saveLocal();
    if (!sb || !synced) return;
    clearTimeout(pushTimer[scorer]);
    pushTimer[scorer] = setTimeout(function () {
      var payload = scorer === "_weights" ? weights : scores[scorer];
      sb.from(TABLE).upsert({ family_code: code, scorer: scorer, data: payload, updated_at: new Date().toISOString() }, { onConflict: "family_code,scorer" })
        .then(function (r) { if (r.error) banner("Couldn't save to the cloud (" + esc(r.error.message) + "). Saved on this phone."); });
    }, 400);
  }
  function applyRow(row) {
    if (!row || !row.data) return;
    if (row.scorer === "_weights") Object.assign(weights, row.data);
    else if (row.scorer === "Ollie" || row.scorer === "Jenny") scores[row.scorer] = row.data;
  }
  function connect() {
    if (!window.supabase || !code) { banner("Offline: scores are saved on this phone only."); return; }
    banner("Connecting… until sync connects, scores are saved on this phone only.");
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    sb.from(TABLE).select("scorer,data").eq("family_code", code).then(function (r) {
      if (r.error) { banner("Sync isn't set up yet, so scores are saved on this phone only."); return; }
      synced = true; banner("");
      var had = {};
      (r.data || []).forEach(function (row) { had[row.scorer] = true; applyRow(row); });
      // First run on this device: push anything entered offline that the cloud lacks.
      ["Ollie", "Jenny"].forEach(function (sc) { if (!had[sc] && Object.keys(scores[sc]).length) push(sc); });
      saveLocal(); render();
      sb.channel("camper-" + code).on("postgres_changes", { event: "*", schema: "public", table: TABLE, filter: "family_code=eq." + code },
        function (p) { if (p.new && p.new.scorer !== me) { applyRow(p.new); saveLocal(); render(); } }).subscribe();
    }).catch(function () { banner("Sync isn't available, so scores are saved on this phone only."); });
  }

  // ---- events ----
  document.addEventListener("click", function (e) {
    var t = e.target.closest("button"); if (!t) return;
    if (t.dataset.view) {
      document.querySelectorAll(".tab").forEach(function (b) { b.setAttribute("aria-pressed", String(b === t)); });
      $("#summary").hidden = t.dataset.view !== "summary"; $("#score").hidden = t.dataset.view !== "score";
      return;
    }
    if (t.dataset.me) { me = t.dataset.me; store.set(ME_KEY, me); render(); return; }
    if (t.dataset.w) { weights[t.dataset.item] = Number(t.dataset.w); push("_weights"); render(); return; }
    if (t.dataset.v && me) {
      var it = t.dataset.item, s = t.dataset.setup, v = Number(t.dataset.v);
      scores[me][it] = scores[me][it] || {};
      if (scores[me][it][s] === v) delete scores[me][it][s]; else scores[me][it][s] = v; // tap again to clear
      push(me); render();
    }
  });
  document.addEventListener("toggle", function (e) {
    if (e.target.matches && e.target.matches("details.sec")) openSections[e.target.dataset.sec] = e.target.open;
  }, true);
  $("#codeGo").addEventListener("click", function () {
    var v = $("#codeIn").value.trim(); if (v.length < 4) return;
    code = v; store.set(CODE_KEY, code); $("#gate").hidden = true; connect();
  });

  render();
  if (code) connect(); else $("#gate").hidden = false;
})();
