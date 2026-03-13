import React from "react";
import { useNavigate } from "react-router-dom";
import { SECTORS } from "../data/sectors";
import DecryptedText from "../components/DecryptedText";

// Free Unsplash images (Unsplash license — free for commercial use)
const FLAG_BG =
  "https://images.unsplash.com/photo-1508433957232-3107f5fd5995?w=1920&q=80&auto=format";
const CAPITOL_BG =
  "https://images.unsplash.com/photo-1501466044931-62695aada8e9?w=1920&q=80&auto=format";

const HomePage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-white">
      {/* Hero with flag background */}
      <div className="relative overflow-hidden">
        {/* Background image layer */}
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${FLAG_BG})` }}
        />
        {/* Dark overlay */}
        <div className="absolute inset-0 bg-slate-950/75" />
        {/* Gradient fade to bottom */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-slate-950" />

        {/* Content */}
        <div className="relative z-10 flex flex-col items-center pt-20 pb-16 px-4">
          {/* Brand */}
          <div className="flex items-center gap-3 mb-6">
            <div className="h-14 w-14 rounded-xl bg-blue-600 flex items-center justify-center text-2xl font-black text-white shadow-lg shadow-blue-600/30">
              WP
            </div>
            <h1 className="text-5xl font-bold tracking-tight">
              <DecryptedText
                text="We The People"
                animateOn="view"
                sequential={true}
                speed={100}
                revealDirection="start"
                className="text-white"
                encryptedClassName="text-blue-400/40"
              />
            </h1>
          </div>

          {/* Tagline — layer 2, delayed */}
          <p className="text-lg text-blue-200/80 font-medium tracking-wide uppercase mb-2">
            <DecryptedText
              text="Accountability Across Every Sector"
              animateOn="view"
              sequential={true}
              speed={100}
              revealDirection="start"
              className="text-blue-200/80"
              encryptedClassName="text-blue-500/20"
            />
          </p>
          <div className="w-16 h-0.5 bg-blue-500/50 rounded-full mb-8" />

          {/* Headline — layer 3 */}
          <h2 className="text-2xl sm:text-3xl font-semibold text-white text-center mb-3">
            <DecryptedText
              text="Which sector are you interested in?"
              animateOn="view"
              sequential={true}
              speed={100}
              revealDirection="start"
              className="text-white"
              encryptedClassName="text-white/20"
            />
          </h2>

          {/* Description — layer 4, updated language */}
          <p className="text-slate-400 text-center max-w-xl mb-2">
            <DecryptedText
              text="Real data on what the powerful do — votes, finances, patents, enforcement, and more. Pick a sector to start exploring."
              animateOn="view"
              sequential={true}
              speed={35}
              revealDirection="start"
              className="text-slate-400"
              encryptedClassName="text-slate-600/30"
            />
          </p>
        </div>
      </div>

      {/* Sector grid section with Capitol background */}
      <div className="relative flex-1 pb-16">
        {/* Subtle Capitol background */}
        <div
          className="absolute inset-0 bg-cover bg-top opacity-[0.04]"
          style={{ backgroundImage: `url(${CAPITOL_BG})` }}
        />

        <div className="relative z-10 max-w-5xl mx-auto px-4 -mt-4">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {SECTORS.map((sector) => (
              <button
                key={sector.slug}
                onClick={() =>
                  navigate(
                    sector.available
                      ? sector.route
                      : `/coming-soon/${sector.slug}`
                  )
                }
                className={`relative group rounded-2xl bg-gradient-to-br ${sector.gradient} p-6 text-left shadow-lg shadow-black/30 hover:scale-[1.03] hover:shadow-2xl hover:shadow-black/40 transition-all duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-950 focus:ring-blue-500 border border-white/10`}
              >
                {/* Coming Soon badge */}
                {!sector.available && (
                  <span className="absolute top-3 right-3 rounded-full bg-black/30 backdrop-blur-sm px-2 py-0.5 text-[10px] font-semibold text-white/80 uppercase tracking-wider border border-white/10">
                    Soon
                  </span>
                )}

                <div className="text-4xl mb-3 drop-shadow-lg">
                  {sector.icon}
                </div>
                <div className="text-xl font-bold text-white mb-1 drop-shadow-sm">
                  <DecryptedText
                    text={sector.name}
                    animateOn="view"
                    sequential={true}
                    speed={60}
                    revealDirection="start"
                    className="text-white"
                    encryptedClassName="text-white/30"
                  />
                </div>
                <div className="text-sm text-white/70 leading-snug">
                  <DecryptedText
                    text={sector.tagline}
                    animateOn="view"
                    sequential={true}
                    speed={30}
                    revealDirection="start"
                    className="text-white/70"
                    encryptedClassName="text-white/20"
                  />
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-white/5 bg-slate-950">
        <div className="max-w-5xl mx-auto px-4 py-6 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span className="text-xs text-slate-500">
            <DecryptedText
              text="WeThePeople — Holding power accountable across every sector"
              animateOn="view"
              sequential={true}
              speed={25}
              revealDirection="start"
              className="text-slate-500"
              encryptedClassName="text-slate-700/30"
            />
          </span>
          <span className="text-xs text-slate-600">
            Photos by{" "}
            <a
              href="https://unsplash.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate-500 hover:text-slate-400 underline"
            >
              Unsplash
            </a>
          </span>
        </div>
      </footer>
    </div>
  );
};

export default HomePage;
