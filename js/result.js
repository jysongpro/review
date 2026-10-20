import { db } from "./firebase-config.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { exportToExcel } from "./common.js";

const $ = (id) => document.getElementById(id);

let lastRows = [];
let _allTargets = [];

// =========================================================================
// 조회 조건(과정/대학/캠퍼스/학과)은 고정 목록이 아니라, 실제 업로드된
// 교육운영계획서 검토목록(targets 컬렉션)을 분석해 실존하는 값만 옵션으로 만든다.
// - 과정 / 학과 : "전체" 옵션을 추가해 선택하지 않아도 전부 조회 가능
// - 대학 / 캠퍼스 : "전체" 없이 실제 존재하는 값만 나열 (정확한 소속 선택을 유도)
// =========================================================================

function uniqueSorted(values) {
  return [...new Set(values.filter(v => v !== undefined && v !== null && v !== ""))]
    .sort((a, b) => String(a).localeCompare(String(b), "ko"));
}

function fillSelect(selectEl, values, withAll) {
  selectEl.innerHTML = "";
  if (withAll) {
    const op = document.createElement("option");
    op.value = "";
    op.textContent = "전체";
    selectEl.appendChild(op);
  }
  values.forEach(v => {
    const op = document.createElement("option");
    op.value = v;
    op.textContent = v;
    selectEl.appendChild(op);
  });
  if (!withAll && values.length) selectEl.value = values[0];
}

async function initFilters() {
  const snap = await getDocs(collection(db, "targets"));
  _allTargets = [];
  snap.forEach(d => _allTargets.push({ id: d.id, ...d.data() }));

  const courses = uniqueSorted(_allTargets.map(t => t.course));
  const univs = uniqueSorted(_allTargets.map(t => t.collage));
  const campuses = uniqueSorted(_allTargets.map(t => t.campus));
  const depts = uniqueSorted(_allTargets.map(t => t.dept));

  fillSelect($("courseSel"), courses, true);
  fillSelect($("univSel"), univs, false);
  fillSelect($("campusSel"), campuses, false);
  fillSelect($("deptSel"), depts, true);
}
initFilters();

$("searchBtn").addEventListener("click", async () => {
  const course = $("courseSel").value;
  const univ = $("univSel").value;
  const campus = $("campusSel").value;
  const dept = $("deptSel").value;

  const [reviewersSnap, itemsSnap, resultsSnap] = await Promise.all([
    getDocs(collection(db, "reviewers")),
    getDocs(collection(db, "reviewItems")),
    getDocs(collection(db, "reviewResults"))
  ]);
  const targets = {}; _allTargets.forEach(t => targets[t.id] = t);
  const reviewers = {}; reviewersSnap.forEach(d => reviewers[d.id] = d.data());
  const items = {}; itemsSnap.forEach(d => items[d.id] = d.data());

  const rows = [];
  resultsSnap.forEach(d => {
    const r = d.data();
    const t = targets[r.targetId] || {};
    if (course && t.course !== course) return;
    if (univ && t.collage !== univ) return;
    if (campus && t.campus !== campus) return;
    if (dept && t.dept !== dept) return;
    const rev = reviewers[r.reviewerId] || {};
    const it = items[r.itemId] || {};
    rows.push({
      "과정": t.course||"", "대학": t.collage||"", "캠퍼스": t.campus||"", "학과": t.dept||"", "전공과정": t.major||"",
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
    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;color:#999;">조회된 결과가 없습니다.</td></tr>`;
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
