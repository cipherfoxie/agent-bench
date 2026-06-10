# Serena benchmark — ts-callers results

_12 runs_

| model | arm | n | successRate | meanToolCalls | meanTokensIn | meanTokensOut | meanWallS | meanFilesChanged | meanLinesChanged | regressionFreeRate | lintCleanRate |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| local-qwen/qwen3.6-35b | baseline | 3 | 100 | 44.3 | 173029 | 3626 | 73.8 | 16 | 62 | 100 | 100 |
| local-qwen/qwen3.6-35b | serena | 3 | 100 | 39.3 | 199418 | 3069 | 79.7 | 16 | 62 | 100 | 100 |
| local-sglang/Mistral-Small-4 | baseline | 3 | 66.7 | 24 | 204260 | 1203 | 86.3 | 11.7 | 44.7 | 66.7 | 66.7 |
| local-sglang/Mistral-Small-4 | serena | 3 | 66.7 | 23.7 | 272767 | 1178 | 103 | 10.7 | 41.3 | 100 | 100 |
