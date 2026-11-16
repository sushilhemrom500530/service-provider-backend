import {
  PutObjectCommand,
  DeleteObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} from '@aws-sdk/client-s3';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import colors from 'colors';
import sharp from 'sharp';
import ffmpeg from 'fluent-ffmpeg';
import { config } from '../config';
import { errorLogger, logger } from '../shared/logger';
import { s3Client } from './awsConfig';
import AppError from '../errors/AppErro';
import { StatusCodes } from 'http-status-codes';

// AWS errors that mean the server's keys are wrong (not the user's file)
const AWS_CREDENTIAL_ERRORS = [
  'InvalidAccessKeyId',
  'SignatureDoesNotMatch',
  'ExpiredToken',
  'InvalidToken',
  'AccessDenied',
  'CredentialsProviderError',
];
const isAwsCredentialError = (error: unknown) =>
  AWS_CREDENTIAL_ERRORS.includes(String((error as any)?.name ?? (error as any)?.Code ?? ''));

// Supported file types and their max sizes
const FILE_LIMITS = {
  images: {
    extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif'],
    maxSize: 50 * 1024 * 1024, // 50MB
  },
  documents: {
    extensions: ['pdf', 'doc', 'docx', 'txt'],
    maxSize: 100 * 1024 * 1024, // 100MB
  },
  videos: {
    extensions: ['mp4', 'avi', 'mov', 'wmv', 'mkv', 'webm'],
    maxSize: 500 * 1024 * 1024, // 500MB
  },
  audio: {
    extensions: ['mp3', 'wav', 'ogg', 'aac', 'flac'],
    maxSize: 50 * 1024 * 1024, // 50MB
  },
};

const COMPRESSION_CONFIG = {
  images: {
    quality: 80,
    maxWidth: 1920,
    maxHeight: 1080,
    format: 'webp',
  },
  videos: {
    crf: 28,
    maxWidth: 1280,
    maxHeight: 720,
    videoBitrate: '1000k',
    audioBitrate: '128k',
  },
  documents: {
    quality: 85,
    dpi: 150,
  },
};

// Chunk size for multipart upload (minimum 5MB required by S3)
const CHUNK_SIZE = 5 * 1024 * 1024;
const MAX_CONCURRENT_PARTS = 4;
const MAX_RETRIES = 3;

// Validate file
const validateFile = (file: Express.Multer.File) => {
  const fileExtension = path.extname(file.originalname).toLowerCase().slice(1);

  let fileCategory: string | null = null;
  let maxSize = 0;

  for (const [category, limits] of Object.entries(FILE_LIMITS)) {
    if (limits.extensions.includes(fileExtension)) {
      fileCategory = category;
      maxSize = limits.maxSize;
      break;
    }
  }

  if (!fileCategory) {
    throw new Error(`Unsupported file type: ${fileExtension}`);
  }

  if (file.size > maxSize) {
    throw new Error(
      `File size exceeds ${
        maxSize / (1024 * 1024)
      }MB limit for ${fileCategory}: ${file.originalname}`
    );
  }

  return { fileCategory, fileExtension };
};

// Compress image using Sharp
const compressImage = async (
  inputPath: string,
  outputPath: string
): Promise<{ originalSize: number; compressedSize: number }> => {
  try {
    const originalStats = fs.statSync(inputPath);
    const originalSize = originalStats.size;

    await sharp(inputPath)
      .resize(
        COMPRESSION_CONFIG.images.maxWidth,
        COMPRESSION_CONFIG.images.maxHeight,
        {
          fit: 'inside',
          withoutEnlargement: true,
        }
      )
      .webp({ quality: COMPRESSION_CONFIG.images.quality })
      .toFile(outputPath);

    const compressedStats = fs.statSync(outputPath);
    const compressedSize = compressedStats.size;

    logger.info(
      colors.cyan(
        `📸 Image compressed: ${(originalSize / 1024 / 1024).toFixed(2)}MB → ${(
          compressedSize /
          1024 /
          1024
        ).toFixed(2)}MB (${Math.round(
          (1 - compressedSize / originalSize) * 100
        )}% reduction)`
      )
    );

    return { originalSize, compressedSize };
  } catch (error) {
    errorLogger.error('Image compression failed', {
      error,
      inputPath,
      outputPath,
    });
    throw new Error(
      `Image compression failed: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`
    );
  }
};

