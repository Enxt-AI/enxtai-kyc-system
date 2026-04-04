"use client";

import React, { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { KycStepper } from "@/components/KycStepper";
import { UploadStep } from "@/components/kyc/UploadStep";
import { PhotoStep } from "@/components/kyc/PhotoStep";
import { SignatureStep } from "@/components/kyc/SignatureStep";
import {
  getKycApiKey,
  getKycReturnUrl,
  clearKycApiKey,
  clearKycReturnUrl,
} from "@/lib/api-client";

type KycStepTab = 'upload' | 'photo' | 'signature' | 'verify';

function KycFlowContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [isReady, setIsReady] = useState(false);
  const [userId, setUserId] = useState<string>('');
  const [currentStep, setCurrentStep] = useState<KycStepTab>('upload');
  const [returnUrl, setReturnUrl] = useState<string | null>(null);

  // Validate API Key and fetch Return URL
  useEffect(() => {
    try {
      getKycApiKey(); // Validates key exists and isn't expired
      setReturnUrl(getKycReturnUrl());
    } catch (error) {
      router.replace("/?error=session_expired");
    }
  }, [router]);

  // Extract User ID from search params (e.g. ?verification=USER_ID)
  // Ensure we trim whitespace as requested by user.
  useEffect(() => {
    const rawVerificationId = searchParams.get('verification');
    let stepParam = searchParams.get('step') as KycStepTab | null;

    if (!stepParam) {
      const savedStep = localStorage.getItem('kyc_current_step') as KycStepTab;
      if (savedStep && ['upload', 'photo', 'signature', 'verify'].includes(savedStep)) {
        stepParam = savedStep;
      }
    }

    if (stepParam && ['upload', 'photo', 'signature', 'verify'].includes(stepParam)) {
      setCurrentStep(stepParam);
    }

    if (rawVerificationId) {
      const trimmedId = rawVerificationId.trim();
      setUserId(trimmedId);
      localStorage.setItem('kyc_user_id', trimmedId);
      setIsReady(true);
    } else {
      router.replace('/?error=missing_verification_id');
    }
  }, [searchParams, router]);

  const handleCancelToClient = () => {
    if (!returnUrl) return;
    const target = new URL(returnUrl);
    target.searchParams.set("status", "cancelled");
    localStorage.removeItem("kyc_submission_id");
    localStorage.removeItem("kyc_user_id");
    clearKycApiKey();
    clearKycReturnUrl();
    window.location.href = target.toString();
  };

  const handleStepChange = (newStep: KycStepTab) => {
    setCurrentStep(newStep);
    // Persist step in URL so reload doesn't reset it
    const currentUrl = new URL(window.location.href);
    currentUrl.searchParams.set('step', newStep);
    window.history.replaceState({}, '', currentUrl.toString());
    localStorage.setItem('kyc_current_step', newStep);
  };

  const renderStep = () => {
    switch (currentStep) {
      case 'upload':
        return <UploadStep userId={userId} onNext={() => handleStepChange('photo')} />;
      case 'photo':
        return <PhotoStep userId={userId} onNext={() => handleStepChange('signature')} />;
      case 'signature':
        return <SignatureStep userId={userId} onNext={() => {
          router.push('/kyc/verify');
        }} />;
      default:
        return null;
    }
  };

  const getStepNumber = () => {
    switch (currentStep) {
      case 'upload': return 1;
      // Step 2 was Aadhaar but it's now folded into upload visually as step 1 -> step 2.
      // We will map 'photo' to 3 and 'signature' to 4 to match the KycStepper visual mock.
      case 'photo': return 3;
      case 'signature': return 4;
      default: return 1;
    }
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
              if (currentStep === 'signature') setCurrentStep('photo');
              else if (currentStep === 'photo') setCurrentStep('upload');
            }}
            disabled={currentStep === 'upload'}
            className={`absolute left-8 flex h-10 w-10 items-center justify-center rounded-full transition-colors ${
              currentStep === 'upload' ? 'text-gray-300' : 'text-black hover:bg-gray-100'
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
