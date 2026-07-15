> **사용법**: `/finish [quick|doc|deploy|log|arc]`
> - 인수 없음: 사전 상태 수집 후 필요한 단계만 자동 실행
> - `quick`: git commit + push만 (빠른 마무리)
> - `doc`: **일반 finish 마무리(커밋·푸시 등 필요한 단계 전부) + 문서작업(Jarvis 서버 `sp-mail-srv1:/root/data/docs/` 업로드) 필수** — 서버에 글만 남기고 끝내지 않는다
> - `deploy`: 배포 확인 + git push만
> - `log`: 작업 로그 + 오류 KB 기록만
> - `arc` (별칭 `acf`·`archify` 동일 처리): **`doc` 모드 전부 + 아키파이 다이어그램(`docs/archify/`) 생성/갱신 필수(스킵 금지)** — [3.2.1](#321-아키파이-다이어그램-docsarchify) 참조

# 작업 마무리 체크리스트

> **참고**: 단순 질문/조회 작업은 이 체크리스트를 건너뛰어도 됩니다.

---

## 0. 사전 상태 수집 (항상 먼저 실행)

명시 호출이면 실제 입력한 finish 명령을 세션 메모에 보존하세요.

예:
- `/finish doc`
- `/finish quick`
- `/finish log`

아래 명령어로 현재 상태를 파악하고 **필요한 단계만 활성화**하세요:

```bash
git status --short && echo "---" && git log origin/$(git branch --show-current)..HEAD --oneline 2>/dev/null && echo "---" && git diff --name-only HEAD 2>/dev/null
```

**결과 해석 → 단계 활성화:**

| 조건 | 활성화 단계 |
|------|------------|
| 미커밋 파일 있음 | → **4. Git 커밋** 실행 |
| 미푸시 커밋 있음 | → **git push** 실행 |
| 변경 없음 (`nothing to commit`) | → **3.3·6번**만 실행 후 종료 |
| `.css` / `.html` 파일 변경 | → **3.1 CSS-GUIDELINES** 검토 |
| `migrations/**` 변경 | → **3.1 CHANGELOG** 업데이트 |
| 새 디렉토리 생성 | → **3.1 CLAUDE.md** 구조 섹션 업데이트 |
| 이슈/오류 발생했던 세션 | → **3.4 오류 KB** 기록 |
| 아키텍처·데이터 흐름·인프라 구성 변경 | → **3.2.1 아키파이 다이어그램** 검토 |

**모드별 단계 스킵:**

| `/finish quick`  | 0번 → 4번만 실행 (1·2·3·5·6 스킵) |
|------------------|-----------------------------------|
| `/finish doc`    | **인수 없는 자동 finish와 동일하게 0번 판단대로 필요한 단계(1·2·3·4·5)를 전부 실행** + 🔴 **3.2 Jarvis 서버 업로드는 무조건 필수(스킵 금지)**. 즉 "finish 전체 마무리 + 문서작업 필수" |
| `/finish deploy` | 0번 → 1번 → 4번 push만 실행 |
| `/finish log`    | 0번 → 3.3·3.4·6번만 실행 |
| `/finish arc` (=`acf`/`archify`) | **`/finish doc`과 동일하게 전부 실행** + 🔴 **3.2.1 아키파이 다이어그램 생성/갱신 무조건 필수(스킵 금지)** |

---

## 1. 검증 (해당 시)

- 서버 재시작이 필요한 경우: 재시작 후 엔드포인트 테스트
- 브라우저 테스트가 필요한 경우: 주요 기능 동작 확인

---

## 2. 변경사항 요약

```bash
git diff --stat HEAD~1 2>/dev/null || git diff --stat HEAD 2>/dev/null
```

- 무엇을 구현/수정했는지 요약
- 이번 세션에서 발생한 오류·이슈 목록 파악 (→ **3.4 KB 기록** 대상 선별)

---

## 3. 문서 업데이트 (해당 시)

### 3.1 로컬 문서

**0번 단계에서 파악한 변경 파일 기반으로만 업데이트:**

| 문서 | 업데이트 조건 |
|------|---------------|
| `CSS-GUIDELINES.md` | `.css` / `.html` 변경 + 새 패턴 도입 시 |
| `CLAUDE.md` | 디렉터리 구조 변경 또는 새 기술 패턴 도입 시 |
| `PATTERNS.md` | 버그 재발 방지 패턴 발견 시 (`docs/*.md`로 분리 가능) |
| `CHANGELOG.md` | 주요 기능 추가 / DB 마이그레이션 / 버전 변경 시 |

### 3.2 Jarvis 서버 문서화

> 🔴 **`/finish doc`로 명시 호출되면 서버 업로드는 무조건 실행한다 (스킵 절대 금지).**
> 아래 ✅/❌ 기준은 **"무엇을 어느 문서에 담을지"를 정할 때만** 쓰고, **"올릴지 말지"의 근거로 쓰지 않는다.**
> "이건 특정 산출물 전용이라 서버화 스킵" 같은 **자기검열 금지** — 그 산출물에서 나온 범용 패턴·함정·우회법을 **추출해서라도** 올린다. (PPT 내용 자체는 전용이어도, 거기서 나온 python-pptx 함정·QA 함정은 범용이다.)
> ❌ 기준으로 서버 업로드를 *생략*할 수 있는 건 **인수 없는 자동 `/finish`**뿐이다.
>
> 🔵 **업로드 전 필수 — 기존 문서 우선(append-first)**: 먼저 `ssh sp-mail-srv1 'ls /root/data/docs/'`로 **관련 기존 문서를 검색**한다. 있으면 **새 파일을 만들지 말고 그 문서에 섹션을 덧붙인다**(append, 기존 스타일·번호 체계 유지). 없을 때만 신규 생성. — *이번에 `pptx-korean-deck-toolkit.md`가 이미 있었는데 못 보고 스킵할 뻔한 사례 재발 방지.*

**문서화 여부 판단 기준 (명확화 — 위 🔴/🔵 규칙이 우선):**

✅ **문서화 필수** (다른 프로젝트에서 재사용 가능):
- 새 아키텍처 패턴 (sticky subnav + content 정렬 등)
- 보안 취약점 구조적 해결 (동적 렌더링, XSS 방어 등)
- 플랫폼 특유의 버그·우회법
- 이전에 삽질했다가 구조적으로 해결한 패턴

❌ **문서화 스킵** (특정 앱 전용):
- 수치만 바꾼 CSS 조정 (`max-width: 960px` → `780px` 등)
- 특정 페이지 텍스트·레이아웃 수정
- 특정 앱 비즈니스 로직 변경

**판단이 애매하면 스킵. 확실히 범용적일 때만 문서화.**
→ ⚠️ **단, 이 "애매하면 스킵" 규칙은 인수 없는 자동 `/finish`에만 적용된다. 명시적 `/finish doc`에서는 위 🔴 규칙이 우선이라 무조건 업로드한다.**

**절차** (`doc` 모드는 무조건 실행 / 자동 모드는 위 기준 통과 시):

```bash
# SSH config alias 사용 (sp-mail-srv1 → ~/.ssh/tailscale_ed25519 자동 적용)

# Step 1: 스타일 가이드 확인
ssh sp-mail-srv1 'cat /root/data/docs/JARVIS-STYLE.md' | head -80

# Step 2: 문서 업로드
scp /path/to/local/doc.md sp-mail-srv1:/root/data/docs/파일명.md

# Step 3: 검증
ssh sp-mail-srv1 'ls -lh /root/data/docs/파일명.md'
```

**필수 요소**: Mermaid 다이어그램 최소 1개, 색상 팔레트 준수, 실제 사용 사례 포함

**서버 정보**: `sp-mail-srv1` (SSH alias) | 문서 경로: `/root/data/docs/`

> ⏭ **업로드 후 반드시 [4. Git 커밋 및 푸시](#4-git-커밋-및-푸시)로 이어간다.** `/finish doc`은 "서버에 글만 남기고 종료"가 아니라, 로컬 코드·문서 변경분까지 커밋·푸시해야 완료된다.

**운영 상태 문서의 수치·표·차트 갱신 기준:**

- 현재 운영 판단에 쓰는 표/차트는 상단 또는 해당 섹션의 첫 블록에 둔다.
- 과거 장애 분석 수치는 삭제하지 말고 `YYYY-MM-DD 기준 스냅샷`으로 바로 아래에 보존한다.
- 현재값과 과거값이 함께 보이면 기준 시각, 데이터 출처, 최신 이벤트 시각을 각각 명시한다.
- 차트는 현재값처럼 읽히기 쉬우므로 과거 차트만 단독으로 두지 않는다.
- 명시 `/finish doc`로 생성/수정한 Jarvis 문서에는 `finish 호출` 항목으로 실제 호출 명령을 남긴다.

---

### 3.2.1 아키파이 다이어그램 (`docs/archify/`)

Jarvis "아키파이" 탭은 `sp-mail-srv1:/root/data/docs/archify/*.html` 인터랙티브 다이어그램 뷰어다.

**실행 조건 (토큰 폭주 방지 — 기본은 스킵):**

| 모드 | 동작 |
|------|------|
| 자동 `/finish` · `/finish doc` | 아래 ✅ 조건에 해당할 때만 생성/갱신. **애매하면 스킵** — 다이어그램 HTML은 md 문서의 3~4배 토큰이 든다 |
| `/finish arc` (=`acf`/`archify`) | 무조건 생성/갱신 (스킵 금지) |

✅ **생성/갱신 대상:**
- 시스템 구성·데이터 흐름·인프라 토폴로지가 새로 생기거나 구조적으로 바뀐 세션
- 기존 다이어그램이 다루는 시스템을 이번 세션에서 구조 변경한 경우 → 해당 다이어그램 **갱신**
  (확인: `ssh sp-mail-srv1 'ls /root/data/docs/archify/'` — 이 체크는 저렴하니 항상 해도 된다)

❌ **만들지 않는 것:** 버그픽스·수치 조정·문서만 바뀐 세션, 구조 변화 없는 코드 수정

**규약:**
- 파일명: `archify/<주제>-YYYYMMDD.html` (예: `spws-architecture-20260714.html`)
- 동반 md: docs 루트에 같은 basename의 `.md` (예: `spws-architecture-20260714.md`) — 있으면 탭에서 자동 연결됨
- 갱신 시: **같은 주제는 최신 1장만 유지** — 새 날짜 파일 업로드 후 구 파일 삭제. 장애 분석 스냅샷처럼 보존 가치가 있으면 예외로 유지하고 동반 md에 사유를 남긴다
- HTML은 self-contained(외부 CDN 금지), 라이트/다크 테마 토글 대응 — 기존 다이어그램 1개를 먼저 열어 톤을 맞춘다

```bash
# 업로드 + 검증
scp <다이어그램>.html sp-mail-srv1:/root/data/docs/archify/
ssh sp-mail-srv1 'ls -lh /root/data/docs/archify/'
```

---

### 3.3 작업 로그 기록 (매 세션 권장)

세션에서 수행한 작업 내용을 로그 파일로 저장합니다. 추후 유사 작업 시 참고용.

```bash
mkdir -p ~/.claude/work-logs
PROJECT=$(basename $(git rev-parse --show-toplevel 2>/dev/null || echo "general"))
LOG_FILE=~/.claude/work-logs/$(date '+%Y-%m-%d')_${PROJECT}.md
```

**로그 파일 형식** 예시:

```markdown
# 작업 로그 - YYYY-MM-DD

## 프로젝트
- 경로: /path/to/project
- 브랜치: main

## finish 호출
- `/finish doc` 또는 실제 입력 명령

## 작업 내용
- 구현한 기능 / 수정한 버그 요약

## 발생 이슈 & 해결
| 이슈 | 원인 | 해결 방법 |
|------|------|-----------|
| bash 3.2 declare -A 미지원 | macOS 기본 bash 버전 문제 | case 문으로 교체 |

## 다음 작업 시 주의사항
- 주의할 점
```

---

### 3.4 오류/이슈 KB 업데이트 (이슈 발생 시)

이번 세션에서 특이하거나 재발 가능한 오류를 KB에 기록합니다.

```bash
mkdir -p ~/.claude/error-kb
```

**KB 파일 위치**: `~/.claude/error-kb/카테고리-오류명.md`

**기록 기준:**
- ✅ 기록: 같은 오류를 다시 만날 가능성이 있는 것, 해결에 시간이 걸린 것
- ❌ 스킵: 단순 오타, 명백한 문법 오류

**KB 파일 형식**:
```markdown
# [오류명] - 카테고리

## 증상
## 원인
## 해결 방법
## 예방법
## 관련 환경 / 명령어
```

---

## 4. Git 커밋 및 푸시

**0번에서 미커밋/미푸시가 확인되면 실행. 특히 `/finish doc`·`/finish quick`은 변경분이 있으면 문서 업로드 여부와 무관하게 무조건 이 단계를 실행해 커밋·푸시로 마무리한다 (서버 업로드만 하고 종료 금지):**

```bash
# 상태 재확인
git status

# 커밋 (변경사항 있는 경우)
git add <관련 파일들>
git commit -m "한글 커밋 메시지"

# 미푸시 확인 후 push
git log origin/$(git branch --show-current)..HEAD --oneline
git push
```

- 커밋 메시지: 한글로 작성

---

## 5. Claude 설정 GitHub 동기화 (설정 변경 시)

`~/.claude/commands/`, `~/.claude/CLAUDE.md` 등 설정 파일 변경 시 GitHub에 push하여
**다른 환경(서버, 다른 Mac 등)에서도 동일한 설정**을 사용할 수 있도록 합니다.

```bash
# dotfiles / claude-config repo 경로로 이동 (환경에 맞게 설정)
cd ~/dotfiles  # 또는 Claude 설정 전용 repo

git status
git add .claude/commands/ .claude/CLAUDE.md .claude/work-logs/ .claude/error-kb/
git commit -m "Claude 설정 업데이트"
git push
```

**다른 환경에서 동기화:**
```bash
cd ~/dotfiles && git pull
```

**동기화 대상 파일/경로:**

| 경로 | 설명 | 동기화 조건 |
|------|------|-------------|
| `~/.claude/commands/*.md` | 슬래시 명령어 | 명령어 추가/수정 시 |
| `~/.claude/CLAUDE.md` | 전역 AI 설정 | 설정 변경 시 |
| `~/.claude/work-logs/` | 작업 로그 | 매 세션 후 |
| `~/.claude/error-kb/` | 오류 KB | 오류 기록 시 |

> **처음 설정하는 경우**: `~/dotfiles` repo를 만들고 `~/.claude/`를 symlink 또는 직접 포함시키세요.
