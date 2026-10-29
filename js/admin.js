import { db, storage, ALL_COURSES, mapCurriToCourse } from "./firebase-config.js";
import {
  collection, getDocs, addDoc, doc, setDoc, getDoc, updateDoc, deleteDoc, query, where
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  ref, uploadBytes, getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { buildCourseOptions, parseExcelFile, exportToExcel, exportToExcelWithMerges, isAdminLoggedIn, setAdminLoggedIn, toast, sortAndLabelItems } from "./common.js";

const $ = (id) => document.getElementById(id);
function normalizePhone(v) { return (v || "").toString().replace(/[^0-9*]/g, ""); }

// 버튼 클릭 등에서 발생한 예외가 화면에 전혀 표시되지 않고 조용히 무시되는 것을 방지하기 위한 전역 오류 알림
window.addEventListener("error", (ev) => {
  console.error("[admin.js 오류]", ev.error || ev.message);
  alert("스크립트 오류가 발생했습니다: " + (ev.message || ev.error));
});
window.addEventListener("unhandledrejection", (ev) => {
  console.error("[admin.js Promise 오류]", ev.reason);
  alert("처리 중 오류가 발생했습니다: " + (ev.reason && ev.reason.message ? ev.reason.message : ev.reason));
});

// ---------- 로그인 ----------
async function ensureAdminSettingsDoc() {
  const ref_ = doc(db, "settings", "admin");
  const snap = await getDoc(ref_);
  if (!snap.exists()) {
    await setDoc(ref_, { password: "1234" });
    return "1234";
  }
  return snap.data().password;
}

async function tryLogin() {
  const pw = $("pwInput").value.trim();
  const real = await ensureAdminSettingsDoc();
  // Firestore 콘솔에서 값을 직접 수정했을 때 타입(문자/숫자)이나 앞뒤 공백이 섞여도
  // 비교가 실패하지 않도록 문자열 변환 + trim 후 비교
  console.log("[admin] 입력값:", JSON.stringify(pw), "/ 저장된 값:", JSON.stringify(real));
  if (String(pw) === String(real).trim()) {
    setAdminLoggedIn(true);
    showAdmin();
  } else {
    toast($("loginMsg"), "비밀번호가 올바르지 않습니다. (설정된 값과 다릅니다. 콘솔(F12)을 확인하세요)", true);
  }
}

function showAdmin() {
  $("loginView").style.display = "none";
  $("adminView").style.display = "block";
  initTabs();
  loadReviewers();
  loadReviewerAssignOverview();
  loadTargets();
  loadItems();
  loadResults();
}

$("loginBtn").addEventListener("click", tryLogin);
$("pwInput").addEventListener("keydown", (e) => { if (e.key === "Enter") tryLogin(); });

if (isAdminLoggedIn()) showAdmin();

// ---------- 탭 ----------
function initTabs() {
  document.querySelectorAll(".tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
      document.querySelectorAll(".panel").forEach(p => p.style.display = "none");
      tab.classList.add("active");
      $("panel-" + tab.dataset.tab).style.display = "block";
    });
  });
  [$("targetCourseFilter"), $("itemCourseSelect"), $("itemCourseFilter"), $("resultCourseFilter")]
    .forEach(sel => buildCourseOptions(sel));
}

