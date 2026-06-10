// Experiment arms. baseline = opencode native tools only.
// serena = native + Serena MCP (installed via `uv tool install serena-agent`, `serena init`).
// caveman = native tools + the caveman skill prompt injected as AGENTS.md
//   (verbatim skills/caveman/SKILL.md from JuliusBrussee/caveman @073d6bb).
// __WORKDIR__ is replaced with the per-run workdir by writeArmConfig.
const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

export const ARMS = {
  baseline: { mcp: {} },
  caveman: { mcp: {}, agentsFile: `${ROOT}/prompts/caveman.md` },
  serena: {
    mcp: {
      serena: {
        type: 'local',
        command: [
          'serena', 'start-mcp-server',
          '--transport', 'stdio',
          '--context', 'ide-assistant',
          '--project', '__WORKDIR__',
          '--enable-web-dashboard', 'false',
          '--enable-gui-log-window', 'false',
          '--log-level', 'ERROR',
        ],
        enabled: true,
      },
    },
  },
};
