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

## 4) 运行方式

```bash
npm install
npm run build
npm start
```

默认从 `./specs` 加载工具定义；可通过 `MCP_SHELL_SPEC_DIR` 覆盖。

## 5) 测试

```bash
npm test
```

包含：

- YAML 预设加载校验
- 参数到命令/环境变量映射校验