// Compress video using FFMPEG
const compressVideo = async (
  inputPath: string,
  outputPath: string
): Promise<{ originalSize: number; compressedSize: number }> => {
  return new Promise((resolve, reject) => {
    try {
      const originalStats = fs.statSync(inputPath);
      const originalSize = originalStats.size;

      ffmpeg(inputPath)
        .videoCodec('libx264')
        .audioCodec('aac')
        .videoBitrate(COMPRESSION_CONFIG.videos.videoBitrate)
        .audioBitrate(COMPRESSION_CONFIG.videos.audioBitrate)
        .size(
          `${COMPRESSION_CONFIG.videos.maxWidth}x${COMPRESSION_CONFIG.videos.maxHeight}`
        )
        .outputOptions([
          `-crf ${COMPRESSION_CONFIG.videos.crf}`,
          '-preset medium',
          '-movflags +faststart',
        ])
        .output(outputPath)
        .on('start', () => {
          logger.info(
            colors.cyan(
              `🎬 Starting video compression: ${path.basename(inputPath)}`
            )
          );
        })
        .on('progress', progress => {
          if (progress.percent) {
            logger.info(
              colors.yellow(
                `🎬 Video compression progress: ${Math.round(
                  progress.percent
                )}%`
              )
            );
          }
        })
        .on('end', () => {
          try {
            const compressedStats = fs.statSync(outputPath);
            const compressedSize = compressedStats.size;

            logger.info(
              colors.cyan(
                `🎬 Video compressed: ${(originalSize / 1024 / 1024).toFixed(
                  2
                )}MB → ${(compressedSize / 1024 / 1024).toFixed(
                  2
                )}MB (${Math.round(
                  (1 - compressedSize / originalSize) * 100
                )}% reduction)`
              )
            );

            resolve({ originalSize, compressedSize });
          } catch (error) {
            reject(error);
          }
        })
        .on('error', error => {
          errorLogger.error('Video compression failed', {
            error,
            inputPath,
            outputPath,
          });
          reject(new Error(`Video compression failed: ${error.message}`));
        })
        .run();
    } catch (error) {
      reject(error);
    }
  });
};

// Compress document
const compressDocument = async (
  inputPath: string,
  outputPath: string
): Promise<{ originalSize: number; compressedSize: number }> => {
  try {
    const originalStats = fs.statSync(inputPath);
    const originalSize = originalStats.size;

    fs.copyFileSync(inputPath, outputPath);

    const compressedStats = fs.statSync(outputPath);
    const compressedSize = compressedStats.size;

    logger.info(
      colors.cyan(
        `📄 Document processed: ${(originalSize / 1024 / 1024).toFixed(2)}MB`
      )
    );

    return { originalSize, compressedSize };
  } catch (error) {
    errorLogger.error('Document compression failed', {
      error,
      inputPath,
      outputPath,
    });
    throw new Error(
      `Document compression failed: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`
    );
  }
};

/**
 * Compress audio file
 */
const compressAudio = async (
  inputPath: string,
  outputPath: string
): Promise<{ originalSize: number; compressedSize: number }> => {
  return new Promise((resolve, reject) => {
    try {
      const originalStats = fs.statSync(inputPath);
      const originalSize = originalStats.size;

      ffmpeg(inputPath)
        .audioCodec('libmp3lame')
        .audioBitrate('128k')
        .audioFrequency(44100)
        .output(outputPath)
        .on('start', () => {
          logger.info(
            colors.cyan(
              `🎵 Starting audio compression: ${path.basename(inputPath)}`
            )
          );
        })
        .on('end', () => {
          try {
            const compressedStats = fs.statSync(outputPath);
            const compressedSize = compressedStats.size;

            logger.info(
              colors.cyan(
                `🎵 Audio compressed: ${(originalSize / 1024 / 1024).toFixed(
                  2
                )}MB → ${(compressedSize / 1024 / 1024).toFixed(
                  2
                )}MB (${Math.round(
                  (1 - compressedSize / originalSize) * 100
                )}% reduction)`
              )
            );

            resolve({ originalSize, compressedSize });
          } catch (error) {
            reject(error);
          }
        })
        .on('error', error => {
          errorLogger.error('Audio compression failed', {
            error,
            inputPath,
            outputPath,
          });
          reject(new Error(`Audio compression failed: ${error.message}`));
        })
        .run();
    } catch (error) {
      reject(error);
    }
  });
};

/**
 * Compress file based on its type
 */
