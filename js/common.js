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
