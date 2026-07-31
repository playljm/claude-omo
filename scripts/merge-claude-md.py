#!/usr/bin/env python3
"""CLAUDE.md 병합 — install.sh와 /update-omo가 공유하는 단일 구현.

레포 CLAUDE.md는 마커 없이 관리하고, 배포본에만 <!-- OMO:START/END --> 마커를 씌워
그 블록만 교체한다. 마커가 없던 구 배포본은 본문 첫 헤딩을 앵커로 찾아 마커를 씌워
교체하므로, 몇 번을 재실행해도 내용이 중복되지 않는다.

배포본 사정을 확신할 수 없으면 파일을 건드리지 않고 경고만 남긴다. install.sh가
`set -e`로 도는 만큼 이 경우에도 종료 코드는 0이다(설치 자체는 계속 진행).

usage: merge-claude-md.py <배포본 경로> <레포 CLAUDE.md 경로>
"""
import re
import shutil
import sys
from datetime import datetime

START = "<!-- OMO:START -->"
END = "<!-- OMO:END -->"

# 앵커 뒤 꼬리가 본문 대비 이 배수를 넘으면 OMO 블록 외의 내용이 섞인 것으로 본다.
MAX_TAIL_RATIO = 1.5
# 본문 h2 헤딩 중 이 비율 이상이 꼬리에 있어야 같은 블록으로 인정한다.
MIN_HEADING_HIT = 0.6


def find_legacy_start(user_content, body):
    """마커 없이 append 됐던 구 블록의 시작 위치. 확신이 없으면 None.

    구 install.sh는 항상 파일 끝에 append 했으므로 앵커부터 EOF까지가 블록이다.
    같은 방식으로 여러 번 중복된 파일도 첫 앵커부터 잘라내면 한 번에 복구된다.
    """
    lines = [ln for ln in body.splitlines() if ln.strip()]
    if not lines:
        return None

    anchor = lines[0]
    occurrences = user_content.count(anchor)
    if occurrences == 0:
        return None

    start = user_content.index(anchor)
    tail = user_content[start:]
    if len(tail) > len(body) * MAX_TAIL_RATIO * occurrences:
        return None

    headings = [ln for ln in body.splitlines() if ln.startswith("## ")]
    if not headings:
        return None
    if sum(1 for h in headings if h in tail) < len(headings) * MIN_HEADING_HIT:
        return None

    return start


def main():
    if len(sys.argv) < 3:
        print("usage: merge-claude-md.py <배포본 경로> <레포 CLAUDE.md 경로>", file=sys.stderr)
        return 2

    user_path, repo_path = sys.argv[1], sys.argv[2]

    with open(repo_path, encoding="utf-8") as f:
        body = f.read().strip()

    if not body:
        print("  ⚠ 레포 CLAUDE.md가 비어 있어 병합을 건너뜁니다", file=sys.stderr)
        return 0

    block = "%s\n%s\n%s" % (START, body, END)

    try:
        with open(user_path, encoding="utf-8") as f:
            user_content = f.read()
    except FileNotFoundError:
        with open(user_path, "w", encoding="utf-8") as f:
            f.write(block + "\n")
        print("  CLAUDE.md 생성 완료 (신규 설치)")
        return 0

    pattern = re.compile(re.escape(START) + r".*?" + re.escape(END), re.DOTALL)
    legacy_start = None

    if pattern.search(user_content):
        merged = pattern.sub(lambda m: block, user_content, count=1)
        mode = "마커 블록 교체"
    else:
        legacy_start = find_legacy_start(user_content, body)
        if legacy_start is not None:
            merged = user_content[:legacy_start] + block + "\n"
            mode = "마커 없는 구 배포본 감지 → 마커 씌워 교체"
        elif body.splitlines()[0] in user_content:
            # 앵커는 있는데 범위를 확정할 수 없다. append 하면 내용이 중복되므로
            # 손대지 않고 사람이 판단하도록 남긴다.
            print(
                "  ⚠ CLAUDE.md 병합을 건너뜁니다 — 기존 OMO 블록으로 보이는 내용이 있으나\n"
                "    범위를 확정할 수 없습니다. 수동으로 %s / %s 마커를 씌운 뒤 다시 실행하세요.\n"
                "    대상: %s" % (START, END, user_path),
                file=sys.stderr,
            )
            return 0
        else:
            sep = "" if user_content.endswith("\n") else "\n"
            merged = user_content + sep + "\n" + block + "\n"
            mode = "기존 내용 보존 + append"

    if not merged.endswith("\n"):
        merged += "\n"

    if merged == user_content:
        print("  CLAUDE.md 변경 없음")
        return 0

    backup = "%s.bak.%s" % (user_path, datetime.now().strftime("%Y%m%d_%H%M%S"))
    shutil.copy2(user_path, backup)

    with open(user_path, "w", encoding="utf-8") as f:
        f.write(merged)

    print("  CLAUDE.md 병합 완료 (%s)" % mode)
    print("  백업: %s" % backup)
    return 0


if __name__ == "__main__":
    sys.exit(main())
