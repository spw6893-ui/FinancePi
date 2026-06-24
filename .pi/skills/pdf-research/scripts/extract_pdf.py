#!/usr/bin/env python3
"""Extract PDF text and tables into stable Pi artifacts."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import subprocess
import sys
import tempfile
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass
class PageText:
    page: int
    text: str


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", value).strip("-").lower()
    return slug[:80] or "pdf"


def is_url(value: str) -> bool:
    return value.startswith("http://") or value.startswith("https://")


def download_pdf(url: str, work_dir: Path) -> Path:
    target = work_dir / f"{slugify(Path(url).name or 'download')}.pdf"
    request = urllib.request.Request(url, headers={"User-Agent": "FinancePi PDF extractor"})
    with urllib.request.urlopen(request, timeout=60) as response:
        target.write_bytes(response.read())
    return target


def run_pdfinfo(pdf_path: Path) -> dict[str, Any]:
    try:
        result = subprocess.run(
            ["pdfinfo", str(pdf_path)],
            check=False,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
    except FileNotFoundError:
        return {}
    if result.returncode != 0:
        return {"pdfinfo_error": result.stderr.strip()}
    info: dict[str, Any] = {}
    for line in result.stdout.splitlines():
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        info[key.strip()] = value.strip()
    return info


def extract_with_pdfplumber(pdf_path: Path) -> tuple[list[PageText], list[dict[str, Any]], list[str]]:
    warnings: list[str] = []
    pages: list[PageText] = []
    tables: list[dict[str, Any]] = []
    try:
        import pdfplumber  # type: ignore[import-not-found]
    except Exception as exc:
        return [], [], [f"pdfplumber_unavailable:{exc}"]

    try:
        with pdfplumber.open(str(pdf_path)) as pdf:
            for index, page in enumerate(pdf.pages, start=1):
                text = page.extract_text(x_tolerance=1, y_tolerance=3) or ""
                pages.append(PageText(page=index, text=text.strip()))
                try:
                    for table_index, table in enumerate(page.extract_tables() or [], start=1):
                        if table:
                            tables.append({"page": index, "index": table_index, "rows": table})
                except Exception as exc:
                    warnings.append(f"table_extract_failed_page_{index}:{exc}")
    except Exception as exc:
        warnings.append(f"pdfplumber_extract_failed:{exc}")
    return pages, tables, warnings


def extract_with_pdftotext(pdf_path: Path) -> tuple[list[PageText], list[str]]:
    try:
        result = subprocess.run(
            ["pdftotext", "-layout", str(pdf_path), "-"],
            check=False,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
    except FileNotFoundError:
        return [], ["pdftotext_unavailable"]
    if result.returncode != 0:
        return [], [f"pdftotext_failed:{result.stderr.strip()}"]
    raw_pages = result.stdout.split("\f")
    pages = [PageText(page=index, text=text.strip()) for index, text in enumerate(raw_pages, start=1) if text.strip()]
    return pages, []


def choose_pages(pdf_path: Path) -> tuple[list[PageText], list[dict[str, Any]], str, list[str]]:
    plumber_pages, tables, warnings = extract_with_pdfplumber(pdf_path)
    plumber_chars = sum(len(page.text) for page in plumber_pages)
    if plumber_chars > 100:
        return plumber_pages, tables, "pdfplumber", warnings

    fallback_pages, fallback_warnings = extract_with_pdftotext(pdf_path)
    fallback_chars = sum(len(page.text) for page in fallback_pages)
    if fallback_chars > plumber_chars:
        return fallback_pages, tables, "pdftotext", warnings + fallback_warnings
    return plumber_pages, tables, "pdfplumber", warnings + fallback_warnings


def write_text_outputs(out_dir: Path, pages: list[PageText]) -> None:
    pages_dir = out_dir / "pages"
    pages_dir.mkdir(parents=True, exist_ok=True)
    md_lines: list[str] = []
    for page in pages:
        page_path = pages_dir / f"page-{page.page:03d}.txt"
        page_path.write_text(page.text + "\n", encoding="utf-8")
        md_lines.append(f"\n\n## Page {page.page}\n\n{page.text}")
    (out_dir / "text.md").write_text("\n".join(md_lines).strip() + "\n", encoding="utf-8")


def write_tables(out_dir: Path, tables: list[dict[str, Any]]) -> list[dict[str, Any]]:
    tables_dir = out_dir / "tables"
    tables_dir.mkdir(parents=True, exist_ok=True)
    table_summaries: list[dict[str, Any]] = []
    for global_index, table in enumerate(tables, start=1):
        rows = table.get("rows") if isinstance(table.get("rows"), list) else []
        path = tables_dir / f"table-{global_index:03d}-page-{int(table.get('page', 0)):03d}.csv"
        with path.open("w", encoding="utf-8", newline="") as handle:
            writer = csv.writer(handle)
            for row in rows:
                writer.writerow(["" if cell is None else str(cell) for cell in row])
        table_summaries.append(
            {
                "file": str(path.relative_to(out_dir)),
                "page": table.get("page"),
                "tableIndexOnPage": table.get("index"),
                "rows": len(rows),
            }
        )
    return table_summaries


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Extract PDF text/tables into .pi/artifacts/pdf")
    parser.add_argument("pdf", help="Local PDF path or http(s) URL")
    parser.add_argument("--out-root", default=".pi/artifacts/pdf", help="Artifact output root")
    parser.add_argument("--force", action="store_true", help="Overwrite existing output files")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    source = args.pdf
    with tempfile.TemporaryDirectory() as tmp:
        work_dir = Path(tmp)
        pdf_path = download_pdf(source, work_dir) if is_url(source) else Path(source).expanduser().resolve()
        if not pdf_path.exists():
            print(f"PDF not found: {pdf_path}", file=sys.stderr)
            return 2

        pdf_bytes = pdf_path.read_bytes()
        digest = hashlib.sha256(pdf_bytes).hexdigest()[:12]
        slug = f"{slugify(pdf_path.stem)}-{digest}"
        out_dir = Path(args.out_root) / slug
        if out_dir.exists() and not args.force:
            print(out_dir)
            return 0
        out_dir.mkdir(parents=True, exist_ok=True)

        pdfinfo = run_pdfinfo(pdf_path)
        pages, tables, method, warnings = choose_pages(pdf_path)
        write_text_outputs(out_dir, pages)
        table_summaries = write_tables(out_dir, tables)
        char_count = sum(len(page.text) for page in pages)
        if char_count < 100:
            warnings.append("low_text_yield_possible_scanned_or_image_pdf")

        summary = {
            "source": source,
            "inputFile": str(pdf_path),
            "outputDir": str(out_dir),
            "sha256": hashlib.sha256(pdf_bytes).hexdigest(),
            "pageCount": len(pages),
            "charCount": char_count,
            "tableCount": len(table_summaries),
            "method": method,
            "pdfinfo": pdfinfo,
            "tables": table_summaries,
            "warnings": warnings,
        }
        (out_dir / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(out_dir)
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
