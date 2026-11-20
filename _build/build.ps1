# Gera ..\index.html a partir de _build\source\Main.dc.html + runtime.js
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path -Parent $here
$u8 = New-Object System.Text.UTF8Encoding($false)
$src = [IO.File]::ReadAllText("$here\source\Main.dc.html", $u8)
$runtime = [IO.File]::ReadAllText("$here\runtime.js", $u8)
$accent = '#E50914'
$blob = @{ '3775b61418bb91e56a50b956e1d84ebd'='assets/hero.webp'; '75c52b7529cfce9fff4a02f59e401453'='assets/prova.webp'; 'e556999839f6bed66d8d478a5e776a29'='assets/capa.webp'; '2313cbc0830d5d3c3ec95c389e5d22da'='assets/sheet.webp' }
function Fix($s) { foreach ($k in $blob.Keys) { $s = $s.Replace('/_blob/' + $k, $blob[$k]) }; $s }
$i1 = $src.IndexOf('<meta name="description"'); $i2 = $src.IndexOf('</head>')
$headMeta = $src.Substring($i1, $i2 - $i1)
$title = [regex]::Match($src, '<title>.*?</title>').Value
$helmet = [regex]::Match($src, '(?s)<helmet>(.*?)</helmet>').Groups[1].Value.Replace('{{accent}}', $accent)
$body = [regex]::Match($src, '(?s)</helmet>(.*?)</x-dc>').Groups[1].Value
$script = [regex]::Match($src, '(?s)<script type="text/x-dc"[^>]*>(.*?)</script>').Groups[1].Value
$html = "<!doctype html>`n<html lang=`"pt-BR`">`n<head>`n<meta charset=`"utf-8`">`n<meta name=`"viewport`" content=`"width=device-width, initial-scale=1`">`n$title`n$headMeta`n$(Fix $helmet)`n<script type=`"importmap`">{`"imports`":{`"three`":`"https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js`",`"three/addons/`":`"https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/`"}}</script>`n<script src=`"config.js`"></script>`n<script src=`"track.js`" defer></script>`n</head>`n<body style=`"margin:0;background:#070707`">`n<div id=`"app`">$(Fix $body)</div>`n<script>`n$runtime`n</script>`n<script>`n$(Fix $script)`nnew Component({ accent: '$accent' }).mount(document.getElementById('app'));`n</script>`n</body>`n</html>`n"
[IO.File]::WriteAllText("$root\index.html", $html, $u8)
"index.html: $($html.Length) chars"