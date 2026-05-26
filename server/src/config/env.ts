import fs from 'fs';
import path from 'path';

const ENV_FILES = ['.env', '.env.local', '.env.development', '.env.development.local'];

function unquote(value: string): string {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function loadEnvFile(filePath: string): void {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    const value = unquote(line.slice(idx + 1));
    // Shell / process env wins; env files fill missing values only.
    if (!(key in process.env)) process.env[key] = value;
  }
}

for (const name of ENV_FILES) {
  loadEnvFile(path.resolve(process.cwd(), name));
}

