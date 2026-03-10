# mcp-shell (Node.js + TypeScript)

基于 TypeScript 的 MCP Shell Server：通过 **单文件 YAML 规范** 将具体 shell 命令映射为标准 MCP 工具。

## 1) mcp-use 依赖与源码阅读

本项目已引入依赖：

- `mcp-use`（npm）

用于与 MCP 生态保持兼容，并在启动日志中标识 `mcp-use` 版本。

> 备注：`mcp-use` npm 包元数据中已包含其仓库地址 `https://github.com/mcp-use/mcp-use.git`，可按需在本地单独拉取该仓库做源码阅读。

## 2) YAML Spec 设计

一个 YAML 定义一个 MCP 工具，结构如下：

```yaml
apiVersion: v1
tool:
  name: unique_tool_name
  description: |-
    /**
     * 工具描述（TSDoc 标准，且为唯一描述字段）
     * @param arg1 参数说明
     */
  input:
    properties:
      arg1:
        type: string|number|integer|boolean
        description: 参数说明
    required: [arg1]
  output:
    type: object
    properties: { ... }
execution:
  shell:
    mode: direct|shell
    name: bash|zsh|sh|pwsh|cmd   # 可选
    path: /usr/bin/bash          # 可选，优先于 name
    args: ["-lc"]                # 可选，未填使用默认
  env:
    static:
      KEY: VALUE
    fromParams:
      ENV_KEY: inputParamName
  workingDirectory: /tmp/work
  timeoutMs: 30000
  maxOutputBytes: 1048576
  # 二选一：command 或 script
  command:
    executable: ffmpeg
    args:
      - -i
      - "{{input}}"
      - "{{output}}"
  # script:
  #   path: ./scripts/echo_script.sh
  #   interpreter: bash
  #   args:
  #     - "{{arg1}}"
```

设计要点：

- 仅保留 `tool.description` 作为工具描述字段（不再使用 `docstring`），且必须使用 TSDoc 标准；
- `tool.input` / `tool.output` 声明输入输出结构；
- `execution.env.fromParams` 支持参数到环境变量映射；
- `execution.shell` 支持常见 shell 名称与自定义路径；
- `command.args` 支持 `{{param}}` 模板替换；
- `execution.script` 支持脚本路径与可选解释器（相对路径基于 YAML 文件所在目录解析）；
- 每个 YAML 只定义一个工具，利于审计与权限控制。

## 3) ffmpeg 预设工具

已提供 4 个 YAML 预设（`/specs`）：

- `ffmpeg__extract_audio.yaml`：抽取音频
- `ffmpeg__transcode_mp4.yaml`：转码为 H.264/AAC MP4
- `ffmpeg__probe_streams.yaml`：使用 `ffprobe` 输出媒体元数据
- `shell__run_script_echo.yaml`：通过 YAML 配置执行脚本示例
- `runprompt__generate_artifact.yaml`：通过 `runprompt` 生成脚本 / mcp-shell YAML / runprompt 提示词文件

`runprompt__generate_artifact.yaml` 使用：

- `specs/prompts/runprompt/generate_artifact.prompt`（runprompt 提示词模板）
- `specs/prompts/runprompt/type-specs/`（按 artifact_type 拆分的生成约束）
  - `script.spec.md`
  - `mcp-shell-yaml.spec.md`
  - `runprompt-prompt.spec.md`（基于 dotprompt frontmatter/template/picoschema 参考合并）
- `specs/scripts/runprompt_generate_artifact.sh`（调用 runprompt 并写入目标文件）

## 4) 运行方式

```bash
npm install
npm run build
npm start
```

默认从 `./specs` 加载工具定义；可通过 `MCP_SHELL_SPEC_DIR` 覆盖。

### 4.1 通过 GitHub 仓库直接 `npx -y` 启动（stdio）

支持直接通过 GitHub 仓库安装并启动（会自动执行 `prepare` 构建）：

```bash
npx -y github:jussker/mcp-shell --transport stdio
```

### 4.2 启动参数与环境变量

- `--transport` / `MCP_SHELL_TRANSPORT`：`stdio`（默认）或 `streamable-http`
- `--spec-dir` / `MCP_SHELL_SPEC_DIR`：YAML spec 目录（默认 `./specs`）
- `--host` / `MCP_SHELL_HTTP_HOST`：`streamable-http` 监听地址（默认 `127.0.0.1`）
- `--port` / `MCP_SHELL_HTTP_PORT`：`streamable-http` 监听端口（默认 `3001`）
- `--http-path` / `MCP_SHELL_HTTP_PATH`：`streamable-http` 路径（默认 `/mcp`）
- `MCP_SHELL_SERVER_NAME`：MCP server 名称（默认 `mcp-shell`）
- `MCP_SHELL_SERVER_VERSION`：MCP server 版本（默认读取 `package.json` 的 `version`）

示例（HTTP 模式）：

```bash
npx -y github:jussker/mcp-shell --transport streamable-http --host 127.0.0.1 --port 3001 --http-path /mcp
```

## 5) mcpServers 配置示例

### 5.1 stdio（推荐给本地 MCP 客户端）

```json
{
  "mcpServers": {
    "mcp-shell": {
      "command": "npx",
      "args": ["-y", "github:jussker/mcp-shell", "--transport", "stdio"],
      "env": {
        "MCP_SHELL_SPEC_DIR": "/absolute/path/to/specs"
      }
    }
  }
}
```

### 5.2 streamable-http（作为 HTTP MCP 服务）

```json
{
  "mcpServers": {
    "mcp-shell-http": {
      "command": "npx",
      "args": [
        "-y",
        "github:jussker/mcp-shell",
        "--transport",
        "streamable-http",
        "--host",
        "127.0.0.1",
        "--port",
        "3001",
        "--http-path",
        "/mcp"
      ],
      "env": {
        "MCP_SHELL_SPEC_DIR": "/absolute/path/to/specs",
        "MCP_SHELL_SERVER_NAME": "mcp-shell-http"
      }
    }
  }
}
```

## 6) 测试

```bash
npm test
```

包含：

- YAML 预设加载校验
- 参数到命令/环境变量映射校验
