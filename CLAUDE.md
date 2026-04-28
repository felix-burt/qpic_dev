# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**qpic (⟨q|pic⟩)** is a compiler that converts a concise ASCII-based DSL describing quantum circuits into TikZ graphics code (and optionally PDF/PNG). No external Python dependencies are required.

## Common Commands

```bash
# Run all tests
python setup.py test
# or
python -m unittest tests.test_qpic

# Run tests across multiple Python versions
tox

# Lint
flake8 qpic tests

# Build docs
make docs

# Run the tool directly
python -m qpic < input.qpic               # outputs TikZ to stdout
python -m qpic --filetype pdf -o out.pdf  # requires pdflatex
```

**Adding a test case:** Create a matching pair of files in `tests/data/` — a `.qpic` input file and a `.tikz` expected-output file. The test framework discovers them automatically via `find_test_files2()`.

## Architecture

All compiler logic lives in `qpic/qpic.py` (~3250 lines). The pipeline is:

1. **Parsing** (`tokenize`, `parse_groups`, `parse_into_commands`) — converts input lines to command tokens via a chain of generator functions.

2. **Command dispatch** (`process_one_command`) — the main ~950-line dispatcher handles 40+ command types (W, T, C, G, M, PM, PR, SWAP, LABEL, …) and global settings (HORIZONTAL, SCALE, COLOR, PREAMBLE, …). It populates the circuit's data model.

3. **Data model** — key classes:
   - `Wire` — a quantum/classical wire; tracks position, depth, color, style, labels.
   - `Gate` — a gate/operation; references wire targets and controls, manages styling.
   - `Box` — rectangular or circular box drawn around a gate.
   - `Depth` — a vertical time-slice containing co-occurring gates.
   - `WireLabel` — labels/brace decorations at wire endpoints.

4. **TikZ generation** — `end_circuit()` / `print_circuit()` iterate over depths and call per-type draw functions (`draw_meter`, `draw_control`, `draw_rectangle`, `draw_pauli_measurement`, etc.) to emit TikZ code.

Global state (wires dict, depth list, options) is initialised by `initialize_globals()` and mutated throughout processing — be careful when modifying shared state.

## Input Language Basics

Each non-blank, non-comment line is a command. The first token is the command type:

- `a W` — declare wire `a`
- `a H` — Hadamard on wire `a`
- `a b T` — CNOT with control `a`, target `b`
- `a G $U$` — labelled box gate on wire `a`
- `a M` — measurement on wire `a`
- `a b PM X` — Pauli measurement (X basis) spanning wires `a`–`b`
- `LABEL` / `PREAMBLE` / `SCALE` / `COLOR` — global settings

See `doc/` for ~70 annotated example `.qpic` files and `qpic_doc.pdf` for the full language reference.

## Testing Notes

Tests are data-driven: `tests/test_qpic.py` dynamically generates one `unittest` method per `.qpic`/`.tikz` pair found in `tests/data/`. To debug a single case, run:

```bash
python -m qpic < tests/data/foo.qpic
```

and diff against `tests/data/foo.tikz`.
