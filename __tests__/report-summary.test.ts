import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';

import type * as ReportSummaryModule from '../src/report-summary.ts';

const mockWarning = jest.fn<(message: string) => void>();
const mockSummary = {
  addRaw: jest.fn<(text: string, addEOL?: boolean) => typeof mockSummary>(),
  write: jest.fn<(options?: { overwrite?: boolean }) => Promise<void>>(),
};

mockSummary.addRaw.mockImplementation(() => mockSummary);
mockSummary.write.mockResolvedValue(undefined);

jest.unstable_mockModule('@actions/core', () => ({
  summary: mockSummary,
  warning: mockWarning,
}));

let appendPublishedReportSummary: typeof ReportSummaryModule.appendPublishedReportSummary;
let buildPublishedReportSummaryMarkdown: typeof ReportSummaryModule.buildPublishedReportSummaryMarkdown;
let parseReportLinks: typeof ReportSummaryModule.parseReportLinks;
let resolvePublishedReportLink: typeof ReportSummaryModule.resolvePublishedReportLink;

beforeAll(async () => {
  ({
    appendPublishedReportSummary,
    buildPublishedReportSummaryMarkdown,
    parseReportLinks,
    resolvePublishedReportLink,
  } = await import('../src/report-summary.ts'));
});

describe('report-summary', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('parses valid TSV rows and skips malformed lines', () => {
    expect(
      parseReportLinks(
        [
          'HTML Report\tcoverage/index.html',
          '',
          'missing-tab',
          ' \tmissing-label',
          'Coverage JSON\thttps://example.com/report.json',
        ].join('\n')
      )
    ).toStrictEqual([
      { label: 'HTML Report', target: 'coverage/index.html' },
      {
        label: 'Coverage JSON',
        target: 'https://example.com/report.json',
      },
    ]);
  });

  it('resolves artifact-relative paths against the public website URL', () => {
    expect(
      resolvePublishedReportLink(
        { label: 'Coverage Report', target: './coverage results/index.html' },
        {
          artifactName: '123-upload-artifacts',
          folderName: 'upload-artifacts',
          websiteUrl: 'https://reports.example.com/base/',
        }
      )
    ).toStrictEqual({
      label: 'Coverage Report',
      url: 'https://reports.example.com/base/ci-pipeline-upload-artifacts/upload-artifacts/123-upload-artifacts/coverage%20results/index.html',
    });
  });

  it('renders markdown with a title, intro, and links', () => {
    expect(
      buildPublishedReportSummaryMarkdown(
        [
          {
            label: 'HTML Report',
            url: 'https://reports.example.com/html/index.html',
          },
        ],
        'UI Test Reports',
        'Published report links'
      )
    ).toBe(
      [
        '### UI Test Reports',
        '',
        'Published report links',
        '',
        '- [HTML Report](https://reports.example.com/html/index.html)',
        '',
      ].join('\n')
    );
  });

  it('appends a published report summary and warns for unresolved rows', async () => {
    process.env.GITHUB_STEP_SUMMARY = '/tmp/summary.md';

    const tempDirectory = await fs.mkdtemp(
      path.join(os.tmpdir(), 'transfer-artifact-report-summary-')
    );
    const reportLinksFile = path.join(tempDirectory, 'report-links.tsv');
    await fs.writeFile(
      reportLinksFile,
      [
        'HTML Report\tcoverage/index.html',
        'Absolute URL\thttps://reports.example.com/external/index.html',
        'Invalid Relative\t../secret/index.html',
      ].join('\n')
    );

    await appendPublishedReportSummary({
      artifactName: '123-upload-artifacts',
      folderName: 'upload-artifacts',
      reportLinksFile,
      reportSummaryIntro: 'Published report links',
      reportSummaryTitle: 'UI Test Reports',
      websiteUrl: 'https://reports.example.com/root',
    });

    expect(mockWarning).toHaveBeenCalledWith(
      "Skipping published report link 'Invalid Relative' because it is not an absolute URL and could not be resolved with website-url."
    );
    expect(mockSummary.addRaw).toHaveBeenCalledWith(
      [
        '### UI Test Reports',
        '',
        'Published report links',
        '',
        '- [HTML Report](https://reports.example.com/root/ci-pipeline-upload-artifacts/upload-artifacts/123-upload-artifacts/coverage/index.html)',
        '- [Absolute URL](https://reports.example.com/external/index.html)',
        '',
      ].join('\n'),
      true
    );
    expect(mockSummary.write).toHaveBeenCalledWith({ overwrite: false });
  });
});
