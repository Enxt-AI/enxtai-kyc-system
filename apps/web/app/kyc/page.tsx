"use client";

import React, { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSelector, useDispatch } from "react-redux";
import { RootState } from "@/lib/store/store";
import { setCurrentStep, setUserId as setReduxUserId, setSubmissionId } from "@/lib/store/features/kycSlice";
import { ChevronLeft } from "lucide-react";
import { KycStepper } from "@/components/KycStepper";
import { DocumentUploadStep } from "@/components/kyc/DocumentUploadStep";
import { PhotoStep } from "@/components/kyc/PhotoStep";
import { SignatureStep } from "@/components/kyc/SignatureStep";
import {
  getKycApiKey,
  getKycReturnUrl,
  clearKycApiKey,
  clearKycReturnUrl,
  updateKycUiStep,
  initiateKyc,
} from "@/lib/api-client";

type KycStepTab = 'upload' | 'photo' | 'signature' | 'verify';

function KycFlowContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [isReady, setIsReady] = useState(false);
  const [userId, setUserId] = useState<string>('');

  const dispatch = useDispatch();
  const currentStep = useSelector((state: RootState) => state.kyc.currentStep);

  const [returnUrl, setReturnUrl] = useState<string | null>(null);

  const sessionId = useSelector((state: RootState) => state.kyc.submissionId);

  // Validate API Key and fetch Return URL
  useEffect(() => {
    try {
      getKycApiKey(); // Validates key exists and isn't expired
      setReturnUrl(getKycReturnUrl());
    } catch (error) {
      router.replace("/?error=session_expired");
    }
  }, [router]);

  // Extract User ID and sync state from DB securely
  useEffect(() => {
    const rawVerificationId = searchParams.get('verification');
    if (!rawVerificationId) {
      router.replace('/?error=missing_verification_id');
      return;
    }

    const trimmedId = rawVerificationId.trim();
    setUserId(trimmedId);
    dispatch(setReduxUserId(trimmedId));

    // Try to load state safely from database
    const fetchStateFromDb = async () => {
      try {
        const sessionData = await initiateKyc(trimmedId);
        
        if (sessionData?.kycSessionId) {
          dispatch(setSubmissionId(sessionData.kycSessionId));
          
          let stepParam = parseInt(searchParams.get('step') ?? '0', 10);
          if (!stepParam && sessionData.uiStep) {
            stepParam = sessionData.uiStep;
          }
          
          dispatch(setCurrentStep(stepParam >= 1 && stepParam <= 4 ? stepParam : 1));
        } else {
          dispatch(setCurrentStep(1));
        }
      } catch (e) {
        // Fallback default
        dispatch(setCurrentStep(1));
      } finally {
        setIsReady(true);
      }
    };

    fetchStateFromDb();
  }, [searchParams, router, dispatch]);

  const handleCancelToClient = () => {
    if (!returnUrl) return;
    const target = new URL(returnUrl);
    target.searchParams.set("status", "cancelled");
    clearKycApiKey();
    clearKycReturnUrl();
    window.location.href = target.toString();
  };

  const handleStepChange = async (newStep: number, skipNetwork = false) => {
    dispatch(setCurrentStep(newStep));
    // Persist step in URL so reload doesn't reset it during the same session without DB fetch
    const currentUrl = new URL(window.location.href);
    currentUrl.searchParams.set('step', newStep.toString());
    window.history.replaceState({}, '', currentUrl.toString());

    // Sync explicitly to postgres DB using Redux state
    if (sessionId && !skipNetwork) {
      try {
        await updateKycUiStep(sessionId, newStep);
      } catch (e) {
        // Failing to sync UI step isn't fatal, ignore gracefully.
      }
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return <DocumentUploadStep userId={userId} onNext={() => handleStepChange(3)} onStateRestored={(step) => handleStepChange(step, true)} />;
      case 2:
      case 3:
        return <PhotoStep userId={userId} onNext={() => handleStepChange(4)} />;
      case 4:
        return <SignatureStep userId={userId} onNext={() => {
          router.push(`/kyc/verify?verification=${userId}`);
        }} />;
      default:
        return null;
    }
  };

  const getStepNumber = () => {
    return currentStep as 1 | 2 | 3 | 4;
  };

  if (!isReady) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-t-blue-600 border-r-blue-600 border-b-transparent border-l-transparent" />
      </main>
    );
  }

  return (
    <main className=" relative sm:py-12 font-sans selection:bg-pink-200 selection:text-black flex flex-col items-center">
      <div className="w-full flex-1 min-h-[100dvh] sm:min-h-[700px] sm:h-[85vh] overflow-hidden relative flex flex-col">
        {/* Header */}
        <div className="pt-8 px-8 pb-6 flex items-center justify-center relative">
          <button
            onClick={() => {
              if (currentStep === 4) dispatch(setCurrentStep(3));
              else if (currentStep === 3) dispatch(setCurrentStep(1));
              else if (currentStep === 2) dispatch(setCurrentStep(1));
            }}
            disabled={currentStep === 1}
            className={`absolute left-8 flex h-10 w-10 items-center justify-center rounded-full transition-colors ${
              currentStep === 1 ? 'text-gray-300' : 'text-black hover:bg-gray-100'
            }`}
          >
            <ChevronLeft className="h-7 w-7" strokeWidth={3} />
          </button>
          <h1 className="text-xl font-bold tracking-widest text-black">KYC</h1>
        </div>

        {/* Stepper */}
        <div className="px-4 sm:px-16 lg:px-24">
          <KycStepper currentStep={getStepNumber()} />
        </div>

        {/* Dynamic Card Content */}
        <div className="flex-1 px-6 sm:px-16 lg:px-24 pb-8 flex flex-col min-h-0">
          <div className="bg-white rounded-[24px] shadow-[0_4px_24px_rgba(0,0,0,0.06)] border border-gray-100 flex-1 flex flex-col relative z-20 overflow-hidden">
            {renderStep()}
          </div>
        </div>

      </div>
    </main>
    
  );
}

export default function KycPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-4 border-t-black border-r-black border-transparent"></div></div>}>
      <KycFlowContent />
    </Suspense>
  );
}
