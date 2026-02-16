import React from "react";
import { Link } from "react-router-dom";

const NotFoundPage: React.FC = () => (
  <div className="text-center mt-16">
    <h1 className="text-3xl font-bold mb-4">404 — Not Found</h1>
    <p className="mb-4">The page you requested does not exist.</p>
    <Link to="/" className="text-blue-700 hover:underline">Return to Dashboard</Link>
  </div>
);

export default NotFoundPage;
