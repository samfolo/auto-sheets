# Parallel builds that killed each other

On 26 September 2026, three builds ran in parallel on one Mac, each with its own workspace, port
and browser, to compare models. Within fifteen minutes, two agents had stopped processes that
weren't theirs. Their shells ran unsandboxed: the factory had scrubbed their environment
variables, but nothing stopped them signalling any process the user owned. This is the evidence
behind decision 73, the sandbox.

`kill-commands.jsonl` has every command from those runs that stopped a process: the time, the
model, the end of the agent's reasoning just before it, the command and what it returned. It is
extracted from the runs' Pi sessions, which stay local under `artifacts/runs/`.

## What happened

| Time (UTC) | Run                                                      | Command                          | Effect                                                                                                   |
| ---------- | -------------------------------------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 18:29:25   | `2026-09-26T18-20-34-767Z-bf7f`, DeepSeek v4.1 Flash     | `pkill -f "dist/server/main.js"` | Killed a finished clone from an earlier build that was being served for a person to try.                 |
| 18:30:47   | `2026-09-26T18-21-19-498Z-caad`, Nemotron 3 Super (free) | `pkill -f vite`                  | Matched nothing that time.                                                                               |
| 18:32:48   | `2026-09-26T18-21-19-498Z-caad`, Nemotron 3 Super (free) | `pkill -f node`                  | Killed every Node process the user owned: the other two builds (exit 143) and background work elsewhere. |

The DeepSeek agent printed `killed-siblings` after its command. The Nemotron agent's reasoning
before its first `pkill` said: "We can do `pkill -f vite` but that might kill other things.
Let's do that."

The DeepSeek build had passed all 10 visible cases at 10.8 minutes; it died before its final
check, so it has no summary. Its clone was checked afterwards with `factory clone check`.

## What changed

Commit `84d9e3c` runs every agent command, and the clone when a check starts it, inside macOS's
Seatbelt sandbox. Inside it, a process can read and write only its workspace and temporary files,
and signal only processes in the same sandbox. The same commands now fail:

```text
$ pkill -f "dist/server/main.js"
pkill: signalling pid 29028: Operation not permitted
$ cat ../../auto-sheets/.env
cat: ../../auto-sheets/.env: Operation not permitted
```

The second line shows a hole the incident exposed but no agent used: any agent could have read
the factory's credentials, or the held-out cases' references, straight off the disk.
