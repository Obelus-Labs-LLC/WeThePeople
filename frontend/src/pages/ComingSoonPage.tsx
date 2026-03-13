import React from "react";
import { useParams, Link } from "react-router-dom";
import { SECTORS } from "../data/sectors";

const ComingSoonPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const sector = SECTORS.find((s) => s.slug === slug);

  if (!sector) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white mb-2">Sector Not Found</h1>
          <p className="text-slate-400 mb-6">We couldn't find the sector you're looking for.</p>
          <Link to="/" className="text-blue-400 hover:text-blue-300 font-medium">
            &larr; Back to Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      {/* Gradient accent header */}
      <div className={`relative bg-gradient-to-r ${sector.gradient} py-20 px-4`}>
        <div className="absolute inset-0 bg-black/20" />
        <div className="relative max-w-2xl mx-auto text-center">
          <div className="text-7xl mb-4 drop-shadow-lg">{sector.icon}</div>
          <h1 className="text-4xl font-bold text-white mb-2 drop-shadow-sm">{sector.name}</h1>
          <p className="text-white/80 text-lg">{sector.tagline}</p>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex items-start justify-center px-4 py-16">
        <div className="max-w-lg text-center">
          <h2 className="text-3xl font-semibold text-white mb-4">
            Coming Soon
          </h2>
          <p className="text-slate-400 mb-8 leading-relaxed text-lg">
            We're building transparency tools for the{" "}
            <span className="font-medium text-slate-200">{sector.name}</span>{" "}
            sector. Our team is gathering public data sources, building connectors, and
            making real information accessible to everyone.
          </p>
          <p className="text-slate-500 text-sm mb-10">
            Want to be notified when this sector launches? Stay tuned.
          </p>
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-xl bg-white/10 border border-white/10 px-6 py-3 text-sm font-medium text-white hover:bg-white/20 transition-colors backdrop-blur-sm"
          >
            &larr; Back to All Sectors
          </Link>
        </div>
      </div>
    </div>
  );
};

export default ComingSoonPage;
