---
name: multi-model-config
description: 외부 모델(GPT/GLM) 설정·사용 상세 레퍼런스 — providers.json 프로바이더 추가/제거, reasoning_effort 선택 가이드, ask_parallel 교차 검증 예시. Use when adding or removing model providers, choosing reasoning effort, or running cross-validation — 트리거 providers.json, 프로바이더 추가, 모델 추가/제거, reasoning effort, ask_parallel.
---

# 멀티모델 설정·사용 상세 레퍼런스

CLAUDE.md의 OMO 라우팅 정책에서 이관된 상세 문서. 라우팅 테이블·위임 기준은 CLAUDE.md에 그대로 있고, 여기는 설정 변경과 세부 가이드만 담는다.

## 모델 추가/제거 (providers.json)

`~/mcp-servers/multi-model/providers.json`에서 외부 모델 프로바이더를 관리한다.

- **추가**: 새 프로바이더 블록을 등록. OpenAI 호환 API(`/v1/chat/completions` 스펙을 따르는 서비스)는
  `kind: "openai-chat"`으로 지정하면 코드 수정 없이 바로 붙는다.
- **제거**: 블록을 삭제하지 말고 `enabled: false`로 비활성화 (롤백 용이).
- 변경 후에는 반드시 Claude Code를 재시작해야 반영된다 (MCP 서버 프로세스 재기동 필요).
- **ToS 주의**: ChatGPT 계정의 OAuth 토큰을 직접 호출하는 방식은 이용약관 위반 소지가 있어 기본
  비활성화되어 있다. `OPENAI_API_KEY` 정식 API 키를 쓰거나, 이미 인증된 `codex` CLI를 경유하는
  방식을 권장한다.

## reasoning_effort 가이드 (ask_gpt 사용 시)

- `none`  : 포맷팅, 단순 변환 (reasoning 토큰 없음, 최저 비용)
- `low`   : 빠른 응답, 간단한 질문
- `medium`: 기본값, 대부분의 작업
- `high`  : 복잡한 알고리즘, 깊은 코드 분석
- `xhigh` : 아키텍처 설계, 전체 리팩토링, 전략 결정

## ask_parallel 교차 검증 가이드

```
ask_parallel(
  prompt="이 알고리즘을 최적화하는 방법은?",
  models=["gpt", "glm"]
)
→ 2개 응답 동시 수신 → 공통 지적사항 = 확실한 개선점
```

사용 시점: 코드 리뷰, 아키텍처 의견 수렴, 중요한 기술 결정의 교차 검증
