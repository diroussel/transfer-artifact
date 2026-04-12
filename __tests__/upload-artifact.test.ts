import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';

import type { UploadInputs } from '../src/upload-inputs.ts';

const mockGetInputs = jest.fn<() => UploadInputs>();
const mockFindFilesToUpload =
  jest.fn<() => Promise<{ filesToUpload: string[]; rootDirectory: string }>>();
const mockUploadArtifact = jest.fn<(...args: unknown[]) => Promise<void>>();
const mockCreatePublishedReportSummaryMarkdown =
  jest.fn<(...args: unknown[]) => Promise<string | null>>();
const mockAppendPublishedReportSummary =
  jest.fn<(...args: unknown[]) => Promise<void>>();
const mockInfo = jest.fn<(message: string) => void>();
const mockWarning = jest.fn<(message: string) => void>();
const mockDebug = jest.fn<(message: string) => void>();
const mockSetFailed = jest.fn<(message: string) => void>();

jest.unstable_mockModule('@actions/core', () => ({
  debug: mockDebug,
  info: mockInfo,
  setFailed: mockSetFailed,
  warning: mockWarning,
}));

jest.unstable_mockModule('../src/input-helper.ts', () => ({
  getInputs: mockGetInputs,
}));

jest.unstable_mockModule('../src/search.ts', () => ({
  findFilesToUpload: mockFindFilesToUpload,
}));

jest.unstable_mockModule('../src/aws/uploader.ts', () => ({
  uploadArtifact: mockUploadArtifact,
}));

jest.unstable_mockModule('../src/report-summary.ts', () => ({
  createPublishedReportSummaryMarkdown:
    mockCreatePublishedReportSummaryMarkdown,
  appendPublishedReportSummary: mockAppendPublishedReportSummary,
}));

describe('runUpload', () => {
  let runUpload: () => Promise<void>;

  beforeAll(async () => {
    ({ runUpload } = await import('../src/upload-artifact.ts'));
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetInputs.mockReturnValue({
      artifactBucket: 'test-bucket',
      artifactName: '123-test-folder',
      concurrency: 4,
      direction: 'upload',
      folderName: 'test-folder',
      ifNoFilesFound: 'warn',
      searchPath: '/tmp/reports',
    });
    mockFindFilesToUpload.mockResolvedValue({
      filesToUpload: ['/tmp/reports/index.html'],
      rootDirectory: '/tmp',
    });
    mockUploadArtifact.mockResolvedValue(undefined);
    mockCreatePublishedReportSummaryMarkdown.mockResolvedValue(null);
    mockAppendPublishedReportSummary.mockResolvedValue(undefined);
  });

  it('uploads files and appends the published report summary when report links are configured', async () => {
    mockGetInputs.mockReturnValue({
      artifactBucket: 'test-bucket',
      artifactName: '123-test-folder',
      concurrency: 4,
      direction: 'upload',
      folderName: 'test-folder',
      ifNoFilesFound: 'warn',
      reportLinks: ['Coverage Report:coverage:HTML coverage report'],
      reportSummaryIntro: 'Published report links',
      reportSummaryTitle: 'UI Test Reports',
      searchPath: '/tmp/reports',
      websiteUrl: 'https://reports.example.com',
    });
    mockCreatePublishedReportSummaryMarkdown.mockResolvedValue(
      '### UI Test Reports\n'
    );

    await runUpload();

    expect(mockCreatePublishedReportSummaryMarkdown).toHaveBeenCalledWith({
      artifactName: '123-test-folder',
      folderName: 'test-folder',
      reportLinks: ['Coverage Report:coverage:HTML coverage report'],
      reportSummaryIntro: 'Published report links',
      reportSummaryTitle: 'UI Test Reports',
      searchPath: '/tmp/reports',
      websiteUrl: 'https://reports.example.com',
    });
    expect(mockUploadArtifact).toHaveBeenCalledWith(
      '123-test-folder',
      ['/tmp/reports/index.html'],
      '/tmp',
      {},
      'test-bucket',
      'test-folder',
      4
    );
    expect(mockAppendPublishedReportSummary).toHaveBeenCalledWith(
      '### UI Test Reports\n'
    );
  });

  it('does not append a published report summary when no report links are configured', async () => {
    await runUpload();

    expect(mockUploadArtifact).toHaveBeenCalled();
    expect(mockCreatePublishedReportSummaryMarkdown).not.toHaveBeenCalled();
    expect(mockAppendPublishedReportSummary).not.toHaveBeenCalled();
  });

  it('does not upload or append a summary when no files are found', async () => {
    mockFindFilesToUpload.mockResolvedValue({
      filesToUpload: [],
      rootDirectory: '/tmp',
    });

    await runUpload();

    expect(mockWarning).toHaveBeenCalledWith(
      'No files were found with the provided path: /tmp/reports. No artifacts will be uploaded.'
    );
    expect(mockCreatePublishedReportSummaryMarkdown).not.toHaveBeenCalled();
    expect(mockUploadArtifact).not.toHaveBeenCalled();
    expect(mockAppendPublishedReportSummary).not.toHaveBeenCalled();
  });

  it('fails before uploading when report link validation fails', async () => {
    mockGetInputs.mockReturnValue({
      artifactBucket: 'test-bucket',
      artifactName: '123-test-folder',
      concurrency: 4,
      direction: 'upload',
      folderName: 'test-folder',
      ifNoFilesFound: 'warn',
      reportLinks: ['Coverage Report:coverage:HTML coverage report'],
      searchPath: '/tmp/reports',
      websiteUrl: 'https://reports.example.com',
    });
    mockCreatePublishedReportSummaryMarkdown.mockRejectedValue(
      new Error('Invalid report-links configuration')
    );

    await runUpload();

    expect(mockSetFailed).toHaveBeenCalledWith(
      'Invalid report-links configuration'
    );
    expect(mockUploadArtifact).not.toHaveBeenCalled();
    expect(mockAppendPublishedReportSummary).not.toHaveBeenCalled();
  });
});
