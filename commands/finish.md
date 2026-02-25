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

## 3. Beads 작업 정리 (선택)

bd(beads) 사용 중인 경우:
- 진행 중 이슈 있으면: bd close <id> 또는 comments 기록
- 4턴+ 작업이었는데 이슈 없었으면: 다음부터 beads 사용 권고

## 4. 문서 업데이트

필요한 경우에만 업데이트:
- **README.md**: 사용법, 설치 방법 변경 시
- **CHANGELOG.md**: 주요 기능/버전 변경 시
- **프로젝트별 docs/**: 트러블슈팅, 설정 가이드 등

문서 작성 시 시각적 요소 권장:
- 아키텍처/흐름: mermaid flowchart
- 데이터 비율: pie chart
- DB 구조: erDiagram

## 4-1. JARVIS 서버 문서 동기화

인프라·설정·AI 파이프라인·아키텍처 변경 시 수행:

**접속 정보**: `root@100.70.193.60`
**docs 위치**: `/root/data/docs/`
**스타일 가이드**: `/root/data/docs/JARVIS-STYLE.md`

**문서 작성 절차:**
1. 작업 내용에 맞는 문서 타입 판단 (JARVIS-STYLE.md 0.1 매트릭스 참고)
2. 규칙 준수하여 로컬 `/tmp/파일명.md` 에 작성
3. `scp /tmp/파일명.md root@100.70.193.60:/root/data/docs/파일명.md` 로 업로드
4. SSH 접속 후 업로드 확인

**파일명 규칙:**
- 설정/가이드: `{주제}-setup.md` 또는 `{주제}-guide.md`
- 장애: `incident-{YYYY-MM-DD}.md`
- 트러블슈팅: `troubleshooting-{주제}.md`
- 날짜 기반 작업: `{YYYY-MM-DD}-{주제}.md`

**JARVIS-STYLE.md 필수 체크리스트:**
- [ ] Mermaid 다이어그램 1개 이상 (문서 타입별 종류 준수)
- [ ] 모든 flowchart 노드에 색상 style 적용
- [ ] 노드 줄바꿈: `\n` 대신 `<br/>` 사용
- [ ] 헤더: `생성일`, `수정일`, `관련 시스템` 포함
- [ ] 상단 요약 테이블 포함
- [ ] 코드 블록 언어 태그 명시
- [ ] 민감정보 마스킹 (`<API_KEY>` 형식)
- [ ] 푸터: `문서 위치`, `생성일`, `수정일` 포함

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
