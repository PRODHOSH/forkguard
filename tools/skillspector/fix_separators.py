"""Turns raw U+2028 / U+2029 characters in source files back into escapes, so they cannot end a JavaScript line."""
import glob, sys
for f in glob.glob('src/skills/**/*.js', recursive=True):
    s = open(f, encoding='utf8').read()
    t = s.replace('\u2028', '\\u2028').replace('\u2029', '\\u2029')
    if t != s:
        open(f, 'w', encoding='utf8').write(t); print('fixed', f)
