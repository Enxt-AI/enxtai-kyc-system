import {
  Body,
  Controller,
  Get,
  BadRequestException,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import type { MultipartFile } from '@fastify/multipart';
import { KycService } from './kyc.service';
import { CreateKYCSubmissionDto } from './dto/create-kyc-submission.dto';
import { ExtractAadhaarDto, ExtractPanDto } from '../ocr/dto/extract-document.dto';
import { VerifyFaceDto } from './dto/verify-face.dto';

@Controller('kyc')
export class KycController {
  constructor(private readonly kycService: KycService) {}

  @Post('submission')
  async createSubmission(@Body() dto: CreateKYCSubmissionDto) {
    return this.kycService.createSubmission(dto.userId);
  }

  @Get('status/:userId')
  async getStatus(@Param('userId') userId: string) {
    return this.kycService.getKycStatusByUserId(userId);
  }

  @Get('submission/:userId')
  async getSubmission(@Param('userId') userId: string) {
    const submission = await this.kycService.getSubmissionByUserId(userId);
    if (!submission) {
      throw new HttpException('Submission not found', HttpStatus.NOT_FOUND);
    }
    return submission;
  }

  @Post('upload/pan')
  async uploadPan(@Req() req: FastifyRequest) {
    try {
      const parts = req.parts();
      let userId: string | undefined;
      let fileData: { buffer: Buffer; filename: string; mimetype: string } | undefined;

      for await (const part of parts) {
        if (part.type === 'field') {
          if (part.fieldname === 'userId') {
            userId = part.value as string;
          }
        } else if (part.type === 'file' && part.fieldname === 'file') {
          // Buffer immediately while stream is open
          const buffer = await part.toBuffer();
          fileData = {
            buffer,
            filename: part.filename,
            mimetype: part.mimetype,
          };
        }
      }

      if (!userId) {
        throw new BadRequestException('userId is required');
      }

      if (!fileData) {
        throw new BadRequestException('File is required');
      }

      // Create MultipartFile-like object with buffered data
      const file: MultipartFile = {
        ...fileData,
        toBuffer: async () => fileData.buffer,
      } as any;

      const submission = await this.kycService.uploadPanDocument(userId, file);
      return {
        success: true,
        submissionId: submission.id,
        documentUrl: submission.panDocumentUrl,
      };
    } catch (err: any) {
      if (err instanceof HttpException) throw err;
      throw new HttpException(err?.message ?? 'Upload failed', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post('upload/aadhaar')
  async uploadAadhaar(@Req() req: FastifyRequest) {
    try {
      const parts = req.parts();
      let userId: string | undefined;
      let frontFileData: { buffer: Buffer; filename: string; mimetype: string } | undefined;
      let backFileData: { buffer: Buffer; filename: string; mimetype: string } | undefined;

      for await (const part of parts) {
        if (part.type === 'field' && part.fieldname === 'userId') {
          userId = part.value as string;
        } else if (part.type === 'file') {
          // Buffer immediately while stream is open
          const buffer = await part.toBuffer();
          const fileData = {
            buffer,
            filename: part.filename,
            mimetype: part.mimetype,
          };

          if (part.fieldname === 'front') {
            frontFileData = fileData;
          } else if (part.fieldname === 'back') {
            backFileData = fileData;
          }
        }
      }

      if (!userId) {
        throw new BadRequestException('userId is required');
      }

      if (!frontFileData && !backFileData) {
        throw new BadRequestException('At least one file (front or back) is required');
      }

      const results: any = {};

      if (frontFileData) {
        // Create MultipartFile-like object with buffered data
        const frontFile: MultipartFile = {
          ...frontFileData,
          toBuffer: async () => frontFileData.buffer,
        } as any;
        const submission = await this.kycService.uploadAadhaarFront(userId, frontFile);
        results.front = {
          submissionId: submission.id,
          documentUrl: submission.aadhaarFrontUrl,
        };
      }

      if (backFileData) {
        // Create MultipartFile-like object with buffered data
        const backFile: MultipartFile = {
          ...backFileData,
          toBuffer: async () => backFileData.buffer,
        } as any;
        const submission = await this.kycService.uploadAadhaarBack(userId, backFile);
        results.back = {
          submissionId: submission.id,
          documentUrl: submission.aadhaarBackUrl,
        };
      }

      return {
        success: true,
        submissionId: results.front?.submissionId || results.back?.submissionId,
        ...results,
      };
    } catch (err: any) {
      if (err instanceof HttpException) throw err;
      throw new HttpException(err?.message ?? 'Upload failed', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post('upload/live-photo')
  async uploadLivePhoto(@Req() req: FastifyRequest) {
    try {
      const parts = req.parts();
      let userId: string | undefined;
      let fileData: { buffer: Buffer; filename: string; mimetype: string } | undefined;

      for await (const part of parts) {
        if (part.type === 'field') {
          if (part.fieldname === 'userId') {
            userId = part.value as string;
          }
        } else if (part.type === 'file' && part.fieldname === 'file') {
          // Buffer immediately while stream is open
          const buffer = await part.toBuffer();
          fileData = {
            buffer,
            filename: part.filename,
            mimetype: part.mimetype,
          };
        }
      }

      if (!userId) {
        throw new BadRequestException('userId is required');
      }

      if (!fileData) {
        throw new BadRequestException('File is required');
      }

      // Create MultipartFile-like object with buffered data
      const file: MultipartFile = {
        ...fileData,
        toBuffer: async () => fileData.buffer,
      } as any;

      const submission = await this.kycService.uploadLivePhotoDocument(userId, file);
      return {
        success: true,
        submissionId: submission.id,
        documentUrl: submission.livePhotoUrl,
      };
    } catch (err: any) {
      if (err instanceof HttpException) throw err;
      throw new HttpException(err?.message ?? 'Upload failed', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post('verify/face')
  async verifyFace(@Body() dto: VerifyFaceDto) {
    try {
      const submission = await this.kycService.verifyFaceAndUpdate(dto.submissionId);
      return {
        success: true,
        submissionId: submission.id,
        verificationResults: {
          faceMatchScore: submission.faceMatchScore,
          livenessScore: submission.livenessScore,
          internalStatus: submission.internalStatus,
        },
      };
    } catch (err: any) {
      if (err instanceof HttpException) throw err;
      throw new HttpException(
        err?.message ?? 'Face verification failed',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('extract/pan')
  async extractPan(@Body() dto: ExtractPanDto) {
    try {
      const submission = await this.kycService.extractPanDataAndUpdate(dto.submissionId);
      return {
        success: true,
        submissionId: submission.id,
        extractedData: {
          panNumber: submission.panNumber,
          fullName: submission.fullName,
          dateOfBirth: submission.dateOfBirth,
        },
      };
    } catch (err: any) {
      if (err instanceof HttpException) throw err;
      throw new HttpException(err?.message ?? 'PAN extraction failed', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post('extract/aadhaar')
  async extractAadhaar(@Body() dto: ExtractAadhaarDto) {
    try {
      const submission = await this.kycService.extractAadhaarDataAndUpdate(dto.submissionId);
      return {
        success: true,
        submissionId: submission.id,
        extractedData: {
          aadhaarNumber: submission.aadhaarNumber,
          fullName: submission.fullName,
          address: submission.address,
        },
      };
    } catch (err: any) {
      if (err instanceof HttpException) throw err;
      throw new HttpException(err?.message ?? 'Aadhaar extraction failed', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
