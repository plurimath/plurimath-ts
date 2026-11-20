"""Extract a bounded TS/WASM differential fixture from the pinned testsuite (PyYAML)."""
import argparse
import hashlib
import json
import subprocess
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
SUITE = ROOT / "submodules/plurimath-testsuite"
TARGET = ROOT / "test/fixtures/facade/text-parse-parity.json"
SELECTIONS = [
    ("asciimath", "000006", "frac.yaml", ["frac-simple", "frac-numeric"]),
    ("latex", "000004", "numbers.yaml", ["latex-number-integer", "latex-number-decimal"]),
    ("unicode", "000005", "fences.yaml", ["unicode-fence-round", "unicode-fence-square"]),
]
REFUSALS = [
    ("asciimath", "frac-trailing"),
    ("latex", "latex-unclosed-brace"),
    ("unicode", "unicode-unclosed-paren"),
]


def git(*args, cwd=ROOT):
    return subprocess.check_output(["git", *args], cwd=cwd, text=True).strip()


def export():
    revision = git("rev-parse", "HEAD:submodules/plurimath-testsuite")
    if git("rev-parse", "HEAD", cwd=SUITE) != revision or git("status", "--porcelain", cwd=SUITE):
        raise SystemExit("testsuite must be clean and checked out at the superproject pin")
    payloads, rows, refusals = [], [], []

    def read(path):
        raw = (SUITE / path).read_bytes()
        payloads.append({"path": path, "sha256": hashlib.sha256(raw).hexdigest()})
        return {row["id"]: row for row in yaml.safe_load(raw)["cases"]}

    for stage, generation, filename, ids in SELECTIONS:
        cases = read(f"stages/{stage}/generations/{generation}/payloads/{filename}")
        for row_id in ids:
            case = cases[row_id]
            rows.append({
                "id": row_id, "format": stage, "input": case["input"],
                "expected": {key: case["expected"][key] for key in ("asciimath", "latex", "unicodemath")},
            })
    for stage, row_id in REFUSALS:
        case = read(f"corpus/{stage}/rejections.yaml")[row_id]
        refusals.append({"id": row_id, "format": stage, "input": case["input"]})
    return json.dumps({
        "source": "plurimath/plurimath-testsuite", "revision": revision,
        "purpose": "Six parse-path byte comparisons and three refusals; not full format parity",
        "payloads": payloads, "rows": rows, "refusals": refusals,
    }, ensure_ascii=False, indent=2) + "\n"


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    content = export()
    if args.check:
        if TARGET.read_text() != content:
            raise SystemExit("TS/WASM differential fixture differs from the pinned payloads")
    else:
        TARGET.write_text(content)
    print("Six shared cases, three refusals and six payload hashes verified")