const compressFile = async (
  file: Express.Multer.File,
  fileCategory: string
): Promise<{
  compressedPath: string;
  originalSize: number;
  compressedSize: number;
  newExtension?: string;
}> => {
  const inputPath = file.path;
  const tempDir = path.dirname(inputPath);
  const baseName = path.basename(
    file.originalname,
    path.extname(file.originalname)
  );

  let outputPath: string;
  let newExtension: string | undefined;
  let compressionResult: { originalSize: number; compressedSize: number };

  try {
    switch (fileCategory) {
      case 'images':
        newExtension = 'webp';
        outputPath = path.join(
          tempDir,
          `${baseName}_compressed.${newExtension}`
        );
        compressionResult = await compressImage(inputPath, outputPath);
        break;

      case 'videos':
        newExtension = 'mp4';
        outputPath = path.join(
          tempDir,
          `${baseName}_compressed.${newExtension}`
        );
        compressionResult = await compressVideo(inputPath, outputPath);
        break;

      case 'audio':
        newExtension = 'mp3';
        outputPath = path.join(
          tempDir,
          `${baseName}_compressed.${newExtension}`
        );
        compressionResult = await compressAudio(inputPath, outputPath);
        break;

      case 'documents':
        const originalExt = path.extname(file.originalname).slice(1);
        outputPath = path.join(
          tempDir,
          `${baseName}_compressed.${originalExt}`
        );
        compressionResult = await compressDocument(inputPath, outputPath);
        break;

      default:
        throw new Error(
          `Compression not supported for file category: ${fileCategory}`
        );
    }

    return {
      compressedPath: outputPath,
      originalSize: compressionResult.originalSize,
      compressedSize: compressionResult.compressedSize,
      newExtension,
    };
  } catch (error) {
    errorLogger.error('File compression failed', {
      error,
      fileCategory,
      fileName: file.originalname,
    });
    throw error;
  }
};

/**
 * Clean up local temporary files
 */
const cleanupLocalFiles = (filePaths: string[]) => {
  filePaths.forEach(filePath => {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        logger.info(colors.green(`🗑️  Cleaned up local file: ${filePath}`));
      }
    } catch (err) {
      logger.warn(
        colors.yellow(`⚠️  Failed to delete temp file ${filePath}: ${err}`)
      );
    }
  });
};

/**
 * Upload a single chunk with retry logic
 */
const uploadChunkWithRetry = async (
  params: {
    Bucket: string;
    Key: string;
    UploadId: string;
    PartNumber: number;
    Body: Buffer;
  },
  retries = MAX_RETRIES
): Promise<{ ETag: string; PartNumber: number }> => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const uploadPartCommand = new UploadPartCommand(params);
      const uploadPartResult = await s3Client.send(uploadPartCommand);

      if (!uploadPartResult.ETag) {
        throw new Error('No ETag returned from S3');
      }

      return {
        ETag: uploadPartResult.ETag,
        PartNumber: params.PartNumber,
      };
    } catch (error) {
      if (attempt === retries) {
        throw error;
      }

      const waitTime = Math.min(1000 * Math.pow(2, attempt - 1), 5000); // Exponential backoff
      logger.warn(
        colors.yellow(
          `⚠️  Chunk ${params.PartNumber} upload failed (attempt ${attempt}/${retries}), retrying in ${waitTime}ms...`
        )
      );
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }

  throw new Error(
    `Failed to upload chunk ${params.PartNumber} after ${retries} attempts`
  );
};

/**
 * Upload large file to S3 using multipart upload with concurrent chunks
 */
