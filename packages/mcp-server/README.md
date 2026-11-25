# @a11ied/mcp-server

`@a11ied/mcp-server` is the [Model Context Protocol](https://modelcontextprotocol.io) server for the a11ied toolkit. It exposes a11ied's WCAG lookup, axe scanning, and screen reader control tools to AI agents and editors over stdio.

## internal package

This is an internal package of [`a11ied`](https://www.npmjs.com/package/a11ied). It is published because `a11ied` depends on it, and its API can change in any release. Install `a11ied` instead.

## start via CLI

```sh
a1 mcp
```

## start programmatically

```ts
import { createMcpServer } from '@a11ied/mcp-server';
```

## usage with agents

See the [MCP usage](https://a11ied.dev/mcp-usage) documentation for tool names, input schemas, and example agent configurations.
