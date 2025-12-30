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
import type { MultipartFile } from '@fastify/multipart';
import type { FastifyRequest } from 'fastify';
import { KycService } from './kyc.service';
import { UploadAadhaarDto, UploadLivePhotoDto, UploadPanDto } from './dto/upload-document.dto';
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
  async uploadPan(
    @Req() req: FastifyRequest,
    @Body() dto: UploadPanDto,
  ) {
    try {
      const file = (await (req as any).file()) as MultipartFile;
      if (!file) {
        throw new BadRequestException('File is required');
      }
      const submission = await this.kycService.uploadPanDocument(dto.userId, file);
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
  async uploadAadhaar(
    @Req() req: FastifyRequest,
    @Body() dto: UploadAadhaarDto,
  ) {
    try {
      const file = (await (req as any).file()) as MultipartFile;
      if (!file) {
        throw new BadRequestException('File is required');
      }
      const submission = await this.kycService.uploadAadhaarDocument(dto.userId, file);
      return {
        success: true,
        submissionId: submission.id,
        documentUrl: submission.aadhaarDocumentUrl,
      };
    } catch (err: any) {
      if (err instanceof HttpException) throw err;
      throw new HttpException(err?.message ?? 'Upload failed', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post('upload/live-photo')
  async uploadLivePhoto(
    @Req() req: FastifyRequest,
    @Body() dto: UploadLivePhotoDto,
  ) {
    try {
      const file = (await (req as any).file()) as MultipartFile;
      if (!file) {
        throw new BadRequestException('File is required');
      }
      const submission = await this.kycService.uploadLivePhotoDocument(dto.userId, file);
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
