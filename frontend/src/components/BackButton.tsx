import React from 'react';
import { useNavigate } from 'react-router-dom';

interface BackButtonProps {
  to?: string;
  label?: string;
}

export default function BackButton({ to, label = 'Go Back' }: BackButtonProps) {
  const navigate = useNavigate();

  const handleClick = () => {
    if (to) {
      navigate(to);
    } else {
      navigate(-1);
    }
  };

  return (
    <button
      onClick={handleClick}
      type="button"
      className="group relative h-12 w-44 rounded-2xl border border-white/10 bg-white/[0.03] text-base font-semibold text-white/70 transition-colors hover:text-white"
    >
      <div className="absolute left-1 top-[4px] z-10 flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500 transition-all duration-500 group-hover:w-[168px]">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 1024 1024"
          height="20px"
          width="20px"
        >
          <path
            d="M224 480h640a32 32 0 1 1 0 64H224a32 32 0 0 1 0-64z"
            fill="#FFFFFF"
          />
          <path
            d="m237.248 512 265.408 265.344a32 32 0 0 1-45.312 45.312l-288-288a32 32 0 0 1 0-45.312l288-288a32 32 0 1 1 45.312 45.312L237.248 512z"
            fill="#FFFFFF"
          />
        </svg>
      </div>
      <p className="translate-x-3 font-body text-sm">{label}</p>
    </button>
  );
}