const uploadLargeFileToS3 = async (
  file: Express.Multer.File,
  uploadsFolder: string,
  customFileName?: string,
  enableCompression: boolean = true
): Promise<string> => {
  const filePaths: string[] = [];
  let uploadId: string | undefined;

  try {
    // Validate file
    const { fileCategory, fileExtension } = validateFile(file);

    // Prepare file path
    const filePath = file.path || path.join(uploadsFolder, file.filename);
    filePaths.push(filePath);

    let uploadBuffer: Buffer;
    let finalFileName: string;
    let compressionStats: {
      originalSize: number;
      compressedSize: number;
    } | null = null;

    // Compress file if enabled and supported
    if (
      enableCompression &&
      ['images', 'videos', 'audio', 'documents'].includes(fileCategory)
    ) {
      try {
        logger.info(
          colors.blue(
            `🗜️  Compressing ${fileCategory} file: ${file.originalname}`
          )
        );

        const compressionResult = await compressFile(file, fileCategory);
        filePaths.push(compressionResult.compressedPath);

        uploadBuffer = fs.readFileSync(compressionResult.compressedPath);
        compressionStats = {
          originalSize: compressionResult.originalSize,
          compressedSize: compressionResult.compressedSize,
        };

        const finalExtension = compressionResult.newExtension || fileExtension;
        finalFileName = customFileName || `${uuidv4()}.${finalExtension}`;

        logger.info(
          colors.green(
            `✅ Compression complete: ${Math.round(
              (1 -
                compressionResult.compressedSize /
                  compressionResult.originalSize) *
                100
            )}% size reduction`
          )
        );
      } catch (compressionError) {
        logger.warn(
          colors.yellow(
            `⚠️  Compression failed, uploading original file: ${
              compressionError instanceof Error
                ? compressionError.message
                : 'Unknown error'
            }`
          )
        );
        uploadBuffer = fs.readFileSync(filePath);
        finalFileName = customFileName || `${uuidv4()}.${fileExtension}`;
      }
    } else {
      uploadBuffer = fs.readFileSync(filePath);
      finalFileName = customFileName || `${uuidv4()}.${fileExtension}`;
    }

    const key = `${uploadsFolder}/${finalFileName}`;

    logger.info(
      colors.blue(`📤 Starting multipart upload for: ${file.originalname}`)
    );

    // Prepare metadata
    const metadata: Record<string, string> = {
      originalName: file.originalname,
      uploadedAt: new Date().toISOString(),
      originalSize: file.size.toString(),
    };

    if (compressionStats) {
      metadata.compressed = 'true';
      metadata.compressedSize = compressionStats.compressedSize.toString();
      metadata.compressionRatio = Math.round(
        (1 - compressionStats.compressedSize / compressionStats.originalSize) *
          100
      ).toString();
    }

    // Initialize multipart upload
    const multipartParams = {
      Bucket: config.aws.bucketName,
      Key: key,
      ContentType: file.mimetype,
      Metadata: metadata,
    };

    const multipartUpload = await s3Client.send(
      new CreateMultipartUploadCommand(multipartParams)
    );
    uploadId = multipartUpload.UploadId;

    if (!uploadId) {
      throw new Error('Failed to initiate multipart upload');
    }

    const fileSize = uploadBuffer.length;
    const numChunks = Math.ceil(fileSize / CHUNK_SIZE);

    logger.info(
      colors.cyan(
        `📦 Uploading ${numChunks} chunks (${(fileSize / (1024 * 1024)).toFixed(
          2
        )}MB total) with ${MAX_CONCURRENT_PARTS} concurrent uploads`
      )
    );

    // Upload chunks concurrently in batches
    const uploadedParts: { ETag: string; PartNumber: number }[] = [];

    for (let i = 0; i < numChunks; i += MAX_CONCURRENT_PARTS) {
      const batchPromises: Promise<{ ETag: string; PartNumber: number }>[] = [];

      for (let j = 0; j < MAX_CONCURRENT_PARTS && i + j < numChunks; j++) {
        const partNumber = i + j + 1;
        const start = (partNumber - 1) * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, fileSize);
        const chunk = uploadBuffer.slice(start, end);

        const uploadPromise = uploadChunkWithRetry({
          Bucket: config.aws.bucketName,
          Key: key,
          UploadId: uploadId,
          PartNumber: partNumber,
          Body: chunk,
        }).then(result => {
          logger.info(
            colors.green(
              `✅ Uploaded chunk ${partNumber}/${numChunks} (${(
                (end - start) /
                1024
              ).toFixed(2)}KB)`
            )
          );
          return result;
        });

        batchPromises.push(uploadPromise);
      }

      // Wait for current batch to complete
      const batchResults = await Promise.all(batchPromises);
      uploadedParts.push(...batchResults);
    }

    // Complete multipart upload
    const completeParams = {
      Bucket: config.aws.bucketName,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: uploadedParts.sort((a, b) => a.PartNumber - b.PartNumber),
      },
    };

    await s3Client.send(new CompleteMultipartUploadCommand(completeParams));

    const fileUrl = `https://${config.aws.bucketName}.s3.${config.aws.region}.amazonaws.com/${key}`;

    const sizeInfo = compressionStats
      ? ` (${(compressionStats.originalSize / 1024 / 1024).toFixed(2)}MB → ${(
          compressionStats.compressedSize /
          1024 /
          1024
        ).toFixed(2)}MB)`
      : ` (${(file.size / 1024 / 1024).toFixed(2)}MB)`;

    logger.info(
      colors.green(`✅ Multipart upload completed${sizeInfo}: ${fileUrl}`)
    );

    return fileUrl;
  } catch (error) {
    errorLogger.error('Large file upload failed', {
      error,
      fileName: file.originalname,
      fileSize: file.size,
    });

    // Abort multipart upload on error
    if (uploadId) {
      try {
        await s3Client.send(
          new AbortMultipartUploadCommand({
            Bucket: config.aws.bucketName,
            Key: `${uploadsFolder}/${customFileName || file.originalname}`,
            UploadId: uploadId,
          })
        );
        logger.info(colors.yellow('⚠️  Multipart upload aborted due to error'));
      } catch (abortError) {
        errorLogger.error('Failed to abort multipart upload', {
          error: abortError,
        });
      }
    }

    throw new Error(
      `Large file upload failed for ${file.originalname}: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`
    );
  } finally {
    cleanupLocalFiles(filePaths);
  }
};

