import React from "react";
import { Check } from "lucide-react";

export type KycStep = 1 | 2 | 3 | 4;

interface KycStepperProps {
  currentStep: KycStep;
}

const steps = [
  { num: 1, label: "Pan Card" },
  { num: 2, label: "Aadhaar Card" },
  { num: 3, label: "Profile Pic" },
  { num: 4, label: "Signature" },
];

export function KycStepper({ currentStep }: KycStepperProps) {
  return (
    <div className="relative mb-8 w-full">
      {/* Steps Container */}
      <div className="flex justify-between items-start relative z-10 w-full px-2 sm:px-6">
        {steps.map((step, index) => {
          const isActive = currentStep === step.num;
          const isCompleted = currentStep > step.num;

          return (
            <div key={step.num} className="flex-1 flex flex-col items-center relative group">
              {/* Connecting Line */}
              {index < steps.length - 1 && (
                <div className="absolute top-[18px] left-[50%] w-full h-[2px] bg-gray-200 z-0 pointer-events-none" />
              )}
              
              <div
                className={`w-[36px] h-[36px] rounded-full flex items-center justify-center text-sm font-semibold transition-colors duration-300 z-10 relative
                  ${
                    isActive
                      ? "bg-black text-white"
                      : isCompleted
                      ? "bg-black text-white"
                      : "bg-white text-gray-400 border-[2px] border-gray-200"
                  }`}
              >
                {step.num}
              </div>
              <span
                className={`mt-2 text-[10px] sm:text-xs font-semibold text-center leading-tight sm:max-w-[70px] ${
                  isActive || isCompleted ? "text-black" : "text-gray-400"
                }`}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
