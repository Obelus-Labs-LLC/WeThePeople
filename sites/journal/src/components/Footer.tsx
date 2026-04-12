import { Link } from 'react-router-dom';

export function Footer() {
  return (
    <footer className="border-t border-zinc-900 py-8 px-4">
      <div className="max-w-5xl mx-auto">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="text-center sm:text-left">
            <p
              className="text-sm font-semibold text-zinc-400 mb-1"
              style={{ fontFamily: 'Oswald, sans-serif' }}
            >
              The Influence Journal
            </p>
            <p className="text-xs text-zinc-600">
              Part of the WeThePeople ecosystem
            </p>
          </div>
          <nav className="flex items-center gap-6">
            <Link
              to="/about"
              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              About
            </Link>
            <Link
              to="/subscribe"
              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              Subscribe
            </Link>
            <Link
              to="/coverage"
              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              Coverage
            </Link>
            <Link
              to="/verify-our-data"
              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              Verify Data
            </Link>
            <Link
              to="/corrections"
              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              Corrections
            </Link>
            <a
              href="https://wethepeopleforus.com"
              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              Main Site
            </a>
            <a
              href="https://research.wethepeopleforus.com"
              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              Research
            </a>
            <a
              href="https://wethepeopleforus.com/methodology"
              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              Methodology
            </a>
            <a
              href="https://github.com/Obelus-Labs-LLC/WeThePeople"
              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              GitHub
            </a>
          </nav>
        </div>
      </div>
    </footer>
  );
}
