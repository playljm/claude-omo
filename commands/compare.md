---
description: ask_parallel을 통해 GPT/Gemini/GLM 3개 모델의 응답을 동시에 비교합니다. 코드 리뷰, 기술 결정, 교차 검증에 유용.
---

다음 내용을 `mcp__multi-model-agent__ask_parallel` 도구로 3개 모델에 동시에 전달하세요:

**프롬프트**: $ARGUMENTS

`ask_parallel` 도구를 호출할 때:
- `prompt` 파라미터에 위 내용 전달
- `models`는 생략 (기본: gpt, gemini, glm 전체)
- 코드 리뷰라면 실제 코드를 프롬프트에 포함

응답을 받은 후:
1. 3개 모델의 응답을 비교 분석
2. **공통 지적사항** (컨센서스) 추출 → 확실한 개선점
3. **모델별 독특한 의견** 정리
4. 최종 권고사항 제시 (공통 의견 우선)
