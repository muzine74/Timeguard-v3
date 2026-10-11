import io, json, re
def load(n): return json.load(io.open(n, encoding="utf-8"))
def only_help(fs): return all("/help/" in f for f in fs)
seen = {}
order = []
def add(t, kind):
    if t in seen: return
    seen[t] = kind; order.append((kind, t))
for n in ("static.json", "attrs.json"):
    for e in load(n):
        if only_help(e["f"]): continue
        t = e["t"]
        if re.fullmatch(r"[\W\d_]+", t): continue
        add(t, "S")
for e in load("mixed.json"):
    if only_help(e["f"]): continue
    i = [0]
    def rep(m):
        k = i[0]; i[0] += 1; return "{%d}" % k
    t = re.sub(r"\{\{.*?\}\}", rep, e["t"])
    lit = re.sub(r"\{\d+\}", " ", t)
    if not re.search(r"[A-Za-zÀ-ÿ]{3,}", lit): continue
    add(t, "M")
ts = [e for e in load("ts.json") if not only_help(e["f"])]
for e in ts:
    t = e["t"]
    if re.search(r"^(\[|✓|✕|→|  )|console|\bHTTP\b.*\$|^[a-z]+[A-Z]\w+$", t): continue
    add(t, "T")
io.open("source.txt", "w", encoding="utf-8").write("".join("%04d\t%s\t%s\n" % (n, k, t) for n, (k, t) in enumerate(order, 1)))
import collections
print(len(order), collections.Counter(k for k, _ in order), sum(len(t) for _, t in order))
