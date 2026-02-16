import React from 'react';
import { Link } from 'react-router-dom';

interface Crumb {
  label: string;
  to?: string;
}

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  breadcrumbs?: Crumb[];
}

const PageHeader: React.FC<PageHeaderProps> = ({ title, subtitle, breadcrumbs }) => {
  return (
    <div className="mb-6">
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav className="mb-2 text-sm text-stone-500">
          {breadcrumbs.map((crumb, i) => (
            <span key={i}>
              {i > 0 && <span className="mx-1.5">/</span>}
              {crumb.to ? (
                <Link to={crumb.to} className="hover:text-blue-600 transition-colors">{crumb.label}</Link>
              ) : (
                <span className="text-stone-700">{crumb.label}</span>
              )}
            </span>
          ))}
        </nav>
      )}
      <h1 className="text-2xl font-bold text-stone-900">{title}</h1>
      {subtitle && <p className="mt-1 text-stone-500">{subtitle}</p>}
    </div>
  );
};

export default PageHeader;