// Uploads a single file to S3
const uploadSingleFileToS3 = async (
  file: Express.Multer.File,
  uploadsFolder: string,
  customFileName?: string,
  enableCompression: boolean = true
): Promise<string> => {
  // Check if file should use multipart upload (videos > 5MB or any file > 100MB)
  const fileExtension = path.extname(file.originalname).toLowerCase().slice(1);
  const isVideo = FILE_LIMITS.videos.extensions.includes(fileExtension);
  const shouldUseMultipart =
    (isVideo && file.size > CHUNK_SIZE) || file.size > 100 * 1024 * 1024;

  if (shouldUseMultipart) {
    logger.info(
      colors.blue(
        `📹 Large file detected (${(file.size / (1024 * 1024)).toFixed(
          2
        )}MB), using multipart upload`
      )
    );
    return await uploadLargeFileToS3(
      file,
      uploadsFolder,
      customFileName,
      enableCompression
    );
  }

  const filePaths: string[] = [];

  try {
    const { fileCategory, fileExtension: validatedExtension } =
      validateFile(file);
    const filePath = file.path || path.join(uploadsFolder, file.filename);
    filePaths.push(filePath);

    let uploadBuffer: Buffer;
    let finalFileName: string;
    let compressionStats: {
      originalSize: number;
      compressedSize: number;
    } | null = null;

    if (
      enableCompression &&
      ['images', 'videos', 'audio', 'documents'].includes(fileCategory)
    ) {
      try {
        logger.info(
          colors.blue(
            `🗜️  Compressing ${fileCategory} file: ${file.originalname}`
          )
        );
        const compressionResult = await compressFile(file, fileCategory);
        filePaths.push(compressionResult.compressedPath);

        uploadBuffer = fs.readFileSync(compressionResult.compressedPath);
        compressionStats = {
          originalSize: compressionResult.originalSize,
          compressedSize: compressionResult.compressedSize,
        };

        const finalExtension =
          compressionResult.newExtension || validatedExtension;
        finalFileName = customFileName || `${uuidv4()}.${finalExtension}`;

        logger.info(
          colors.green(
            `✅ Compression complete: ${Math.round(
              (1 -
                compressionResult.compressedSize /
                  compressionResult.originalSize) *
                100
            )}% size reduction`
          )
        );
      } catch (compressionError) {
        logger.warn(
          colors.yellow(
            `⚠️  Compression failed, uploading original file: ${
              compressionError instanceof Error
                ? compressionError.message
                : 'Unknown error'
            }`
          )
        );
        uploadBuffer = fs.readFileSync(filePath);
        finalFileName = customFileName || `${uuidv4()}.${validatedExtension}`;
      }
    } else {
      uploadBuffer = fs.readFileSync(filePath);
      finalFileName = customFileName || `${uuidv4()}.${validatedExtension}`;
    }

    const key = `${uploadsFolder}/${finalFileName}`;

    logger.info(colors.blue(`📤 Uploading file to S3: ${file.originalname}`));

    const metadata: Record<string, string> = {
      originalName: file.originalname,
      uploadedAt: new Date().toISOString(),
      originalSize: file.size.toString(),
    };

    if (compressionStats) {
      metadata.compressed = 'true';
      metadata.compressedSize = compressionStats.compressedSize.toString();
      metadata.compressionRatio = Math.round(
        (1 - compressionStats.compressedSize / compressionStats.originalSize) *
          100
      ).toString();
    }

    const command = new PutObjectCommand({
      Bucket: config.aws.bucketName,
      Key: key,
      Body: uploadBuffer,
      ContentType: file.mimetype,
      Metadata: metadata,
    });

    await s3Client.send(command);

    const fileUrl = `https://${config.aws.bucketName}.s3.${config.aws.region}.amazonaws.com/${key}`;

    const sizeInfo = compressionStats
      ? ` (${(compressionStats.originalSize / 1024 / 1024).toFixed(2)}MB → ${(
          compressionStats.compressedSize /
          1024 /
          1024
        ).toFixed(2)}MB)`
      : ` (${(file.size / 1024 / 1024).toFixed(2)}MB)`;

    logger.info(
      colors.green(`✅ File uploaded successfully${sizeInfo}: ${fileUrl}`)
    );

    return fileUrl;
  } catch (error) {
    errorLogger.error('Single file upload failed', {
      error,
      fileName: file.originalname,
      fileSize: file.size,
    });

    // bad AWS keys on the server: a clear 503 instead of a generic 500
    if (isAwsCredentialError(error))
      throw new AppError(
        StatusCodes.SERVICE_UNAVAILABLE,
        'Image upload is unavailable: the server storage (AWS) credentials are invalid. Please try again later.',
      );

    throw new Error(
      `File upload failed for ${file.originalname}: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`
    );
  } finally {
    cleanupLocalFiles(filePaths);
  }
};

