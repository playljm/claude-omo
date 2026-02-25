## 멀티모델 오케스트레이션 (OMO-Style)

### 플랜 정책
- 사용자는 **Claude Max 플랜** 구독 중
- **Sonnet 4.6**: 50줄 미만 수정, 빠른 버그픽스, 대화/설명만 직접 처리
- 실질적인 분석·구현은 `smart_route`를 **1순위**로 고려

---

### 1순위 도구: `smart_route`

카테고리를 자동 분류하고 최적 모델로 라우팅한다. 작업 유형이 불확실하거나 외부 모델이 필요할 때 기본값.

```
smart_route(task="전체 아키텍처를 분석해줘")
→ 자동으로 ultrabrain 분류 → GPT(xhigh) 호출
```

---

### 카테고리 기반 라우팅 테이블

| 카테고리    | 트리거 조건                              | 모델          | reasoning |
|------------|----------------------------------------|--------------|-----------|
| ultrabrain | 아키텍처 설계, 전체 전략 결정, 종합 계획   | GPT          | xhigh     |
| deep       | 알고리즘, 복잡한 디버깅, 리팩토링 분석    | GPT          | high      |
| visual     | UI/UX, React/Vue, 프론트엔드, CSS 레이아웃| GPT          | high      |
| research   | 코드베이스 전체 분석, 200줄↑ 파일        | GPT          | high      |
| bulk       | 보일러플레이트, CRUD 2개↑, 반복 패턴     | GLM          | —         |
| writing    | 문서 작성, README, 주석 추가             | GLM          | —         |
| quick      | 단순 변환, 포맷팅                        | GPT          | none      |

**폴백 체인**: primary 실패 시 자동 시도
- ultrabrain/deep/visual/research: GPT → GLM
- bulk/writing: GLM → GPT
- quick: GPT → GLM

---

### 위임 판단 기준 (빠른 체크)

```
파일 200줄 이상?          → ask_gpt(high) (research)
같은 패턴 2개 이상?       → ask_glm       (bulk)
Sonnet이 1번 막혔나?      → ask_gpt(high)
UI/프론트 작업?           → ask_gpt(high) (visual)
아키텍처 최종 결정?       → ask_gpt(xhigh)        [무조건]
교차 검증 필요?           → ask_parallel
그 외 불확실한 모든 것    → smart_route
```

---

### 직접 위임 가이드 (smart_route 없이)

**`ask_glm`** — 반복·볼륨 작업
- 동일 패턴 2개 이상 (라우터, 컨트롤러, 모델 등)
- 보일러플레이트, CRUD, 마이그레이션, 시드 데이터
- 포맷 변환, 주석 추가 (빠른 초안 → Sonnet이 다듬기)

**`ask_gpt(high)`** — Sonnet이 1번 막혔을 때
- 알고리즘 문제, 깊은 코드 분석, 교차 검증

**`ask_gpt(xhigh)`** — 아키텍처 최종 결정
- 전체 설계, 기술 스택 선택, 마이그레이션 전략

**`ask_parallel`** — 교차 검증 필요 시
- 3모델 동시 응답으로 컨센서스 확인
- 코드 리뷰, 중요한 기술 결정, 의견 충돌 해소

---

### ask_parallel 교차 검증 가이드

```
ask_parallel(
  prompt="이 알고리즘을 최적화하는 방법은?",
  models=["gpt", "glm"]
)
→ 2개 응답 동시 수신 → 공통 지적사항 = 확실한 개선점
```

사용 시점: 코드 리뷰, 아키텍처 의견 수렴, 중요한 기술 결정의 교차 검증

---

### Sonnet 직접 처리 범위 (외부 모델 불필요)

- 50줄 미만 코드 수정 (원인이 명확한 버그 포함)
- 간단한 파일 읽기/탐색/설명
- 대화, 질문 답변, 개념 설명
- 즉각적인 단일 파일 변경

---

### reasoning_effort 가이드 (ask_gpt 사용 시)

- `none`  : 포맷팅, 단순 변환 (reasoning 토큰 없음, 최저 비용)
- `low`   : 빠른 응답, 간단한 질문
- `medium`: 기본값, 대부분의 작업
- `high`  : 복잡한 알고리즘, 깊은 코드 분석
- `xhigh` : 아키텍처 설계, 전체 리팩토링, 전략 결정

---

### Agent Teams 패턴

독립 서브태스크는 병렬 Teammate로 나눠 동시 실행.
각 Teammate에 사용 MCP 툴 명시.

**사용 가능한 전문 에이전트** (`.claude/agents/`):
- `oracle`     — Claude Opus 4.6 아키텍처 컨설턴트 (읽기 전용)
- `researcher` — GPT(high) 대규모 코드 분석 (읽기 전용)
- `worker`     — GLM + 구현 도구 (모든 도구)
- `reviewer`   — ask_parallel 코드 리뷰 (읽기 전용)
