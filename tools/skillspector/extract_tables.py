# SPDX-License-Identifier: Apache-2.0
# Written for forkguard to copy rule tables out of NVIDIA SkillSpector (Apache-2.0, https://github.com/NVIDIA/SkillSpector).
# See NOTICE.
"""Copies module-level constant tables out of SkillSpector analyzer modules without importing them.

Only plain assignments are evaluated, in a namespace with no I/O. re.compile is replaced by a recorder so
the exact pattern text and flags are kept. Nothing from the scanned project is executed.
"""
import ast, json, sys, os, glob

PURE_FUNCS = {"_long_option_prefixes"}
SAFE_CALLS = {"frozenset", "tuple", "list", "set", "dict", "sorted", "len", "range", "str", "int", "float", "chr", "ord", "max", "min", "sum", "bool", "zip", "enumerate", "any", "all", "map", "filter", "reversed", "repr"}

class _PatternRecord(dict):
    """A compiled-pattern stand in. It serialises to {"__re", "flags"} and answers .pattern and .flags."""
    def __init__(self, src, flags):
        super().__init__({"__re": src, "flags": flags})
        self.pattern = src
        self.flags = flags

class Re:
    I = IGNORECASE = 2
    M = MULTILINE = 8
    S = DOTALL = 16
    X = VERBOSE = 64
    A = ASCII = 256
    U = UNICODE = 32
    L = LOCALE = 4
    @staticmethod
    def compile(src, flags=0):
        return _PatternRecord(src, int(flags))
    @staticmethod
    def escape(s):
        import re
        return re.escape(s)

class Sev:
    def __getattr__(self, n): return n
class _CatVal(str):
    @property
    def value(self): return str(self)
class Cat:
    def __getattr__(self, n): return _CatVal(n.replace("_", " ").title())

def allowed(node):
    for n in ast.walk(node):
        if isinstance(n, (ast.Lambda, ast.Await, ast.Yield, ast.YieldFrom)):
            return False
        if isinstance(n, ast.Call):
            f = n.func
            if isinstance(f, ast.Name) and (f.id in SAFE_CALLS or f.id in PURE_FUNCS): continue
            if isinstance(f, ast.Attribute) and isinstance(f.value, ast.Name) and f.value.id in ("re", "regex") and f.attr in ("compile", "escape"): continue
            if isinstance(f, ast.Attribute) and f.attr in ("join", "format", "lower", "upper", "strip", "split", "replace", "keys", "values", "items", "startswith", "endswith", "encode", "decode"): continue
            if isinstance(f, ast.Name) and f.id in ("PatternCategory", "Severity", "StrEnum"): continue
            return False
    return True

NAMESPACES = {}

def run(path):
    src = open(path, encoding="utf-8").read()
    tree = ast.parse(src)
    ns = {"re": Re, "regex": Re, "Severity": Sev(), "PatternCategory": Cat(), "__builtins__": {k: __builtins__.__dict__[k] if isinstance(__builtins__, type(os)) else __builtins__[k] for k in SAFE_CALLS}}
    out, skipped = {}, []
    for node in tree.body:
        if isinstance(node, ast.FunctionDef) and node.name in PURE_FUNCS:
            exec(compile(ast.Module(body=[node], type_ignores=[]), path, "exec"), ns)
            continue
        if isinstance(node, ast.ImportFrom) and node.level == 1 and node.module in NAMESPACES:
            for a in node.names:
                if a.name in NAMESPACES[node.module]:
                    ns[a.asname or a.name] = NAMESPACES[node.module][a.name]
            continue
        targets = None
        if isinstance(node, ast.Assign):
            targets, value = node.targets, node.value
        elif isinstance(node, ast.AnnAssign) and node.value is not None:
            targets, value = [node.target], node.value
        else:
            continue
        names = [t.id for t in targets if isinstance(t, ast.Name)]
        if not names: continue
        if not allowed(value):
            skipped.append(names[0]); continue
        try:
            val = eval(compile(ast.Expression(value), path, "eval"), ns)
        except Exception as e:
            skipped.append(names[0] + " (" + type(e).__name__ + ")"); continue
        for nme in names: ns[nme] = val
        if any(nme.startswith("__") for nme in names): continue
        try:
            out[names[0]] = json.loads(json.dumps(val, default=lambda o: sorted(o, key=repr) if isinstance(o, (set, frozenset)) else repr(o)))
        except Exception:
            skipped.append(names[0] + " (json)")
    NAMESPACES[os.path.basename(path)[:-3]] = ns
    return out, skipped

if __name__ == "__main__":
    base = sys.argv[1]
    result = {}
    first = ["common", "whitespace_padding", "pattern_defaults", "prohibition_context"]
    files = sorted(glob.glob(os.path.join(base, "*.py")), key=lambda p: (first.index(os.path.basename(p)[:-3]) if os.path.basename(p)[:-3] in first else 99, p))
    for f in files:
        o, s = run(f)
        result[os.path.basename(f)] = {"consts": o, "skipped": s}
    json.dump(result, open(sys.argv[2], "w"), indent=1)
    tot = sum(len(v["consts"]) for v in result.values())
    print("modules", len(result), "constants", tot, "skipped", sum(len(v["skipped"]) for v in result.values()))
