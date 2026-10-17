# 자율성과지표 관리 (Netlify 배포판)

전문대학 혁신지원사업 자율성과지표 4종의 진척 현황을 보여 주는 웹 대시보드입니다.
**접속 코드와 수정 PIN이 없습니다.** 주소를 아는 사람은 누구나 보고, 실적을 입력하고, 저장할 수 있습니다.

- 화면: `public/index.html` (한 파일)
- 저장 API: `netlify/functions/api.mjs` (Netlify Functions)
- 데이터 저장소: Netlify Blobs (별도 DB 가입·설정 필요 없음)
- 처음 데이터: `data/seed.json` (2026 2분기 실적, 정의서 기준 목표, 보정 반영)

---

## 1. GitHub에 올리기

1. GitHub에서 **New repository** → 이름 예: `kpi-dashboard` → **Private** 선택 → Create
2. 저장소 화면에서 **uploading an existing file** 클릭
3. 압축을 푼 `kpi-netlify` 폴더 **안의 내용 전체**(public, netlify, data 폴더와 netlify.toml, package.json 등)를 끌어다 놓기
4. **Commit changes**

> `.gitignore`처럼 점(.)으로 시작하는 파일은 탐색기에서 안 보일 수 있습니다. 빠져도 동작에는 문제없습니다.

## 2. Netlify에 연결·배포

1. app.netlify.com 로그인 → **Add new project** → **Import an existing project** → **GitHub**
2. 위 저장소 선택
3. 빌드 설정은 `netlify.toml`에서 자동으로 읽습니다. 그대로 두고 **Deploy** 클릭
4. 1~2분 뒤 `https://○○○.netlify.app` 주소가 생깁니다. **Project configuration → Change project name**에서 주소 앞부분을 바꿀 수 있습니다.

이후 GitHub 저장소의 파일을 고치면 Netlify가 자동으로 다시 배포합니다.
**배포를 다시 해도 입력한 실적 데이터는 지워지지 않습니다**(Blobs에 따로 저장).

## 3. (선택) AI 보고 문안

1. Anthropic 콘솔에서 API 키 발급 (사용량만큼 요금 발생)
2. Netlify **Project configuration → Environment variables → Add a variable**
   - `ANTHROPIC_API_KEY` = 발급받은 키
   - `AI_MODEL` = (선택) 모델 이름, 기본값 `claude-sonnet-4-5`
3. **Deploys → Trigger deploy → Deploy project**로 다시 배포
4. [AI 요약 보고서] 팝업 아래 [AI로 보고 문안 작성] 버튼이 켜집니다.

키는 Netlify 서버에만 있고 화면에는 노출되지 않습니다. 같은 데이터로는 1분 안에 다시 호출하지 않습니다.
키를 넣지 않아도 자동 분석 보고서는 그대로 동작합니다.

## 4. 사용 방법

- **실적 입력**: 오른쪽 위 [실적 입력] → 입력자 이름 → 값 수정 → [저장]
  - 다른 사람 화면에는 1분 안에 자동 반영됩니다.
  - 동시에 고치면 나중 저장자에게 "다른 사용자가 먼저 저장했습니다"가 뜹니다. [새로 불러오기] 후 다시 입력하세요.
- **변경 이력·복원**: [실적 입력] 패널 아래쪽에 최근 저장 이력이 있습니다. [이 시점으로 복원]을 두 번 누르면 되돌립니다. 최근 60개까지 보관합니다.
- **목표값·가중치 변경**: [백업 내려받기]로 JSON 파일을 받아 고친 뒤 [백업 불러오기]로 올립니다.
  - `targets`: [1차, 2차, 3차 목표] / `actuals`: [1차, 2차, 3차 확정 실적] / `cur`: 진행 중 연차 현재 실적 / `prov`: 시점형 잠정값
- **처음 데이터로 되돌리기**: 변경 이력의 가장 오래된 항목으로 복원하세요.
  `data/seed.json`은 아직 한 번도 저장하지 않은 사이트에서만 쓰입니다.

## 5. 꼭 알아 두실 점 (보안)

- 이 판은 **인터넷에 공개된 주소에서 누구나 수정할 수 있습니다.** 주소가 유출되면 외부인이 수치를 바꿀 수 있습니다.
  - 주소는 관계자에게만 공유하세요. 검색엔진 수집은 막아 두었습니다(noindex).
  - 잘못 바뀌면 변경 이력에서 복원하세요.
- 접근을 막아야 하면 Netlify 유료 요금제의 **Password protection**(사이트 전체 비밀번호)을 켜거나, 이전에 드린 PIN 판(kpi-app)을 내부망에서 쓰세요.
- 대학 내부 성과 자료이므로, 외부 클라우드 게시가 학내 정보보안 지침에 맞는지 먼저 확인하세요.

## 6. 무료 사용량 참고

열려 있는 화면마다 1분에 한 번 변경 여부를 확인합니다(탭이 숨겨져 있으면 확인하지 않음).
여러 명이 하루 종일 켜 두면 Netlify Functions 호출 수가 늘어나니, 요금제 사용량을 가끔 확인하세요.

## 폴더 구성

```
public/index.html            화면 (파일만 더블클릭해도 이 PC 전용 모드로 동작)
netlify/functions/api.mjs     저장·이력·복원·AI 요약 API
data/seed.json               처음 데이터
netlify.toml                 Netlify 설정
package.json                 의존성 (@netlify/blobs)
```
