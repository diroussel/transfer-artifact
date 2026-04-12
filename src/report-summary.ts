import fs from 'node:fs/promises';
import path from 'node:path';

import * as core from '@actions/core';

const DEFAULT_REPORT_SUMMARY_TITLE = 'Published Reports';
const ARTIFACT_PREFIX = 'ci-pipeline-upload-artifacts';

export interface ReportLinkDefinition {
  name: string;
  path: string;
  text: string;
}

export interface PublishedReportLink {
  name: string;
  text: string;
  url: string;
}

export interface CreatePublishedReportSummaryMarkdownOptions {
  artifactName: string;
  folderName: string;
  reportLinks: string[];
  reportSummaryIntro?: string;
  reportSummaryTitle?: string;
  searchPath: string;
  websiteUrl?: string;
}

export function parseReportLinks(
  reportLinks: string[]
): ReportLinkDefinition[] {
  return reportLinks.flatMap((line) => {
    const trimmedLine = line.trim();
    if (!trimmedLine) {
      return [];
    }

    const firstSeparatorIndex = trimmedLine.indexOf(':');
    const secondSeparatorIndex =
      firstSeparatorIndex === -1
        ? -1
        : trimmedLine.indexOf(':', firstSeparatorIndex + 1);

    if (firstSeparatorIndex === -1 || secondSeparatorIndex === -1) {
      throw new Error(
        `Invalid report-links entry '${line}'. Expected format: link-name:link-path:link-text`
      );
    }

    const name = trimmedLine.slice(0, firstSeparatorIndex).trim();
    const reportPath = trimmedLine
      .slice(firstSeparatorIndex + 1, secondSeparatorIndex)
      .trim();
    const text = trimmedLine.slice(secondSeparatorIndex + 1).trim();

    if (!name || !reportPath || !text) {
      throw new Error(
        `Invalid report-links entry '${line}'. Expected format: link-name:link-path:link-text`
      );
    }

    return [{ name, path: reportPath, text }];
  });
}

export async function createPublishedReportSummaryMarkdown(
  options: CreatePublishedReportSummaryMarkdownOptions
): Promise<string | null> {
  if (options.reportLinks.length === 0) {
    return null;
  }

  if (!options.websiteUrl) {
    throw new Error('website-url is required when report-links is provided');
  }

  const searchDirectory = await resolveReportSearchDirectory(
    options.searchPath
  );
  const parsedReportLinks = parseReportLinks(options.reportLinks);
  if (parsedReportLinks.length === 0) {
    return null;
  }

  const publishedLinks: PublishedReportLink[] = [];
  for (const reportLink of parsedReportLinks) {
    const normalizedReportPath = normalizeReportPath(reportLink.path);
    const reportFilePath = path.join(
      searchDirectory,
      ...getLocalReportPathSegments(normalizedReportPath),
      'index.html'
    );
    const reportFileExists = await fileExists(reportFilePath);

    if (!reportFileExists) {
      throw new Error(
        `Report entry '${reportLink.name}' expects an index.html at '${reportFilePath}'`
      );
    }

    publishedLinks.push({
      name: reportLink.name,
      text: reportLink.text,
      url: buildArtifactWebsiteUrl(
        options.websiteUrl,
        options.folderName,
        options.artifactName,
        normalizedReportPath
      ),
    });
  }

  return buildPublishedReportSummaryMarkdown(
    publishedLinks,
    options.reportSummaryTitle,
    options.reportSummaryIntro
  );
}

export async function appendPublishedReportSummary(
  markdown: string
): Promise<void> {
  if (!process.env.GITHUB_STEP_SUMMARY) {
    return;
  }

  core.summary.addRaw(markdown, true);
  await core.summary.write({ overwrite: false });
}

export function buildPublishedReportSummaryMarkdown(
  links: PublishedReportLink[],
  title = DEFAULT_REPORT_SUMMARY_TITLE,
  intro?: string
): string {
  const lines = [`### ${title.trim() || DEFAULT_REPORT_SUMMARY_TITLE}`, ''];
  const trimmedIntro = intro?.trim();

  if (trimmedIntro) {
    lines.push(trimmedIntro, '');
  }

  lines.push(
    ...links.map(({ name, text, url }) => `- [${name}](${url}) ${text}`),
    ''
  );

  return lines.join('\n');
}

async function resolveReportSearchDirectory(
  searchPath: string
): Promise<string> {
  if (searchPath.includes('\n')) {
    throw new Error(
      `report-links requires 'path' to be a single concrete directory. Received multiline path input: ${searchPath}`
    );
  }

  const resolvedSearchPath = path.resolve(searchPath);

  let searchPathStats;
  try {
    searchPathStats = await fs.stat(resolvedSearchPath);
  } catch {
    throw new Error(
      `report-links requires 'path' to be a single concrete directory. Received: ${searchPath}`
    );
  }

  if (!searchPathStats.isDirectory()) {
    throw new Error(
      `report-links requires 'path' to be a directory. Received: ${searchPath}`
    );
  }

  return resolvedSearchPath;
}

function normalizeReportPath(reportPath: string): string {
  const normalizedPath = path.posix.normalize(
    reportPath.trim().replaceAll('\\', '/')
  );

  if (!normalizedPath || normalizedPath === '' || normalizedPath === '/') {
    throw new Error(`Invalid report link path '${reportPath}'`);
  }

  if (
    normalizedPath === '..' ||
    normalizedPath.startsWith('../') ||
    normalizedPath.startsWith('/')
  ) {
    throw new Error(
      `Invalid report link path '${reportPath}'. Paths must stay within the uploaded directory.`
    );
  }

  return normalizedPath === '.' ? '.' : normalizedPath.replace(/^\.\/+/u, '');
}

function getLocalReportPathSegments(reportPath: string): string[] {
  return reportPath === '.'
    ? []
    : reportPath.split('/').filter((segment) => segment.length > 0);
}

function buildArtifactWebsiteUrl(
  websiteUrl: string,
  folderName: string,
  artifactName: string,
  reportPath: string
): string {
  const url = new URL(websiteUrl);
  url.search = '';
  url.hash = '';

  const baseSegments = url.pathname.split('/').filter(Boolean);
  const reportSegments = getLocalReportPathSegments(reportPath);

  url.pathname = `/${[
    ...baseSegments,
    ARTIFACT_PREFIX,
    folderName,
    artifactName,
    ...reportSegments,
    'index.html',
  ]
    .map((segment) => encodeURIComponent(segment))
    .join('/')}`;

  return url.toString();
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    const fileStats = await fs.stat(filePath);
    return fileStats.isFile();
  } catch {
    return false;
  }
}
