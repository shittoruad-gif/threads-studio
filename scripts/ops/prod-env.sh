#!/bin/bash
# 本番の環境変数を Coolify から取り出して export 文で出す（トークンは ~/.claude/secrets/coolify.token から都度読む・ファイルに書かない）
#   使い方: eval "$(bash scripts/ops/prod-env.sh KEY1 KEY2 ...)"
#   DATABASE_URL は SSH トンネル（127.0.0.1:13308）向けに書き換えて出す。トンネルは呼び出し側で張る:
#   nc -z localhost 13308 || ssh -fN -L 13308:10.0.1.7:3306 root@163.44.103.9
set -e
# Coolify(8000番)は外から閉じているので、ssh で入って VPS 内の localhost を呼ぶ（トークンは標準入力で渡す）
printf 'Authorization: Bearer %s\n' "$(cat ~/.claude/secrets/coolify.token)" \
 | ssh -i ~/.ssh/id_ed25519 -o BatchMode=yes root@163.44.103.9 'curl -s -H @- http://localhost:8000/api/v1/applications/g89zg5s4u6xr08gp2b0dptcn/envs' \
 | python3 -c '
import sys,json,shlex,urllib.parse as u
want=sys.argv[1:]
envs={e["key"]:e["value"] for e in json.load(sys.stdin) if not e.get("is_preview")}
for k in want:
    v=envs.get(k)
    if v is None: print(f"echo \"[prod-env] missing {k}\" >&2", file=sys.stdout); continue
    if k=="DATABASE_URL":
        p=u.urlparse(v); v=f"mysql://{p.username}:{p.password}@127.0.0.1:13308{p.path}"
    print(f"export {k}={shlex.quote(v)}")
' "$@"
