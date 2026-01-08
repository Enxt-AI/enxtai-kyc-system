import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as faceapi from '@vladmandic/face-api/dist/face-api.node-wasm.js';
import * as tf from '@tensorflow/tfjs';
import * as wasm from '@tensorflow/tfjs-backend-wasm';
import { Canvas, Image, ImageData, createCanvas, loadImage } from 'canvas';
import * as path from 'path';
import * as fs from 'fs';
import {
  FaceExtractionResult,
  FaceVerificationResult,
  LivenessDetectionResult,
  FaceVerificationWorkflowResult,
} from './face-recognition.interface';

@Injectable()
export class FaceRecognitionService implements OnModuleInit {
  private readonly logger = new Logger(FaceRecognitionService.name);
  private modelsLoaded = false;
  private modelsPath!: string;

  async onModuleInit() {
    await this.initializeModels();
  }

  private async initializeModels() {
    try {
      faceapi.env.monkeyPatch({
        Canvas: Canvas as any,
        Image: Image as any,
        ImageData: ImageData as any,
      });

      const configuredPath = process.env.FACE_API_MODELS_PATH;
      const faceApiPackagePath = require.resolve('@vladmandic/face-api/package.json');
      const defaultModelsPath = path.join(path.dirname(faceApiPackagePath), 'model');

      const resolvedConfiguredPath = configuredPath ? path.resolve(configuredPath) : null;
      const configuredExists = resolvedConfiguredPath ? fs.existsSync(resolvedConfiguredPath) : false;

      if (resolvedConfiguredPath && configuredExists) {
        this.modelsPath = resolvedConfiguredPath;
      } else {
        if (resolvedConfiguredPath && !configuredExists) {
          this.logger.warn(
            `Configured FACE_API_MODELS_PATH not found (${resolvedConfiguredPath}); falling back to package models`,
          );
        }
        this.modelsPath = defaultModelsPath;
      }

      // Set up WASM backend for TensorFlow.js
      const wasmPath = require.resolve('@tensorflow/tfjs-backend-wasm/dist/tfjs-backend-wasm.wasm');
      wasm.setWasmPaths(path.dirname(wasmPath) + '/');
      await tf.setBackend('wasm');
      await tf.ready();
      this.logger.log(`TensorFlow.js backend: ${tf.getBackend()}`);

      await this.loadModels();
      this.logger.log(`Loaded face-api models from ${this.modelsPath}`);
    } catch (err: any) {
      this.logger.error(`Failed to initialize face-api models: ${err?.message ?? 'unknown error'}`);
      throw err;
    }
  }

  private async loadModels() {
    if (this.modelsLoaded) {
      return;
    }

    await Promise.all([
      faceapi.nets.ssdMobilenetv1.loadFromDisk(this.modelsPath),
      faceapi.nets.faceLandmark68Net.loadFromDisk(this.modelsPath),
      faceapi.nets.faceRecognitionNet.loadFromDisk(this.modelsPath),
    ]);

    this.modelsLoaded = true;
  }

  private async ensureModelsLoaded() {
    if (!this.modelsLoaded) {
      await this.loadModels();
    }
  }

  async extractFace(imageBuffer: Buffer): Promise<FaceExtractionResult> {
    await this.ensureModelsLoaded();

    try {
      const image = await loadImage(imageBuffer);
      const input = image as unknown as faceapi.TNetInput;
      const detections = await faceapi.detectAllFaces(input).withFaceLandmarks();

      if (!detections.length) {
        return {
          success: false,
          face_found: false,
          face_base64: null,
          face_count: 0,
          message: 'No face detected',
        };
      }

      const largest = detections.reduce((prev, current) => {
        const prevBox = prev.detection.box;
        const currBox = current.detection.box;
        const prevArea = prevBox.width * prevBox.height;
        const currArea = currBox.width * currBox.height;
        return currArea > prevArea ? current : prev;
      });

      const box = largest.detection.box;
      const faceCanvas = createCanvas(box.width, box.height);
      const ctx = faceCanvas.getContext('2d');
      ctx.drawImage(image as unknown as any, box.x, box.y, box.width, box.height, 0, 0, box.width, box.height);

      const faceBuffer = faceCanvas.toBuffer('image/jpeg');
      const base64 = faceBuffer.toString('base64');

      return {
        success: true,
        face_found: true,
        face_base64: base64,
        face_count: detections.length,
        message: 'Face extracted successfully',
      };
    } catch (err: any) {
      this.logger.error(`Face extraction failed: ${err?.message ?? 'unknown error'}`);
      return {
        success: false,
        face_found: false,
        face_base64: null,
        face_count: 0,
        message: 'Face extraction failed',
      };
    }
  }

