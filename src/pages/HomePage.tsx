import { Link } from 'react-router-dom';

export function HomePage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-emerald-900 text-white">
      <h1 className="text-5xl font-bold mb-2">Yarborough</h1>
      <p className="text-emerald-300 mb-12">A modern bridge bidding tool</p>
      <div className="flex gap-6">
        <Link
          to="/explore"
          className="px-8 py-4 bg-white text-emerald-900 rounded-xl font-semibold text-lg hover:bg-emerald-100 transition-colors shadow-lg"
        >
          Bid Explorer
        </Link>
        <Link
          to="/practice"
          className="px-8 py-4 bg-white text-emerald-900 rounded-xl font-semibold text-lg hover:bg-emerald-100 transition-colors shadow-lg"
        >
          Practice Bidding
        </Link>
      </div>
    </div>
  );
}
