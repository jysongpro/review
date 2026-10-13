// ===================================================================
// Firebase 프로젝트 설정
// Firebase 콘솔(https://console.firebase.google.com) > 프로젝트명: review
// > 프로젝트 설정 > 일반 > 내 앱(웹 앱 추가)에서 복사한 값으로 교체하세요.
// ===================================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getStorage
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import {
  getAuth
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyAw9Owk795ZpbpDx5hBf--20EYFEiMIWTE",
  authDomain: "review-2ec80.firebaseapp.com",
  projectId: "review-2ec80",
  storageBucket: "review-2ec80.firebasestorage.app",
  messagingSenderId: "222629901538",
  appId: "1:222629901538:web:0439c925db52c08a4fdabb",
  measurementId: "G-FQNJVNESGM"
  appId: "YOUR_APP_ID"
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const auth = getAuth(app);

// ---- 공통 상수 ----
// 교육운영계획서 과정 구분 (설계서 4번 항목)
export const COURSE_GROUPS = {
  "학위과정": ["2년제학위과정", "학위전공심화과정"],
  "직업교육과정": ["하이테크", "전문기술", "중장년특화장기", "일반계고위탁", "기능장"]
};

export const ALL_COURSES = Object.values(COURSE_GROUPS).flat();

export function courseCategory(course) {
  for (const [cat, list] of Object.entries(COURSE_GROUPS)) {
    if (list.includes(course)) return cat;
  }
  return "";
}
