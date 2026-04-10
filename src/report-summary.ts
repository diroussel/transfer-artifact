import fs from 'node:fs/promises';
import path from 'node:path';

import * as core from '@actions/core';

const DEFAULT_REPORT_SUMMARY_TITLE = 'Published Reports';
const ARTIFACT_PREFIX = 'ci-pipeline-upload-artifacts';

export interface ReportLinkEntry {
  label: string;
  target: string;
}

export interface PublishedReportLink {
  label: string;
  url: string;
}

export interface AppendPublishedReportSummaryOptions {
  artifactName: string;
  folderName: string;
  reportLinksFile: string;
  reportSummaryIntro?: string;
  reportSummaryTitle?: string;
  websiteUrl?: string;
}

export function parseReportLinks(content: string): ReportLinkEntry[] {
  return content
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      const separatorIndex = line.indexOf('\t');
      if (separatorIndex === -1) {
        return [];
      }

      const label = line.slice(0, separatorIndex).trim();
      const target = line.slice(separatorIndex + 1).trim();

      if (!label || !target) {
        return [];
      }

      return [{ label, target }];
    });
}

export function resolvePublishedReportLink(
  link: ReportLinkEntry,
  options: Pick<
    AppendPublishedReportSummaryOptions,
    'artifactName' | 'folderName' | 'websiteUrl'
  >
): PublishedReportLink | null {
  const absoluteUrl = normalizeAbsoluteUrl(link.target);
  if (absoluteUrl) {
    return {
      label: link.label,
      url: absoluteUrl,
    };
  }

  if (!options.websiteUrl) {
    return null;
  }

  const relativePath = normalizeRelativeReportPath(link.target);
  if (!relativePath) {
    return null;
  }

  return {
    label: link.label,
    url: buildArtifactWebsiteUrl(
      options.websiteUrl,
      options.folderName,
      options.artifactName,
      relativePath
    ),
  };
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

  lines.push(...links.map(({ label, url }) => `- [${label}](${url})`), '');

  return lines.join('\n');
}

export async function appendPublishedReportSummary(
  options: AppendPublishedReportSummaryOptions
): Promise<void> {
  if (!process.env.GITHUB_STEP_SUMMARY) {
    return;
  }

  let reportLinksContent: string;
  try {
    reportLinksContent = await fs.readFile(options.reportLinksFile, 'utf8');
  } catch {
    core.warning(
      `Could not read report links file '${options.reportLinksFile}'. Skipping published report summary.`
    );
    return;
  }

  const reportLinks = parseReportLinks(reportLinksContent);
  if (reportLinks.length === 0) {
    return;
  }

  const publishedLinks = reportLinks.flatMap((link) => {
    const resolvedLink = resolvePublishedReportLink(link, options);
    if (resolvedLink) {
      return [resolvedLink];
    }

    core.warning(
      `Skipping published report link '${link.label}' because it is not an absolute URL and could not be resolved with website-url.`
    );
    return [];
  });

  if (publishedLinks.length === 0) {
    return;
  }

  const markdown = buildPublishedReportSummaryMarkdown(
    publishedLinks,
    options.reportSummaryTitle,
    options.reportSummaryIntro
  );

  core.summary.addRaw(markdown, true);
  await core.summary.write({ overwrite: false });
}

function normalizeAbsoluteUrl(value: string): string | null {
  try {
    return new URL(value).toString();
  } catch {
    return null;
  }
}

function normalizeRelativeReportPath(reportPath: string): string | null {
  const slashNormalizedPath = reportPath.trim().replaceAll('\\', '/');
  if (!slashNormalizedPath) {
    return null;
  }

  const normalizedPath = path.posix
    .normalize(slashNormalizedPath)
    .replace(/^\/+/u, '');

  if (
    !normalizedPath ||
    normalizedPath === '.' ||
    normalizedPath === '..' ||
    normalizedPath.startsWith('../')
  ) {
    return null;
  }

  return normalizedPath;
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
  const reportSegments = reportPath.split('/').filter(Boolean);

  url.pathname = `/${[...baseSegments, ARTIFACT_PREFIX, folderName, artifactName, ...reportSegments]
    .map((segment) => encodeURIComponent(segment))
    .join('/')}`;

  return url.toString();
}
