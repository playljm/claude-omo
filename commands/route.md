---
description: smart_route를 통해 최적 AI 모델로 작업을 라우팅합니다. 카테고리 자동 분류 후 GPT/Gemini/GLM 중 최적 모델 선택.
---

다음 작업을 `mcp__multi-model-agent__smart_route` 도구로 전달하세요:

**작업**: $ARGUMENTS

`smart_route` 도구를 호출할 때:
- `task` 파라미터에 위 작업 내용을 그대로 전달
- `category`는 생략 (자동 분류)
- 필요하면 현재 파일/코드 내용을 `context`에 추가

결과를 사용자에게 전달할 때 다음을 명시하세요:
1. 어떤 카테고리로 분류되었는지 (`[smart_route: category → model]` 헤더 확인)
2. 어떤 모델이 응답했는지
3. 폴백이 발생했다면 그 이유
