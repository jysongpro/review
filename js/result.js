import { db } from "./firebase-config.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { exportToExcel, sortAndLabelItems } from "./common.js";

const $ = (id) => document.getElementById(id);

// =========================================================================
// 조회 조건(과정/대학/캠퍼스/학과)은 고정 목록이 아니라, 실제 업로드된
// 교육운영계획서 검토목록(targets 컬렉션)을 분석해 실존하는 값만 옵션으로 만든다.
// - 과정 / 학과 : "전체" 옵션을 추가해 선택하지 않아도 전부 조회 가능
// - 대학 / 캠퍼스 : "전체" 없이 실제 존재하는 값만 나열 (정확한 소속 선택을 유도)
//
// 조회 결과는 관리자 "검토결과 조회" 화면과 동일하게 검토대상(targets) +
// 배정된 검토위원 1명을 기준으로 한 행으로 구성하고, 컬럼은
// 대학/캠퍼스/학과/전공/계열/검토위원/최종결과/검토의견서보기 로 표시한다.
// =========================================================================

let lastRows = [];
let _allTargets = [];
let _resultsContext = { targets: {}, reviewers: {}, items: {}, resultsByKey: {}, submissions: {} };

function normalizePhone(v) {
  return (v || "").toString().replace(/[^0-9]/g, "");
}

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

// 과정 선택 -> 해당 과정의 대학 목록, 대학 선택 -> 해당 과정+대학의 캠퍼스 목록,
// 캠퍼스 선택 -> 해당 과정+대학+캠퍼스의 학과 목록 순으로 연동되어 선택 범위가 좁혀진다.
function filteredTargets({ uptoCourse, uptoUniv, uptoCampus } = {}) {
  const course = $("courseSel").value;
  const univ = $("univSel").value;
  const campus = $("campusSel").value;
  return _allTargets.filter(t => {
    if (uptoCourse !== false && course && t.course !== course) return false;
    if (uptoUniv !== false && univ && t.collage !== univ) return false;
    if (uptoCampus !== false && campus && t.campus !== campus) return false;
    return true;
  });
}

function refreshUniv() {
  const arr = filteredTargets({ uptoUniv: false, uptoCampus: false });
  fillSelect($("univSel"), uniqueSorted(arr.map(t => t.collage)), false);
}
function refreshCampus() {
  const arr = filteredTargets({ uptoCampus: false });
  fillSelect($("campusSel"), uniqueSorted(arr.map(t => t.campus)), false);
}
function refreshDept() {
  const arr = filteredTargets();
  fillSelect($("deptSel"), uniqueSorted(arr.map(t => t.dept)), true);
}

async function initFilters() {
  const snap = await getDocs(collection(db, "targets"));
  _allTargets = [];
  snap.forEach(d => _allTargets.push({ id: d.id, ...d.data() }));

  const courses = uniqueSorted(_allTargets.map(t => t.course));
  fillSelect($("courseSel"), courses, true);
  refreshUniv();
  refreshCampus();
  refreshDept();

  $("courseSel").addEventListener("change", () => { refreshUniv(); refreshCampus(); refreshDept(); });
  $("univSel").addEventListener("change", () => { refreshCampus(); refreshDept(); });
  $("campusSel").addEventListener("change", () => { refreshDept(); });
}
initFilters();

