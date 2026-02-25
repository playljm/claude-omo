---
name: finish
description: 작업 마무리 체크리스트. 변경사항 요약, 문서 업데이트, 커밋/푸시까지 안내.
user-invocable: true
metadata:
  version: "2.1.0"
  category: "workflow"
  updated: "2026-02-23"
---

# 작업 마무리

작업 완료 전 체크리스트를 수행합니다.

## 1. 검증

해당하는 항목 수행:
- 서버 재시작 및 동작 확인 (백엔드 변경 시)
- 브라우저 테스트 (프론트엔드 변경 시)
- 테스트 실행 (npm test, pytest, etc.)
- 린트/타입 체크 통과 확인

## 2. 변경사항 요약

변경된 파일 목록과 핵심 변경사항을 정리합니다.

**변경 파일:**
- (파일 목록)

**핵심 변경사항:**
- (주요 변경 내용)

## 4. 문서 업데이트

필요한 경우에만 업데이트:
- **README.md**: 사용법, 설치 방법 변경 시
- **CHANGELOG.md**: 주요 기능/버전 변경 시
- **프로젝트별 docs/**: 트러블슈팅, 설정 가이드 등

문서 작성 시 시각적 요소 권장:
- 아키텍처/흐름: mermaid flowchart
- 데이터 비율: pie chart
- DB 구조: erDiagram

## 5. Git 커밋 및 푸시

커밋 메시지 컨벤션:
- feat: 새 기능
- fix: 버그 수정
- docs: 문서 변경
- style: 코드 포맷팅
- refactor: 리팩토링
- test: 테스트 추가/수정
- chore: 빌드, 설정 변경

feature 브랜치라면 master에 머지 후 push (GitHub 잔디 반영)

## 6. 결과 요약

커밋/푸시 완료 후 아래 형식으로 간결하게 요약합니다:

```
저장소: {remote_url} ({branch_name})
커밋: {commit_hash} - {commit_message}
변경: {files_changed}개 파일 (+{insertions} -{deletions})
푸시: {push_status}
```

---

작업 완료 후 이 체크리스트를 따라 마무리하세요.