// ===================== 검토위원 =====================
// reviewers 컬렉션의 문서 ID = 휴대폰번호(숫자만). 휴대폰번호가 검토위원의 고유 ID입니다.
async function loadReviewers() {
  const snap = await getDocs(collection(db, "reviewers"));
  const tbody = $("reviewerTable").querySelector("tbody");
  tbody.innerHTML = "";
  let rno = 0;
  snap.forEach(d => {
    rno++;
    const r = d.data();
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${rno}</td><td>${d.id}</td><td>${r.name||""}</td><td>${r.univ||""}</td><td>${r.campus||""}</td><td>${r.dept||""}</td><td>${r.track||""}</td><td>${r.title||""}</td><td>${r.email||""}</td>
      <td>
        <button class="btn small secondary" onclick="window.__editReviewer('${d.id}')">수정</button>
        <button class="btn small danger" onclick="window.__deleteReviewer('${d.id}')">삭제</button>
      </td>`;
    tbody.appendChild(tr);
  });
}

$("uploadReviewerBtn").addEventListener("click", async () => {
  const f = $("reviewerExcel").files[0];
  if (!f) return toast($("reviewerUploadMsg"), "엑셀 파일을 선택하세요.", true);
  try {
    const rows = await parseExcelFile(f);
    let count = 0;
    for (const row of rows) {
      const phone = normalizePhone(row["휴대폰번호"] || row["연락처"] || row["phone"] || "");
      if (!phone) continue;
      await setDoc(doc(db, "reviewers", phone), {
        phone,
        name: row["성명"] || row["name"] || "",
        univ: row["대학"] || row["univ"] || "",
        campus: row["캠퍼스"] || row["campus"] || "",
        dept: row["학과명"] || row["학과"] || row["dept"] || "",
        track: row["계열"] || row["track"] || "",
        title: row["직급"] || row["직위"] || row["title"] || "",
        email: row["이메일"] || row["email"] || ""
      }, { merge: true });
      count++;
    }
    toast($("reviewerUploadMsg"), `${count}건 저장 완료`);
    loadReviewers();
  } catch (e) {
    toast($("reviewerUploadMsg"), "업로드 실패: " + e.message, true);
  }
});

$("addReviewerBtn").addEventListener("click", async () => {
  const phone = normalizePhone($("revPhone").value);
  const name = $("revName").value.trim();
  const email = $("revEmail").value.trim();
  const univ = $("revUniv").value.trim();
  const campus = $("revCampus").value.trim();
  const dept = $("revDept").value.trim();
  const track = $("revTrack").value.trim();
  const title = $("revTitle").value.trim();
  if (!name || !phone) return alert("휴대폰번호와 성명은 필수입니다.");
  await setDoc(doc(db, "reviewers", phone), { phone, name, email, univ, campus, dept, track, title }, { merge: true });
  $("revPhone").value = ""; $("revName").value = ""; $("revEmail").value = "";
  $("revUniv").value = ""; $("revCampus").value = ""; $("revDept").value = ""; $("revTrack").value = ""; $("revTitle").value = "";
  loadReviewers();
});

window.__deleteReviewer = async (id) => {
  if (!confirm("삭제하시겠습니까?")) return;
  await deleteDoc(doc(db, "reviewers", id));
  loadReviewers();
};
window.__editReviewer = async (id) => {
  const snap = await getDoc(doc(db, "reviewers", id));
  const r = snap.data();
  const name = prompt("성명", r.name) ?? r.name;
  const univ = prompt("대학", r.univ) ?? r.univ;
  const campus = prompt("캠퍼스", r.campus) ?? r.campus;
  const dept = prompt("학과명", r.dept) ?? r.dept;
  const track = prompt("계열", r.track) ?? r.track;
  const title = prompt("직급", r.title) ?? r.title;
  const email = prompt("이메일", r.email) ?? r.email;
  // 휴대폰번호(ID)는 문서 ID이므로 여기서는 변경하지 않음(변경이 필요하면 삭제 후 재등록)
  await updateDoc(doc(db, "reviewers", id), { name, univ, campus, dept, track, title, email });
  loadReviewers();
};

// ---- 검토위원별 배정목록 전체보기 ----
async function loadReviewerAssignOverview() {
  const [reviewersSnap, targetsSnap] = await Promise.all([
    getDocs(collection(db, "reviewers")),
    getDocs(collection(db, "targets"))
  ]);
  const targetsByPhone = {};
  targetsSnap.forEach(d => {
    const t = d.data();
    const phone = normalizePhone(t.reviewerAssigned);
    if (!phone) return;
    if (!targetsByPhone[phone]) targetsByPhone[phone] = [];
    targetsByPhone[phone].push(t);
  });

  const wrap = $("reviewerAssignOverview");
  wrap.innerHTML = "";
  if (reviewersSnap.empty) {
    wrap.innerHTML = `<p style="color:#999;font-size:13px;">등록된 검토위원이 없습니다.</p>`;
    return;
  }
  const table = document.createElement("table");
  table.innerHTML = `<thead><tr><th>휴대폰번호</th><th>성명</th><th>배정건수</th><th>배정된 검토대상(No / 과정 / 학과)</th></tr></thead><tbody></tbody>`;
  const tbody = table.querySelector("tbody");
  reviewersSnap.forEach(d => {
    const r = d.data();
    const list = targetsByPhone[d.id] || [];
    const listStr = list.length
      ? list.sort((a,b)=>(Number(a.no)||0)-(Number(b.no)||0))
            .map(t => `[${t.no}] ${t.course||""} ${t.dept||""}`).join("<br>")
      : '<span style="color:#bbb;">미배정</span>';
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${d.id}</td><td>${r.name||""}</td><td>${list.length}</td><td>${listStr}</td>`;
    tbody.appendChild(tr);
  });
  wrap.appendChild(table);
}

// ===================== 검토대상 운영계획서 =====================
// targets 컬렉션 문서 ID = 엑셀의 No 값(문자열화). 동일 No로 재업로드하면 덮어씁니다.
// PDF 원본은 저장소 루트 기준 상대경로 Files/{filename}에 미리 위치해야 하며, pdfUrl은 이 경로로 자동 계산됩니다.
// (주의: 사이트가 하위 폴더(예: /review/)에서 서비스되므로 절대경로 "/Files/..."를 쓰면 안됨 — 404 원인)
let _allTargetsCache = [];

