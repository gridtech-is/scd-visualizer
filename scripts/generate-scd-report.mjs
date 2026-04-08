#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';

function usage() {
  console.error('Usage: node scripts/generate-scd-report.mjs <input.scd> [output.pdf]');
}

function formatBytes(size) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function attr(el, name) {
  return el.getAttribute(name) || '';
}

function ancestorTag(el, tag) {
  let cur = el.parentElement;
  while (cur) {
    if (cur.tagName === tag) return cur;
    cur = cur.parentElement;
  }
  return null;
}

function wrapLine(line, maxChars = 95) {
  if (line.length <= maxChars) return [line];
  const words = line.split(' ');
  const out = [];
  let cur = '';

  for (const word of words) {
    const candidate = cur ? `${cur} ${word}` : word;
    if (candidate.length <= maxChars) {
      cur = candidate;
      continue;
    }

    if (cur) out.push(cur);

    if (word.length <= maxChars) {
      cur = word;
      continue;
    }

    let i = 0;
    while (i < word.length) {
      out.push(word.slice(i, i + maxChars));
      i += maxChars;
    }
    cur = '';
  }

  if (cur) out.push(cur);
  return out;
}

function pdfEscape(line) {
  return line.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function buildPdf(lines) {
  const wrapped = lines.flatMap((line) => wrapLine(line));

  const pageWidth = 612;
  const pageHeight = 792;
  const margin = 72;
  const fontSize = 10;
  const lineHeight = 14;
  const linesPerPage = Math.floor((pageHeight - margin * 2) / lineHeight);

  const pages = [];
  for (let i = 0; i < wrapped.length; i += linesPerPage) {
    pages.push(wrapped.slice(i, i + linesPerPage));
  }
  if (pages.length === 0) pages.push(['(empty report)']);

  const pageCount = pages.length;
  const fontObjNum = 3 + pageCount * 2;

  const objects = new Map();
  objects.set(1, '<< /Type /Catalog /Pages 2 0 R >>');

  const kids = [];
  for (let i = 0; i < pageCount; i += 1) {
    const pageObjNum = 3 + i * 2;
    kids.push(`${pageObjNum} 0 R`);
  }
  objects.set(2, `<< /Type /Pages /Count ${pageCount} /Kids [${kids.join(' ')}] >>`);

  for (let i = 0; i < pageCount; i += 1) {
    const pageObjNum = 3 + i * 2;
    const contentObjNum = 4 + i * 2;

    const chunk = pages[i];
    const yStart = pageHeight - margin;
    const streamLines = ['BT', `/F1 ${fontSize} Tf`, `${lineHeight} TL`, `${margin} ${yStart} Td`];

    for (let j = 0; j < chunk.length; j += 1) {
      const escaped = pdfEscape(chunk[j]);
      if (j === 0) streamLines.push(`(${escaped}) Tj`);
      else streamLines.push('T*', `(${escaped}) Tj`);
    }

    streamLines.push('ET');
    const stream = `${streamLines.join('\n')}\n`;

    objects.set(
      pageObjNum,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${fontObjNum} 0 R >> >> /Contents ${contentObjNum} 0 R >>`
    );

    objects.set(contentObjNum, `<< /Length ${Buffer.byteLength(stream, 'utf8')} >>\nstream\n${stream}endstream`);
  }

  objects.set(fontObjNum, '<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>');

  const maxObjNum = fontObjNum;
  let pdf = '%PDF-1.4\n%\xFF\xFF\xFF\xFF\n';
  const offsets = new Array(maxObjNum + 1).fill(0);

  for (let n = 1; n <= maxObjNum; n += 1) {
    offsets[n] = Buffer.byteLength(pdf, 'utf8');
    pdf += `${n} 0 obj\n${objects.get(n)}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${maxObjNum + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let n = 1; n <= maxObjNum; n += 1) {
    pdf += `${String(offsets[n]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${maxObjNum + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(pdf, 'utf8');
}

function buildLines(inputPath, xmlText) {
  const dom = new JSDOM(xmlText, { contentType: 'text/xml' });
  const doc = dom.window.document;

  if (doc.querySelector('parsererror')) {
    throw new Error('Invalid XML: parsererror found in document.');
  }

  const stat = fs.statSync(inputPath);

  const ieds = [...doc.getElementsByTagName('IED')];
  const accessPoints = [...doc.getElementsByTagName('AccessPoint')];
  const lDevices = [...doc.getElementsByTagName('LDevice')];
  const datasets = [...doc.getElementsByTagName('DataSet')];
  const fcdas = [...doc.getElementsByTagName('FCDA')];

  const gseControls = [...doc.getElementsByTagName('GSEControl')];
  const svControls = [...doc.getElementsByTagName('SampledValueControl')];
  const reportControls = [...doc.getElementsByTagName('ReportControl')];

  const subNetworks = [...doc.getElementsByTagName('SubNetwork')];
  const connectedAps = [...doc.getElementsByTagName('ConnectedAP')];
  const gses = [...doc.getElementsByTagName('GSE')];
  const smvs = [...doc.getElementsByTagName('SMV')];

  const extRefs = [...doc.getElementsByTagName('ExtRef')];

  const connectedApKeys = new Set(
    connectedAps.map((cap) => `${attr(cap, 'iedName')}::${attr(cap, 'apName')}`)
  );

  let unresolvedGoose = 0;
  for (const gse of gseControls) {
    const ied = ancestorTag(gse, 'IED');
    const ap = ancestorTag(gse, 'AccessPoint');
    const key = `${ied ? attr(ied, 'name') : ''}::${ap ? attr(ap, 'name') : ''}`;
    if (!connectedApKeys.has(key)) unresolvedGoose += 1;
  }

  let unresolvedSv = 0;
  for (const sv of svControls) {
    const ied = ancestorTag(sv, 'IED');
    const ap = ancestorTag(sv, 'AccessPoint');
    const key = `${ied ? attr(ied, 'name') : ''}::${ap ? attr(ap, 'name') : ''}`;
    if (!connectedApKeys.has(key)) unresolvedSv += 1;
  }

  const missingReportDataSet = reportControls.filter((rc) => !attr(rc, 'datSet')).length;

  const unnamedIeds = ieds.filter((ied) => !attr(ied, 'name')).length;
  const unnamedSubnets = subNetworks.filter((sn) => !attr(sn, 'name')).length;

  const topIeds = ieds
    .map((ied) => attr(ied, 'name') || '(unnamed)')
    .filter(Boolean)
    .slice(0, 15);

  const subnetRows = subNetworks.map((sn) => {
    const name = attr(sn, 'name') || '(unnamed)';
    const type = attr(sn, 'type') || 'n/a';
    const capCount = sn.getElementsByTagName('ConnectedAP').length;
    return `- ${name} (type: ${type}, ConnectedAP: ${capCount})`;
  });

  return [
    'IEC 61850 SCD REPORT',
    '',
    `Generated: ${new Date().toISOString()}`,
    `Source: ${inputPath}`,
    `Last modified: ${stat.mtime.toISOString()}`,
    `File size: ${formatBytes(stat.size)} (${stat.size} bytes)`,
    '',
    'OVERVIEW',
    `- IED: ${ieds.length}`,
    `- AccessPoint: ${accessPoints.length}`,
    `- LDevice: ${lDevices.length}`,
    `- DataSet: ${datasets.length}`,
    `- FCDA: ${fcdas.length}`,
    `- ExtRef: ${extRefs.length}`,
    '',
    'CONTROL BLOCKS',
    `- GSEControl: ${gseControls.length}`,
    `- SampledValueControl: ${svControls.length}`,
    `- ReportControl: ${reportControls.length}`,
    '',
    'COMMUNICATION',
    `- SubNetwork: ${subNetworks.length}`,
    `- ConnectedAP: ${connectedAps.length}`,
    `- GSE endpoints: ${gses.length}`,
    `- SMV endpoints: ${smvs.length}`,
    '',
    'QUALITY CHECKS',
    `- GSEControl without matching ConnectedAP (same IED/AP): ${unresolvedGoose}`,
    `- SampledValueControl without matching ConnectedAP (same IED/AP): ${unresolvedSv}`,
    `- ReportControl missing datSet: ${missingReportDataSet}`,
    `- Unnamed IED entries: ${unnamedIeds}`,
    `- Unnamed SubNetwork entries: ${unnamedSubnets}`,
    '',
    'IED LIST (up to first 15)',
    ...(topIeds.length ? topIeds.map((n) => `- ${n}`) : ['- None']),
    '',
    'SUBNETWORK LIST',
    ...(subnetRows.length ? subnetRows : ['- None'])
  ];
}

function main() {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    usage();
    process.exit(1);
  }

  const inputPath = path.resolve(args[0]);
  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input file not found: ${inputPath}`);
  }

  const inputBase = path.basename(inputPath, path.extname(inputPath));
  const outputPdf = path.resolve(args[1] || `${inputBase}-report.pdf`);
  const outputTxt = outputPdf.replace(/\.pdf$/i, '.txt');

  const xmlText = fs.readFileSync(inputPath, 'utf8');
  const lines = buildLines(inputPath, xmlText);

  fs.writeFileSync(outputTxt, `${lines.join('\n')}\n`, 'utf8');
  fs.writeFileSync(outputPdf, buildPdf(lines));

  console.log(`Text report: ${outputTxt}`);
  console.log(`PDF report: ${outputPdf}`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
