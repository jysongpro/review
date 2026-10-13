import { db, storage } from "./firebase-config.js";
import {
  collection, getDocs, query, where, doc, getDoc, addDoc, updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { setReviewerSession, getReviewerSession, clearReviewerSession, nowStr, toast } from "./common.js";

const $ = (id) => document.getElementById(id);

// =========================================================================
// 로그인 방식
// 검토위원 정보(이름, 소속, 직위, 휴대폰번호)는 관리자가 엑셀로 사전 일괄 등록합니다.
// 별도 회원가입/인증번호 발급 절차 없이, 휴대폰번호 자체가 로그인 ID 역할을 합니다.
// 입력한 번호가 reviewers 컬렉션에 등록된 번호와 일치하면 해당 검토위원으로 로그인됩니다.
// =========================================================================

function normalizePhone(v) {
  return (v || "").replace(/[^0-9]/g, "");
}

async function findReviewerByPhone(phoneDigits) {
  const all = await getDocs(collection(db, "reviewers"));
  return all.docs.find(d => normalizePhone(d.data().phone) === phoneDigits);
}

$("loginBtn").addEventListener("click", async () => {
  const phone = normalizePhone($("phoneInput").value);
  if (phone.length < 10) return toast($("loginMsg"), "휴대폰 번호를 정확히 입력하세요.", true);

  const matched = await findReviewerByPhone(phone);
  if (!matched) {
    return toast($("loginMsg"), "등록되지 않은 휴대폰 번호입니다. 관리자에게 등록을 요청하세요.", true);
  }

  setReviewerSession({ id: matched.id, ...matched.data() });
  showMain();
});
$("phoneInput").addEventListener("keydown", (e) => { if (e.key === "Enter") $("loginBtn").click(); });

$("logoutBtn").addEventListener("click", () => {
  clearReviewerSession();
  location.reload();
});

const session = getReviewerSession();
if (session) showMain();

function showMain() {
  const r = getReviewerSession();
  $("loginView").style.display = "none";
  $("mainView").style.display = "block";
  $("reviewerInfo").textContent = `${r.name} (${r.org || ""} ${r.title || ""}) / ${r.phone}`;
  loadAssigned();
}

async function loadAssigned() {
  const r = getReviewerSession();
  const targetsSnap = await getDocs(collection(db, "targets"));
  const resultsSnap = await getDocs(collection(db, "reviewResults"));
  const doneTargetIds = new Set(resultsSnap.docs.filter(d => d.data().reviewerId === r.id).map(d => d.data().targetId));

  const tbody = $("assignedTable").querySelector("tbody");
  tbody.innerHTML = "";
  let count = 0;
  targetsSnap.forEach(d => {
    const t = d.data();
    const assigned = (t.reviewerAssigned || "");
    // 담당검토위원 컬럼은 이름 또는 휴대폰번호 어느 쪽으로 기재되어도 매칭되도록 처리
    const isMine = assigned && (assigned === r.name || normalizePhone(assigned) === normalizePhone(r.phone));
    if (!isMine) return;
    count++;
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${t.course||""}</td><td>${t.univ||""}</td><td>${t.campus||""}</td><td>${t.dept||""}</td><td>${t.major||""}</td>
      <td>${doneTargetIds.has(d.id) ? '<span class="badge ok">작성완료</span>' : '<span class="badge pending">미작성</span>'}</td>
      <td><button class="btn small" data-id="${d.id}">선택</button></td>`;
    tbody.appendChild(tr);
  });
  if (count === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:#999;">배정된 검토목록이 없습니다.</td></tr>`;
  }
  tbody.querySelectorAll("button[data-id]").forEach(btn => {
    btn.addEventListener("click", () => openReviewPanel(btn.dataset.id));
  });
}

async function openReviewPanel(targetId) {
  const r = getReviewerSession();
  const tSnap = await getDoc(doc(db, "targets", targetId));
  const t = tSnap.data();
  $("reviewPanel").style.display = "block";
  $("reviewPanelTitle").textContent = `검토 입력 - [${t.course}] ${t.univ} ${t.campus} ${t.dept} ${t.major||""}`;
  $("pdfLink").href = t.pdfUrl || "#";
  $("pdfLink").textContent = t.pdfUrl ? "운영계획서 PDF 다운로드" : "업로드된 PDF가 없습니다";

  const itemsSnap = await getDocs(query(collection(db, "reviewItems"), where("course", "==", t.course)));
  const resultsSnap = await getDocs(query(
    collection(db, "reviewResults"), where("targetId", "==", targetId), where("reviewerId", "==", r.id)
  ));
  const existing = {};
  resultsSnap.forEach(d => existing[d.data().itemId] = { id: d.id, ...d.data() });

  const tbody = $("reviewItemsTable").querySelector("tbody");
  tbody.innerHTML = "";
  itemsSnap.forEach(d => {
    const it = d.data();
    const ex = existing[d.id];
    const tr = document.createElement("tr");
    tr.dataset.itemId = d.id;
    tr.innerHTML = `
      <td>${it.field}</td>
      <td>${it.question}</td>
      <td>
        <select class="resultSelect">
          <option value="">선택</option>
          <option value="적합" ${ex && ex.result==="적합" ? "selected":""}>적합</option>
          <option value="부적합" ${ex && ex.result==="부적합" ? "selected":""}>부적합</option>
        </select>
      </td>
      <td><input type="text" class="opinionInput" style="width:100%;" value="${ex ? (ex.opinion||"").replace(/"/g,'&quot;') : ""}"></td>
    `;
    tbody.appendChild(tr);
  });
  if (itemsSnap.empty) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:#999;">등록된 검토항목이 없습니다. 관리자에게 문의하세요.</td></tr>`;
  }

  $("saveReviewBtn").onclick = async () => {
    const rows = tbody.querySelectorAll("tr[data-item-id], tr");
    const trRows = tbody.querySelectorAll("tr");
    for (const row of trRows) {
      const itemId = row.dataset.itemId;
      if (!itemId) continue;
      const result = row.querySelector(".resultSelect").value;
      const opinion = row.querySelector(".opinionInput").value;
      if (!result && !opinion) continue;
      const ex = existing[itemId];
      if (ex) {
        await updateDoc(doc(db, "reviewResults", ex.id), { result, opinion, updatedAt: nowStr() });
      } else {
        await addDoc(collection(db, "reviewResults"), {
          targetId, itemId, reviewerId: r.id, course: t.course, result, opinion, updatedAt: nowStr()
        });
      }
    }
    toast($("saveMsg"), "저장되었습니다.");
    loadAssigned();
    openReviewPanel(targetId);
  };
}
