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

const mockSummary = {
  addRaw: jest.fn<(text: string, addEOL?: boolean) => typeof mockSummary>(),
  write: jest.fn<(options?: { overwrite?: boolean }) => Promise<void>>(),
};

mockSummary.addRaw.mockImplementation(() => mockSummary);
mockSummary.write.mockResolvedValue(undefined);

jest.unstable_mockModule('@actions/core', () => ({
  summary: mockSummary,
}));

let appendPublishedReportSummary: typeof ReportSummaryModule.appendPublishedReportSummary;
let buildPublishedReportSummaryMarkdown: typeof ReportSummaryModule.buildPublishedReportSummaryMarkdown;
let createPublishedReportSummaryMarkdown: typeof ReportSummaryModule.createPublishedReportSummaryMarkdown;
let parseReportLinks: typeof ReportSummaryModule.parseReportLinks;

beforeAll(async () => {
  ({
    appendPublishedReportSummary,
    buildPublishedReportSummaryMarkdown,
    createPublishedReportSummaryMarkdown,
    parseReportLinks,
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

  it('parses colon-separated report definitions and allows colons in link text', () => {
    expect(
      parseReportLinks([
        'Coverage Report:coverage:HTML coverage report',
        'Unit Tests:unit-tests:Detailed results: with extra detail',
      ])
    ).toStrictEqual([
      {
        name: 'Coverage Report',
        path: 'coverage',
        text: 'HTML coverage report',
      },
      {
        name: 'Unit Tests',
        path: 'unit-tests',
        text: 'Detailed results: with extra detail',
      },
    ]);
  });

  it('renders markdown with link text on each bullet', () => {
    expect(
      buildPublishedReportSummaryMarkdown(
        [
          {
            name: 'Coverage Report',
            text: 'HTML coverage report',
            url: 'https://reports.example.com/coverage/index.html',
          },
        ],
        'Coverage Reports',
        'Published report links'
      )
    ).toBe(
      [
        '### Coverage Reports',
        '',
        'Published report links',
        '',
        '- [Coverage Report](https://reports.example.com/coverage/index.html) HTML coverage report',
        '',
      ].join('\n')
    );
  });

  it('creates markdown from multiline report-links definitions', async () => {
    const tempDirectory = await fs.mkdtemp(
      path.join(os.tmpdir(), 'transfer-artifact-report-summary-')
    );
    await fs.mkdir(path.join(tempDirectory, 'coverage'), { recursive: true });
    await fs.mkdir(path.join(tempDirectory, 'unit-tests'), { recursive: true });
    await fs.writeFile(
      path.join(tempDirectory, 'coverage', 'index.html'),
      'ok'
    );
    await fs.writeFile(
      path.join(tempDirectory, 'unit-tests', 'index.html'),
      'ok'
    );

    await expect(
      createPublishedReportSummaryMarkdown({
        artifactName: '123-upload-artifacts',
        folderName: 'upload-artifacts',
        reportLinks: [
          'Coverage Report:coverage:HTML coverage report',
          'Unit Tests:unit-tests:Detailed unit test report',
        ],
        reportSummaryIntro: 'Published report links',
        reportSummaryTitle: 'UI Test Reports',
        searchPath: tempDirectory,
        websiteUrl: 'https://reports.example.com/base',
      })
    ).resolves.toBe(
      [
        '### UI Test Reports',
        '',
        'Published report links',
        '',
        '- [Coverage Report](https://reports.example.com/base/ci-pipeline-upload-artifacts/upload-artifacts/123-upload-artifacts/coverage/index.html) HTML coverage report',
        '- [Unit Tests](https://reports.example.com/base/ci-pipeline-upload-artifacts/upload-artifacts/123-upload-artifacts/unit-tests/index.html) Detailed unit test report',
        '',
      ].join('\n')
    );
  });

  it('rejects report links that traverse outside the upload directory', async () => {
    const tempDirectory = await fs.mkdtemp(
      path.join(os.tmpdir(), 'transfer-artifact-report-summary-')
    );

    await expect(
      createPublishedReportSummaryMarkdown({
        artifactName: '123-upload-artifacts',
        folderName: 'upload-artifacts',
        reportLinks: ['Coverage Report:../coverage:HTML coverage report'],
        searchPath: tempDirectory,
        websiteUrl: 'https://reports.example.com/base',
      })
    ).rejects.toThrow(
      "Invalid report link path '../coverage'. Paths must stay within the uploaded directory."
    );
  });

  it('rejects multiline or non-directory path inputs when report-links are enabled', async () => {
    await expect(
      createPublishedReportSummaryMarkdown({
        artifactName: '123-upload-artifacts',
        folderName: 'upload-artifacts',
        reportLinks: ['Coverage Report:coverage:HTML coverage report'],
        searchPath: 'coverage\nreports',
        websiteUrl: 'https://reports.example.com/base',
      })
    ).rejects.toThrow(
      "report-links requires 'path' to be a single concrete directory. Received multiline path input: coverage\nreports"
    );

    const tempDirectory = await fs.mkdtemp(
      path.join(os.tmpdir(), 'transfer-artifact-report-summary-')
    );
    const singleFilePath = path.join(tempDirectory, 'index.html');
    await fs.writeFile(singleFilePath, 'ok');

    await expect(
      createPublishedReportSummaryMarkdown({
        artifactName: '123-upload-artifacts',
        folderName: 'upload-artifacts',
        reportLinks: ['Coverage Report:coverage:HTML coverage report'],
        searchPath: singleFilePath,
        websiteUrl: 'https://reports.example.com/base',
      })
    ).rejects.toThrow(
      `report-links requires 'path' to be a directory. Received: ${singleFilePath}`
    );
  });

  it('requires an index.html inside each report folder', async () => {
    const tempDirectory = await fs.mkdtemp(
      path.join(os.tmpdir(), 'transfer-artifact-report-summary-')
    );
    await fs.mkdir(path.join(tempDirectory, 'coverage'), { recursive: true });

    await expect(
      createPublishedReportSummaryMarkdown({
        artifactName: '123-upload-artifacts',
        folderName: 'upload-artifacts',
        reportLinks: ['Coverage Report:coverage:HTML coverage report'],
        searchPath: tempDirectory,
        websiteUrl: 'https://reports.example.com/base',
      })
    ).rejects.toThrow(
      `Report entry 'Coverage Report' expects an index.html at '${path.join(
        tempDirectory,
        'coverage',
        'index.html'
      )}'`
    );
  });

  it('appends markdown to the GitHub step summary when available', async () => {
    process.env.GITHUB_STEP_SUMMARY = '/tmp/summary.md';

    await appendPublishedReportSummary('### Published Reports\n');

    expect(mockSummary.addRaw).toHaveBeenCalledWith(
      '### Published Reports\n',
      true
    );
    expect(mockSummary.write).toHaveBeenCalledWith({ overwrite: false });
  });
});