$("searchBtn").addEventListener("click", async () => {
  const course = $("courseSel").value;
  const univ = $("univSel").value;
  const campus = $("campusSel").value;
  const dept = $("deptSel").value;

  const [reviewersSnap, itemsSnap, resultsSnap, submissionsSnap] = await Promise.all([
    getDocs(collection(db, "reviewers")),
    getDocs(collection(db, "reviewItems")),
    getDocs(collection(db, "reviewResults")),
    getDocs(collection(db, "reviewSubmissions"))
  ]);
  const targets = {}; _allTargets.forEach(t => targets[t.id] = t);
  const reviewers = {}; reviewersSnap.forEach(d => reviewers[d.id] = { id: d.id, ...d.data() });
  const items = {}; itemsSnap.forEach(d => items[d.id] = { id: d.id, ...d.data() });

  const resultsByKey = {};
  resultsSnap.forEach(d => {
    const r = d.data();
    const key = `${r.targetId}_${r.reviewerId}`;
    if (!resultsByKey[key]) resultsByKey[key] = [];
    resultsByKey[key].push({ id: d.id, ...r });
  });
  const submissions = {};
  submissionsSnap.forEach(d => submissions[d.id] = { id: d.id, ...d.data() });

  _resultsContext = { targets, reviewers, items, resultsByKey, submissions };

  const rows = [];
  Object.values(targets).forEach(t => {
    if (course && t.course !== course) return;
    if (univ && t.collage !== univ) return;
    if (campus && t.campus !== campus) return;
    if (dept && t.dept !== dept) return;
    const phone = normalizePhone(t.reviewerAssigned);
    if (!phone) return;
    const rev = reviewers[phone];
    if (!rev) return;
    const key = `${t.id}_${phone}`;
    const sub = submissions[key];
    rows.push({
      "대학": t.collage || "", "캠퍼스": t.campus || "", "학과": t.dept || "", "전공": t.major || "", "계열": t.cate || "",
      "검토위원": rev.name || "", "최종결과": (sub && sub.finalResult) || "미정",
      targetId: t.id, reviewerId: rev.id
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
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:#999;">조회된 결과가 없습니다.</td></tr>`;
    return;
  }
  rows.forEach(row => {
    const finalBadge = row["최종결과"] === "적합" ? `<span class="badge ok">적합</span>`
      : row["최종결과"] === "부적합" ? `<span class="badge bad">부적합</span>`
      : row["최종결과"];
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${row["대학"]}</td><td>${row["캠퍼스"]}</td><td>${row["학과"]}</td><td>${row["전공"]}</td><td>${row["계열"]}</td>
      <td>${row["검토위원"]}</td><td>${finalBadge}</td>
      <td><button class="btn small secondary" onclick="window.__viewOpinion('${row.targetId}','${row.reviewerId}')">검토의견서 보기</button></td>`;
    tbody.appendChild(tr);
  });
}

$("exportBtn").addEventListener("click", () => {
  const excelRows = lastRows.map(r => ({
    "대학": r["대학"], "캠퍼스": r["캠퍼스"], "학과": r["학과"], "전공": r["전공"], "계열": r["계열"],
    "검토위원": r["검토위원"], "최종결과": r["최종결과"]
  }));
  exportToExcel(excelRows, `검토결과조회_${$("courseSel").value || "전체"}.xlsx`);
});
$("printBtn").addEventListener("click", () => window.print());

// ---- 검토의견서 보기 모달 ----
window.__viewOpinion = (targetId, reviewerId) => {
  const { targets, reviewers, items, resultsByKey, submissions } = _resultsContext;
  const t = targets[targetId] || {};
  const rev = reviewers[reviewerId] || {};
  const key = `${targetId}_${reviewerId}`;
  const resultList = resultsByKey[key] || [];
  const resultByItem = {};
  resultList.forEach(r => resultByItem[r.itemId] = r);

  const infoCols = [
    ["과정", t.curri || t.course || ""],
    ["대학", t.collage || ""],
    ["캠퍼스", t.campus || ""],
    ["학과", t.dept || ""],
    ["전공", t.major || ""],
    ["계열", t.cate || ""]
  ];
  $("opinionTargetInfoTable").innerHTML =
    `<thead><tr>${infoCols.map(c => `<th>${c[0]}</th>`).join("")}</tr></thead>
     <tbody><tr>${infoCols.map(c => `<td>${c[1]||"-"}</td>`).join("")}</tr></tbody>`;

  const reviewerCols = [
    ["검토위원", rev.name || ""],
    ["소속대학", rev.univ || ""],
    ["소속캠퍼스", rev.campus || ""],
    ["소속학과", rev.dept || ""],
    ["휴대폰번호", rev.phone || reviewerId || ""],
    ["이메일", rev.email || ""]
  ];
  $("opinionReviewerInfoTable").innerHTML =
    `<thead><tr>${reviewerCols.map(c => `<th>${c[0]}</th>`).join("")}</tr></thead>
     <tbody><tr>${reviewerCols.map(c => `<td>${c[1]||"-"}</td>`).join("")}</tr></tbody>`;

  const sub = submissions[key] || {};
  const finalCols = [
    ["최종결과", sub.finalResult || "미정"],
    ["최종검토의견", sub.finalOpinion || "-"]
  ];
  $("opinionFinalTable").innerHTML =
    `<thead><tr>${finalCols.map(c => `<th>${c[0]}</th>`).join("")}</tr></thead>
     <tbody><tr>${finalCols.map(c => `<td>${c[1]||"-"}</td>`).join("")}</tr></tbody>`;

  const itemListRaw = Object.values(items).filter(it => it.course === t.course);
  const { sorted: itemList, labelMap: itemLabelMap } = sortAndLabelItems(itemListRaw);

  const tbody1 = $("opinionTablePart1").querySelector("tbody");
  const tbody2 = $("opinionTablePart2").querySelector("tbody");
  tbody1.innerHTML = ""; tbody2.innerHTML = "";
  itemList.forEach(it => {
    const r = resultByItem[it.id];
    const tbody = it.part === "part2" ? tbody2 : tbody1;
    const tr = document.createElement("tr");
    const badge = r && r.result ? `<span class="badge ${r.result==="적합"?"ok":"bad"}">${r.result}</span>` : "-";
    tr.innerHTML = `<td>${itemLabelMap.get(it.id)}</td><td>${it.question||""}</td><td>${badge}</td><td>${r ? (r.opinion||"") : ""}</td>`;
    tbody.appendChild(tr);
  });
  if (!tbody1.children.length) tbody1.innerHTML = `<tr><td colspan="4" style="text-align:center;color:#999;">항목 없음</td></tr>`;
  if (!tbody2.children.length) tbody2.innerHTML = `<tr><td colspan="4" style="text-align:center;color:#999;">항목 없음</td></tr>`;

  $("opinionModal").classList.add("open");
};

$("opinionModalClose").addEventListener("click", () => $("opinionModal").classList.remove("open"));
$("opinionModal").addEventListener("click", (e) => { if (e.target.id === "opinionModal") $("opinionModal").classList.remove("open"); });
