# Serena benchmark — ts-ambiguous results

_12 runs_

| model | arm | n | successRate | meanToolCalls | meanTokensIn | meanTokensOut | meanWallS | meanFilesChanged | meanLinesChanged | regressionFreeRate | lintCleanRate |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| local-qwen/qwen3.6-35b | baseline | 3 | 100 | 15.7 | 146708 | 937 | 41.2 | 4 | 8 | 100 | 100 |
| local-qwen/qwen3.6-35b | serena | 3 | 100 | 13 | 151871 | 740 | 28.4 | 4 | 8 | 100 | 100 |
| local-sglang/Mistral-Small-4 | baseline | 3 | 0 | 24 | 313080 | 1218 | 82.5 | 8 | 16.7 | 100 | 100 |
| local-sglang/Mistral-Small-4 | serena | 3 | 33.3 | 11 | 152721 | 343 | 50.6 | 1.7 | 3.3 | 66.7 | 66.7 |
