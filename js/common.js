import { ALL_COURSES, COURSE_GROUPS } from "./firebase-config.js";

// ---- 과정 선택 옵션 렌더링 ----
export function buildCourseOptions(selectEl, { withGroupLabel = true } = {}) {
  selectEl.innerHTML = '<option value="">선택하세요</option>';
  for (const [group, list] of Object.entries(COURSE_GROUPS)) {
    const og = document.createElement("optgroup");
    og.label = group;
    list.forEach(c => {
      const op = document.createElement("option");
      op.value = c;
      op.textContent = c;
      og.appendChild(op);
    });
    selectEl.appendChild(og);
  }
}

// ---- 관리자 로그인 상태 (Firebase Auth email/password 기반) ----
export function isAdminLoggedIn() {
  return sessionStorage.getItem("review_admin") === "1";
}
export function setAdminLoggedIn(v) {
  if (v) sessionStorage.setItem("review_admin", "1");
  else sessionStorage.removeItem("review_admin");
}

// ---- 검토위원 로그인 상태 ----
export function getReviewerSession() {
  const raw = sessionStorage.getItem("review_reviewer");
  return raw ? JSON.parse(raw) : null;
}
export function setReviewerSession(data) {
  sessionStorage.setItem("review_reviewer", JSON.stringify(data));
}
export function clearReviewerSession() {
  sessionStorage.removeItem("review_reviewer");
}

// ---- 엑셀 업로드 파싱 (SheetJS, index.html에서 CDN 로드 필요) ----
export function parseExcelFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
        resolve(rows);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

// ---- 엑셀 다운로드 ----
export function exportToExcel(rows, filename) {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "data");
  XLSX.writeFile(wb, filename);
}

// ---- 병합 셀이 포함된 엑셀 다운로드 (aoa: 배열의 배열, merges: [{s:{r,c},e:{r,c}}, ...]) ----
export function exportToExcelWithMerges(aoa, merges, filename, colWidths) {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!merges"] = merges;
  if (colWidths) ws["!cols"] = colWidths.map(w => ({ wch: w }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "data");
  XLSX.writeFile(wb, filename);
}

// ---- 랜덤 6자리 인증번호 ----
export function genCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// ---- 날짜 포맷 ----
export function nowStr() {
  const d = new Date();
  return d.toISOString().slice(0, 19).replace("T", " ");
}

export function toast(msgEl, text, isError = false) {
  msgEl.textContent = text;
  msgEl.className = "msg " + (isError ? "error" : "ok");
}

// ---- 검토항목 화면 순번 계산 ----
// DB에 저장된 mainNo 값은 중복·삭제 등으로 값 자체가 비어있거나 엉규 수 있어,
// 화면에 보여지는 순서(과정+구분 내에서 mainNo/subNo 정렬 순서)를 기준으로
// 매번 1부터 다시 매기는 순번 라벨을 계산해 준다. 입력: course+part가 같은 항목 배열(이미 정렬됨).
// 반환값: Map(itemId -> "1", "2-1" 등 현재 화면 순서 기준 라벨)
export function buildDisplayNoMap(sortedItems) {
  const map = new Map();
  let mainCounter = 0;
  let subCounter = 0;
  let lastGroupKey = null;
  sortedItems.forEach(it => {
    const groupKey = `${it.course}||${it.part}||${it.mainNo}`;
    if (!it.subNo) {
      mainCounter++;
      subCounter = 0;
      lastGroupKey = groupKey;
      map.set(it.id, `${mainCounter}`);
    } else {
      if (groupKey !== lastGroupKey) {
        // 부모 주항목이 없이 소항목만 있는 경우(드물때 만을 대비) 새 그룹으로 처리
        mainCounter++;
        subCounter = 0;
        lastGroupKey = groupKey;
      }
      subCounter++;
      map.set(it.id, `${mainCounter}-${subCounter}`);
    }
  });
  return map;
}

// 검토항목 배열을 정렬(course, part, mainNo, subNo 순)한 뒤 buildDisplayNoMap을 바로 적용해주는 헬퍼
export function sortAndLabelItems(items) {
  const sorted = [...items].sort((a, b) =>
    (a.course||"").localeCompare(b.course||"") ||
    (a.part||"").localeCompare(b.part||"") ||
    (a.mainNo||0) - (b.mainNo||0) || (a.subNo||0) - (b.subNo||0)
  );
  return { sorted, labelMap: buildDisplayNoMap(sorted) };
}
