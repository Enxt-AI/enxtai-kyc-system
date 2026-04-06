import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import * as pako from 'pako';
import * as xml2js from 'xml2js';

export interface AadhaarQrData {
  uid: string; // The masked reference ID or UID
  fullName: string;
  gender: string;
  dateOfBirth?: Date;
  address?: Record<string, any>;
  photoBytes?: Buffer; // JP2 image bytes
}

@Injectable()
export class AadhaarQrService {
  private readonly logger = new Logger(AadhaarQrService.name);

  /**
   * Decodes a raw Aadhaar QR Code string.
   * Supports both legacy XML strings and the massive numeric string of Secure QR.
   */
  async decodeQrString(rawQrText: string): Promise<AadhaarQrData> {
    if (!rawQrText) {
      throw new BadRequestException('QR text is empty');
    }

    // Check if it's the Secure QR (all digits, length > 500)
    if (/^\d+$/.test(rawQrText.trim()) && rawQrText.trim().length > 500) {
      return this.decodeSecureQr(rawQrText.trim());
    } else {
      // Try old XML format
      return this.decodeXmlQr(rawQrText.trim());
    }
  }

  private async decodeSecureQr(numericString: string): Promise<AadhaarQrData> {
    try {
      // 1. Convert BigInt string to Byte Array
      const bigInt = BigInt(numericString);
      let hex = bigInt.toString(16);
      if (hex.length % 2 !== 0) {
        hex = '0' + hex;
      }
      const bytes = new Uint8Array(hex.length / 2);
      for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
      }

      // 2. Decompress using pako
      const decompressed = pako.inflate(bytes);

      // 3. Find JP2 image separator (FF 4F FF 51)
      let jp2Index = -1;
      for (let i = 0; i < decompressed.length - 3; i++) {
        if (
          decompressed[i] === 255 &&
          decompressed[i + 1] === 79 &&
          decompressed[i + 2] === 255 &&
          decompressed[i + 3] === 81
        ) {
          jp2Index = i;
          break;
        }
      }

      // 4. Decode iso-8859-1 up to the image bytes
      const decoder = new TextDecoder('iso-8859-1');
      let textData = decoder.decode(jp2Index !== -1 ? decompressed.slice(0, jp2Index) : decompressed);
      
      // Delimiter is char code 255
      const parts = textData.split(String.fromCharCode(255));

      if (parts.length < 4 || (!parts[0].includes('V'))) {
        throw new Error('Decompressed data did not match expected Aadhaar Secure QR format.');
      }

      // Extract Data
      // In Secure QR, parts[2] is the Reference ID (last 4 digits of Aadhaar)
      const uidRaw = parts[2] || '';
      // Always mask: for Secure QR the full number is never present,
      // only the reference ID (last 4 digits). For longer values, show last 4.
      let uidMasked: string;
      if (uidRaw.length <= 4 && uidRaw.length > 0) {
        // Reference ID (last 4 digits only) — typical Secure QR
        uidMasked = `XXXX XXXX ${uidRaw}`;
      } else if (uidRaw.length > 4) {
        // Full or partial UID — mask all but last 4
        uidMasked = `XXXX XXXX ${uidRaw.slice(-4)}`;
      } else {
        uidMasked = uidRaw;
      }
      
      const fullName = parts[3] || '';
      const dobString = parts[4] || '';
      const genderCode = parts[5] || '';
      
      const gender = genderCode === 'M' ? 'Male' : genderCode === 'F' ? 'Female' : genderCode;

      // Extract Date of Birth
      let dateOfBirth: Date | undefined;
      if (dobString) {
        // usually DD-MM-YYYY
        const dParts = dobString.split('-');
        if (dParts.length === 3) {
          dateOfBirth = new Date(parseInt(dParts[2], 10), parseInt(dParts[1], 10) - 1, parseInt(dParts[0], 10));
        } else if (dobString.length === 4) {
          // just year of birth
          dateOfBirth = new Date(parseInt(dobString, 10), 0, 1);
        }
      }

      // Combine Address components (indices 6 to 16)
      const addressParts = [];
      for (let i = 6; i <= 16; i++) {
        if (parts[i] && parts[i].trim() !== '') {
          addressParts.push(parts[i].trim());
        }
      }
      
      const address = { fullAddress: addressParts.join(', ') };

      // Extract Photo Bytes (minus the signature at the end)
      let photoBytes: Buffer | undefined;
      if (jp2Index !== -1 && decompressed.length > 256) {
        const signatureIndex = decompressed.length - 256; // last 256 bytes = 2048-bit signature
        // The image bytes are between jp2Index and signatureIndex
        const imageSlice = decompressed.slice(jp2Index, signatureIndex);
        photoBytes = Buffer.from(imageSlice);
      }

      return {
        uid: uidMasked,
        fullName,
        gender,
        dateOfBirth,
        address,
        photoBytes,
      };

    } catch (e) {
      this.logger.error('Failed to decode Secure QR', e);
      throw new BadRequestException('Failed to decompress and parse Aadhaar Secure QR Code data.');
    }
  }

  private async decodeXmlQr(xmlString: string): Promise<AadhaarQrData> {
    try {
      const parser = new xml2js.Parser({ explicitArray: false, mergeAttrs: true });
      const result = await parser.parseStringPromise(xmlString);
      
      const root = result.PrintLetterBarcodeData || result;
      if (!root) {
        throw new Error('Invalid XML Root');
      }

      const uid = root.uid || '';
      const uidMasked = uid.length >= 4 ? `XXXX XXXX ${uid.slice(-4)}` : uid;

      const fullName = root.name || '';
      const gender = root.gender === 'M' ? 'Male' : root.gender === 'F' ? 'Female' : (root.gender || '');
      
      let dateOfBirth: Date | undefined;
      if (root.dob) {
        const dParts = root.dob.split('-');
        if (dParts.length === 3) {
           // Support DD/MM/YYYY or YYYY/MM/DD
           if (dParts[0].length === 4) { // YYYY-MM-DD
             dateOfBirth = new Date(parseInt(dParts[0], 10), parseInt(dParts[1], 10) - 1, parseInt(dParts[2], 10));
           } else { // DD-MM-YYYY
             dateOfBirth = new Date(parseInt(dParts[2], 10), parseInt(dParts[1], 10) - 1, parseInt(dParts[0], 10));
           }
        }
      } else if (root.yob) {
        dateOfBirth = new Date(parseInt(root.yob, 10), 0, 1);
      }

      return {
        uid: uidMasked,
        fullName,
        gender,
        dateOfBirth,
        address: root,
      };
    } catch (e) {
       this.logger.error('Failed to parse old format XML QR', e);
       throw new BadRequestException('Invalid Aadhaar XML QR Code.');
    }
  }
}
