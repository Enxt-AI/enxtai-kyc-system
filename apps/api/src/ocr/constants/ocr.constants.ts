export const PAN_REGEX = /[A-Z]{5}[0-9]{4}[A-Z]/;
export const AADHAAR_REGEX = /\d{4}\s?\d{4}\s?\d{4}/;
export const DOB_PATTERNS = [
  /\b(0?[1-9]|[12][0-9]|3[01])[\/-](0?[1-9]|1[0-2])[\/-]((19|20)?\d{2})\b/i,
  /\b(0?[1-9]|1[0-2])[\/-](0?[1-9]|[12][0-9]|3[01])[\/-]((19|20)?\d{2})\b/i,
];
export const TESSERACT_CONFIG = { lang: 'eng', tessedit_pageseg_mode: '6' };
export const MAX_OCR_IMAGE_DIMENSION = 2048;
export const MIN_CONFIDENCE_DEFAULT = 60;
