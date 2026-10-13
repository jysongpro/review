import { db, storage, ALL_COURSES } from "./firebase-config.js";
import {
  collection, getDocs, addDoc, doc, setDoc, getDoc, updateDoc, deleteDoc, query, where
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  ref, uploadBytes, getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { buildCourseOptions, parseExcelFile, exportToExcel, isAdminLoggedIn, setAdminLoggedIn, toast } from "./common.js";

const $ = (id) => document.getElementById(id);

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
async function loadReviewers() {
  const snap = await getDocs(collection(db, "reviewers"));
  const tbody = $("reviewerTable").querySelector("tbody");
  tbody.innerHTML = "";
  snap.forEach(d => {
    const r = d.data();
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${r.name||""}</td><td>${r.org||""}</td><td>${r.title||""}</td><td>${r.phone||""}</td>
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
    for (const row of rows) {
      await addDoc(collection(db, "reviewers"), {
        name: row["성명"] || row["name"] || "",
        org: row["소속"] || row["org"] || "",
        title: row["직위"] || row["title"] || "",
        phone: String(row["연락처"] || row["phone"] || "").trim()
      });
    }
    toast($("reviewerUploadMsg"), `${rows.length}건 저장 완료`);
    loadReviewers();
  } catch (e) {
    toast($("reviewerUploadMsg"), "업로드 실패: " + e.message, true);
  }
});

$("addReviewerBtn").addEventListener("click", async () => {
  const name = $("revName").value.trim();
  const org = $("revOrg").value.trim();
  const title = $("revTitle").value.trim();
  const phone = $("revPhone").value.trim();
  if (!name || !phone) return alert("성명과 연락처는 필수입니다.");
  await addDoc(collection(db, "reviewers"), { name, org, title, phone });
  $("revName").value = ""; $("revOrg").value = ""; $("revTitle").value = ""; $("revPhone").value = "";
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
  const org = prompt("소속", r.org) ?? r.org;
  const title = prompt("직위", r.title) ?? r.title;
  const phone = prompt("연락처", r.phone) ?? r.phone;
  await updateDoc(doc(db, "reviewers", id), { name, org, title, phone });
  loadReviewers();
};

// ===================== 검토대상 운영계획서 =====================
async function loadTargets() {
  const snap = await getDocs(collection(db, "targets"));
  const filter = $("targetCourseFilter").value;
  const tbody = $("targetTable").querySelector("tbody");
  tbody.innerHTML = "";
  $("targetSelectForPdf").innerHTML = "";
  snap.forEach(d => {
    const r = d.data();
    if (filter && r.course !== filter) return;
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${r.univ||""}</td><td>${r.campus||""}</td><td>${r.course||""}</td><td>${r.dept||""}</td><td>${r.major||""}</td><td>${r.reviewerAssigned||""}</td>
      <td>${r.pdfUrl ? `<a href="${r.pdfUrl}" target="_blank">보기</a>` : "-"}</td>`;
    tbody.appendChild(tr);

    const op = document.createElement("option");
    op.value = d.id;
    op.textContent = `[${r.course}] ${r.univ} ${r.campus} ${r.dept} ${r.major||""}`;
    $("targetSelectForPdf").appendChild(op);
  });
}
$("targetCourseFilter").addEventListener("change", loadTargets);

$("uploadTargetBtn").addEventListener("click", async () => {
  const f = $("targetExcel").files[0];
  if (!f) return toast($("targetUploadMsg"), "엑셀 파일을 선택하세요.", true);
  try {
    const rows = await parseExcelFile(f);
    for (const row of rows) {
      await addDoc(collection(db, "targets"), {
        univ: row["대학"] || "",
        campus: row["캠퍼스"] || "",
        course: row["과정구분"] || row["과정"] || "",
        dept: row["학과"] || "",
        major: row["전공과정"] || "",
        reviewerAssigned: String(row["담당검토위원"] || "").trim(),
        pdfUrl: "", pdfPath: ""
      });
    }
    toast($("targetUploadMsg"), `${rows.length}건 저장 완료`);
    loadTargets();
  } catch (e) {
    toast($("targetUploadMsg"), "업로드 실패: " + e.message, true);
  }
});

$("uploadPdfBtn").addEventListener("click", async () => {
  const targetId = $("targetSelectForPdf").value;
  const f = $("pdfFile").files[0];
  if (!targetId || !f) return toast($("pdfUploadMsg"), "검토대상과 PDF를 선택하세요.", true);
  try {
    const snap = await getDoc(doc(db, "targets", targetId));
    const r = snap.data();
    const path = `reviewfiles/${r.course}/${targetId}_${f.name}`;
    const sref = ref(storage, path);
    await uploadBytes(sref, f);
    const url = await getDownloadURL(sref);
    await updateDoc(doc(db, "targets", targetId), { pdfUrl: url, pdfPath: path });
    toast($("pdfUploadMsg"), "PDF 업로드 완료");
    loadTargets();
  } catch (e) {
    toast($("pdfUploadMsg"), "업로드 실패: " + e.message, true);
  }
});

// ===================== 검토항목 등록 =====================
async function loadItems() {
  const snap = await getDocs(collection(db, "reviewItems"));
  const filter = $("itemCourseFilter").value;
  const tbody = $("itemTable").querySelector("tbody");
  tbody.innerHTML = "";
  snap.forEach(d => {
    const r = d.data();
    if (filter && r.course !== filter) return;
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${r.course||""}</td><td>${r.field||""}</td><td>${r.question||""}</td>
      <td><button class="btn small danger" onclick="window.__deleteItem('${d.id}')">삭제</button></td>`;
    tbody.appendChild(tr);
  });
}
$("itemCourseFilter").addEventListener("change", loadItems);

$("addItemBtn").addEventListener("click", async () => {
  const course = $("itemCourseSelect").value;
  const field = $("itemField").value.trim();
  const question = $("itemQuestion").value.trim();
  if (!course || !field || !question) return toast($("itemAddMsg"), "모든 항목을 입력하세요.", true);
  await addDoc(collection(db, "reviewItems"), { course, field, question });
  $("itemField").value = ""; $("itemQuestion").value = "";
  toast($("itemAddMsg"), "저장되었습니다.");
  loadItems();
});
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
      "과정": t.course || "", "대학": t.univ || "", "캠퍼스": t.campus || "", "학과": t.dept || "", "전공과정": t.major || "",
      "검토위원": rev.name || "", "검토분야": it.field || "", "검토문항": it.question || "",
      "결과": r.result || "", "검토의견": r.opinion || "", "등록일시": r.updatedAt || ""
    };
    _allResultsCache.push(row);
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${row["과정"]}</td><td>${row["대학"]} ${row["캠퍼스"]}</td><td>${row["학과"]}</td><td>${row["검토위원"]}</td>
      <td>${row["검토분야"]}</td><td>${row["검토문항"]}</td>
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
