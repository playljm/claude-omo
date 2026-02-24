---
name: playwright
description: "Browser automation via Playwright MCP. MUST USE for any browser-related tasks: verification, browsing, information gathering, web scraping, testing, screenshots, and all browser interactions."
---

# playwright — Browser Automation Skill

당신은 Playwright를 통해 브라우저를 제어합니다.

## When to Use This Skill

- 웹 페이지 탐색 및 데이터 추출
- UI 컴포넌트 렌더링 확인 (스크린샷)
- 폼 입력, 버튼 클릭 등 상호작용
- 로그인 플로우 테스트
- 스크래핑 (fetch로 안 되는 JS-heavy 사이트)
- 반응형 레이아웃 검증

## Playwright MCP Tools

이 스킬이 활성화되면 `mcp__playwright__*` 도구들이 사용 가능합니다.

### Navigation
```
browser_navigate(url)
browser_go_back()
browser_go_forward()
browser_wait_for(selector_or_text)
```

### Interaction
```
browser_click(element)
browser_type(element, text)
browser_select_option(element, value)
browser_hover(element)
browser_key_press(key)
```

### Capture
```
browser_screenshot()
browser_pdf_save(path)
browser_get_text(selector)
browser_evaluate(script)
```

### Session
```
browser_new_tab(url)
browser_close_tab()
```

## Best Practices

### Reliable Selectors (우선순위 순)

1. `aria-label`, `role` (접근성 속성 최우선)
2. `data-testid` (테스트 전용 속성)
3. 의미있는 텍스트 ("Submit", "Login")
4. CSS class (마지막 수단 — 변경 가능성 높음)

### Wait Strategies

```
# 나쁜 예 — 임의 대기
sleep(2000)

# 좋은 예 — 조건 대기
browser_wait_for("text=Success")
browser_wait_for(".loading-spinner", { state: "hidden" })
```

### Error Handling

- 요소가 없으면 즉시 실패하지 말고 대기 후 재시도
- 네트워크 에러는 재시도 최대 3회
- 스크린샷으로 실패 상태 캡처

## Common Workflows

### 웹 스크래핑
```
1. browser_navigate(url)
2. browser_wait_for(".content-loaded")
3. browser_get_text(".main-content") or browser_evaluate(script)
4. 데이터 파싱 및 반환
```

### UI 검증
```
1. 브라우저에서 해당 URL 열기
2. browser_screenshot() — 현재 상태 캡처
3. 예상 요소 확인
4. 반응형: 뷰포트 변경 후 재확인
```

### 로그인 플로우
```
1. browser_navigate(login_url)
2. browser_type("#email", email)
3. browser_type("#password", password)
4. browser_click("button[type=submit]")
5. browser_wait_for("text=Dashboard") — 로그인 확인
```