function uniqueSortedVals(values) {
  return [...new Set(values.filter(v => v !== undefined && v !== null && v !== ""))]
    .sort((a, b) => String(a).localeCompare(String(b), "ko"));
}

// 과정 필터 선택 시 해당 과정의 캠퍼스 목록을, 캠퍼스 선택 시 해당 과정+캠퍼스의 학과 목록을 연동해서 보여준다.
// (메인화면 교육운영계획서검토 조회메뉴의 과정→대학→캠퍼스→학과 연동 방식과 동일한 방식)
function refreshTargetCampusOptions() {
  const course = $("targetCourseFilter").value;
  const keep = $("targetCampusFilter").value;
  const campuses = uniqueSortedVals(
    _allTargetsCache.filter(r => !course || r.course === course).map(r => r.campus)
  );
  $("targetCampusFilter").innerHTML = `<option value="">전체</option>` +
    campuses.map(c => `<option value="${c}">${c}</option>`).join("");
  if (campuses.includes(keep)) $("targetCampusFilter").value = keep;
}
function refreshTargetDeptOptions() {
  const course = $("targetCourseFilter").value;
  const campus = $("targetCampusFilter").value;
  const keep = $("targetDeptFilter").value;
  const depts = uniqueSortedVals(
    _allTargetsCache.filter(r => (!course || r.course === course) && (!campus || r.campus === campus)).map(r => r.dept)
  );
  $("targetDeptFilter").innerHTML = `<option value="">전체</option>` +
    depts.map(d => `<option value="${d}">${d}</option>`).join("");
  if (depts.includes(keep)) $("targetDeptFilter").value = keep;
}

