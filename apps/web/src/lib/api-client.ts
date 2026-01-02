import axios, { type AxiosError, type AxiosResponse } from 'axios';
import type { UploadDocumentResponse } from '@enxtai/shared-types';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001',
  timeout: 15000,
});

api.interceptors.response.use(
  (response: AxiosResponse) => response,
  (error: AxiosError) => {
    // Centralized error passthrough; customize later for toast logging.
    return Promise.reject(error);
  },
);

export default api;

  export async function createKYCSubmission(userId: string) {
    const res = await api.post('/api/kyc/submission', { userId });
    return res.data as { id: string };
  }

  export async function getKYCSubmission(userId: string) {
    const res = await api.get(`/api/kyc/submission/${userId}`);
    return res.data;
  }

  export async function uploadPanDocument(
    userId: string,
    file: File,
    onUploadProgress?: (progress: number) => void,
  ): Promise<UploadDocumentResponse> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('userId', userId);

    const res = await api.post('/api/kyc/upload/pan', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (event) => {
        if (!event.total || !onUploadProgress) return;
        const percent = Math.round((event.loaded * 100) / event.total);
        onUploadProgress(percent);
      },
    });
    return res.data as UploadDocumentResponse;
  }

  export async function uploadAadhaarDocument(
    userId: string,
    file: File,
    onUploadProgress?: (progress: number) => void,
  ): Promise<UploadDocumentResponse> {
    const formData = new FormData();
    formData.append('userId', userId);
    formData.append('file', file);

    const res = await api.post('/api/kyc/upload/aadhaar', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (event) => {
        if (!event.total || !onUploadProgress) return;
        const percent = Math.round((event.loaded * 100) / event.total);
        onUploadProgress(percent);
      },
    });
    return res.data as UploadDocumentResponse;
  }

  export async function uploadAadhaarFront(
    userId: string,
    file: File,
    onUploadProgress?: (progress: number) => void,
  ): Promise<UploadDocumentResponse> {
    const formData = new FormData();
    formData.append('userId', userId);
    formData.append('front', file);

    const res = await api.post('/api/kyc/upload/aadhaar', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (event) => {
        if (!event.total || !onUploadProgress) return;
        const percent = Math.round((event.loaded * 100) / event.total);
        onUploadProgress(percent);
      },
    });
    return (res.data as any).front as UploadDocumentResponse;
  }

  export async function uploadAadhaarBack(
    userId: string,
    file: File,
    onUploadProgress?: (progress: number) => void,
  ): Promise<UploadDocumentResponse> {
    const formData = new FormData();
    formData.append('userId', userId);
    formData.append('back', file);

    const res = await api.post('/api/kyc/upload/aadhaar', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (event) => {
        if (!event.total || !onUploadProgress) return;
        const percent = Math.round((event.loaded * 100) / event.total);
        onUploadProgress(percent);
      },
    });
    return (res.data as any).back as UploadDocumentResponse;
  }

  export async function uploadLivePhoto(
    userId: string,
    file: File,
    onUploadProgress?: (progress: number) => void,
  ): Promise<UploadDocumentResponse> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('userId', userId);

    const res = await api.post('/api/kyc/upload/live-photo', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (event) => {
        if (!event.total || !onUploadProgress) return;
        const percent = Math.round((event.loaded * 100) / event.total);
        onUploadProgress(percent);
      },
    });
    return res.data as UploadDocumentResponse;
  }

  export async function uploadSignature(
    userId: string,
    file: File,
    onUploadProgress?: (progress: number) => void,
  ): Promise<UploadDocumentResponse> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('userId', userId);

    const res = await api.post('/api/kyc/upload/signature', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (event) => {
        if (!event.total || !onUploadProgress) return;
        const percent = Math.round((event.loaded * 100) / event.total);
        onUploadProgress(percent);
      },
    });
    return res.data as UploadDocumentResponse;
  }

  export async function deletePanDocument(userId: string, submissionId?: string) {
    const res = await api.post('/api/kyc/delete/pan', { userId, submissionId });
    return res.data;
  }

  export async function deleteAadhaarFront(userId: string, submissionId?: string) {
    const res = await api.post('/api/kyc/delete/aadhaar/front', { userId, submissionId });
    return res.data;
  }

  export async function deleteAadhaarBack(userId: string, submissionId?: string) {
    const res = await api.post('/api/kyc/delete/aadhaar/back', { userId, submissionId });
    return res.data;
  }

  export async function verifyFace(submissionId: string) {
    const res = await api.post('/api/kyc/verify/face', { submissionId });
    return res.data as {
      success: boolean;
      submissionId: string;
      verificationResults: {
        faceMatchScore: number;
        livenessScore: number;
        internalStatus: string;
      };
    };
  }

  export async function getKycStatus(userId: string) {
    const res = await api.get(`/api/kyc/status/${userId}`);
    return res.data;
  }

  export async function getPendingReviews() {
    const res = await api.get('/api/admin/kyc/pending-review');
    return res.data;
  }

  export async function getSubmissionDetails(submissionId: string) {
    const res = await api.get(`/api/admin/kyc/submission/${submissionId}`);
    return res.data;
  }

  export async function approveKycSubmission(submissionId: string, adminUserId: string, notes?: string) {
    const res = await api.post('/api/admin/kyc/approve', { submissionId, adminUserId, notes });
    return res.data;
  }

  export async function rejectKycSubmission(submissionId: string, adminUserId: string, reason: string) {
    const res = await api.post('/api/admin/kyc/reject', { submissionId, adminUserId, reason });
    return res.data;
  }
