# import re, math
# from typing import List, Sequence, Callable, Dict

# def qasm_to_qpic(src: str, include_classical: bool = True) -> str:
#     _DEFNS = {"pi": math.pi}
#     def _eval(expr: str) -> float:
#         try:
#             return float(eval(expr, {"__builtins__": {}}, _DEFNS))
#         except Exception:
#             return 0.0

#     GateBuilder = Callable[[Sequence[str], Sequence[str]], str]
#     def _single(lbl: str) -> GateBuilder:
#         return lambda w, p: f"{w[0]} {lbl}"
    
#     def _rot(axis: str) -> GateBuilder:
#         return lambda w, p: f"{w[0]} G R_{axis}({_eval(p[0]):.3g})"

#     _GATE_MAP: Dict[str, GateBuilder] = {
#         "x": _single("X"), "y": _single("Y"), "z": _single("Z"),
#         "h": _single("H"), "s": _single("S"), "sdg": _single("S†"),
#         "t": _single("T"), "tdg": _single("T†"), "sx": _single("√X"),
#         "id": _single("I"),
#         "rx": _rot("x"), "ry": _rot("y"), "rz": _rot("z"),
#         "cx": lambda w, p: f"{w[0]} +{w[1]}",
#         "cy": lambda w, p: f"{w[0]} +{w[1]} Y",
#         "cz": lambda w, p: f"{w[0]} +{w[1]} Z",
#         "swap": lambda w, p: f"{w[0]} @{w[1]}",
#         "ccx": lambda w, p: f"{w[0]} + {w[1]} + {w[2]} X",
#     }

#     _COMMENT_RE = re.compile(r"//.*$|/\*.*?\*/", re.DOTALL)
#     _QREG_RE   = re.compile(r"qreg\s+(\w+)\[(\d+)]\s*;")
#     _CREG_RE   = re.compile(r"creg\s+(\w+)\[(\d+)]\s*;")
#     _MEAS_RE   = re.compile(r"measure\s+([^->]+)->\s*([^;]+);")
#     _GATE_RE   = re.compile(r"(\w+)(?:\(([^)]*)\))?\s+([^;]+);")
#     _QARG_RE   = re.compile(r"(\w+)\[(\d+)]")

#     def _wire(tok: str) -> str:
#         m = _QARG_RE.fullmatch(tok.strip())
#         return f"{m.group(1)}{m.group(2)}" if m else tok.strip()

#     src = _COMMENT_RE.sub("", src)
#     q_wires, c_wires = [], []
#     for line in src.splitlines():
#         if m := _QREG_RE.match(line):
#             name, n = m.groups(); q_wires += [f"{name}{i}" for i in range(int(n))]
#         elif m := _CREG_RE.match(line):
#             name, n = m.groups(); c_wires += [f"{name}{i}" for i in range(int(n))]

#     body: List[str] = []
#     for line in src.splitlines():
#         line = line.strip()
#         if not line or line.startswith("OPENQASM"): continue

#         if m := _MEAS_RE.match(line):
#             qtok, ctok = map(str.strip, m.groups())
#             qwire, cwire = _wire(qtok), _wire(ctok)
#             body.append(f"{qwire} M {cwire}" if include_classical else f"{qwire} M")
#             continue

#         if not (m := _GATE_RE.match(line)): continue
#         gname, params, wires = m.groups()
#         gname = gname.lower()
#         params = [p.strip() for p in params.split(",")] if params else []
#         wires = [_wire(tok) for tok in wires.split(",")]
#         builder = _GATE_MAP.get(gname)
#         body.append(builder(wires, params) if builder
#                     else f"{' '.join(wires)} G {gname.upper()}")

#     decl = [f"{w} W" for w in q_wires]
#     if include_classical: decl += [f"{c} C" for c in c_wires]
#     return "\n".join(decl + ["", *body, ""])

import re, math
from typing import List, Sequence, Callable, Dict

def qasm_to_qpic(src: str, include_classical: bool = True) -> str:
    _DEFNS = {"pi": math.pi}
    def _eval(expr: str) -> float:
        try:
            return float(eval(expr, {"__builtins__": {}}, _DEFNS))
        except Exception:
            return 0.0

    GateBuilder = Callable[[Sequence[str], Sequence[str]], str]
    def _single(lbl: str) -> GateBuilder:
        return lambda w, p: f"{w[0]} {lbl}"
    
    def _rot(axis: str) -> GateBuilder:
        return lambda w, p: f"{w[0]} G R_{axis}({_eval(p[0]):.3g})"

    _GATE_MAP: Dict[str, GateBuilder] = {
        "x": _single("X"), "y": _single("Y"), "z": _single("Z"),
        "h": _single("H"), "s": _single("S"), "sdg": _single("S†"),
        "t": _single("T"), "tdg": _single("T†"), "sx": _single("√X"),
        "id": _single("I"),
        "rx": _rot("x"), "ry": _rot("y"), "rz": _rot("z"),
        "cx": lambda w, p: f"{w[0]} +{w[1]}",
        "cy": lambda w, p: f"{w[0]} +{w[1]} Y",
        "cz": lambda w, p: f"{w[0]} +{w[1]} Z",
        "swap": lambda w, p: f"{w[0]} @{w[1]}",
        "ccx": lambda w, p: f"{w[0]} + {w[1]} + {w[2]} X",
    }

    _COMMENT_RE = re.compile(r"//.*$|/\*.*?\*/", re.DOTALL)
    _QREG_RE   = re.compile(r"qreg\s+(\w+)\[(\d+)]\s*;")
    _CREG_RE   = re.compile(r"creg\s+(\w+)\[(\d+)]\s*;")
    _MEAS_RE   = re.compile(r"measure\s+([^->]+)->\s*([^;]+);")
    _GATE_RE   = re.compile(r"(\w+)(?:\(([^)]*)\))?\s+([^;]+);")
    _QARG_RE   = re.compile(r"(\w+)\[(\d+)]")

    def _wire(tok: str) -> str:
        m = _QARG_RE.fullmatch(tok.strip())
        return f"{m.group(1)}{m.group(2)}" if m else tok.strip()

    src = _COMMENT_RE.sub("", src)
    q_wires, c_wires = [], []
    for line in src.splitlines():
        print(line)
        if m := _QREG_RE.match(line):
            name, n = m.groups(); q_wires += [f"{name}{i}" for i in range(int(n))]
        elif m := _CREG_RE.match(line):
            name, n = m.groups(); c_wires += [f"{name}{i}" for i in range(int(n))]

    body: List[str] = []
    for line in src.splitlines():
        line = line.strip()
        if not line or line.startswith("OPENQASM"): continue

        if m := _MEAS_RE.match(line):
            qtok, ctok = map(str.strip, m.groups())
            qwire, cwire = _wire(qtok), _wire(ctok)
            body.append(f"{qwire} M {cwire}" if include_classical else f"{qwire} M")
            continue

        if not (m := _GATE_RE.match(line)): continue
        gname, params, wires = m.groups()
        gname = gname.lower()
        params = [p.strip() for p in params.split(",")] if params else []
        wires = [_wire(tok) for tok in wires.split(",")]
        builder = _GATE_MAP.get(gname)
        body.append(builder(wires, params) if builder
                    else f"{' '.join(wires)} G {gname.upper()}")

    decl = [f"{w} W" for w in q_wires]
    if include_classical: decl += [f"{c} C" for c in c_wires]
    return "\n".join(decl + ["", *body, ""])