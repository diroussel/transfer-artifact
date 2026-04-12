import type { NoFileOptions, DirectionOptions } from './constants.ts';

export interface UploadInputs {
  /**
   * The name of the artifact that will be uploaded
   */
  artifactName: string;

  /**
   * The S3 bucket to upload to
   */
  artifactBucket: string;

  /**
   * The search path used to describe what to upload as part of the artifact
   * Or where to download the artifact
   */
  searchPath: string;

  /**
   * The desired behavior if no files are found with the provided search path
   */
  ifNoFilesFound: NoFileOptions;

  /**
   * Duration after which artifact will expire in days
   */
  retentionDays?: number;

  /**
   * Whether to upload to S3, or download from S3
   */
  direction: DirectionOptions;

  /**
   * Name of the folder to upload or download into
   */
  folderName: string;

  /**
   * The rate of concurrency for p-map
   */
  concurrency: number;

  /**
   * Optional multiline list of published report definitions
   */
  reportLinks?: string[];

  /**
   * Optional public website base URL for published reports
   */
  websiteUrl?: string;

  /**
   * Optional job summary heading for published reports
   */
  reportSummaryTitle?: string;

  /**
   * Optional job summary intro text for published reports
   */
  reportSummaryIntro?: string;
}
