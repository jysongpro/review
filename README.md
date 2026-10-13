# 교육운영계획서 검토 지원도구 (review)

설계서(설계서.txt)를 기반으로 제작한 웹기반 교육운영계획서 검토 지원도구입니다.
기존 "교과개편 세부기준 검수 지원도구(CurriculumChecker)"와 동일한 디자인 톤(네이비/블루)으로 제작했습니다.

## 1. 구성
- `index.html` : 메인 화면 (검토결과조회 / 검토위원 버튼, 우상단 관리자 버튼)
- `admin.html`, `js/admin.js` : 관리자 화면 (비밀번호 보호, 초기 비밀번호 `1234`, 관리자 화면에서 변경 가능)
- `reviewer.html`, `js/reviewer.js` : 검토위원 화면 (휴대폰 번호 + 인증번호 로그인)
- `result.html`, `js/result.js` : 검토결과조회 화면 (인증 없이 공개 조회)
- `js/firebase-config.js` : Firebase 프로젝트 연결 설정 + 과정 분류 상수
- `js/common.js` : 공통 유틸(엑셀 업로드/다운로드, 세션 관리 등)
- `firestore.rules`, `storage.rules` : Firebase 보안 규칙 (데모용, 배포 전 강화 필요)

## 2. 교육과정 분류 (설계서 4번)
- 학위과정: 2년제학위과정, 학위전공심화과정
- 직업교육과정: 하이테크, 전문기술, 중장년특화장기, 일반계고위탁, 기능장

## 3. Firestore 컬렉션 구조
| 컬렉션 | 설명 | 주요 필드 |
|---|---|---|
| `settings/admin` | 관리자 비밀번호 | password |
| `reviewers` | 검토위원 정보 | name, org, title, phone |
| `targets` | 검토대상 교육운영계획서 | univ, campus, course, dept, major, reviewerAssigned, pdfUrl, pdfPath |
| `reviewItems` | 교육과정별 검토항목(관리자 등록) | course, field(검토분야), question(검토문항) |
| `reviewResults` | 검토위원이 입력한 검토결과 | targetId, itemId, reviewerId, course, result(적합/부적합), opinion, updatedAt |
| `verificationCodes` | 검토위원 로그인용 인증번호(데모) | phone, code, createdAt, used |

PDF 원본 파일은 Firebase Storage의 `reviewfiles/{과정}/{targetId}_{파일명}.pdf` 경로에 저장됩니다.

## 4. 설치 및 배포 절차 (GitHub Pages + Firebase)

1. **Firebase 프로젝트 생성**
   - https://console.firebase.google.com 에서 프로젝트 이름 `review` 로 생성
   - Firestore Database 생성 (프로덕션 모드) 후 `firestore.rules` 내용 반영
   - Storage 생성 후 `storage.rules` 내용 반영
   - 프로젝트 설정 > 일반 > "웹 앱 추가" 로 구성값을 발급받아 `js/firebase-config.js`의
     `firebaseConfig` 값을 교체합니다.

2. **GitHub 저장소 준비**
   - 새 저장소 생성 후 이 폴더(`review-app/`) 전체를 루트에 업로드/커밋/푸시
   - 저장소 Settings > Pages 에서 배포 브랜치(main) / 루트(/) 선택 후 저장
   - 발급된 GitHub Pages 주소로 접속하면 서비스가 동작합니다.

3. **최초 사용**
   - 관리자 버튼 클릭 → 비밀번호 `1234` 입력(로그인 즉시 settings/admin 문서가 자동 생성됩니다)
   - 검토위원 등록(엑셀 업로드 또는 개별 추가)
   - 검토대상 운영계획서 목록 업로드 및 PDF 첨부
   - 과정별 검토항목(검토분야/검토문항) 등록
   - 비밀번호는 "비밀번호 변경" 탭에서 변경 가능

## 5. 검토위원 로그인 방식
검토위원 정보(이름, 소속, 직위, 휴대폰번호)는 **관리자가 엑셀로 사전에 일괄 등록**합니다.
별도의 회원가입이나 인증번호(OTP) 발급 절차 없이, **휴대폰번호 자체가 로그인 ID**입니다.

- 검토위원이 휴대폰번호를 입력하면 `reviewers` 컬렉션에서 숫자만 비교(하이픈 유무 무관)하여
  일치하는 레코드를 찾습니다.
- 일치하면 해당 검토위원 정보로 즉시 로그인되고, 그 검토위원에게 배정된 검토목록만 표시됩니다.
- 등록되지 않은 번호로는 로그인할 수 없으며 "관리자에게 등록을 요청하세요" 안내가 표시됩니다.
- SMS 인증번호 발송 절차는 사용하지 않습니다.

## 6. 각 화면별 기능 요약

### 관리자 (인증 후)
1. 검토위원 등록 - 엑셀 업로드/DB 저장/조회, 수정, 개별 추가
2. 검토대상 운영계획서 - 엑셀 업로드(대학/캠퍼스/과정구분/학과/전공과정/담당검토위원) + PDF 개별 업로드
3. 과정별 검토항목 등록 - 검토분야/검토문항 등록 (결과/의견은 검토위원이 입력)
4. 등록 내역 - 과정별 필터 조회 + 엑셀 저장

### 검토위원 (휴대폰 인증 후)
1. 로그인 시 본인 정보 및 배정된 검토목록(복수) 조회
2. 목록 선택 → 운영계획서 PDF 다운로드, 해당 과정의 검토문항에 결과(적합/부적합)·의견 입력
3. 저장 및 수정 가능

### 검토결과조회 (인증 없음)
1. 과정/대학/캠퍼스/학과/전공과정별 조회
2. 조회 후 엑셀 저장, 인쇄(출력) 가능

## 7. 커스터마이징 메모
- 디자인은 `css/style.css` 한 곳에서 색상(네이비 #0b2a4a / 블루 #1565c0) 관리
- 보안 규칙(`firestore.rules`, `storage.rules`)은 데모용으로, 운영 배포 전 관리자 인증
  기반 규칙으로 반드시 강화하세요.
