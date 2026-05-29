import fs from 'fs';
import path from 'path';
import { inflateRawSync } from 'zlib';

export type PptExportRun = { stdout: string; stderr: string; command: string; duration_ms: number };

export interface PptProjectExportResult {
  pptxPath: string;
  slideCount: number;
  run: PptExportRun;
}

const EMU_PER_PX = 914400 / 96;
const XMLNS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const XMLNS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const XMLNS_P = 'http://schemas.openxmlformats.org/presentationml/2006/main';

interface SvgNode {
  tag: string;
  attrs: Record<string, string>;
  children: SvgNode[];
  text: string;
}

interface SvgGradientStop {
  offset: number;
  color: string;
  opacity: number;
}

interface SvgGradientDef {
  id: string;
  kind: 'linear' | 'radial';
  attrs: Record<string, string>;
  stops: SvgGradientStop[];
}

interface ConvertCtx {
  tx: number;
  ty: number;
  sx: number;
  sy: number;
  opacity: number;
  inherited: Record<string, string>;
  canvasWidth: number;
  gradients: Map<string, SvgGradientDef>;
}

interface SlideBuildCtx {
  nextShapeId: number;
  media: Map<string, Buffer>;
  mediaExts: Set<string>;
  rels: Array<{ id: string; type: string; target: string }>;
  nextRelId: number;
  svgFile: string;
  projectRoot: string;
}

interface ShapeXml {
  xml: string;
}

interface SvgPathCommand {
  cmd: string;
  values: number[];
}

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (const b of buf) crc = crcTable[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date = new Date()): { time: number; date: number } {
  const year = Math.max(1980, date.getFullYear());
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time: dosTime, date: dosDate };
}

function createZip(files: Array<{ name: string; data: Buffer | string }>): Buffer {
  const chunks: Buffer[] = [];
  const central: Buffer[] = [];
  const now = dosDateTime();
  let offset = 0;
  for (const file of files) {
    const nameBuf = Buffer.from(file.name.replace(/^\/+/, ''), 'utf8');
    const data = Buffer.isBuffer(file.data) ? file.data : Buffer.from(file.data, 'utf8');
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(0, 8); // store, no compression
    local.writeUInt16LE(now.time, 10);
    local.writeUInt16LE(now.date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    chunks.push(local, nameBuf, data);

    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(20, 4);
    cen.writeUInt16LE(20, 6);
    cen.writeUInt16LE(0x0800, 8);
    cen.writeUInt16LE(0, 10);
    cen.writeUInt16LE(now.time, 12);
    cen.writeUInt16LE(now.date, 14);
    cen.writeUInt32LE(crc, 16);
    cen.writeUInt32LE(data.length, 20);
    cen.writeUInt32LE(data.length, 24);
    cen.writeUInt16LE(nameBuf.length, 28);
    cen.writeUInt16LE(0, 30);
    cen.writeUInt16LE(0, 32);
    cen.writeUInt16LE(0, 34);
    cen.writeUInt16LE(0, 36);
    cen.writeUInt32LE(0, 38);
    cen.writeUInt32LE(offset, 42);
    central.push(cen, nameBuf);
    offset += local.length + nameBuf.length + data.length;
  }
  const centralStart = offset;
  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(centralStart, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...chunks, centralBuf, end]);
}

