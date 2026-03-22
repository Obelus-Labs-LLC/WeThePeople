import React, { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { motion } from 'framer-motion';
import { verifyText, verifyUrl, type VerificationResult, type VerificationItem } from '../api/claims';
import ClaimSubmitForm from '../components/ClaimSubmitForm';
import VerificationCard from '../components/VerificationCard';
import EvidenceList from '../components/EvidenceList';
import TierBadge from '../components/TierBadge';
import { VerifySectorHeader } from '../components/SectorHeader';

export default function VerifySubmitPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VerificationResult | null>(null);

  const handleSubmit = async (data: {
    mode: 'text' | 'url';
    text?: string;
    url?: string;
    entity_id: string;
    entity_type: string;
  }) => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      let res: VerificationResult;
      if (data.mode === 'text' && data.text) {
        res = await verifyText({
          text: data.text,
          entity_id: data.entity_id,
          entity_type: data.entity_type as any,
        });
      } else if (data.mode === 'url' && data.url) {
        res = await verifyUrl({
          url: data.url,
          entity_id: data.entity_id,
          entity_type: data.entity_type as any,
        });
      } else {
        setError('Please provide text or a URL.');
        setLoading(false);
        return;
      }
      setResult(res);
    } catch (e: any) {
      setError(e.message || 'Verification failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen px-4 py-6 sm:px-8">
      <VerifySectorHeader />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-2xl mx-auto"
      >
        {/* Header */}
        <div className="flex items-center gap-3 mb-2">
          <ShieldCheck className="w-6 h-6 text-emerald-400" />
          <h1 className="text-2xl font-bold text-white">Submit Verification</h1>
        </div>
        <p className="text-sm text-slate-400 mb-8">
          Paste a speech, press release, or article — or enter a URL. We will extract claims and
          check them against the legislative record: votes, bills, trades, lobbying, and more.
        </p>

        {/* Form */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <ClaimSubmitForm
            onSubmit={handleSubmit}
            loading={loading}
            error={error}
          />
        </div>

        {/* Results */}
        {result && result.claims && result.claims.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-10"
          >
            <h2 className="text-lg font-bold text-white mb-1">
              Verification Results
            </h2>
            <p className="text-sm text-slate-400 mb-6">
              {result.total_claims} claim{result.total_claims !== 1 ? 's' : ''} extracted and verified
              {result.auth_tier === 'free' && ' (free tier)'}
            </p>

            <div className="space-y-6">
              {result.claims.map((claim, i) => (
                <div
                  key={claim.id || i}
                  className="rounded-2xl border border-white/10 bg-white/[0.03] p-5"
                >
                  {/* Claim header */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <TierBadge tier={claim.evaluation?.tier} size="md" />
                    {claim.evaluation?.score !== undefined && (
                      <span className="text-sm font-mono text-slate-400">
                        {Math.round(claim.evaluation.score * 100)}% confidence
                      </span>
                    )}
                  </div>

                  {/* Claim text */}
                  <p className="text-sm text-white/90 leading-relaxed mb-4">
                    {claim.text}
                  </p>

                  {/* Evidence */}
                  {claim.evaluation?.evidence && (
                    <EvidenceList evidence={claim.evaluation.evidence} />
                  )}

                  {/* Why */}
                  {claim.evaluation?.why && claim.evaluation.why.length > 0 && (
                    <div className="mt-4 pl-4 border-l-2 border-emerald-500/30">
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                        Analysis
                      </p>
                      {claim.evaluation.why.map((reason, j) => (
                        <p key={j} className="text-xs text-slate-300 leading-relaxed">{reason}</p>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* No results */}
        {result && (!result.claims || result.claims.length === 0) && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-10 rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center"
          >
            <ShieldCheck className="w-10 h-10 text-slate-600 mx-auto mb-3" />
            <p className="text-sm text-slate-400">
              No verifiable claims could be extracted from the provided text.
            </p>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}
