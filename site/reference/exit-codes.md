# Exit codes

> Three codes, so scripts and CI can react.

| Code | Meaning | Typical cause |
| --- | --- | --- |
| `0` | Clean, or only MED findings. | Nothing dangerous was found. |
| `1` | Something HIGH was found. | A dangerous finding. Also returned by `fix` when something HIGH is still left. |
| `2` | forkguard itself could not run. | A folder that does not exist, a repo it could not download, not being logged in for `--mine`. |

## Use it in a script

```bash
if ! forkguard ./app; then
  echo "forkguard found something, stopping"
  exit 1
fi
```

Because MED findings exit `0`, they never fail a build. Only HIGH findings do.

## In the shell hooks

For [automatic protection](https://forkguard.pages.dev/guides/automatic-protection/), only `1` stops a command. If forkguard exits `2` or is missing, your command runs anyway.

## Where to next

- [JSON output](https://forkguard.pages.dev/reference/json/): Results for scripts.
- [GitHub Action](https://forkguard.pages.dev/guides/github-action/): Fail the build on malware.
