param([int]$Port=8080)
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$mime=@{'.html'='text/html; charset=utf-8';'.webp'='image/webp';'.png'='image/png';'.js'='text/javascript';'.css'='text/css';'.json'='application/json'}
$l=New-Object Net.HttpListener; $l.Prefixes.Add("http://localhost:$Port/"); $l.Start()
while($l.IsListening){ $c=$l.GetContext(); $path=[Uri]::UnescapeDataString($c.Request.Url.AbsolutePath); if($path -eq '/'){$path='/index.html'}
 $f=Join-Path $root ($path.TrimStart('/') -replace '/','\')
 if((Test-Path $f -PathType Leaf) -and $f.StartsWith($root)){ $b=[IO.File]::ReadAllBytes($f); $e=[IO.Path]::GetExtension($f).ToLower(); $c.Response.ContentType=$(if($mime[$e]){$mime[$e]}else{'application/octet-stream'}); $c.Response.OutputStream.Write($b,0,$b.Length) } else { $c.Response.StatusCode=404 }
 $c.Response.Close() }