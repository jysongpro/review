import { db, storage } from "./firebase-config.js";
import {
  collection, getDocs, query, where, doc, getDoc, setDoc, addDoc, updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { setReviewerSession, getReviewerSession, clearReviewerSession, nowStr, toast, sortAndLabelItems } from "./common.js";

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
// - 작성중: 저장 버튼으로 결과를 1건 이상 저장했지만 최종제출은 안 함 (목록의 진행상태 칸에서 최종제출 가능)
// - 최종제출완료: reviewSubmissions/{targetId_reviewerId} 문서가 status="submitted"
//   → 이후에는 해당 검토대상의 입력이 모두 잠겨 수정 불가
// =========================================================================

function normalizePhone(v) {
  return (v || "").toString().replace(/[^0-9]/g, "");
}

async function findReviewerByPhone(phoneDigits) {
  const snap = await getDoc(doc(db, "reviewers", phoneDigits));
  if (snap.exists()) return { id: snap.id, data: () => snap.data() };
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
    const isMine = assigned && (normalizePhone(assigned) === normalizePhone(r.phone) || assigned === r.name);
    if (!isMine) return;
    count++;

    const isSubmitted = mySubmittedTargetIds.has(d.id);
    const isDraft = !isSubmitted && myResultTargetIds.has(d.id);

    let statusCell;
    if (isSubmitted) {
      statusCell = '<span class="badge ok">최종제출완료</span>';
    } else if (isDraft) {
      statusCell = `<span class="badge pending" style="background:#fff3cd;color:#8a6d00;">작성중</span>
        <button class="btn small danger" style="margin-left:6px;" data-final-id="${d.id}">최종제출</button>`;
    } else {
      statusCell = '<span class="badge pending">미작성</span>';
    }

    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${count}</td><td>${t.curri||t.course||""}</td><td>${t.collage||""}</td><td>${t.campus||""}</td><td>${t.dept||""}</td><td>${t.major||""}</td><td>${t.cate||""}</td>
      <td>${statusCell}</td>
      <td><button class="btn small" data-id="${d.id}">검토하기</button></td>`;
    tbody.appendChild(tr);
  });
  if (count === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;color:#999;">배정된 교육운영계획서 검토 목록이 없습니다.</td></tr>`;
  }
  tbody.querySelectorAll("button[data-id]").forEach(btn => {
    btn.addEventListener("click", () => openReviewPanel(btn.dataset.id));
  });
  tbody.querySelectorAll("button[data-final-id]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      submitFinal(btn.dataset.finalId);
    });
  });
}

async function submitFinal(targetId) {
  const r = getReviewerSession();

  // 최종제출 전 검증: 해당 검토대상의 모든 검토항목(1·2번 파트 전체)에 검토의견이 저장되어 있어야 함
  const tSnap = await getDoc(doc(db, "targets", targetId));
  const t = tSnap.exists() ? tSnap.data() : {};
  const itemsSnap = await getDocs(query(collection(db, "reviewItems"), where("course", "==", t.course)));
  const resultsSnap = await getDocs(query(
    collection(db, "reviewResults"), where("targetId", "==", targetId), where("reviewerId", "==", r.id)
  ));
  const opinionByItem = {};
  const resultByItem = {};
  resultsSnap.forEach(d => {
    opinionByItem[d.data().itemId] = (d.data().opinion || "").trim();
    resultByItem[d.data().itemId] = d.data().result || "";
  });

  const missing = [];
  itemsSnap.forEach(d => {
    const it = d.data();
    if (!opinionByItem[d.id] || !resultByItem[d.id]) {
      missing.push(`${it.mainNo||""}`);
    }
  });
  if (missing.length) {
    alert(`모든 검토항목의 검토결과(적합/부적합)와 검토의견을 입력해야 최종제출할 수 있습니다.\n(미입력 항목: ${missing.join(", ")})\n\n"검토하기"를 눌러 먼저 저장해 주세요.`);
    return;
  }

  // 검토결과(적합/부적합)와 최종검토의견이 모두 입력되어야 최종제출 가능
  const subSnap = await getDoc(doc(db, "reviewSubmissions", submissionId(targetId, r.id)));
  const subData = subSnap.exists() ? subSnap.data() : {};
  const finalResult = subData.finalResult || "";
  const finalOpinion = (subData.finalOpinion || "").trim();
  if (finalResult !== "적합" && finalResult !== "부적합") {
    alert("검토결과(적합/부적합)가 확정되지 않았습니다.\n모든 검토항목에 결과를 선택하고 \"저장\" 버튼을 눌러 저장한 뒤 다시 시도해 주세요.");
    return;
  }
  if (!finalOpinion) {
    alert("최종검토의견을 입력하고 \"저장\" 버튼을 눌러 저장한 뒤 최종제출해 주세요.");
    return;
  }

  if (!confirm("최종 제출하면 더 이상 수정할 수 없습니다. 제출하시겠습니까?")) return;
  await setDoc(doc(db, "reviewSubmissions", submissionId(targetId, r.id)), {
    targetId, reviewerId: r.id, status: "submitted", submittedAt: nowStr()
  }, { merge: true });
  loadAssigned();
}

