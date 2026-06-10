# Serena benchmark — ts-rename results

_20 runs_

| model | arm | n | successRate | meanToolCalls | meanTokensIn | meanTokensOut | meanWallS | meanFilesChanged | meanLinesChanged | regressionFreeRate | lintCleanRate |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| local-qwen/qwen3.6-35b | baseline | 5 | 100 | 10.8 | 75628 | 696 | 19.6 | 3 | 10 | 100 | 100 |
| local-qwen/qwen3.6-35b | serena | 5 | 100 | 16.2 | 195171 | 1000 | 34.5 | 3 | 10 | 100 | 100 |
| local-sglang/Mistral-Small-4 | baseline | 5 | 100 | 9.6 | 99286 | 409 | 45.8 | 3 | 10 | 100 | 100 |
| local-sglang/Mistral-Small-4 | serena | 5 | 100 | 9.6 | 149351 | 440 | 51.5 | 3 | 10.2 | 100 | 100 |
