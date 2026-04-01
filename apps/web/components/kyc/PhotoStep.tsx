"use client";

import React, { useState } from "react";
import { WebcamCapture } from "@/components/WebcamCapture";
import { Camera, CheckCircle2 } from "lucide-react";

interface PhotoStepProps {
  userId: string;
  onNext: () => void;
}

export function PhotoStep({ userId, onNext }: PhotoStepProps) {
  const [uploaded, setUploaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-10 relative z-20 overflow-y-auto no-scrollbar w-full">
      <div className="flex flex-col h-full w-full animate-in fade-in slide-in-from-right-4 duration-500">
        <h2 className="text-[22px] font-bold text-black mb-2">Live Photo</h2>
        <p className="text-gray-500 text-sm mb-6 leading-relaxed">
          Take a clear selfie to verify your identity matching the provided documents.
        </p>

        {/* Status */}
        <div
          className={`mb-6 rounded-2xl border transition-all duration-500 w-full ${uploaded ? "border-emerald-200 bg-emerald-50" : "border-gray-200 bg-[#FDFDFD]"}`}
        >
          <div className="p-4 flex items-center gap-4">
            <div
              className={`flex h-12 w-12 items-center justify-center rounded-2xl shadow-sm transition-colors duration-500 ${uploaded ? "bg-emerald-500 text-white" : "bg-white text-gray-400 border border-gray-200"}`}
            >
              {uploaded ? <CheckCircle2 className="w-6 h-6" /> : <Camera className="w-6 h-6" />}
            </div>
            <div>
              <h3 className="text-sm font-bold text-black">Status</h3>
              <p className={`text-xs font-medium mt-0.5 ${uploaded ? "text-emerald-700" : "text-gray-500"}`}>
                {uploaded ? "Photo successful" : "Pending capture..."}
              </p>
            </div>
          </div>
        </div>

        {/* Camera Component */}
        <div className="w-full aspect-[3/4] mx-auto rounded-[2rem] overflow-hidden bg-black mb-6 relative border-[6px] border-gray-100 shadow-inner max-w-sm">
          <WebcamCapture
            userId={userId}
            onUploadSuccess={() => {
              setUploaded(true);
              setError(null);
            }}
            onUploadError={(msg) => setError(msg)}
          />
        </div>

        {error && (
          <div className="mb-6 text-center text-xs font-semibold text-red-500">
            {error}
          </div>
        )}

        <div className="mt-auto pt-4 mb-4 sm:mb-6 flex flex-col items-center w-full">
          <button
            type="button"
            disabled={!uploaded}
            onClick={() => onNext()}
            className="w-full sm:w-[300px] rounded-[2rem] bg-black py-4 text-sm font-bold text-white shadow-[0_8px_20px_rgba(0,0,0,0.15)] transition-transform active:scale-95 disabled:bg-gray-300 disabled:shadow-none mb-6"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}