/**
 * Upload multiple files to S3 with compression
 */
const uploadFilesToS3 = async (
  files: Express.Multer.File[],
  uploadsFolder: string,
  enableCompression: boolean = true
): Promise<string[]> => {
  if (!files || files.length === 0) {
    throw new Error('No files provided');
  }

  const uploadedFiles: string[] = [];

  logger.info(
    colors.blue(`📤 Starting upload of ${files.length} files to S3...`)
  );

  try {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      logger.info(
        colors.cyan(
          `📤 Processing file ${i + 1}/${files.length}: ${file.originalname}`
        )
      );

      try {
        const fileUrl = await uploadSingleFileToS3(
          file,
          uploadsFolder,
          undefined,
          enableCompression
        );

        uploadedFiles.push(fileUrl);

        logger.info(
          colors.green(
            `✅ Uploaded (${i + 1}/${files.length}): ${file.originalname}`
          )
        );
      } catch (fileError) {
        const errorMessage = `Failed to upload ${file.originalname}: ${
          fileError instanceof Error ? fileError.message : 'Unknown error'
        }`;
        errorLogger.error(errorMessage, { error: fileError });
      }
    }

    if (uploadedFiles.length === 0) {
      throw new Error('No files uploaded successfully');
    }

    logger.info(
      colors.green(
        `🎉 ${uploadedFiles.length}/${files.length} files uploaded successfully!`
      )
    );

    return uploadedFiles;
  } catch (error) {
    errorLogger.error('Multiple files upload failed', {
      error,
      filesCount: files.length,
      fileNames: files.map(f => f.originalname),
    });

    throw new Error(
      `Batch upload failed: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`
    );
  }
};

/**
 * Delete file from S3
 */
const deleteFileFromS3 = async (fileUrl: string): Promise<void> => {
  try {
    const url = new URL(fileUrl);
    const key = url.pathname.slice(1);

    logger.info(colors.blue(`🗑️  Deleting file from S3: ${key}`));

    const command = new DeleteObjectCommand({
      Bucket: config.aws.bucketName,
      Key: key,
    });

    await s3Client.send(command);
    logger.info(colors.green(`✅ File deleted successfully: ${key}`));
  } catch (error) {
    errorLogger.error('Failed to delete file from S3', { error, fileUrl });
    throw new Error(
      `Failed to delete file: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`
    );
  }
};

/**
 * Delete multiple files from S3
 */
const deleteMultipleFilesFromS3 = async (fileUrls: string[]): Promise<void> => {
  if (!fileUrls || fileUrls.length === 0) {
    return;
  }

  logger.info(colors.blue(`🗑️  Deleting ${fileUrls.length} files from S3...`));

  try {
    const deletePromises = fileUrls.map(url => deleteFileFromS3(url));
    await Promise.allSettled(deletePromises);

    logger.info(
      colors.green(`✅ Batch delete completed for ${fileUrls.length} files`)
    );
  } catch (error) {
    errorLogger.error('Batch delete failed', { error, fileUrls });
    throw new Error(
      `Batch delete failed: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`
    );
  }
};

export const s3Services = {
  uploadFilesToS3,
  uploadSingleFileToS3,
  uploadLargeFileToS3,
  deleteFileFromS3,
  deleteMultipleFilesFromS3,
};
