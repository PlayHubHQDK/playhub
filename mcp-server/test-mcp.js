// Protocol-level test: spawn index.js over stdio, list tools, call one.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [path.join(__dirname, "index.js")],
});
const client = new Client({ name: "test", version: "1.0.0" });
await client.connect(transport);

const tools = await client.listTools();
console.log("Tools exposed:");
for (const t of tools.tools) console.log(`  - ${t.name}`);

console.log("\nCalling get_recently_played_games ...");
const res = await client.callTool({
  name: "get_recently_played_games",
  arguments: {},
});
const parsed = JSON.parse(res.content[0].text);
console.log(`  total_count: ${parsed.total_count}`);

await client.close();
console.log("\nMCP protocol test OK.");
process.exit(0);
