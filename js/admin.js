import { db, storage, ALL_COURSES, mapCurriToCourse, COURSE_FOLDER } from "./firebase-config.js";
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
  table.innerHTML = `<thead><tr><th>휴대폰번호</th><th>성명</th><th>배정건수</th><th>배정된 검토대상(No / 캠퍼스 / 과정 / 학과 / 전공)</th></tr></thead><tbody></tbody>`;
  const tbody = table.querySelector("tbody");
  const reviewerDocs = reviewersSnap.docs.slice()
    .sort((a, b) => String(a.data().name || "").localeCompare(String(b.data().name || ""), "ko"));
  reviewerDocs.forEach(d => {
    const r = d.data();
    const list = targetsByPhone[d.id] || [];
    const listStr = list.length
      ? list.sort((a,b)=>(Number(a.no)||0)-(Number(b.no)||0))
            .map(t => `[${t.no}] ${t.campus||""} ${t.course||""} ${t.dept||""} ${t.major||""}`).join("<br>")
      : '<span style="color:#bbb;">미배정</span>';
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${d.id}</td><td>${r.name||""}</td><td>${list.length}</td><td>${listStr}</td>`;
    tbody.appendChild(tr);
  });
  wrap.appendChild(table);
}

// ===================== 검토대상 운영계획서 =====================
// targets 컬렉션 문서 ID = 엑셀의 No 값(문자열화). 동일 No로 재업로드하면 덮어씁니다.
// PDF 원본은 저장소 루트 기준 상대경로 Files/{과정별 폴더번호}/{filename}에 미리 위치해야 하며, pdfUrl은 이 경로로 자동 계산됩니다.
// 과정별 폴더번호: 2년제학위과정=1, 학위전공심화과정=2, 전문기술=3, 일반계고위탁=4, 중장년특화장기=5, 하이테크=6, 기능장=7
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
      const docData = {
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
        pdfUrl: filename
          ? `Files/${COURSE_FOLDER[mapCurriToCourse(curri)] || ""}/${filename}`
          : ""
      };
      // '담당검토위원' 컬럼에 값이 있을 때만 갱신 — 값이 없으면 기존에 배정된
      // reviewerAssigned를 지우지 않고 그대로 보존한다(merge:true라도 필드를
      // 명시적으로 보내면 덮어써지므로, 아예 필드를 보내지 않아야 함).
      if (row["담당검토위원"]) {
        docData.reviewerAssigned = String(row["담당검토위원"]).trim();
      }
      await setDoc(doc(db, "targets", no), docData, { merge: true });
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
      `${okCount}건 배정 완료` + (failList.leng