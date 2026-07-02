---
description: API 키와 GPT 인증 상태를 안전하게 확인·재설정합니다. Usage: /auth-setup
---

claude-omo 인증 설정을 점검하고 재설정합니다.

터미널에서 아래 명령을 실행하세요:

```bash
node ~/mcp-servers/multi-model/auth-setup.js
```

상태만 확인:

```bash
node ~/mcp-servers/multi-model/auth-setup.js --status
```

환경변수에 이미 키가 있으면 저장만 수행:

```bash
GLM_API_KEY="$GLM_API_KEY" OPENAI_API_KEY="$OPENAI_API_KEY" \
  node ~/mcp-servers/multi-model/auth-setup.js --apply-env
```

주의:
- 입력값은 화면에 표시되지 않습니다.
- 저장 위치는 Claude MCP 설정 파일입니다.
- 적용 후 Claude Code를 재시작해야 새 MCP env가 반영됩니다.
- ChatGPT OAuth 직접 호출은 기본 인증 체인이 아니며, `OPENAI_API_KEY` 또는 `codex login`을 우선 사용하세요.
