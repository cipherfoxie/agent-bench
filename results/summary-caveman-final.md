# Serena benchmark — caveman-final results

_60 runs_

| model | task | arm | n | successRate | meanToolCalls | meanTokensIn | meanTokensOut | meanWallS | meanFilesChanged | meanLinesChanged | regressionFreeRate | lintCleanRate |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| local-qwen/qwen3.6-35b | chat-acid | baseline | 3 | 100 | 0 | 12474 | 105 | 6.2 | 0 | 0 | 0 | 0 |
| local-qwen/qwen3.6-35b | chat-acid | caveman | 3 | 100 | 0 | 13493 | 94 | 6.2 | 0 | 0 | 0 | 0 |
| local-qwen/qwen3.6-35b | chat-chmod | baseline | 3 | 100 | 0 | 12477 | 138 | 6.3 | 0 | 0 | 0 | 0 |
| local-qwen/qwen3.6-35b | chat-chmod | caveman | 3 | 100 | 0 | 13496 | 117 | 5.9 | 0 | 0 | 0 | 0 |
| local-qwen/qwen3.6-35b | chat-tcp | baseline | 3 | 100 | 0 | 12473 | 201 | 7.7 | 0 | 0 | 0 | 0 |
| local-qwen/qwen3.6-35b | chat-tcp | caveman | 3 | 100 | 0 | 13487 | 94 | 5.8 | 0 | 0 | 0 | 0 |
| local-qwen/qwen3.6-35b | ts-ambiguous | baseline | 3 | 100 | 16 | 125322 | 1027 | 30.3 | 4 | 8 | 100 | 100 |
| local-qwen/qwen3.6-35b | ts-ambiguous | caveman | 3 | 100 | 16.3 | 152976 | 932 | 30.1 | 4 | 8 | 100 | 100 |
| local-qwen/qwen3.6-35b | ts-rename | baseline | 3 | 100 | 10 | 89268 | 762 | 21.5 | 3 | 10.3 | 100 | 100 |
| local-qwen/qwen3.6-35b | ts-rename | caveman | 3 | 100 | 15.3 | 111089 | 1015 | 26.6 | 3 | 10 | 100 | 100 |
| local-sglang/Mistral-Small-4 | chat-acid | baseline | 3 | 100 | 0 | 12553 | 111 | 16.5 | 0 | 0 | 0 | 0 |
| local-sglang/Mistral-Small-4 | chat-acid | caveman | 3 | 100 | 0 | 13573 | 55 | 14.4 | 0 | 0 | 0 | 0 |
| local-sglang/Mistral-Small-4 | chat-chmod | baseline | 3 | 100 | 0 | 12553 | 27 | 11.2 | 0 | 0 | 0 | 0 |
| local-sglang/Mistral-Small-4 | chat-chmod | caveman | 3 | 100 | 0 | 13577 | 23 | 12.6 | 0 | 0 | 0 | 0 |
| local-sglang/Mistral-Small-4 | chat-tcp | baseline | 3 | 100 | 0 | 12548 | 94 | 19.2 | 0 | 0 | 0 | 0 |
| local-sglang/Mistral-Small-4 | chat-tcp | caveman | 3 | 100 | 0 | 13576 | 82 | 16.4 | 0 | 0 | 0 | 0 |
| local-sglang/Mistral-Small-4 | ts-ambiguous | baseline | 3 | 0 | 25 | 221476 | 1241 | 93.2 | 8 | 16 | 100 | 100 |
| local-sglang/Mistral-Small-4 | ts-ambiguous | caveman | 3 | 0 | 23.3 | 147093 | 887 | 66.9 | 8 | 16.7 | 100 | 100 |
| local-sglang/Mistral-Small-4 | ts-rename | baseline | 3 | 100 | 12.3 | 112733 | 569 | 43.5 | 3 | 10.3 | 100 | 100 |
| local-sglang/Mistral-Small-4 | ts-rename | caveman | 3 | 100 | 9 | 116148 | 489 | 38.3 | 3 | 10.7 | 100 | 100 |