  async verifyFaces(livePhoto: Buffer, documentPhoto: Buffer): Promise<FaceVerificationResult> {
    await this.ensureModelsLoaded();

    const threshold = 0.6;

    const [live, document] = await Promise.all([loadImage(livePhoto), loadImage(documentPhoto)]);
    const liveInput = live as unknown as faceapi.TNetInput;
    const documentInput = document as unknown as faceapi.TNetInput;

    const liveDescriptor = await faceapi
      .detectSingleFace(liveInput)
      .withFaceLandmarks()
      .withFaceDescriptor();
    if (!liveDescriptor?.descriptor) {
      throw new Error('No face detected in live photo');
    }

    const documentDescriptor = await faceapi
      .detectSingleFace(documentInput)
      .withFaceLandmarks()
      .withFaceDescriptor();
    if (!documentDescriptor?.descriptor) {
      throw new Error('No face detected in document photo');
    }

    const distance = faceapi.euclideanDistance(liveDescriptor.descriptor, documentDescriptor.descriptor);
    const confidence = Math.max(0, 1 - distance);

    return {
      verified: distance < threshold,
      confidence,
      distance,
      model: 'FaceRecognitionNet',
      threshold,
    };
  }

  async detectLiveness(photo: Buffer): Promise<LivenessDetectionResult> {
    await this.ensureModelsLoaded();

    const image = await loadImage(photo);
    const input = image as unknown as faceapi.TNetInput;
    const detection = await faceapi.detectSingleFace(input).withFaceLandmarks();

    if (!detection) {
      return {
        is_live: false,
        confidence: 0,
        method: 'landmark-based',
        message: 'No face detected for liveness',
      };
    }

    const confidence = detection.detection.score ?? 0;
    const is_live = confidence >= 0.5;

    return {
      is_live,
      confidence,
      method: 'landmark-based',
      message: is_live ? 'Liveness detected' : 'Low confidence liveness',
    };
  }

  async verifyFaceWorkflow(
    livePhoto: Buffer,
    panDocument: Buffer,
    aadhaarDocument: Buffer,
  ): Promise<FaceVerificationWorkflowResult> {
    await this.ensureModelsLoaded();

    let documentUsed: FaceVerificationWorkflowResult['documentUsed'] = 'PAN';
    let extraction = await this.extractFace(panDocument);

    if (!extraction.face_found) {
      this.logger.warn('PAN face extraction failed, falling back to Aadhaar');
      documentUsed = 'AADHAAR';
      extraction = await this.extractFace(aadhaarDocument);
    }

    if (!extraction.face_found) {
      throw new Error('Unable to extract face from uploaded documents');
    }

    const verification = await this.verifyFaces(
      livePhoto,
      documentUsed === 'PAN' ? panDocument : aadhaarDocument,
    );

    const liveness = await this.detectLiveness(livePhoto);

    const faceMatchScore = verification.confidence ?? 0;
    const livenessScore = liveness.confidence ?? 0;
    const verified = Boolean(verification.verified && liveness.is_live);

    return {
      verified,
      faceMatchScore,
      livenessScore,
      faceExtractionSuccess: Boolean(extraction.success && extraction.face_found),
      documentUsed,
    };
  }
}
