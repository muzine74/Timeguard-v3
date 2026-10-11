"""Inventaire des textes affichés par le front (lecture seule) : textes fixes des gabarits, attributs, libellés des .ts."""
import io, os, re, json, sys, collections

root = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "src", "app"))
out  = os.path.dirname(os.path.abspath(__file__))

def norm(s): return re.sub(r"\s+", " ", s).strip()
def has_letters(s): return re.search(r"[A-Za-zÀ-ÿ]{2,}", s) is not None

static = collections.defaultdict(set)   # texte -> fichiers
mixed  = collections.defaultdict(set)   # texte avec {{ }} -> fichiers
attrs  = collections.defaultdict(set)
tsstr  = collections.defaultdict(set)

def scan_template(html, rel):
    html = re.sub(r"<!--.*?-->", "", html, flags=re.S)
    html = re.sub(r"<(script|style)[^>]*>.*?</\1>", "", html, flags=re.S)
    for m in re.finditer(r">([^<>]+)<", html):
        t = norm(m.group(1))
        if not t or not has_letters(re.sub(r"\{\{.*?\}\}", "", t)): continue
        (mixed if "{{" in t else static)[t].add(rel)
    for m in re.finditer(r"""\s(placeholder|title|aria-label|alt)="([^"]+)\"""", html):
        t = norm(m.group(2))
        if has_letters(t) and "{{" not in t: attrs[t].add(rel)

for d, _, files in os.walk(root):
    for f in files:
        p = os.path.join(d, f); rel = os.path.relpath(p, root).replace("\\", "/")
        if f.endswith(".html"):
            scan_template(io.open(p, encoding="utf-8").read(), rel)
        elif f.endswith(".ts") and not f.endswith(".spec.ts"):
            src = io.open(p, encoding="utf-8").read()
            for m in re.finditer(r"template:\s*`(.*?)`,\s*\n\s*(?:styles|styleUrls|changeDetection|imports)", src, flags=re.S):
                scan_template(m.group(1), rel)
            # Chaînes françaises des .ts (libellés, messages) : au moins un espace ou un accent, pas de code
            for m in re.finditer(r"""(?<![\w.])(['"])((?:(?!\1)[^\\\n]|\\.){3,200})\1""", src):
                t = m.group(2).replace("\\'", "'")
                if re.search(r"[À-ÿ]", t) or (" " in t and re.search(r"[a-zà-ÿ]{3,} [a-zà-ÿ]{2,}", t)):
                    if not re.search(r"^[./@#]|\$\{|=>|;$|^\w+\.\w+|[{}<>]|^import |^\s*$", t) and not t.startswith("M") or re.search(r"[À-ÿ]", t):
                        if not re.search(r"[<>{}]", t): tsstr[norm(t)].add(rel)

def dump(name, d):
    items = sorted(d.items(), key=lambda kv: (sorted(kv[1])[0], kv[0]))
    json.dump([{"t": k, "f": sorted(v)} for k, v in items], io.open(os.path.join(out, name), "w", encoding="utf-8"), ensure_ascii=False, indent=0)
    return items

for name, d in (("static.json", static), ("mixed.json", mixed), ("attrs.json", attrs), ("ts.json", tsstr)):
    items = dump(name, d)
    chars = sum(len(k) for k, _ in items)
    print(f"{name:12} {len(items):5} textes  {chars:7} caractères")

by_file = collections.Counter()
for d in (static, mixed, attrs):
    for k, fs in d.items():
        for f in fs: by_file[f.split("/")[-2] if "/" in f else f] += 1
print("par page :", by_file.most_common(45))
