import { db, storage } from "./firebase-config.js";
import {
  collection, getDocs, query, where, doc, getDoc, setDoc, addDoc, updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { setReviewerSession, getReviewerSession, clearReviewerSession, nowStr, toast } from "./common.js";

const $ = (id) => document.getElementById(id);

// =========================================================================
// 로그인 방식
// 검토위원 정보(휴대폰번호, 대학, 캠퍼스, 학과명, 계열, 직급, 성명, 이메일)는
// 관리자가 엑셀로 사전 일괄 등록합니다. reviewers 컬렉션의 문서 ID가 곧 휴대폰번호입니다.
// 별도 회원가입/인증번호 발급 절차 없이, 휴대폰번호 자체가 로그인 ID 역할을 합니다.
// 입력한 번호와 일치하는 문서 ID(reviewers/{phone})가 있으면 해당 검토위원으로 로그인됩니다.
//
// 진행상태
// - 미작성: 저장된 검토결과가 하나도 없음
// - 작성중: 저장(임시) 버튼으로 결과를 1건 이상 저장했지만 최종제출은 안 함
// - 최종제출완료: reviewSubmissions/{targetId_reviewerId} 문서가 status="submitted"
//   → 이후에는 해당 검토대상의 입력이 모두 잠겨 수정 불가
// =========================================================================

function normalizePhone(v) {
  return (v || "").toString().replace(/[^0-9]/g, "");
}

async function findReviewerByPhone(phoneDigits) {
  const snap = await getDoc(doc(db, "reviewers", phoneDigits));
  if (snap.exists()) return { id: snap.id, data: () => snap.data() };
  // 구 버전 데이터(문서 ID가 휴대폰번호가 아닌 경우)를 위한 호환 검색
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
  $("reviewerInfo").textContent =
    `${r.name} (${r.univ || ""} ${r.campus || ""} ${r.dept || ""} ${r.track || ""} ${r.title || ""}) / ${r.phone}${r.email ? " / " + r.email : ""}`;
  loadAssigned();
}

function submissionId(targetId, reviewerId) {
  return `${targetId}_${reviewerId}`;
}

async function loadAssigned() {
  const r = getReviewerSession();
  const [targetsSnap, resultsSnap, submissionsSnap] = await Promise.all([
    getDocs(collection(db, "targets")),
    getDocs(collection(db, "reviewResults")),
    getDocs(collection(db, "reviewSubmissions"))
  ]);

  const myResultTargetIds = new Set(
    resultsSnap.docs.filter(d => d.data().reviewerId === r.id).map(d => d.data().targetId)
  );
  const mySubmittedTargetIds = new Set();
  submissionsSnap.forEach(d => {
    const s = d.data();
    if (s.reviewerId === r.id && s.status === "submitted") mySubmittedTargetIds.add(s.targetId);
  });

  const tbody = $("assignedTable").querySelector("tbody");
  tbody.innerHTML = "";
  let count = 0;
  targetsSnap.forEach(d => {
    const t = d.data();
    const assigned = (t.reviewerAssigned || "");
    // 담당검토위원 컬럼은 휴대폰번호(ID)로 저장되며, 구버전(이름) 데이터도 호환 매칭
    const isMine = assigned && (normalizePhone(assigned) === normalizePhone(r.phone) || assigned === r.name);
    if (!isMine) return;
    count++;

    let statusBadge;
    if (mySubmittedTargetIds.has(d.id)) {
      statusBadge = '<span class="badge ok">최종제출완료</span>';
    } else if (myResultTargetIds.has(d.id)) {
      statusBadge = '<span class="badge pending" style="background:#fff3cd;color:#8a6d00;">작성중</span>';
    } else {
      statusBadge = '<span class="badge pending">미작성</span>';
    }

    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${t.univ||""}</td><td>${t.campus||""}</td><td>${t.dept||""}</td><td>${t.major||""}</td><td>${t.collage||""}</td>
      <td>${statusBadge}</td>
      <td><button class="btn small" data-id="${d.id}">선택</button></td>`;
    tbody.appendChild(tr);
  });
  if (count === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:#999;">배정된 교육운영계획서 검토 목록이 없습니다.</td></tr>`;
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
  $("reviewPanelTitle").textContent = `교육운영계획서 검토 하기`;

  // 검토목록에 저장된 모든 정보를 상세히 표기
  const infoParts = [
    t.univ ? `<b>대학</b> ${t.univ}` : "",
    t.campus ? `<b>캠퍼스</b> ${t.campus}` : "",
    t.dept ? `<b>학과</b> ${t.dept}` : "",
    t.major ? `<b>전공</b> ${t.major}` : "",
    t.collage ? `<b>계열</b> ${t.collage}` : "",
    t.course ? `<b>과정구분</b> ${t.course}` : "",
    t.cate ? `<b>분야</b> ${t.cate}` : "",
    t.per ? `<b>기간</b> ${t.per}` : "",
    t.dn ? `<b>주야</b> ${t.dn}` : ""
  ].filter(Boolean);
  $("reviewPanelInfo").innerHTML = infoParts.join(" &nbsp;|&nbsp; ");

  $("pdfLink").href = t.pdfUrl || "#";
  $("pdfLink").textContent = t.pdfUrl ? "운영계획서 PDF 다운로드" : "업로드된 PDF가 없습니다";

  const subSnap = await getDoc(doc(db, "reviewSubmissions", submissionId(targetId, r.id)));
  const isSubmitted = subSnap.exists() && subSnap.data().status === "submitted";

  const itemsSnap = await getDocs(query(collection(db, "reviewItems"), where("course", "==", t.course)));
  const resultsSnap = await getDocs(query(
    collection(db, "reviewResults"), where("targetId", "==", targetId), where("reviewerId", "==", r.id)
  ));
  const existing = {};
  resultsSnap.forEach(d => existing[d.data().itemId] = { id: d.id, ...d.data() });

  const tbody1 = $("reviewItemsTablePart1").querySelector("tbody");
  const tbody2 = $("reviewItemsTablePart2").querySelector("tbody");
  tbody1.innerHTML = ""; tbody2.innerHTML = "";

  function itemNoLabel(it) {
    return it.subNo ? `${it.mainNo||""}-${it.subNo}` : `${it.mainNo||""}`;
  }

  function renderRow(d) {
    const it = d.data();
    const ex = existing[d.id];
    const tr = document.createElement("tr");
    tr.dataset.itemId = d.id;
    tr.innerHTML = `
      <td>${itemNoLabel(it)}</td>
      <td>${it.question}</td>
      <td>
        <select class="resultSelect" ${isSubmitted ? "disabled" : ""}>
          <option value="">선택</option>
          <option value="적합" ${ex && ex.result==="적합" ? "selected":""}>적합</option>
          <option value="부적합" ${ex && ex.result==="부적합" ? "selected":""}>부적합</option>
        </select>
      </td>
      <td><input type="text" class="opinionInput" style="width:100%;" ${isSubmitted ? "disabled" : ""} value="${ex ? (ex.opinion||"").replace(/"/g,'&quot;') : ""}"></td>
    `;
    return tr;
  }

  const itemRows = [];
  itemsSnap.forEach(d => itemRows.push({ id: d.id, ...d.data() }));
  itemRows.sort((a, b) => (a.mainNo||0) - (b.mainNo||0) || (a.subNo||0) - (b.subNo||0));
  itemRows.forEach(it => {
    const tbody = it.part === "part2" ? tbody2 : tbody1;
    tbody.appendChild(renderRow({ id: it.id, data: () => it }));
  });
  if (!tbody1.children.length) tbody1.innerHTML = `<tr><td colspan="4" style="text-align:center;color:#999;">등록된 검토항목이 없습니다.</td></tr>`;
  if (!tbody2.children.length) tbody2.innerHTML = `<tr><td colspan="4" style="text-align:center;color:#999;">등록된 검토항목이 없습니다.</td></tr>`;

  $("submittedNotice").style.display = isSubmitted ? "block" : "none";
  $("reviewActionBtns").style.display = isSubmitted ? "none" : "block";

  $("saveReviewBtn").onclick = async () => {
    const trRows = [...tbody1.querySelectorAll("tr"), ...tbody2.querySelectorAll("tr")];
    let savedAny = false;
    for (const row of trRows) {
      const itemId = row.dataset.itemId;
      if (!itemId) continue;
      const result = row.querySelector(".resultSelect").value;
      const opinion = row.querySelector(".opinionInput").value;
      if (!result && !opinion) continue;
      savedAny = true;
      const ex = existing[itemId];
      if (ex) {
        await updateDoc(doc(db, "reviewResults", ex.id), { result, opinion, updatedAt: nowStr() });
      } else {
        await addDoc(collection(db, "reviewResults"), {
          targetId, itemId, reviewerId: r.id, course: t.course, result, opinion, updatedAt: nowStr()
        });
      }
    }
    if (savedAny) {
      // 저장 버튼을 눌렀다는 것은 "작성중" 상태로 진입했다는 뜻이므로 표시용 문서를 남김
      await setDoc(doc(db, "reviewSubmissions", submissionId(targetId, r.id)), {
        targetId, reviewerId: r.id, status: "draft", updatedAt: nowStr()
      }, { merge: true });
    }
    toast($("saveMsg"), "저장되었습니다.");
    loadAssigned();
    openReviewPanel(targetId);
  };

  $("submitFinalBtn").onclick = async () => {
    if (!confirm("최종 제출하면 더 이상 수정할 수 없습니다. 제출하시겠습니까?")) return;
    await setDoc(doc(db, "reviewSubmissions", submissionId(targetId, r.id)), {
      targetId, reviewerId: r.id, status: "submitted", submittedAt: nowStr()
    }, { merge: true });
    toast($("saveMsg"), "최종 제출이 완료되었습니다.");
    loadAssigned();
    openReviewPanel(targetId);
  };
}