function openModal() { $("reviewModal").classList.add("open"); }
function closeModal() { $("reviewModal").classList.remove("open"); }
$("modalCloseBtn").addEventListener("click", closeModal);
$("reviewModal").addEventListener("click", (e) => { if (e.target.id === "reviewModal") closeModal(); });

async function openReviewPanel(targetId) {
  const r = getReviewerSession();
  const tSnap = await getDoc(doc(db, "targets", targetId));
  const t = tSnap.data();

  // 검토 대상 정보를 2행 표(헤더행 + 값행)로 표시
  const infoCols = [
    ["과정", t.curri || t.course || ""],
    ["대학", t.collage || ""],
    ["캠퍼스", t.campus || ""],
    ["학과", t.dept || ""],
    ["전공", t.major || ""],
    ["계열", t.cate || ""],
    ["기간", t.per || ""],
    ["주야", t.dn || ""]
  ];
  $("reviewInfoTable").innerHTML =
    `<thead><tr>${infoCols.map(c => `<th>${c[0]}</th>`).join("")}</tr></thead>
     <tbody><tr>${infoCols.map(c => `<td>${c[1] || "-"}</td>`).join("")}</tr></tbody>`;

  if (t.pdfUrl) {
    $("pdfViewLink").style.display = "inline-block";
    $("pdfDownloadLink").style.display = "inline-block";
    $("pdfNone").style.display = "none";
    $("pdfViewLink").href = t.pdfUrl;
    $("pdfDownloadLink").href = t.pdfUrl;
    $("pdfDownloadLink").setAttribute("download", t.filename || "");
  } else {
    $("pdfViewLink").style.display = "none";
    $("pdfDownloadLink").style.display = "none";
    $("pdfNone").style.display = "inline";
  };

  const subSnap = await getDoc(doc(db, "reviewSubmissions", submissionId(targetId, r.id)));
  const isSubmitted = subSnap.exists() && subSnap.data().status === "submitted";

  const itemsSnap = await getDocs(query(collection(db, "reviewItems"), where("course", "==", t.course)));
  const resultsSnap = await getDocs(query(
    collection(db, "reviewResults"), where("targetId", "==", targetId), where("reviewerId", "==", r.id)
  ));
  const existing = {};
  resultsSnap.forEach(d => existing[d.data().itemId] = { id: d.id, ...d.data() });

  const subData = subSnap.exists() ? subSnap.data() : {};
  $("finalOpinionInput").value = subData.finalOpinion || "";
  $("finalOpinionInput").disabled = isSubmitted;

  const tbody1 = $("reviewItemsTablePart1").querySelector("tbody");
  const tbody2 = $("reviewItemsTablePart2").querySelector("tbody");
  tbody1.innerHTML = ""; tbody2.innerHTML = "";

  function renderRow(d, label) {
    const it = d.data();
    const ex = existing[d.id];
    const tr = document.createElement("tr");
    tr.dataset.itemId = d.id;
    tr.innerHTML = `
      <td>${label}</td>
      <td>${it.question}</td>
      <td>
        <select class="resultSelect" ${isSubmitted ? "disabled" : ""}>
          <option value="">선택</option>
          <option value="적합" ${ex && ex.result==="적합" ? "selected":""}>적합</option>
          <option value="부적합" ${ex && ex.result==="부적합" ? "selected":""}>부적합</option>
        </select>
      </td>
      <td><textarea class="opinionInput" maxlength="50" rows="2" style="width:100%;resize:vertical;white-space:pre-wrap;word-break:break-all;" ${isSubmitted ? "disabled" : ""}>${ex ? (ex.opinion||"") : ""}</textarea></td>
    `;
    return tr;
  }

  const itemRowsRaw = [];
  itemsSnap.forEach(d => itemRowsRaw.push({ id: d.id, ...d.data() }));
  const { sorted: itemRows, labelMap: itemLabelMap } = sortAndLabelItems(itemRowsRaw);
  itemRows.forEach(it => {
    const tbody = it.part === "part2" ? tbody2 : tbody1;
    tbody.appendChild(renderRow({ id: it.id, data: () => it }, itemLabelMap.get(it.id)));
  });
  if (!tbody1.children.length) tbody1.innerHTML = `<tr><td colspan="4" style="text-align:center;color:#999;">등록된 검토항목이 없습니다.</td></tr>`;
  if (!tbody2.children.length) tbody2.innerHTML = `<tr><td colspan="4" style="text-align:center;color:#999;">등록된 검토항목이 없습니다.</td></tr>`;

  // 최종결과 자동 계산: 하나라도 부적합이면 부적합, 모든 항목이 적합이면 적합, 그 외(미입력 포함)는 미정
  function recomputeFinalResult() {
    const selects = [...tbody1.querySelectorAll(".resultSelect"), ...tbody2.querySelectorAll(".resultSelect")];
    const values = selects.map(s => s.value);
    let finalResult = "미정";
    if (values.length && values.some(v => v === "부적합")) finalResult = "부적합";
    else if (values.length && values.every(v => v === "적합")) finalResult = "적합";
    $("finalResultInput").value = finalResult;
    return finalResult;
  }
  [...tbody1.querySelectorAll(".resultSelect"), ...tbody2.querySelectorAll(".resultSelect")].forEach(sel => {
    sel.addEventListener("change", recomputeFinalResult);
  });
  recomputeFinalResult();

  $("submittedNotice").style.display = isSubmitted ? "block" : "none";
  $("reviewActionBtns").style.display = isSubmitted ? "none" : "block";
  $("saveMsg").textContent = "";

  $("saveReviewBtn").onclick = async () => {
    const trRows = [...tbody1.querySelectorAll("tr"), ...tbody2.querySelectorAll("tr")].filter(row => row.dataset.itemId);

    let savedAny = false;
    for (const row of trRows) {
      const itemId = row.dataset.itemId;
      const result = row.querySelector(".resultSelect").value;
      const opinion = row.querySelector(".opinionInput").value.slice(0, 50);
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
    const finalResult = recomputeFinalResult();
    const finalOpinion = $("finalOpinionInput").value.slice(0, 100);
    await setDoc(doc(db, "reviewSubmissions", submissionId(targetId, r.id)), {
      targetId, reviewerId: r.id,
      status: savedAny || subData.status === "draft" ? "draft" : (subData.status || "draft"),
      finalResult, finalOpinion, updatedAt: nowStr()
    }, { merge: true });
    toast($("saveMsg"), "저장되었습니다.");
    loadAssigned();
    openReviewPanel(targetId);
  };

  openModal();
}
