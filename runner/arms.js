// Experiment arms. baseline = opencode native tools only.
// serena = native + Serena MCP (installed via `uv tool install serena-agent`, `serena init`).
// __WORKDIR__ is replaced with the per-run workdir by writeArmConfig.
export const ARMS = {
  baseline: { mcp: {} },
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
