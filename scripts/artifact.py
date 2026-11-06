# Turns dist-single/index.html into the page body the Artifact viewer expects (it adds its own <html>/<head>/<body>).
import re, sys
s = open(sys.argv[1]).read()
hs = s.index('<head>') + 6                      # the first <head> is the real one
he = s.rindex('</head>'); bs = s.rindex('<body>') + 6; be = s.rindex('</body>')   # libraries contain these strings, so search from the end
head, body = s[hs:he], s[bs:be]
title = re.search(r'<title>.*?</title>', head).group(0); head = head.replace(title, '', 1)
head = re.sub(r'<meta charset[^>]*>', '', head, 1); head = re.sub(r'<meta name="viewport"[^>]*>', '', head, 1)
open(sys.argv[2], 'w').write(title + '\n' + head + body)
