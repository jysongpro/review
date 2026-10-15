import { db } from "./firebase-config.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { buildCourseOptions, exportToExcel } from "./common.js";

const $ = (id) => document.getElementById(id);
buildCourseOptions($("courseSel"));

let lastRows = [];

$("searchBtn").addEventListener("click", async () => {
  const course = $("courseSel").value;
  const campus = $("campusSel").value.trim();
  const dept = $("deptSel").value.trim();
  const major = $("majorSel").value.trim();

  const [targetsSnap, reviewersSnap, itemsSnap, resultsSnap] = await Promise.all([
    getDocs(collection(db, "targets")),
    getDocs(collection(db, "reviewers")),
    getDocs(collection(db, "reviewItems")),
    getDocs(collection(db, "reviewResults"))
  ]);
  const targets = {}; targetsSnap.forEach(d => targets[d.id] = d.data());
  const reviewers = {}; reviewersSnap.forEach(d => reviewers[d.id] = d.data());
  const items = {}; itemsSnap.forEach(d => items[d.id] = d.data());

  const rows = [];
  resultsSnap.forEach(d => {
    const r = d.data();
    const t = targets[r.targetId] || {};
    if (course && t.course !== course) return;
    if (campus && !(t.campus||"").includes(campus)) return;
    if (dept && !(t.dept||"").includes(dept)) return;
    if (major && !(t.major||"").includes(major)) return;
    const rev = reviewers[r.reviewerId] || {};
    const it = items[r.itemId] || {};
    rows.push({
      "과정구분": t.course||"", "캠퍼스": t.campus||"", "학과": t.dept||"", "전공과정": t.major||"",
      "검토위원": rev.name||"", "검토분야": it.field||"", "검토문항": it.question||"",
      "결과": r.result||"", "검토의견": r.opinion||""
    });
  });

  lastRows = rows;
  renderTable(rows);
  $("resultCard").style.display = "block";
});

function renderTable(rows) {
  const tbody = $("resultTable").querySelector("tbody");
  tbody.innerHTML = "";
  if (rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;color:#999;">조회된 결과가 없습니다.</td></tr>`;
    return;
  }
  rows.forEach(row => {
    const tr = document.createElement("tr");
    tr.innerHTML = Object.values(row).map(v =>
      `<td>${v === "적합" ? `<span class="badge ok">적합</span>` : v === "부적합" ? `<span class="badge bad">부적합</span>` : v}</td>`
    ).join("");
    tbody.appendChild(tr);
  });
}

$("exportBtn").addEventListener("click", () => {
  exportToExcel(lastRows, `검토결과조회_${$("courseSel").value || "전체"}.xlsx`);
});
$("printBtn").addEventListener("click", () => window.print());