async function loadTargets() {
  const snap = await getDocs(collection(db, "targets"));
  const filter = $("targetCourseFilter").value;
  const campusFilter = $("targetCampusFilter").value;
  const deptFilter = $("targetDeptFilter").value;
  const tbody = $("targetTable").querySelector("tbody");
  tbody.innerHTML = "";
  $("targetSelectForAssign").innerHTML = "";
  _allTargetsCache = [];

  const rows = [];
  snap.forEach(d => rows.push({ id: d.id, ...d.data() }));
  rows.sort((a, b) => (Number(a.no) || 0) - (Number(b.no) || 0));

  rows.forEach(r => _allTargetsCache.push(r));
  refreshTargetCampusOptions();
  refreshTargetDeptOptions();

  // 필터링된 결과기준으로 순번(No)을 1부터 다시 부여한다.
  let seq = 0;
  rows.forEach(r => {
    if (filter && r.course !== filter) return;
    if (campusFilter && r.campus !== campusFilter) return;
    if (deptFilter && r.dept !== deptFilter) return;
    seq++;
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${seq}</td><td>${r.no||""}</td><td>${r.course||""}</td><td>${r.collage||""}</td><td>${r.campus||""}</td><td>${r.dept||""}</td><td>${r.major||""}</td><td>${r.cate||""}</td><td>${r.per||""}</td><td>${r.dn||""}</td><td>${r.reviewerAssigned||"-"}</td>
      <td>${r.pdfUrl ? `<a href="${r.pdfUrl}" target="_blank">보기</a>` : "-"}</td>`;
    tbody.appendChild(tr);

    const op = document.createElement("option");
    op.value = r.id;
    op.textContent = `[${r.no}] ${r.campus} ${r.dept} ${r.major||""} (${r.course})`;
    $("targetSelectForAssign").appendChild(op);
  });
}
$("targetCourseFilter").addEventListener("change", () => { refreshTargetCampusOptions(); refreshTargetDeptOptions(); loadTargets(); });
$("targetCampusFilter").addEventListener("change", () => { refreshTargetDeptOptions(); loadTargets(); });
$("targetDeptFilter").addEventListener("change", loadTargets);

$("uploadTargetBtn").addEventListener("click", async () => {
  const f = $("targetExcel").files[0];
  if (!f) return toast($("targetUploadMsg"), "엑셀 파일을 선택하세요.", true);
  try {
    const rows = await parseExcelFile(f);
    let count = 0;
    for (const row of rows) {
      const no = String(row["No"] ?? row["no"] ?? "").trim();
      if (!no) continue;
      const filename = row["filename"] || "";
      const curri = row["curri"] || "";
      await setDoc(doc(db, "targets", no), {
        no,
        univ: row["대학"] || row["univ"] || "한국폴리텍대학",
        collage: row["collage"] || "",
        campus: row["campus"] || "",
        dept: row["dept"] || "",
        major: row["major"] || "",
        curri,
        course: mapCurriToCourse(curri),
        cate: row["cate"] || "",
        per: row["per"] || "",
        dn: row["dn"] || "",
        filename,
        pdfUrl: filename ? `Files/${filename}` : "",
        reviewerAssigned: row["담당검토위원"] ? String(row["담당검토위원"]).trim() : ""
      }, { merge: true });
      count++;
    }
    toast($("targetUploadMsg"), `${count}건 저장 완료`);
    loadTargets();
    loadReviewerAssignOverview();
  } catch (e) {
    toast($("targetUploadMsg"), "업로드 실패: " + e.message, true);
  }
});

$("assignBtn").addEventListener("click", async () => {
  const targetId = $("targetSelectForAssign").value;
  const phone = normalizePhone($("assignPhoneInput").value);
  if (!targetId) return toast($("assignMsg"), "검토대상을 선택하세요.", true);
  if (!phone) return toast($("assignMsg"), "담당검토위원 휴대폰번호를 입력하세요.", true);
  const revSnap = await getDoc(doc(db, "reviewers", phone));
  if (!revSnap.exists()) return toast($("assignMsg"), "등록되지 않은 검토위원 번호입니다.", true);
  await updateDoc(doc(db, "targets", targetId), { reviewerAssigned: phone });
  toast($("assignMsg"), `${revSnap.data().name} 검토위원으로 배정되었습니다.`);
  $("assignPhoneInput").value = "";
  loadTargets();
});

// ---- 검토위원별 배정목록 엑셀 일괄 업로드 (컴럼: 휴대폰번호, 검토목록=No) ----
$("uploadAssignBtn").addEventListener("click", async () => {
  const f = $("assignExcel").files[0];
  if (!f) return toast($("assignUploadMsg"), "엑셀 파일을 선택하세요.", true);
  try {
    const rows = await parseExcelFile(f);
    let okCount = 0, failList = [];
    for (const row of rows) {
      const phone = normalizePhone(row["휴대폰번호"] || row["phone"] || "");
      const no = String(row["검토목록"] ?? row["No"] ?? row["no"] ?? "").trim();
      if (!phone || !no) continue;
      const revSnap = await getDoc(doc(db, "reviewers", phone));
      const tgtSnap = await getDoc(doc(db, "targets", no));
      if (!revSnap.exists() || !tgtSnap.exists()) {
        failList.push(`${phone}/${no}`);
        continue;
      }
      await updateDoc(doc(db, "targets", no), { reviewerAssigned: phone });
      okCount++;
    }
    toast($("assignUploadMsg"),
      `${okCount}건 배정 완료` + (failList.length ? ` / 실패(미등록 번호또는 No): ${failList.join(", ")}` : ""),
      failList.length > 0 && okCount === 0);
    loadTargets();
    loadReviewerAssignOverview();
  } catch (e) {
    toast($("assignUploadMsg"), "업로드 실패: " + e.message, true);
  }
});

// ===================== 검토항목 등록 =====================
// part1: 교과과정개편 세부기준 준수 여부 / part2: 교육운영계획서 세부내용 검토
// mainNo: 과정+구분(part) 내에서 자동 증가하는 순번 (소항목은 사용하지 않음)
const PART_LABEL = { part1: "1. 교과과정개편 세부기준 준수 여부", part2: "2. 교육운영계획서 세부내용 검토" };

async function loadItems() {
  const tbody1 = $("itemTablePart1").querySelector("tbody");
  const tbody2 = $("itemTablePart2").querySelector("tbody");
  try {
    // 필터를 걸지 않으면(과정 미선택 시) reviewItems 콜렉션의 모든 문서를 그대로 불러와 보여주어,
    // 중복 저장된 항목까지 누락 없이 확인하고 관리자가 직접 삭제할 수 있도록 함
    const snap = await getDocs(collection(db, "reviewItems"));
    const filter = ($("itemCourseFilter").value || "").trim();
    tbody1.innerHTML = ""; tbody2.innerHTML = "";

    const rawRows = [];
    snap.forEach(d => rawRows.push({ id: d.id, ...d.data(), course: (d.data().course || "").trim() }));

    // 동일 과정+구분+검토문항(공백 제거 비교) 조합이 2건 이상이면 중복으로 판단 (전체 데이터 기준)
    const dupKeyCount = {};
    rawRows.forEach(r => {
      const key = `${r.course}||${r.part}||${(r.question||"").trim().replace(/\s+/g, " ")}`;
      dupKeyCount[key] = (dupKeyCount[key] || 0) + 1;
    });

    // 화면에 표시될 필터 기준 항목만 먼저 걸러낸 뒤 그 결과에 대해서만 순번(1부터)을 매겨,
    // 특정 과정(예: 학위전공심화과정)만 조회해도 항상 1번부터 정상적으로 보이도록 함
    const filteredRows = rawRows.filter(r => !filter || r.course === filter);
    const { sorted: rows, labelMap } = sortAndLabelItems(filteredRows);

    let count1 = 0, count2 = 0;
    rows.forEach(r => {
      const tbody = r.part === "part2" ? tbody2 : tbody1;
      if (r.part === "part2") count2++; else count1++;
      const key = `${r.course}||${r.part}||${(r.question||"").trim().replace(/\s+/g, " ")}`;
      const isDup = dupKeyCount[key] > 1;
      const tr = document.createElement("tr");
      tr.dataset.itemId = r.id;
      if (isDup) tr.style.background = "#ffecec";
      tr.innerHTML = `<td>${labelMap.get(r.id)}</td><td>${r.course||""}</td>
        <td style="white-space:pre-line;text-align:left;">${isDup ? '<span class="badge bad" style="margin-right:6px;">중복</span>' : ""}${formatQuestion(r.question)}</td>
        <td>
          <button class="btn small secondary" onclick="window.__editItem('${r.id}')">수정</button>
          <button class="btn small danger" onclick="window.__deleteItem('${r.id}')">삭제</button>
        </td>`;
      tbody.appendChild(tr);
    });
    if (!tbody1.children.length) tbody1.innerHTML = `<tr><td colspan="4" style="text-align:center;color:#999;">등록된 항목이 없습니다.</td></tr>`;
    if (!tbody2.children.length) tbody2.innerHTML = `<tr><td colspan="4" style="text-align:center;color:#999;">등록된 항목이 없습니다.</td></tr>`;
    $("part1Count").textContent = count1;
    $("part2Count").textContent = count2;
  } catch (e) {
    // 목록 조회 실패 시 화면이 조용히 비어 보이지 않고 원인을 바로 알 수 있도록 표시
    const msg = `<tr><td colspan="4" style="text-align:center;color:#c0392b;">목록 불러오기 실패: ${e.message}</td></tr>`;
    tbody1.innerHTML = msg; tbody2.innerHTML = msg;
    toast($("itemAddMsg"), "목록 조회 중 오류가 발생했습니다: " + e.message, true);
  }
}
$("itemCourseFilter").addEventListener("change", loadItems);
$("refreshItemsBtn").addEventListener("click", loadItems);

$("exportItemsBtn").addEventListener("click", async () => {
  try {
    const snap = await getDocs(collection(db, "reviewItems"));
    const filter = ($("itemCourseFilter").value || "").trim();
    const rawRows = [];
    snap.forEach(d => rawRows.push({ id: d.id, ...d.data(), course: (d.data().course || "").trim() }));
    const filteredRows = rawRows.filter(r => !filter || r.course === filter);
    const { sorted: rows, labelMap } = sortAndLabelItems(filteredRows);
    if (!rows.length) return toast($("itemAddMsg"), "다운로드할 검토항목이 없습니다.", true);
    const excelRows = rows.map(r => ({
      "순번": labelMap.get(r.id),
      "과정": r.course || "",
      "검토구분": r.part === "part2" ? "2. 교육운영계획서 세부내용 검토" : "1. 교과과정개편 세부기준 준수 여부",
      "검토문항": r.question || ""
    }));
    exportToExcel(excelRows, `검토항목_${filter || "전체"}.xlsx`);
  } catch (e) {
    toast($("itemAddMsg"), "다운로드 실패: " + e.message, true);
  }
});

async function nextMainNo(course, part) {
  const snap = await getDocs(query(collection(db, "reviewItems"), where("course", "==", course), where("part", "==", part)));
  let max = 0;
  snap.forEach(d => { const n = d.data().mainNo || 0; if (n > max) max = n; });
  return max + 1;
}

$("addItemBtn").addEventListener("click", async () => {
  const course = ($("itemCourseSelect").value || "").trim();
  const part = ($("itemPartSelect").value || "").trim();
  const question = $("itemQuestion").value.trim();
  if (!course) return toast($("itemAddMsg"), "과정을 선택하세요.", true);
  if (!question) { toast($("itemAddMsg"), "검토문항을 입력하세요.", true); $("itemQuestion").focus(); return; }

  $("addItemBtn").disabled = true;
  try {
    const mainNo = await nextMainNo(course, part);
    const ref = await addDoc(collection(db, "reviewItems"), { course, part, mainNo, field: "", question });

    // 다음 항목을 바로 이어서 입력할 수 있도록 입력란만 비우고(과정/구분은 유지) 포커스를 검토문항으로 이동
    $("itemQuestion").value = "";
    $("itemQuestion").focus();

    // 방금 저장한 과정으로 목록 필터를 항상 맞추어(값이 같아도 명시적으로 재설정) 바로 아래에 보이도록 처리
    $("itemCourseFilter").value = course;
    await loadItems();

    // 방금 추가된 항목이 실제로 화면에 나타났는지 확인해, 혹시 없다면 사용자에게 명확히 알림
    const added = document.querySelector(`tr[data-item-id="${ref.id}"]`);
    if (added) {
      added.scrollIntoView({ behavior: "smooth", block: "center" });
      added.style.outline = "2px solid #2a62e8";
      setTimeout(() => { added.style.outline = ""; }, 1500);
      toast($("itemAddMsg"), `${mainNo}번 항목으로 저장되었습니다. 계속해서 다음 항목을 입력하세요.`);
    } else {
      toast($("itemAddMsg"), `${mainNo}번 항목으로 저장되었지만 화면에 표시되지 않았습니다. 새로고침 버튼을 눌러주세요.`, true);
    }
  } catch (e) {
    toast($("itemAddMsg"), "저장 실패: " + e.message, true);
  } finally {
    $("addItemBtn").disabled = false;
  }
});

function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
// 검토문항 내 괄호 "(…)" 안 내용을 bold로 강조표시 (검토위원 화면과 동일한 규칙)
function formatQuestion(q) {
  const escaped = escapeHtml(q || "");
  return escaped.replace(/\(([^()]*)\)/g, (m, inner) => `(<b>${inner}</b>)`);
}

// 검토문항은 줄바꿈(Enter)이 포함된 여러 줄 텍스트일 수 있어, prompt() 대신 텍스트영역(textarea) 모달로 수정
 let __editItemId = null;
window.__editItem = async (id) => {
  const snap = await getDoc(doc(db, "reviewItems", id));
  if (!snap.exists()) return;
  const it = snap.data();
  __editItemId = id;
  $("itemEditTextarea").value = it.question || "";
  $("itemEditModal").style.display = "flex";
  $("itemEditTextarea").focus();
};

function closeItemEditModal() {
  $("itemEditModal").style.display = "none";
  __editItemId = null;
}
$("itemEditCloseBtn")?.addEventListener("click", closeItemEditModal);
$("itemEditCancelBtn")?.addEventListener("click", closeItemEditModal);
$("itemEditModal")?.addEventListener("click", (e) => { if (e.target.id === "itemEditModal") closeItemEditModal(); });
$("itemEditSaveBtn")?.addEventListener("click", async () => {
  if (!__editItemId) return;
  const question = $("itemEditTextarea").value;
  if (!question.trim()) return alert("검토문항은 비워둘 수 없습니다.");
  await updateDoc(doc(db, "reviewItems", __editItemId), { question: question.trim() });
  closeItemEditModal();
  loadItems();
});

window.__deleteItem = async (id) => {
  if (!confirm("삭제하시겠습니까?")) return;
  await deleteDoc(doc(db, "reviewItems", id));
  loadItems();
};

// ===================== 검토결과 조회 =====================
// targets(검토대상) 1건 + 배정된 검토위원 1명을 기준으로 한 행을 구성.
// 상태: 미작성 / 작성중 / 제출완료 (reviewSubmissions 컬렉션 기준)
let _allResultsCache = [];
let _resultsContext = { targets: {}, reviewers: {}, items: {}, resultsByKey: {}, submissions: {} };

async function loadResults() {
  const [targetsSnap, reviewersSnap, itemsSnap, resultsSnap, submissionsSnap] = await Promise.all([
    getDocs(collection(db, "targets")),
    getDocs(collection(db, "reviewers")),
    getDocs(collection(db, "reviewItems")),
    getDocs(collection(db, "reviewResults")),
    getDocs(collection(db, "reviewSubmissions"))
  ]);
  const targets = {}; targetsSnap.forEach(d => targets[d.id] = { id: d.id, ...d.data() });
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

  const filter = $("resultCourseFilter").value;
  const tbody = $("resultTable").querySelector("tbody");
  tbody.innerHTML = "";
  _allResultsCache = [];

  const rows = [];
  Object.values(targets).forEach(t => {
    if (filter && t.course !== filter) return;
    const phone = normalizePhone(t.reviewerAssigned);
    if (!phone) return;
    const rev = reviewers[phone];
    if (!rev) return;
    const key = `${t.id}_${phone}`;
    const sub = submissions[key];
    const hasResults = !!resultsByKey[key];
    let status = "미작성";
    if (sub && sub.status === "submitted") status = "제출완료";
    else if (hasResults || (sub && sub.status === "draft")) status = "작성중";
    const updatedAt = (sub && (sub.submittedAt || sub.updatedAt)) || "";
    const finalResult = (sub && sub.finalResult) || "";
    const finalOpinion = (sub && sub.finalOpinion) || "";
    rows.push({ t, rev, key, status, updatedAt, finalResult, finalOpinion });
  });
  rows.sort((a, b) => (Number(a.t.no)||0) - (Number(b.t.no)||0));

  rows.forEach(({ t, rev, status, updatedAt, finalResult, finalOpinion }) => {
    _allResultsCache.push({
      "No": t.no || "", "과정": t.course || "", "대학": t.collage || "", "캠퍼스": t.campus || "", "학과": t.dept || "", "전공": t.major || "", "계열": t.cate || "",
      "검토위원": rev.name || "", "상태": status, "등록일시": updatedAt, "최종결과": finalResult, "최종검토의견": finalOpinion
    });
    const badgeClass = status === "제출완료" ? "ok" : "pending";
    const badgeStyle = status === "작성중" ? 'style="background:#fff3cd;color:#8a6d00;"' : "";
    const finalBadge = finalResult ? `<span class="badge ${finalResult==="적합"?"ok":finalResult==="부적합"?"bad":"pending"}">${finalResult}</span>` : "-";
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${t.no||""}</td><td>${t.collage||""}</td><td>${t.campus||""}</td><td>${t.dept||""}</td><td>${t.major||""}</td><td>${t.cate||""}</td>
      <td>${rev.name||""}</td><td>${updatedAt||"-"}</td>
      <td><span class="badge ${badgeClass}" ${badgeStyle}>${status}</span></td>
      <td>${finalBadge}</td>
      <td>${finalOpinion || "-"}</td>
      <td>
        <button class="btn small secondary" onclick="window.__viewOpinion('${t.id}','${rev.id}')">검토의견서 보기</button>
        ${status === "제출완료" ? `<button class="btn small" onclick="window.__reopenSubmission('${t.id}','${rev.id}')">수정하기</button>` : ""}
      </td>`;
    tbody.appendChild(tr);
  });
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="13" style="text-align:center;color:#999;">조회된 검토목록이 없습니다.</td></tr>`;
  }
}
$("resultCourseFilter").addEventListener("change", loadResults);

// ---- 엑셀 다운로드 ----
// 과정별로 검토문항이 다르기 때문에 관리자가 과정을 반드시 1개 선택한 상태여야만 다운로드 가능
// 엑셀 구성: 1행=제목("00과정 검토결과"), 2~3행=헤더(검토문항은 가로 2칸 병합 후 검토결과/검토의견으로 분할,
// 매학 단일 컴럼은 2~3행 세로 병합), 4행부터 데이터
function colLetter(idx) {
  let s = "", n = idx;
  do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; } while (n >= 0);
  return s;
}
$("exportResultsBtn").addEventListener("click", () => {
  const { targets, reviewers, items, resultsByKey, submissions } = _resultsContext;
  const filter = $("resultCourseFilter").value;
  if (!filter) return alert("다운로드할 과정을 먼저 선택하세요. (과정별로 검토문항이 다르기 때문에 과정을 선택해야만 다운로드할 수 있습니다.)");

  const rows = [];
  Object.values(targets).forEach(t => {
    if (t.course !== filter) return;
    const phone = normalizePhone(t.reviewerAssigned);
    if (!phone) return;
    const rev = reviewers[phone];
    if (!rev) return;
    rows.push({ t, rev });
  });
  rows.sort((a, b) => (Number(a.t.no)||0) - (Number(b.t.no)||0));

  if (!rows.length) return alert("내려받을 검토결과가 없습니다.");

  const { sorted: itemRows, labelMap: itemLabelMap } = sortAndLabelItems(
    Object.values(items).filter(it => it.course === filter)
  );
  function itemNo(it) { return itemLabelMap.get(it.id); }

  const singleHeaders = ["과정", "대학", "캠퍼스", "학과", "전공", "계열", "검토위원", "상태", "등록일시"];
  const tailHeaders = ["최종결과", "최종검토의견"];
  const totalCols = singleHeaders.length + itemRows.length * 2 + tailHeaders.length;

  const row1 = new Array(totalCols).fill("");
  row1[0] = `${filter} 검토결과`;
  const row2 = new Array(totalCols).fill("");
  const row3 = new Array(totalCols).fill("");
  const merges = [{ s: { r: 0, c: 0 }, e: { r: 0, c: totalCols - 1 } }];

  let c = 0;
  singleHeaders.forEach(h => {
    row2[c] = h;
    merges.push({ s: { r: 1, c }, e: { r: 2, c } });
    c++;
  });
  itemRows.forEach(it => {
    row2[c] = `${itemNo(it)}. ${it.question || ""}`;
    merges.push({ s: { r: 1, c }, e: { r: 1, c: c + 1 } });
    row3[c] = "검토결과";
    row3[c + 1] = "검토의견";
    c += 2;
  });
  tailHeaders.forEach(h => {
    row2[c] = h;
    merges.push({ s: { r: 1, c }, e: { r: 2, c } });
    c++;
  });

  const aoa = [row1, row2, row3];

  rows.forEach(({ t, rev }) => {
    const key = `${t.id}_${normalizePhone(t.reviewerAssigned)}`;
    const sub = submissions[key];
    const resultList = resultsByKey[key] || [];
    const resultByItem = {};
    resultList.forEach(r => resultByItem[r.itemId] = r);

    let status = "미작성";
    if (sub && sub.status === "submitted") status = "제출완료";
    else if (resultList.length || (sub && sub.status === "draft")) status = "작성중";
    const updatedAt = (sub && (sub.submittedAt || sub.updatedAt)) || "";

    const dataRow = [t.course || "", t.collage || "", t.campus || "", t.dept || "", t.major || "", t.cate || "", rev.name || "", status, updatedAt];
    itemRows.forEach(it => {
      const r = resultByItem[it.id];
      dataRow.push(r ? (r.result || "") : "");
      dataRow.push(r ? (r.opinion || "") : "");
    });
    dataRow.push((sub && sub.finalResult) || "미정");
    dataRow.push((sub && sub.finalOpinion) || "");
    aoa.push(dataRow);
  });

  const colWidths = singleHeaders.map(() => 12)
    .concat(itemRows.flatMap(() => [10, 24]))
    .concat([10, 24]);

  exportToExcelWithMerges(aoa, merges, `${filter}_검토결과.xlsx`, colWidths);
});

// ---- 검토의견서 보기 ----
window.__viewOpinion = async (targetId, reviewerId) => {
  const { targets, reviewers, items, resultsByKey } = _resultsContext;
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
    `<thead><tr>${infoCols.map(c => `<th style="background:#e6effa;color:#0f2c5c;border:1px solid #dde5f0;padding:8px;">${c[0]}</th>`).join("")}</tr></thead>
     <tbody><tr>${infoCols.map(c => `<td style="border:1px solid #dde5f0;padding:8px;text-align:center;">${c[1]||"-"}</td>`).join("")}</tr></tbody>`;

  const sub = _resultsContext.submissions[key] || {};
  const reviewerCols = [
    ["검토위원", rev.name || ""],
    ["소속대학", rev.univ || ""],
    ["소속캠퍼스", rev.campus || ""],
    ["소속학과", rev.dept || ""],
    ["휴대폰번호", rev.phone || reviewerId || ""],
    ["이메일", rev.email || ""]
  ];
  $("opinionReviewerInfoTable").innerHTML =
    `<thead><tr>${reviewerCols.map(c => `<th style="background:#e6effa;color:#0f2c5c;border:1px solid #dde5f0;padding:8px;">${c[0]}</th>`).join("")}</tr></thead>
     <tbody><tr>${reviewerCols.map(c => `<td style="border:1px solid #dde5f0;padding:8px;text-align:center;">${c[1]||"-"}</td>`).join("")}</tr></tbody>`;

  const finalCols = [
    ["최종결과", sub.finalResult || "미정"],
    ["최종검토의견", sub.finalOpinion || "-"]
  ];
  $("opinionFinalTable").innerHTML =
    `<thead><tr>${finalCols.map(c => `<th style="background:#e6effa;color:#0f2c5c;border:1px solid #dde5f0;padding:8px;">${c[0]}</th>`).join("")}</tr></thead>
     <tbody><tr>${finalCols.map(c => `<td style="border:1px solid #dde5f0;padding:8px;text-align:center;">${c[1]||"-"}</td>`).join("")}</tr></tbody>`;

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
    tr.innerHTML = `<td>${itemLabelMap.get(it.id)}</td><td style="white-space:pre-line;text-align:left;">${formatQuestion(it.question)}</td><td>${badge}</td><td style="white-space:pre-line;text-align:left;">${escapeHtml(r ? (r.opinion||"") : "")}</td>`;
    tbody.appendChild(tr);
  });
  if (!tbody1.children.length) tbody1.innerHTML = `<tr><td colspan="4" style="text-align:center;color:#999;">항목 없음</td></tr>`;
  if (!tbody2.children.length) tbody2.innerHTML = `<tr><td colspan="4" style="text-align:center;color:#999;">항목 없음</td></tr>`;

  $("opinionModal").style.display = "flex";
};
$("opinionModalClose").addEventListener("click", () => { $("opinionModal").style.display = "none"; });
$("opinionPrintBtn").addEventListener("click", () => window.print());
$("opinionModal").addEventListener("click", (e) => { if (e.target.id === "opinionModal") $("opinionModal").style.display = "none"; });

// ---- 제출완료된 검토의견서를 다시 작성할 수 있도록 잠금 해제 ----
window.__reopenSubmission = async (targetId, reviewerId) => {
  if (!confirm("최종제출된 검토의견서를 다시 작성할 수 있도록 허용하시겠습니까?")) return;
  await setDoc(doc(db, "reviewSubmissions", `${targetId}_${reviewerId}`), {
    targetId, reviewerId, status: "draft"
  }, { merge: true });
  loadResults();
};

// ===================== 비밀번호 변경 =====================
$("changePwBtn").addEventListener("click", async () => {
  const pw = $("newPw").value.trim();
  if (!pw) return toast($("pwChangeMsg"), "새 비밀번호를 입력하세요.", true);
  await setDoc(doc(db, "settings", "admin"), { password: pw });
  toast($("pwChangeMsg"), "비밀번호가 변경되었습니다.");
  $("newPw").value = "";
});