function esc(value: string | number | undefined | null): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function num(value: string | undefined, fallback = 0): number {
  if (!value) return fallback;
  const match = value.match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function emu(px: number): number {
  return Math.round(px * EMU_PER_PX);
}

function parseAttrs(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const match of raw.matchAll(/([\w:-]+)\s*=\s*(["'])([\s\S]*?)\2/g)) {
    attrs[match[1]] = decodeXml(match[3]);
  }
  return attrs;
}

function parseSvgXml(xml: string): SvgNode {
  const root: SvgNode = { tag: '#root', attrs: {}, children: [], text: '' };
  const stack: SvgNode[] = [root];
  const tokenRe = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\/?[\w:.-]+\b[^>]*>|[^<]+/g;
  for (const match of xml.matchAll(tokenRe)) {
    const token = match[0];
    if (!token || token.startsWith('<!--')) continue;
    if (token.startsWith('<![CDATA[')) {
      stack[stack.length - 1].text += token.slice(9, -3);
      continue;
    }
    if (token.startsWith('</')) {
      const closing = token.match(/^<\/([\w:.-]+)/)?.[1]?.toLowerCase();
      while (stack.length > 1) {
        const popped = stack.pop();
        if (popped?.tag.toLowerCase() === closing) break;
      }
      continue;
    }
    if (token.startsWith('<')) {
      if (/^<\?/.test(token) || /^<!/.test(token)) continue;
      const tag = token.match(/^<([\w:.-]+)/)?.[1] || '';
      if (!tag) continue;
      const rawAttrs = token.replace(/^<[\w:.-]+/, '').replace(/\/?>$/, '');
      const node: SvgNode = { tag, attrs: parseAttrs(rawAttrs), children: [], text: '' };
      stack[stack.length - 1].children.push(node);
      const selfClosing = /\/\s*>$/.test(token) || ['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'image', 'use', 'stop'].includes(tag.toLowerCase());
      if (!selfClosing) stack.push(node);
      continue;
    }
    stack[stack.length - 1].text += decodeXml(token);
  }
  const svg = root.children.find((child) => localName(child.tag) === 'svg');
  if (!svg) throw new Error('invalid SVG: missing <svg> root');
  return svg;
}

function localName(tag: string): string {
  return tag.includes(':') ? tag.split(':').pop() || tag : tag;
}

function parseStyle(style: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!style) return out;
  for (const part of style.split(';')) {
    const idx = part.indexOf(':');
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key && value) out[key] = value;
  }
  return out;
}

const inheritableKeys = new Set([
  'fill', 'fill-opacity', 'stroke', 'stroke-opacity', 'stroke-width', 'stroke-linecap', 'stroke-linejoin',
  'stroke-dasharray', 'opacity', 'font-family', 'font-size', 'font-weight', 'font-style', 'text-anchor',
]);

function mergedAttrs(node: SvgNode, ctx: ConvertCtx): Record<string, string> {
  return { ...ctx.inherited, ...parseStyle(node.attrs.style), ...node.attrs };
}

function childCtx(node: SvgNode, ctx: ConvertCtx): ConvertCtx {
  const own = { ...parseStyle(node.attrs.style), ...node.attrs };
  const inherited = { ...ctx.inherited };
  for (const [key, value] of Object.entries(own)) {
    if (inheritableKeys.has(key)) inherited[key] = value;
  }
  let next: ConvertCtx = { ...ctx, inherited };
  if (own.opacity !== undefined) next = { ...next, opacity: next.opacity * clamp(Number(own.opacity), 0, 1) };
  if (own.transform) next = applyTransform(next, own.transform);
  return next;
}

function applyTransform(ctx: ConvertCtx, transform: string): ConvertCtx {
  let sx = 1;
  let sy = 1;
  let tx = 0;
  let ty = 0;
  const re = /(matrix|translate|scale)\(([^)]*)\)/gi;
  for (const match of transform.matchAll(re)) {
    const op = match[1].toLowerCase();
    const vals = match[2].split(/[\s,]+/).map(Number).filter((n) => Number.isFinite(n));
    if (op === 'translate') {
      tx += vals[0] || 0;
      ty += vals.length > 1 ? vals[1] || 0 : 0;
    } else if (op === 'scale') {
      const x = vals[0] || 1;
      const y = vals.length > 1 ? vals[1] || 1 : x;
      sx *= x;
      sy *= y;
    } else if (op === 'matrix' && vals.length >= 6) {
      sx *= vals[0] || 1;
      sy *= vals[3] || 1;
      tx += vals[4] || 0;
      ty += vals[5] || 0;
    }
  }
  return {
    ...ctx,
    sx: ctx.sx * sx,
    sy: ctx.sy * sy,
    tx: ctx.tx + tx * ctx.sx,
    ty: ctx.ty + ty * ctx.sy,
  };
}

function x(value: number, ctx: ConvertCtx): number { return value * ctx.sx + ctx.tx; }
function y(value: number, ctx: ConvertCtx): number { return value * ctx.sy + ctx.ty; }
function w(value: number, ctx: ConvertCtx): number { return value * ctx.sx; }
function h(value: number, ctx: ConvertCtx): number { return value * ctx.sy; }

function colorHex(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const v = value.trim().toLowerCase();
  if (!v || v === 'none' || v === 'transparent') return undefined;
  const short = v.match(/^#([0-9a-f]{3})$/i);
  if (short) return short[1].split('').map((c) => c + c).join('').toUpperCase();
  const long = v.match(/^#([0-9a-f]{6})$/i);
  if (long) return long[1].toUpperCase();
  const rgb = v.match(/^rgba?\(([^)]+)\)$/i);
  if (rgb) {
    const parts = rgb[1].split(',').map((p) => Number(p.trim().replace('%', '')));
    if (parts.length >= 3 && parts.slice(0, 3).every((n) => Number.isFinite(n))) {
      return parts.slice(0, 3).map((n) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0')).join('').toUpperCase();
    }
  }
  const named: Record<string, string> = {
    white: 'FFFFFF', black: '000000', red: 'FF0000', green: '008000', blue: '0000FF',
    gray: '808080', grey: '808080', lightgray: 'D3D3D3', lightgrey: 'D3D3D3', orange: 'FFA500', yellow: 'FFFF00',
  };
  return named[v];
}


function opacityFromColor(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const rgba = value.trim().match(/^rgba\(([^)]+)\)$/i);
  if (!rgba) return undefined;
  const parts = rgba[1].split(',').map((p) => p.trim());
  const alpha = Number(parts[3]);
  return Number.isFinite(alpha) ? clamp(alpha, 0, 1) : undefined;
}

function parseGradientOffset(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const raw = value.trim();
  if (raw.endsWith('%')) return clamp(Number(raw.slice(0, -1)) / 100, 0, 1);
  const numValue = Number(raw);
  return Number.isFinite(numValue) ? clamp(numValue, 0, 1) : fallback;
}

function gradientStops(node: SvgNode): SvgGradientStop[] {
  const stops = node.children.filter((child) => localName(child.tag).toLowerCase() === 'stop');
  const parsed = stops.map((stop, index) => {
    const attrs = { ...parseStyle(stop.attrs.style), ...stop.attrs };
    const colorValue = attrs['stop-color'] || '#000000';
    const color = colorHex(colorValue) || '000000';
    const colorOpacity = opacityFromColor(colorValue);
    const opacity = clamp(Number(attrs['stop-opacity'] ?? colorOpacity ?? 1), 0, 1);
    return { offset: parseGradientOffset(attrs.offset, stops.length <= 1 ? index : index / (stops.length - 1)), color, opacity };
  }).filter((stop) => Boolean(stop.color));
  if (!parsed.length) return [];
  return parsed.sort((a, b) => a.offset - b.offset);
}

function collectGradientDefs(root: SvgNode): Map<string, SvgGradientDef> {
  const gradients = new Map<string, SvgGradientDef>();
  const walk = (node: SvgNode) => {
    const tag = localName(node.tag).toLowerCase();
    if ((tag === 'lineargradient' || tag === 'radialgradient') && node.attrs.id) {
      const stops = gradientStops(node);
      if (stops.length) gradients.set(node.attrs.id, { id: node.attrs.id, kind: tag === 'radialgradient' ? 'radial' : 'linear', attrs: node.attrs, stops });
    }
    node.children.forEach(walk);
  };
  walk(root);
  return gradients;
}

function gradientIdFromPaint(value: string | undefined): string | undefined {
  const match = String(value || '').trim().match(/^url\(#([^\)]+)\)$/i);
  return match?.[1];
}

function gradientAngle(def: SvgGradientDef): number {
  const x1 = num(def.attrs.x1, 0);
  const y1 = num(def.attrs.y1, 0);
  const x2 = num(def.attrs.x2, 1);
  const y2 = num(def.attrs.y2, 0);
  const dx = x2 - x1;
  const dy = y2 - y1;
  const deg = Math.atan2(dy, dx) * 180 / Math.PI;
  return Math.round(((deg + 360) % 360) * 60000);
}

function gradientFillXml(def: SvgGradientDef, opacity: number): string {
  const stops = def.stops.length === 1
    ? [def.stops[0], { ...def.stops[0], offset: 1 }]
    : def.stops;
  const gsLst = stops.map((stop) => {
    const pos = clamp(Math.round(stop.offset * 100000), 0, 100000);
    const stopOpacity = opacity * stop.opacity;
    return `<a:gs pos="${pos}"><a:srgbClr val="${stop.color}">${alphaXml(stopOpacity)}</a:srgbClr></a:gs>`;
  }).join('');
  if (def.kind === 'radial') {
    return `<a:gradFill flip="none" rotWithShape="1"><a:gsLst>${gsLst}</a:gsLst><a:path path="circle"><a:fillToRect l="50000" t="50000" r="50000" b="50000"/></a:path></a:gradFill>`;
  }
  return `<a:gradFill flip="none" rotWithShape="1"><a:gsLst>${gsLst}</a:gsLst><a:lin ang="${gradientAngle(def)}" scaled="1"/></a:gradFill>`;
}

function alphaXml(opacity: number): string {
  const val = clamp(Math.round(opacity * 100000), 0, 100000);
  return val >= 99999 ? '' : `<a:alpha val="${val}"/>`;
}

function fillXml(attrs: Record<string, string>, ctx: ConvertCtx, defaultFill?: string): string {
  const fill = attrs.fill ?? defaultFill;
  const opacity = ctx.opacity * clamp(Number(attrs['fill-opacity'] ?? 1), 0, 1);
  const gradientId = gradientIdFromPaint(fill);
  if (gradientId) {
    const gradient = ctx.gradients.get(gradientId);
    if (gradient) return gradientFillXml(gradient, opacity);
  }
  const hex = colorHex(fill);
  if (!hex) return '<a:noFill/>';
  return `<a:solidFill><a:srgbClr val="${hex}">${alphaXml(opacity)}</a:srgbClr></a:solidFill>`;
}

function strokeXml(attrs: Record<string, string>, ctx: ConvertCtx): string {
  const hex = colorHex(attrs.stroke);
  if (!hex) return '<a:ln><a:noFill/></a:ln>';
  const widthPx = Math.max(num(attrs['stroke-width'], 1), 0.25);
  const opacity = ctx.opacity * clamp(Number(attrs['stroke-opacity'] ?? 1), 0, 1);
  const cap = attrs['stroke-linecap'] === 'round' ? ' cap="rnd"' : attrs['stroke-linecap'] === 'square' ? ' cap="sq"' : '';
  const join = attrs['stroke-linejoin'] === 'round' ? '<a:round/>' : '';
  const dash = attrs['stroke-dasharray'] && attrs['stroke-dasharray'] !== 'none' ? '<a:prstDash val="dash"/>' : '';
  return `<a:ln w="${emu(widthPx)}"${cap}><a:solidFill><a:srgbClr val="${hex}">${alphaXml(opacity)}</a:srgbClr></a:solidFill>${dash}${join}</a:ln>`;
}

function wrapShape(id: number, name: string, offX: number, offY: number, extX: number, extY: number, geom: string, fill: string, stroke: string): string {
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${esc(name)}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${offX}" y="${offY}"/><a:ext cx="${Math.max(1, extX)}" cy="${Math.max(1, extY)}"/></a:xfrm>${geom}${fill}${stroke}</p:spPr></p:sp>`;
}

function convertRect(node: SvgNode, ctx: ConvertCtx, slide: SlideBuildCtx): ShapeXml | undefined {
  const attrs = mergedAttrs(node, ctx);
  const xx = x(num(node.attrs.x), ctx);
  const yy = y(num(node.attrs.y), ctx);
  const ww = w(num(node.attrs.width), ctx);
  const hh = h(num(node.attrs.height), ctx);
  if (ww <= 0 || hh <= 0) return undefined;
  const rx = num(node.attrs.rx ?? node.attrs.ry, 0);
  const geom = rx > 0
    ? `<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val ${clamp(Math.round((rx / Math.min(num(node.attrs.width), num(node.attrs.height))) * 100000), 0, 50000)}"/></a:avLst></a:prstGeom>`
    : '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>';
  const id = slide.nextShapeId++;
  return { xml: wrapShape(id, `Rectangle ${id}`, emu(xx), emu(yy), emu(ww), emu(hh), geom, fillXml(attrs, ctx, 'black'), strokeXml(attrs, ctx)) };
}

function convertEllipse(node: SvgNode, ctx: ConvertCtx, slide: SlideBuildCtx): ShapeXml | undefined {
  const attrs = mergedAttrs(node, ctx);
  const tag = localName(node.tag);
  let xx: number;
  let yy: number;
  let ww: number;
  let hh: number;
  if (tag === 'circle') {
    const r = num(node.attrs.r);
    if (r <= 0) return undefined;
    xx = x(num(node.attrs.cx) - r, ctx);
    yy = y(num(node.attrs.cy) - r, ctx);
    ww = Math.abs(w(r * 2, ctx));
    hh = Math.abs(h(r * 2, ctx));
  } else {
    const rx = num(node.attrs.rx);
    const ry = num(node.attrs.ry);
    if (rx <= 0 || ry <= 0) return undefined;
    xx = x(num(node.attrs.cx) - rx, ctx);
    yy = y(num(node.attrs.cy) - ry, ctx);
    ww = Math.abs(w(rx * 2, ctx));
    hh = Math.abs(h(ry * 2, ctx));
  }
  const id = slide.nextShapeId++;
  return { xml: wrapShape(id, `Ellipse ${id}`, emu(xx), emu(yy), emu(ww), emu(hh), '<a:prstGeom prst="ellipse"><a:avLst/></a:prstGeom>', fillXml(attrs, ctx, 'black'), strokeXml(attrs, ctx)) };
}

function convertLine(node: SvgNode, ctx: ConvertCtx, slide: SlideBuildCtx): ShapeXml | undefined {
  const attrs = mergedAttrs(node, ctx);
  const x1 = x(num(node.attrs.x1), ctx);
  const y1 = y(num(node.attrs.y1), ctx);
  const x2 = x(num(node.attrs.x2), ctx);
  const y2 = y(num(node.attrs.y2), ctx);
  const minX = Math.min(x1, x2);
  const minY = Math.min(y1, y2);
  const ww = Math.max(Math.abs(x2 - x1), 0.1);
  const hh = Math.max(Math.abs(y2 - y1), 0.1);
  const flip = `${x1 > x2 ? ' flipH="1"' : ''}${y1 > y2 ? ' flipV="1"' : ''}`;
  const id = slide.nextShapeId++;
  const stroke = strokeXml({ ...attrs, stroke: attrs.stroke || '#000000' }, ctx);
  const xml = `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Line ${id}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm${flip}><a:off x="${emu(minX)}" y="${emu(minY)}"/><a:ext cx="${emu(ww)}" cy="${emu(hh)}"/></a:xfrm><a:prstGeom prst="line"><a:avLst/></a:prstGeom><a:noFill/>${stroke}</p:spPr></p:sp>`;
  return { xml };
}

function parsePoints(points: string | undefined, ctx: ConvertCtx): Array<[number, number]> {
  const nums = String(points || '').match(/-?\d+(?:\.\d+)?/g)?.map(Number) || [];
  const out: Array<[number, number]> = [];
  for (let i = 0; i + 1 < nums.length; i += 2) out.push([x(nums[i], ctx), y(nums[i + 1], ctx)]);
  return out;
}

function customGeomFromPoints(points: Array<[number, number]>, closed: boolean): { geom: string; offX: number; offY: number; extX: number; extY: number } | undefined {
  if (points.length < 2) return undefined;
  const minX = Math.min(...points.map((p) => p[0]));
  const minY = Math.min(...points.map((p) => p[1]));
  const maxX = Math.max(...points.map((p) => p[0]));
  const maxY = Math.max(...points.map((p) => p[1]));
  const extX = Math.max(1, emu(maxX - minX));
  const extY = Math.max(1, emu(maxY - minY));
  const segs = points.map((point, index) => {
    const px = emu(point[0] - minX);
    const py = emu(point[1] - minY);
    return index === 0 ? `<a:moveTo><a:pt x="${px}" y="${py}"/></a:moveTo>` : `<a:lnTo><a:pt x="${px}" y="${py}"/></a:lnTo>`;
  }).join('') + (closed ? '<a:close/>' : '');
  const geom = `<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="l" t="t" r="r" b="b"/><a:pathLst><a:path w="${extX}" h="${extY}">${segs}</a:path></a:pathLst></a:custGeom>`;
  return { geom, offX: emu(minX), offY: emu(minY), extX, extY };
}

function convertPolyline(node: SvgNode, ctx: ConvertCtx, slide: SlideBuildCtx): ShapeXml | undefined {
  const points = parsePoints(node.attrs.points, ctx);
  const closed = localName(node.tag) === 'polygon';
  const geom = customGeomFromPoints(points, closed);
  if (!geom) return undefined;
  const attrs = mergedAttrs(node, ctx);
  const id = slide.nextShapeId++;
  return { xml: wrapShape(id, `${closed ? 'Polygon' : 'Polyline'} ${id}`, geom.offX, geom.offY, geom.extX, geom.extY, geom.geom, fillXml(attrs, ctx, closed ? 'black' : 'none'), strokeXml(attrs, ctx)) };
}

function pathTokens(d: string): string[] {
  return d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) || [];
}

function parsePathCommands(d: string, ctx: ConvertCtx): Array<{ cmd: string; pts: Array<[number, number]> }> {
  const tokens = pathTokens(d);
  const out: Array<{ cmd: string; pts: Array<[number, number]> }> = [];
  let i = 0;
  let cmd = '';
  let cx = 0;
  let cy = 0;
  let startX = 0;
  let startY = 0;
  const isCmd = (t: string) => /^[a-zA-Z]$/.test(t);
  const nextNum = () => Number(tokens[i++]);
  while (i < tokens.length) {
    if (isCmd(tokens[i])) cmd = tokens[i++];
    if (!cmd) break;
    const lower = cmd.toLowerCase();
    const rel = cmd === lower;
    const absPoint = (px: number, py: number): [number, number] => [rel ? cx + px : px, rel ? cy + py : py];
    if (lower === 'm') {
      let first = true;
      while (i + 1 < tokens.length && !isCmd(tokens[i])) {
        const [px, py] = absPoint(nextNum(), nextNum());
        cx = px; cy = py;
        if (first) { startX = px; startY = py; out.push({ cmd: 'M', pts: [[x(px, ctx), y(py, ctx)]] }); first = false; }
        else out.push({ cmd: 'L', pts: [[x(px, ctx), y(py, ctx)]] });
      }
    } else if (lower === 'l') {
      while (i + 1 < tokens.length && !isCmd(tokens[i])) {
        const [px, py] = absPoint(nextNum(), nextNum());
        cx = px; cy = py; out.push({ cmd: 'L', pts: [[x(px, ctx), y(py, ctx)]] });
      }
    } else if (lower === 'h') {
      while (i < tokens.length && !isCmd(tokens[i])) {
        const px = rel ? cx + nextNum() : nextNum();
        cx = px; out.push({ cmd: 'L', pts: [[x(cx, ctx), y(cy, ctx)]] });
      }
    } else if (lower === 'v') {
      while (i < tokens.length && !isCmd(tokens[i])) {
        const py = rel ? cy + nextNum() : nextNum();
        cy = py; out.push({ cmd: 'L', pts: [[x(cx, ctx), y(cy, ctx)]] });
      }
    } else if (lower === 'c') {
      while (i + 5 < tokens.length && !isCmd(tokens[i])) {
        const p1 = absPoint(nextNum(), nextNum());
        const p2 = absPoint(nextNum(), nextNum());
        const p3 = absPoint(nextNum(), nextNum());
        cx = p3[0]; cy = p3[1];
        out.push({ cmd: 'C', pts: [p1, p2, p3].map((p) => [x(p[0], ctx), y(p[1], ctx)] as [number, number]) });
      }
    } else if (lower === 'q') {
      while (i + 3 < tokens.length && !isCmd(tokens[i])) {
        const p1 = absPoint(nextNum(), nextNum());
        const p2 = absPoint(nextNum(), nextNum());
        cx = p2[0]; cy = p2[1];
        out.push({ cmd: 'Q', pts: [p1, p2].map((p) => [x(p[0], ctx), y(p[1], ctx)] as [number, number]) });
      }
    } else if (lower === 'a') {
      while (i + 6 < tokens.length && !isCmd(tokens[i])) {
        i += 5; // rx ry x-axis-rotation large-arc sweep
        const p = absPoint(nextNum(), nextNum());
        cx = p[0]; cy = p[1]; out.push({ cmd: 'L', pts: [[x(cx, ctx), y(cy, ctx)]] });
      }
    } else if (lower === 'z') {
      cx = startX; cy = startY; out.push({ cmd: 'Z', pts: [] });
      cmd = '';
    } else {
      break;
    }
  }
  return out;
}

function convertPath(node: SvgNode, ctx: ConvertCtx, slide: SlideBuildCtx): ShapeXml | undefined {
  const commands = parsePathCommands(node.attrs.d || '', ctx);
  const pts = commands.flatMap((c) => c.pts);
  if (!pts.length) return undefined;
  const minX = Math.min(...pts.map((p) => p[0]));
  const minY = Math.min(...pts.map((p) => p[1]));
  const maxX = Math.max(...pts.map((p) => p[0]));
  const maxY = Math.max(...pts.map((p) => p[1]));
  const extX = Math.max(1, emu(maxX - minX));
  const extY = Math.max(1, emu(maxY - minY));
  const ptXml = (p: [number, number]) => `<a:pt x="${emu(p[0] - minX)}" y="${emu(p[1] - minY)}"/>`;
  const segs = commands.map((c) => {
    if (c.cmd === 'M') return `<a:moveTo>${ptXml(c.pts[0])}</a:moveTo>`;
    if (c.cmd === 'L') return `<a:lnTo>${ptXml(c.pts[0])}</a:lnTo>`;
    if (c.cmd === 'C') return `<a:cubicBezTo>${ptXml(c.pts[0])}${ptXml(c.pts[1])}${ptXml(c.pts[2])}</a:cubicBezTo>`;
    if (c.cmd === 'Q') return `<a:quadBezTo>${ptXml(c.pts[0])}${ptXml(c.pts[1])}</a:quadBezTo>`;
    if (c.cmd === 'Z') return '<a:close/>';
    return '';
  }).join('');
  const geom = `<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="l" t="t" r="r" b="b"/><a:pathLst><a:path w="${extX}" h="${extY}">${segs}</a:path></a:pathLst></a:custGeom>`;
  const attrs = mergedAttrs(node, ctx);
  const id = slide.nextShapeId++;
  return { xml: wrapShape(id, `Path ${id}`, emu(minX), emu(minY), extX, extY, geom, fillXml(attrs, ctx, 'black'), strokeXml(attrs, ctx)) };
}

function textContent(node: SvgNode): string {
  return `${node.text}${node.children.map(textContent).join('')}`;
}

function estimateTextWidth(text: string, fontSize: number): number {
  let units = 0;
  for (const ch of Array.from(text)) {
    if (/\s/.test(ch)) units += 0.32;
    else if (/[\u4e00-\u9fff\u3000-\u303f]/.test(ch)) units += 1.02;
    else if (/[A-Z0-9]/.test(ch)) units += 0.62;
    else units += 0.54;
  }
  return units * fontSize;
}

function fontFace(fontFamily: string | undefined): string {
  const first = String(fontFamily || 'Microsoft YaHei').split(',')[0].replace(/["']/g, '').trim();
  if (!first || /pingfang/i.test(first)) return 'Microsoft YaHei';
  return first;
}

function textShapeXml(id: number, text: string, xx: number, baselineY: number, attrs: Record<string, string>, ctx: ConvertCtx): string {
  const fontSize = Math.max(num(attrs['font-size'], 18), 1);
  const anchor = (attrs['text-anchor'] || 'start').toLowerCase();
  const estimatedWidth = Math.max(estimateTextWidth(text, fontSize) + fontSize * 1.6, fontSize * 2);
  const slideMargin = Math.max(8, fontSize * 0.25);
  let width = estimatedWidth;
  const height = fontSize * 1.35;
  let left = xx;
  if (anchor === 'middle') {
    const centeredAvailable = Math.max(fontSize * 2, 2 * Math.max(0, Math.min(xx - slideMargin, ctx.canvasWidth - xx - slideMargin)));
    width = Math.max(estimatedWidth, centeredAvailable);
    left -= width / 2;
  } else if (anchor === 'end') {
    const leftAvailable = Math.max(fontSize * 2, xx - slideMargin);
    width = Math.max(estimatedWidth, leftAvailable);
    left -= width;
  } else {
    const rightAvailable = Math.max(fontSize * 2, ctx.canvasWidth - xx - slideMargin);
    width = Math.max(estimatedWidth, rightAvailable);
  }
  const top = baselineY - fontSize * 1.05;
  const fill = colorHex(attrs.fill || '#000000') || '000000';
  const opacity = ctx.opacity * clamp(Number(attrs['fill-opacity'] ?? 1), 0, 1);
  const align = anchor === 'middle' ? 'ctr' : anchor === 'end' ? 'r' : 'l';
  const bold = /^(bold|[6-9]00|[7-9]\d\d)$/i.test(attrs['font-weight'] || '') ? ' b="1"' : '';
  const italic = /italic/i.test(attrs['font-style'] || '') ? ' i="1"' : '';
  const sz = Math.max(100, Math.round(fontSize * 75));
  const face = fontFace(attrs['font-family']);
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Text ${id}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${emu(left)}" y="${emu(top)}"/><a:ext cx="${emu(width)}" cy="${emu(height)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr wrap="none" rtlCol="0" anchor="t" lIns="0" tIns="0" rIns="0" bIns="0" horzOverflow="overflow" vertOverflow="overflow"><a:noAutofit/></a:bodyPr><a:lstStyle/><a:p><a:pPr algn="${align}"/><a:r><a:rPr lang="zh-CN" sz="${sz}"${bold}${italic}><a:solidFill><a:srgbClr val="${fill}">${alphaXml(opacity)}</a:srgbClr></a:solidFill><a:latin typeface="${esc(face)}"/><a:ea typeface="${esc(face)}"/><a:cs typeface="${esc(face)}"/></a:rPr><a:t>${esc(text)}</a:t></a:r><a:endParaRPr lang="zh-CN" sz="${sz}"/></a:p></p:txBody></p:sp>`;
}

function convertText(node: SvgNode, ctx: ConvertCtx, slide: SlideBuildCtx): ShapeXml[] {
  const attrs = mergedAttrs(node, ctx);
  const baseX = x(num(node.attrs.x, num(attrs.x)), ctx);
  const baseY = y(num(node.attrs.y, num(attrs.y)), ctx);
  const lines: Array<{ text: string; x: number; y: number }> = [];
  const tspans = node.children.filter((child) => localName(child.tag) === 'tspan');
  if (tspans.length) {
    let currentX = baseX;
    let currentY = baseY;
    for (const tspan of tspans) {
      const tAttrs = { ...attrs, ...parseStyle(tspan.attrs.style), ...tspan.attrs };
      if (tspan.attrs.x !== undefined) currentX = x(num(tspan.attrs.x), ctx);
      if (tspan.attrs.y !== undefined) currentY = y(num(tspan.attrs.y), ctx);
      if (tspan.attrs.dx !== undefined) currentX += w(num(tspan.attrs.dx), ctx);
      if (tspan.attrs.dy !== undefined) currentY += h(num(tspan.attrs.dy), ctx);
      const text = textContent(tspan).replace(/\s+/g, ' ').trim();
      if (text) lines.push({ text, x: currentX, y: currentY });
    }
  } else {
    const text = textContent(node).replace(/\s+/g, ' ').trim();
    if (text) lines.push({ text, x: baseX, y: baseY });
  }
  return lines.map((line) => {
    const id = slide.nextShapeId++;
    return { xml: textShapeXml(id, line.text, line.x, line.y, attrs, ctx) };
  });
}

function mediaContentType(ext: string): string {
  const clean = ext.toLowerCase().replace(/^\./, '');
  if (clean === 'jpg' || clean === 'jpeg') return 'image/jpeg';
  if (clean === 'png') return 'image/png';
  if (clean === 'gif') return 'image/gif';
  if (clean === 'webp') return 'image/webp';
  if (clean === 'svg') return 'image/svg+xml';
  return 'application/octet-stream';
}

function resolveImageHref(href: string, slide: SlideBuildCtx): { data: Buffer; ext: string } | undefined {
  if (!href) return undefined;
  const dataMatch = href.match(/^data:image\/(png|jpeg|jpg|gif|webp|svg\+xml);base64,(.+)$/i);
  if (dataMatch) return { ext: dataMatch[1] === 'jpeg' ? 'jpg' : dataMatch[1].replace('svg+xml', 'svg'), data: Buffer.from(dataMatch[2], 'base64') };
  let file = href;
  if (/^https?:\/\//i.test(file)) return undefined;
  if (file.startsWith('/projects/') || file.startsWith('/generated/')) {
    const helperRoot = path.dirname(path.dirname(slide.projectRoot));
    file = path.join(helperRoot, file.replace(/^\/+/, ''));
  } else if (!path.isAbsolute(file)) {
    const fromSvg = path.resolve(path.dirname(slide.svgFile), file);
    const fromProject = path.resolve(slide.projectRoot, file);
    file = fs.existsSync(fromSvg) ? fromSvg : fromProject;
  }
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return undefined;
  const ext = path.extname(file).replace(/^\./, '').toLowerCase() || 'png';
  return { ext: ext === 'jpeg' ? 'jpg' : ext, data: fs.readFileSync(file) };
}

function convertImage(node: SvgNode, ctx: ConvertCtx, slide: SlideBuildCtx): ShapeXml | undefined {
  const href = node.attrs.href || node.attrs['xlink:href'];
  const img = resolveImageHref(href || '', slide);
  if (!img) return undefined;
  const idx = slide.media.size + 1;
  const mediaName = `image_s${path.basename(slide.svgFile, '.svg').replace(/[^a-zA-Z0-9_-]+/g, '_')}_${idx}.${img.ext}`;
  slide.media.set(mediaName, img.data);
  slide.mediaExts.add(img.ext);
  const rid = `rId${slide.nextRelId++}`;
  slide.rels.push({ id: rid, type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image', target: `../media/${mediaName}` });
  const xx = x(num(node.attrs.x), ctx);
  const yy = y(num(node.attrs.y), ctx);
  const ww = Math.max(1, w(num(node.attrs.width), ctx));
  const hh = Math.max(1, h(num(node.attrs.height), ctx));
  const id = slide.nextShapeId++;
  return { xml: `<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="Picture ${id}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="${emu(xx)}" y="${emu(yy)}"/><a:ext cx="${emu(ww)}" cy="${emu(hh)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>` };
}

function convertNode(node: SvgNode, ctx: ConvertCtx, slide: SlideBuildCtx): ShapeXml[] {
  const tag = localName(node.tag).toLowerCase();
  if (['defs', 'style', 'title', 'desc', 'metadata', 'script'].includes(tag)) return [];
  const nextCtx = childCtx(node, ctx);
  const one = (shape?: ShapeXml) => shape ? [shape] : [];
  if (tag === 'svg' || tag === 'g' || tag === 'a') return node.children.flatMap((child) => convertNode(child, nextCtx, slide));
  if (tag === 'rect') return one(convertRect(node, nextCtx, slide));
  if (tag === 'circle' || tag === 'ellipse') return one(convertEllipse(node, nextCtx, slide));
  if (tag === 'line') return one(convertLine(node, nextCtx, slide));
  if (tag === 'polyline' || tag === 'polygon') return one(convertPolyline(node, nextCtx, slide));
  if (tag === 'path') return one(convertPath(node, nextCtx, slide));
  if (tag === 'text') return convertText(node, nextCtx, slide);
  if (tag === 'image') return one(convertImage(node, nextCtx, slide));
  return node.children.flatMap((child) => convertNode(child, nextCtx, slide));
}

function svgSize(root: SvgNode): { width: number; height: number; minX: number; minY: number } {
  const viewBox = root.attrs.viewBox || root.attrs.viewbox;
  const parts = viewBox?.trim().split(/[\s,]+/).map(Number).filter((n) => Number.isFinite(n));
  if (parts && parts.length >= 4 && parts[2] > 0 && parts[3] > 0) return { minX: parts[0], minY: parts[1], width: parts[2], height: parts[3] };
  return { minX: 0, minY: 0, width: Math.max(num(root.attrs.width, 1280), 1), height: Math.max(num(root.attrs.height, 720), 1) };
}

function slideXml(shapes: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="${XMLNS_A}" xmlns:r="${XMLNS_R}" xmlns:p="${XMLNS_P}"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>${shapes}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
}

function relsXml(rels: Array<{ id: string; type: string; target: string }>): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.map((r) => `<Relationship Id="${r.id}" Type="${r.type}" Target="${esc(r.target)}"/>`).join('')}</Relationships>`;
}

function presentationXml(count: number, widthEmu: number, heightEmu: number): string {
  const slideIds = Array.from({ length: count }, (_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 2}"/>`).join('');
  const type = widthEmu * 9 === heightEmu * 16 ? 'wide' : widthEmu * 3 === heightEmu * 4 ? 'screen4x3' : 'custom';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="${XMLNS_A}" xmlns:r="${XMLNS_R}" xmlns:p="${XMLNS_P}" saveSubsetFonts="1"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${slideIds}</p:sldIdLst><p:sldSz cx="${widthEmu}" cy="${heightEmu}" type="${type}"/><p:notesSz cx="6858000" cy="9144000"/><p:defaultTextStyle><a:defPPr><a:defRPr lang="zh-CN"/></a:defPPr></p:defaultTextStyle></p:presentation>`;
}

function presentationRelsXml(count: number): string {
  const rels = [{ id: 'rId1', type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster', target: 'slideMasters/slideMaster1.xml' }];
  for (let i = 1; i <= count; i += 1) rels.push({ id: `rId${i + 1}`, type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide', target: `slides/slide${i}.xml` });
  return relsXml(rels);
}

function contentTypesXml(slideCount: number, mediaExts: Set<string>): string {
  const mediaDefaults = [...mediaExts].map((ext) => `<Default Extension="${esc(ext)}" ContentType="${mediaContentType(ext)}"/>`).join('');
  const slideOverrides = Array.from({ length: slideCount }, (_, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${mediaDefaults}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>${slideOverrides}</Types>`;
}

function staticPptFiles(slideCount: number, widthEmu: number, heightEmu: number, mediaExts: Set<string>): Array<{ name: string; data: string }> {
  const now = new Date().toISOString();
  return [
    { name: '[Content_Types].xml', data: contentTypesXml(slideCount, mediaExts) },
    { name: '_rels/.rels', data: relsXml([
      { id: 'rId1', type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument', target: 'ppt/presentation.xml' },
      { id: 'rId2', type: 'http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties', target: 'docProps/core.xml' },
      { id: 'rId3', type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties', target: 'docProps/app.xml' },
    ]) },
    { name: 'docProps/core.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>PX AI PPT</dc:title><dc:creator>PX AI Helper</dc:creator><cp:lastModifiedBy>PX AI Helper</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>` },
    { name: 'docProps/app.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>PX AI Helper</Application><PresentationFormat>On-screen Show (16:9)</PresentationFormat><Slides>${slideCount}</Slides><Notes>0</Notes><HiddenSlides>0</HiddenSlides><MMClips>0</MMClips><ScaleCrop>false</ScaleCrop><Company>PX</Company><LinksUpToDate>false</LinksUpToDate><SharedDoc>false</SharedDoc><HyperlinksChanged>false</HyperlinksChanged><AppVersion>16.0000</AppVersion></Properties>` },
    { name: 'ppt/presentation.xml', data: presentationXml(slideCount, widthEmu, heightEmu) },
    { name: 'ppt/_rels/presentation.xml.rels', data: presentationRelsXml(slideCount) },
    { name: 'ppt/slideMasters/slideMaster1.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldMaster xmlns:a="${XMLNS_A}" xmlns:r="${XMLNS_R}" xmlns:p="${XMLNS_P}"><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>` },
    { name: 'ppt/slideMasters/_rels/slideMaster1.xml.rels', data: relsXml([
      { id: 'rId1', type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout', target: '../slideLayouts/slideLayout1.xml' },
      { id: 'rId2', type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme', target: '../theme/theme1.xml' },
    ]) },
    { name: 'ppt/slideLayouts/slideLayout1.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldLayout xmlns:a="${XMLNS_A}" xmlns:r="${XMLNS_R}" xmlns:p="${XMLNS_P}" type="blank" preserve="1"><p:cSld name="Blank"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>` },
    { name: 'ppt/slideLayouts/_rels/slideLayout1.xml.rels', data: relsXml([{ id: 'rId1', type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster', target: '../slideMasters/slideMaster1.xml' }]) },
    { name: 'ppt/theme/theme1.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><a:theme xmlns:a="${XMLNS_A}" name="PX"><a:themeElements><a:clrScheme name="PX"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="1F2937"/></a:dk2><a:lt2><a:srgbClr val="F9FAFB"/></a:lt2><a:accent1><a:srgbClr val="1A56DB"/></a:accent1><a:accent2><a:srgbClr val="00A870"/></a:accent2><a:accent3><a:srgbClr val="F59E0B"/></a:accent3><a:accent4><a:srgbClr val="EF4444"/></a:accent4><a:accent5><a:srgbClr val="8B5CF6"/></a:accent5><a:accent6><a:srgbClr val="06B6D4"/></a:accent6><a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme><a:fontScheme name="PX"><a:majorFont><a:latin typeface="Microsoft YaHei"/><a:ea typeface="Microsoft YaHei"/><a:cs typeface="Microsoft YaHei"/></a:majorFont><a:minorFont><a:latin typeface="Microsoft YaHei"/><a:ea typeface="Microsoft YaHei"/><a:cs typeface="Microsoft YaHei"/></a:minorFont></a:fontScheme><a:fmtScheme name="PX"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>` },
  ];
}


interface ZipEntryData {
  name: string;
  data: Buffer;
}

function readZipEntries(file: string): Map<string, Buffer> {
  const buf = fs.readFileSync(file);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i -= 1) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('invalid pptx: EOCD not found');
  const total = buf.readUInt16LE(eocd + 10);
  const centralOffset = buf.readUInt32LE(eocd + 16);
  const entries = new Map<string, Buffer>();
  let ptr = centralOffset;
  for (let n = 0; n < total; n += 1) {
    if (buf.readUInt32LE(ptr) !== 0x02014b50) throw new Error('invalid pptx: central directory corrupt');
    const method = buf.readUInt16LE(ptr + 10);
    const compSize = buf.readUInt32LE(ptr + 20);
    const nameLen = buf.readUInt16LE(ptr + 28);
    const extraLen = buf.readUInt16LE(ptr + 30);
    const commentLen = buf.readUInt16LE(ptr + 32);
    const localOffset = buf.readUInt32LE(ptr + 42);
    const name = buf.slice(ptr + 46, ptr + 46 + nameLen).toString('utf8');
    const localNameLen = buf.readUInt16LE(localOffset + 26);
    const localExtraLen = buf.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    const compressed = buf.slice(dataStart, dataStart + compSize);
    let data: Buffer;
    if (method === 0) data = compressed;
    else if (method === 8) data = inflateRawSync(compressed);
    else throw new Error(`unsupported zip compression method: ${method}`);
    entries.set(name, data);
    ptr += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

export function validateEditablePptxSync(pptxPath: string): PptExportRun & { ok: boolean; slideCount: number; editableShapeCount: number; pictureCount: number } {
  const started = Date.now();
  const entries = readZipEntries(pptxPath);
  const slideNames = [...entries.keys()]
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => Number(a.match(/slide(\d+)/)?.[1] || 0) - Number(b.match(/slide(\d+)/)?.[1] || 0));
  let editableShapeCount = 0;
  let pictureCount = 0;
  for (const name of slideNames) {
    const xml = entries.get(name)?.toString('utf8') || '';
    editableShapeCount += (xml.match(/<p:(?:sp|cxnSp|grpSp)\b/g) || []).length;
    pictureCount += (xml.match(/<p:pic\b/g) || []).length;
  }
  const ok = slideNames.length > 0 && editableShapeCount > 0;
  return {
    ok,
    slideCount: slideNames.length,
    editableShapeCount,
    pictureCount,
    command: `node-ts validate editable pptx ${path.basename(pptxPath)}`,
    stdout: JSON.stringify({ ok, slide_count: slideNames.length, editable_shape_count: editableShapeCount, picture_count: pictureCount }),
    stderr: ok ? '' : 'No editable DrawingML shapes found',
    duration_ms: Date.now() - started,
  };
}

export function finalizePptSvgSync(projectRoot: string): PptExportRun & { files: string[] } {
  const started = Date.now();
  const svgOutput = path.join(projectRoot, 'svg_output');
  const svgFinal = path.join(projectRoot, 'svg_final');
  if (!fs.existsSync(svgOutput) || !fs.statSync(svgOutput).isDirectory()) throw new Error(`svg_output directory not found: ${svgOutput}`);
  const names = fs.readdirSync(svgOutput).filter((name) => name.toLowerCase().endsWith('.svg')).sort();
  if (!names.length) throw new Error('No SVG files in svg_output');
  fs.rmSync(svgFinal, { recursive: true, force: true });
  fs.mkdirSync(svgFinal, { recursive: true });
  const files: string[] = [];
  for (const name of names) {
    const source = path.join(svgOutput, name);
    const target = path.join(svgFinal, name);
    fs.copyFileSync(source, target);
    files.push(target);
  }
  return {
    command: `node-ts finalize svg_output -> svg_final (${names.length} files)`,
    stdout: `Copied ${names.length} SVG file(s) to svg_final`,
    stderr: '',
    duration_ms: Date.now() - started,
    files,
  };
}

export function exportPptProjectToPptxSync(projectRoot: string, options: { projectName?: string; format?: string } = {}): PptProjectExportResult {
  const started = Date.now();
  const svgDir = path.join(projectRoot, 'svg_output');
  if (!fs.existsSync(svgDir) || !fs.statSync(svgDir).isDirectory()) throw new Error(`svg_output directory not found: ${svgDir}`);
  const svgFiles = fs.readdirSync(svgDir)
    .filter((name) => name.toLowerCase().endsWith('.svg'))
    .sort((a, b) => {
      const an = Number(a.match(/^(\d+)/)?.[1] || 9999);
      const bn = Number(b.match(/^(\d+)/)?.[1] || 9999);
      return an - bn || a.localeCompare(b);
    })
    .map((name) => path.join(svgDir, name));
  if (!svgFiles.length) throw new Error('No SVG files found');

  const firstRoot = parseSvgXml(fs.readFileSync(svgFiles[0], 'utf8'));
  const size = svgSize(firstRoot);
  const widthEmu = emu(size.width);
  const heightEmu = emu(size.height);

  const pptFiles: Array<{ name: string; data: Buffer | string }> = [];
  const allMediaExts = new Set<string>();
  const mediaFiles = new Map<string, Buffer>();

  svgFiles.forEach((svgFile, index) => {
    const root = index === 0 ? firstRoot : parseSvgXml(fs.readFileSync(svgFile, 'utf8'));
    const thisSize = svgSize(root);
    const ctx: ConvertCtx = {
      tx: -thisSize.minX,
      ty: -thisSize.minY,
      sx: size.width / thisSize.width,
      sy: size.height / thisSize.height,
      opacity: 1,
      inherited: {},
      canvasWidth: size.width,
      gradients: collectGradientDefs(root),
    };
    const slide: SlideBuildCtx = { nextShapeId: 2, media: mediaFiles, mediaExts: allMediaExts, rels: [], nextRelId: 2, svgFile, projectRoot };
    const shapes = convertNode(root, ctx, slide).map((shape) => shape.xml).join('');
    pptFiles.push({ name: `ppt/slides/slide${index + 1}.xml`, data: slideXml(shapes) });
    pptFiles.push({ name: `ppt/slides/_rels/slide${index + 1}.xml.rels`, data: relsXml([
      { id: 'rId1', type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout', target: '../slideLayouts/slideLayout1.xml' },
      ...slide.rels,
    ]) });
  });

  for (const [name, data] of mediaFiles) pptFiles.push({ name: `ppt/media/${name}`, data });
  const staticFiles = staticPptFiles(svgFiles.length, widthEmu, heightEmu, allMediaExts);
  const zip = createZip([...staticFiles, ...pptFiles]);
  const exportsDir = path.join(projectRoot, 'exports');
  fs.mkdirSync(exportsDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, '').replace('T', '_');
  const projectName = (options.projectName || path.basename(projectRoot)).replace(/[^a-zA-Z0-9_.-]+/g, '_');
  const out = path.join(exportsDir, `${projectName}_${timestamp}.pptx`);
  fs.writeFileSync(out, zip);

  return {
    pptxPath: out,
    slideCount: svgFiles.length,
    run: {
      command: `node-ts svg_output -> editable pptx (${svgFiles.length} slides, ${options.format || 'ppt169'})`,
      stdout: `Generated ${out}`,
      stderr: '',
      duration_ms: Date.now() - started,
    },
  };
}
