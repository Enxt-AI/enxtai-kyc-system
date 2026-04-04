import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface KycState {
  currentStep: string;
  userId: string | null;
  submissionId: string | null;
  isCompleted: boolean;
}

const initialState: KycState = {
  currentStep: 'upload',
  userId: null,
  submissionId: null,
  isCompleted: false,
};

export const kycSlice = createSlice({
  name: 'kyc',
  initialState,
  reducers: {
    setCurrentStep: (state, action: PayloadAction<string>) => {
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
    resetKyc: () => initialState,
  },
});

export const {
  setCurrentStep,
  setUserId,
  setSubmissionId,
  setKycCompleted,
  resetKyc,
} = kycSlice.actions;

export default kycSlice.reducer;
