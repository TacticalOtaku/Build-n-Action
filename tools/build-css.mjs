import fs from "node:fs/promises";
import path from "node:path";

const stylesDirectory = path.resolve("styles");
const files = (await fs.readdir(stylesDirectory))
  .filter(file => file.endsWith(".css"))
  .sort((a, b) => a.localeCompare(b, "en"));

const contents = await Promise.all(files.map(async file => {
  const css = await fs.readFile(path.join(stylesDirectory, file), "utf8");
  return `/* ${file} */\n${css.trim()}\n`;
}));

await fs.writeFile(path.resolve("module.css"), contents.join("\n"), "utf8");
