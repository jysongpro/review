import { db, storage, ALL_COURSES, mapCurriToCourse } from "./firebase-config.js";
import {
  collection, getDocs, addDoc, doc, setDoc, getDoc, updateDoc, deleteDoc, query, where
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  ref, uploadBytes, getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { buildCourseOptions, parseExcelFile, exportToExcel, isAdminLoggedIn, setAdminLoggedIn, toast } from "./common.js";

const $ = (id) => document.getElementById(id);
function normalizePhone(v) { return (v || "").toString().replace(/[^0-9]/g, ""); }

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
  if (pw === real) {
    setAdminLoggedIn(true);
    showAdmin();
  } else {
    toast($("loginMsg"), "비밀번호가 올바르지 않습니다.", true);
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
  snap.forEach(d => {
    const r = d.data();
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${d.id}</td><td>${r.name||""}</td><td>${r.univ||""}</td><td>${r.campus||""}</td><td>${r.dept||""}</td><td>${r.track||""}</td><td>${r.title||""}</td><td>${r.email||""}</td>
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
// PDF 원본은 서버의 /Files/{filename}에 미리 위치해야 하며, pdfUrl은 이 경로로 자동 계산됩니다.
let _allTargetsCache = [];

async function loadTargets() {
  const snap = await getDocs(collection(db, "targets"));
  const filter = $("targetCourseFilter").value;
  const search = ($("targetSearchInput").value || "").trim();
  const tbody = $("targetTable").querySelector("tbody");
  tbody.innerHTML = "";
  $("targetSelectForAssign").innerHTML = "";
  _allTargetsCache = [];

  const rows = [];
  snap.forEach(d => rows.push({ id: d.id, ...d.data() }));
  rows.sort((a, b) => (Number(a.no) || 0) - (Number(b.no) || 0));

  rows.forEach(r => {
    _allTargetsCache.push(r);
    if (filter && r.course !== filter) return;
    if (search && !((r.campus || "").includes(search) || (r.dept || "").includes(search))) return;
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${r.no||""}</td><td>${r.collage||""}</td><td>${r.campus||""}</td><td>${r.dept||""}</td><td>${r.major||""}</td><td>${r.course||""}</td><td>${r.cate||""}</td><td>${r.per||""}</td><td>${r.dn||""}</td><td>${r.reviewerAssigned||"-"}</td>
      <td>${r.pdfUrl ? `<a href="${r.pdfUrl}" target="_blank">보기</a>` : "-"}</td>`;
    tbody.appendChild(tr);

    const op = document.createElement("option");
    op.value = r.id;
    op.textContent = `[${r.no}] ${r.campus} ${r.dept} ${r.major||""} (${r.course})`;
    $("targetSelectForAssign").appendChild(op);
  });
}
$("targetCourseFilter").addEventListener("change", loadTargets);
$("targetSearchInput").addEventListener("input", loadTargets);

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
        pdfUrl: filename ? `/Files/${filename}` : "",
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
// mainNo: 과정+구분(part) 내에서 자동 증가하는 순번. subNo: 0이면 주항목, 1 이상이면 소항목(1-1, 1-2 ...)
const PART_LABEL = { part1: "1. 교과과정개편 세부기준 준수 여부", part2: "2. 교육운영계획서 세부내용 검토" };

function itemNoLabel(it) {
  return it.subNo ? `${it.mainNo}-${it.subNo}` : `${it.mainNo}`;
}

async function loadItems() {
  const snap = await getDocs(collection(db, "reviewItems"));
  const filter = $("itemCourseFilter").value;
  const tbody1 = $("itemTablePart1").querySelector("tbody");
  const tbody2 = $("itemTablePart2").querySelector("tbody");
  tbody1.innerHTML = ""; tbody2.innerHTML = "";

  const rows = [];
  snap.forEach(d => rows.push({ id: d.id, ...d.data() }));
  rows.sort((a, b) => (a.mainNo||0) - (b.mainNo||0) || (a.subNo||0) - (b.subNo||0));

  rows.forEach(r => {
    if (filter && r.course !== filter) return;
    const tbody = r.part === "part2" ? tbody2 : tbody1;
    const tr = document.createElement("tr");
    const subBtn = !r.subNo
      ? `<button class="btn small secondary" onclick="window.__addSubItem('${r.id}')">소항목 추가</button>`
      : "";
    tr.innerHTML = `<td>${itemNoLabel(r)}</td><td>${r.course||""}</td><td>${r.field||""}</td><td>${r.question||""}</td>
      <td>${subBtn}
        <button class="btn small danger" onclick="window.__deleteItem('${r.id}')">삭제</button>
      </td>`;
    tbody.appendChild(tr);
  });
  if (!tbody1.children.length) tbody1.innerHTML = `<tr><td colspan="5" style="text-align:center;color:#999;">등록된 항목이 없습니다.</td></tr>`;
  if (!tbody2.children.length) tbody2.innerHTML = `<tr><td colspan="5" style="text-align:center;color:#999;">등록된 항목이 없습니다.</td></tr>`;
}
$("itemCourseFilter").addEventListener("change", loadItems);

async function nextMainNo(course, part) {
  const snap = await getDocs(query(collection(db, "reviewItems"), where("course", "==", course), where("part", "==", part)));
  let max = 0;
  snap.forEach(d => { const n = d.data().mainNo || 0; if (n > max) max = n; });
  return max + 1;
}

$("addItemBtn").addEventListener("click", async () => {
  const course = $("itemCourseSelect").value;
  const part = $("itemPartSelect").value;
  const field = $("itemField").value.trim();
  const question = $("itemQuestion").value.trim();
  if (!course) return toast($("itemAddMsg"), "과정을 선택하세요.", true);
  if (!field) { toast($("itemAddMsg"), "검토분야를 입력하세요.", true); $("itemField").focus(); return; }
  if (!question) { toast($("itemAddMsg"), "검토문항을 입력하세요.", true); $("itemQuestion").focus(); return; }

  $("addItemBtn").disabled = true;
  try {
    const mainNo = await nextMainNo(course, part);
    await addDoc(collection(db, "reviewItems"), { course, part, mainNo, subNo: 0, field, question });

    // 다음 항목을 바로 이어서 입력할 수 있도록 입력란만 비우고(과정/구분은 유지) 포커스를 검토분야로 이동
    $("itemField").value = "";
    $("itemQuestion").value = "";
    $("itemField").focus();

    toast($("itemAddMsg"), `${mainNo}번 항목으로 저장되었습니다. 계속해서 다음 항목을 입력하세요.`);

    // 방금 저장한 과정으로 목록 필터를 맞추어 바로 아래에 보이도록 처리
    if ($("itemCourseFilter").value !== course) {
      $("itemCourseFilter").value = course;
    }
    loadItems();
  } catch (e) {
    toast($("itemAddMsg"), "저장 실패: " + e.message, true);
  } finally {
    $("addItemBtn").disabled = false;
  }
});

window.__addSubItem = async (parentId) => {
  const pSnap = await getDoc(doc(db, "reviewItems", parentId));
  if (!pSnap.exists()) return;
  const parent = pSnap.data();
  const field = prompt("소항목 검토분야", parent.field) ?? "";
  if (field === null) return;
  const question = prompt("소항목 검토문항", "");
  if (question === null || !question.trim()) return;

  const siblingsSnap = await getDocs(query(
    collection(db, "reviewItems"),
    where("course", "==", parent.course),
    where("part", "==", parent.part),
    where("mainNo", "==", parent.mainNo)
  ));
  let maxSub = 0;
  siblingsSnap.forEach(d => { const n = d.data().subNo || 0; if (n > maxSub) maxSub = n; });

  await addDoc(collection(db, "reviewItems"), {
    course: parent.course, part: parent.part, mainNo: parent.mainNo, subNo: maxSub + 1,
    field: field.trim(), question: question.trim()
  });
  loadItems();
};

window.__deleteItem = async (id) => {
  if (!confirm("삭제하시겠습니까?")) return;
  await deleteDoc(doc(db, "reviewItems", id));
  loadItems();
};

// ===================== 등록 내역 / 결과 =====================
let _allResultsCache = [];
async function loadResults() {
  const [resultsSnap, targetsSnap, reviewersSnap, itemsSnap] = await Promise.all([
    getDocs(collection(db, "reviewResults")),
    getDocs(collection(db, "targets")),
    getDocs(collection(db, "reviewers")),
    getDocs(collection(db, "reviewItems"))
  ]);
  const targets = {}; targetsSnap.forEach(d => targets[d.id] = d.data());
  const reviewers = {}; reviewersSnap.forEach(d => reviewers[d.id] = d.data());
  const items = {}; itemsSnap.forEach(d => items[d.id] = d.data());

  const filter = $("resultCourseFilter").value;
  const tbody = $("resultTable").querySelector("tbody");
  tbody.innerHTML = "";
  _allResultsCache = [];

  resultsSnap.forEach(d => {
    const r = d.data();
    const t = targets[r.targetId] || {};
    const rev = reviewers[r.reviewerId] || {};
    const it = items[r.itemId] || {};
    if (filter && t.course !== filter) return;
    const row = {
      "과정": t.course || "", "캠퍼스": t.campus || "", "학과": t.dept || "", "전공과정": t.major || "",
      "검토위원": rev.name || "", "구분": PART_LABEL[it.part] || PART_LABEL.part1, "검토분야": it.field || "", "검토문항": it.question || "",
      "결과": r.result || "", "검토의견": r.opinion || "", "등록일시": r.updatedAt || ""
    };
    _allResultsCache.push(row);
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${row["과정"]}</td><td>${row["캠퍼스"]}</td><td>${row["학과"]}</td><td>${row["검토위원"]}</td>
      <td>${row["구분"]}</td><td>${row["검토분야"]}</td><td>${row["검토문항"]}</td>
      <td><span class="badge ${row["결과"]==="적합"?"ok":row["결과"]==="부적합"?"bad":"pending"}">${row["결과"]||"미입력"}</span></td>
      <td>${row["검토의견"]}</td><td>${row["등록일시"]}</td>`;
    tbody.appendChild(tr);
  });
}
$("resultCourseFilter").addEventListener("change", loadResults);
$("exportResultsBtn").addEventListener("click", () => {
  exportToExcel(_allResultsCache, `검토결과_${$("resultCourseFilter").value || "전체"}.xlsx`);
});

// ===================== 비밀번호 변경 =====================
$("changePwBtn").addEventListener("click", async () => {
  const pw = $("newPw").value.trim();
  if (!pw) return toast($("pwChangeMsg"), "새 비밀번호를 입력하세요.", true);
  await setDoc(doc(db, "settings", "admin"), { password: pw });
  toast($("pwChangeMsg"), "비밀번호가 변경되었습니다.");
  $("newPw").value = "";
});
