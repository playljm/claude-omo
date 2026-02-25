---
name: usage
description: 외부 모델(GPT/Gemini/GLM) 토큰 사용량 통계 조회
user-invocable: true
metadata:
  version: "1.0.0"
  category: "workflow"
  updated: "2026-02-23"
---

아래 Python 코드를 Bash 툴로 실행하여 결과를 출력하세요. 추가 설명 없이 결과만 보여주세요.

ARGUMENTS가 숫자이면 그 값을 DAYS 변수에 사용하고, 없으면 7을 사용합니다.

```python
import json
from pathlib import Path
from datetime import datetime, timezone, timedelta

DAYS = 7  # ARGUMENTS 숫자로 교체
log = Path.home() / "mcp-servers" / "multi-model" / "usage-log.jsonl"

if not log.exists():
    print("사용 기록 없음 (아직 외부 모델 호출 없음)")
    exit()

cutoff = datetime.now(timezone.utc) - timedelta(days=DAYS)
by_model = {}
grand_input = grand_output = grand_calls = 0

for line in log.read_text(encoding="utf-8").strip().splitlines():
    try:
        e = json.loads(line)
        ts = datetime.fromisoformat(e["timestamp"].replace("Z", "+00:00"))
        if ts < cutoff:
            continue
        m = e.get("model", "?")
        inp = e.get("input_tokens", 0)
        out = e.get("output_tokens", 0)
        if m not in by_model:
            by_model[m] = {"input": 0, "output": 0, "calls": 0}
        by_model[m]["input"] += inp
        by_model[m]["output"] += out
        by_model[m]["calls"] += 1
        grand_input += inp
        grand_output += out
        grand_calls += 1
    except:
        continue

if grand_calls == 0:
    print(f"최근 {DAYS}일간 외부 모델 호출 없음")
    exit()

grand_total = grand_input + grand_output
print(f"=== 외부 모델 토큰 사용 현황 (최근 {DAYS}일) ===")
print()
print(f"{'모델':<22} {'호출':>5} {'입력':>9} {'출력':>8} {'합계':>9} {'비율':>6}")
print("─" * 62)
for m, s in sorted(by_model.items(), key=lambda x: -(x[1]["input"]+x[1]["output"])):
    total = s["input"] + s["output"]
    pct = f"{total*100/grand_total:.1f}%"
    print(f"{m:<22} {s['calls']:>5} {s['input']:>9} {s['output']:>8} {total:>9} {pct:>6}")
print("─" * 62)
print(f"{'합계':<22} {grand_calls:>5} {grand_input:>9} {grand_output:>8} {grand_total:>9} {'100%':>6}")
print()
print("※ Claude 토큰은 claude.ai/settings/billing 에서 확인")
```
