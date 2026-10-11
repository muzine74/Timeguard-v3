import io, os, re, json, html, glob
here = os.path.dirname(os.path.abspath(__file__))
out = os.path.normpath(os.path.join(here, "..", "..", "src", "brand", "i18n"))
os.makedirs(out, exist_ok=True)
def norm(s): return re.sub(r"\s+", " ", html.unescape(s)).strip()

src = {}
for l in io.open(os.path.join(here, "source.txt"), encoding="utf-8"):
    n, kind, text = l.rstrip("\n").split("\t", 2)
    src[n] = (kind, text)
tr = {}
for f in sorted(glob.glob(os.path.join(here, "tr_*.tsv"))):
    for i, l in enumerate(io.open(f, encoding="utf-8"), 1):
        l = l.rstrip("\n")
        if not l: continue
        parts = l.split("\t")
        assert len(parts) == 4, (f, i, len(parts), l[:60])
        assert parts[0] not in tr, ("doublon", parts[0])
        tr[parts[0]] = parts[1:]
missing = sorted(set(src) - set(tr)); extra = sorted(set(tr) - set(src))
assert not missing and not extra, (missing[:10], extra[:10])

langs = ["en", "es", "it"]
exact = {l: {} for l in langs}; patterns = {l: [] for l in langs}
def holes(s): return sorted(set(re.findall(r"\{(\d+)", s)))
skipped = 0
for n, (kind, text) in src.items():
    for li, l in enumerate(langs):
        t = tr[n][li]
        if t == "-": skipped += 1; continue
        key = norm(text)
        if kind == "M":
            assert set(holes(t)) <= set(holes(key)), (n, l, key, t)
            patterns[l].append([key, t])
        elif t != key:
            exact[l][key] = t
# extras.tsv : ajouts à la main ; api.tsv : messages de l'API, courriels et exports (ne remplace pas un texte déjà traduit)
for name in ("extras.tsv", "api.tsv"):
    for i, line in enumerate(io.open(os.path.join(here, name), encoding="utf-8"), 1):
        line = line.rstrip("\n")
        if not line: continue
        parts = line.split("\t")
        assert len(parts) == 5, (name, i, len(parts), line[:60])
        kind, key = parts[0], norm(parts[1])
        assert kind in ("E", "P"), (name, i, kind)
        for li, l in enumerate(langs):
            t = parts[2 + li]
            if kind == "P":
                assert set(holes(t)) <= set(holes(key)), (name, i, l, key, t)
                patterns[l].append([key, t])
            elif t != key and (name == "extras.tsv" or key not in exact[l]):
                exact[l][key] = t
for l in langs:
    # Modèles les plus précis d'abord (le plus de texte littéral) ; le modèle générique « {0}. {1} » passe en dernier
    seen = set(); ps = []
    for k, t in sorted(patterns[l], key=lambda p: -len(re.sub(r"\{\d+[#!]?\}", "", p[0]))):
        if k in seen: continue
        seen.add(k); ps.append([k, t])
    json.dump({"exact": exact[l], "patterns": ps}, io.open(os.path.join(out, l + ".json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(l, len(exact[l]), "textes,", len(ps), "modèles,", os.path.getsize(os.path.join(out, l + ".json")), "octets")
print("ignorés :", skipped // 3)
