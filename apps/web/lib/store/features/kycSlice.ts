import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface KycState {
  currentStep: number;
  userId: string | null;
  submissionId: string | null;
  isCompleted: boolean;
  panUploaded: boolean;
  aadhaarFrontUploaded: boolean;
  aadhaarBackUploaded: boolean;
}

const initialState: KycState = {
  currentStep: 1,
  userId: null,
  submissionId: null,
  isCompleted: false,
  panUploaded: false,
  aadhaarFrontUploaded: false,
  aadhaarBackUploaded: false,
};

export const kycSlice = createSlice({
  name: 'kyc',
  initialState,
  reducers: {
    setCurrentStep: (state, action: PayloadAction<number>) => {
      state.currentStep = action.payload;
    },
    setUserId: (state, action: PayloadAction<string>) => {
      state.userId = action.payload;
    },
    setSubmissionId: (state, action: PayloadAction<string>) => {
      state.submissionId = action.payload;
    },
    setKycCompleted: (state, action: PayloadAction<boolean>) => {
      state.isCompleted = action.payload;
    },
    setPanUploaded: (state, action: PayloadAction<boolean>) => {
      state.panUploaded = action.payload;
    },
    setAadhaarFrontUploaded: (state, action: PayloadAction<boolean>) => {
      state.aadhaarFrontUploaded = action.payload;
    },
    setAadhaarBackUploaded: (state, action: PayloadAction<boolean>) => {
      state.aadhaarBackUploaded = action.payload;
    },
    resetKyc: () => initialState,
  },
});

export const {
  setCurrentStep,
  setUserId,
  setSubmissionId,
  setKycCompleted,
  setPanUploaded,
  setAadhaarFrontUploaded,
  setAadhaarBackUploaded,
  resetKyc,
} = kycSlice.actions;

export default kycSlice.reducer;
